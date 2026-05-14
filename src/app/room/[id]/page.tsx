'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { rollDice, resolveFinalHand, handStrength, handLabel, formatMoney } from '@/lib/game-logic';
import type { Room, RoomPlayer, Round, Bet, Profile, DiceRoll, Hand } from '@/types/game';

function DiceFace({ value }: { value: number }) {
  const dots: Record<number, [number, number][]> = {
    1: [[50,50]], 2: [[25,25],[75,75]], 3: [[25,25],[50,50],[75,75]],
    4: [[25,25],[75,25],[25,75],[75,75]], 5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
    6: [[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]],
  };
  return (
    <div className="relative w-12 h-12 bg-white rounded-lg shadow-lg border border-zinc-200">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {(dots[value] ?? []).map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="9" fill="#1a1a1a" />)}
      </svg>
    </div>
  );
}

function DiceRow({ dice, rolling }: { dice: DiceRoll | null; rolling: boolean }) {
  return (
    <div className="flex gap-2 justify-center items-center min-h-12">
      {rolling
        ? [0,1,2].map(i => <div key={i} className="w-12 h-12 bg-zinc-700 rounded-lg animate-pulse" />)
        : dice
          ? dice.map((v, i) => <DiceFace key={i} value={v} />)
          : [0,1,2].map(i => <div key={i} className="w-12 h-12 bg-zinc-800 rounded-lg border border-zinc-700" />)
      }
    </div>
  );
}

function HandBadge({ hand, result }: { hand: Hand; result?: 'win' | 'lose' | 'draw' | null }) {
  const color = result === 'win' ? 'bg-green-900 text-green-300 border-green-700'
    : result === 'lose' ? 'bg-red-900 text-red-300 border-red-700'
    : result === 'draw' ? 'bg-zinc-700 text-zinc-300 border-zinc-600'
    : 'bg-zinc-800 text-zinc-300 border-zinc-700';
  return <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${color}`}>{handLabel(hand)}</span>;
}

export default function RoomPage() {
  const { id: roomId } = useParams() as { id: string };
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<(RoomPlayer & { profile: Profile })[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [settleCountdown, setSettleCountdown] = useState<number | null>(null);
  const [nextRoundCountdown, setNextRoundCountdown] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [betAmount, setBetAmount] = useState(10000);
  const [isRolling, setIsRolling] = useState(false);
  const [localRolls, setLocalRolls] = useState<DiceRoll[]>([]);
  const [showDice, setShowDice] = useState<DiceRoll | null>(null);
  const [settling, setSettling] = useState(false);
  const [roundResult, setRoundResult] = useState<Map<string, 'win' | 'lose' | 'draw'> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchAll = useCallback(async () => {
    const [roomRes, playersRes] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).single(),
      supabase.from('room_players').select('*, profile:profiles(*)').eq('room_id', roomId).eq('is_active', true).order('seat_index'),
    ]);
    if (roomRes.data) setRoom(roomRes.data);
    if (playersRes.data) setPlayers(playersRes.data as (RoomPlayer & { profile: Profile })[]);

    const { data: roundData } = await supabase.from('rounds').select('*').eq('room_id', roomId).order('round_number', { ascending: false }).limit(1).single();
    if (roundData) {
      setRound(roundData);
      const { data: betsData } = await supabase.from('bets').select('*').eq('round_id', roundData.id);
      if (betsData) setBets(betsData);
    }
    setPageLoading(false);
  }, [roomId]);

  useEffect(() => {
    if (!authLoading && !user) { router.replace('/login'); return; }
    if (!user) return;
    fetchAll();
    channelRef.current = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, fetchAll)
      .subscribe();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [user, authLoading, roomId, fetchAll, router]);

  useEffect(() => {
    if (profile && profile.money <= 0) router.replace('/work');
  }, [profile, router]);

  const SETTLE_SECS = 10;
  const NEXT_ROUND_SECS = 5;

  // 精算カウントダウン開始
  useEffect(() => {
    if (round?.status === 'settling' && !roundResult) {
      setSettleCountdown(SETTLE_SECS);
    } else {
      setSettleCountdown(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, round?.status]);

  // 精算カウントダウン進行
  useEffect(() => {
    if (settleCountdown === null || settleCountdown <= 0) return;
    const t = setTimeout(() => setSettleCountdown(s => (s ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [settleCountdown]);

  // 0になったら自動精算（親のみ）
  useEffect(() => {
    if (settleCountdown === 0 && !roundResult && isBanker && !settling) {
      doSettle();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleCountdown]);

  // 結果表示後のカウントダウン開始
  useEffect(() => {
    if (roundResult && isBanker) {
      setNextRoundCountdown(NEXT_ROUND_SECS);
    } else {
      setNextRoundCountdown(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!roundResult]);

  // 次ラウンドカウントダウン進行
  useEffect(() => {
    if (nextRoundCountdown === null || nextRoundCountdown <= 0) return;
    const t = setTimeout(() => setNextRoundCountdown(s => (s ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [nextRoundCountdown]);

  // 0になったら自動次ラウンド（親のみ）
  useEffect(() => {
    if (nextRoundCountdown === 0 && roundResult && isBanker) {
      nextRound();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextRoundCountdown]);

  const myPlayer = players.find(p => p.player_id === user?.id) ?? null;
  const banker = players.find(p => room && p.seat_index === room.current_banker_seat) ?? null;
  const isBanker = myPlayer?.player_id === banker?.player_id;
  const myBet = bets.find(b => b.player_id === user?.id);
  const children = players.filter(p => p.player_id !== banker?.player_id);

  const nextRoller = round?.status === 'rolling'
    ? bets.filter(b => b.rolls === null).sort((a, b) => a.amount - b.amount)[0]
    : null;

  const isMyTurnToRoll = round?.status === 'rolling' && (
    (!isBanker && nextRoller?.player_id === user?.id) ||
    (isBanker && !nextRoller && round.banker_rolls === null)
  );

  async function startGame() {
    if (!room || !user) return;
    await supabase.from('rooms').update({ status: 'playing' }).eq('id', room.id);
    await createNewRound(room, players);
  }

  async function createNewRound(r: Room, ps: (RoomPlayer & { profile: Profile })[]) {
    const bankerId = ps.find(p => p.seat_index === r.current_banker_seat)?.player_id;
    if (!bankerId) return;
    await supabase.from('rounds').insert({ room_id: r.id, round_number: r.current_round + 1, banker_id: bankerId, status: 'betting' });
    await supabase.from('rooms').update({ current_round: r.current_round + 1 }).eq('id', r.id);
  }

  async function placeBet() {
    if (!round || !user || myBet) return;
    if (betAmount < 10000 || betAmount > (profile?.money ?? 0)) { setError('賭け金が不正です'); return; }
    setError('');
    await supabase.from('bets').insert({ round_id: round.id, player_id: user.id, amount: betAmount });
    const { data: allBets } = await supabase.from('bets').select('*').eq('round_id', round.id);
    if (allBets && allBets.length >= children.length && children.length > 0) {
      await supabase.from('rounds').update({ status: 'rolling' }).eq('id', round.id);
    }
  }

  async function performRoll() {
    if (!round || !user || isRolling) return;
    setIsRolling(true);
    setError('');
    try {
      const newRolls = [...localRolls, rollDice()];
      const lastDice = newRolls[newRolls.length - 1];
      setShowDice(null);
      await new Promise(r => setTimeout(r, 300));
      setShowDice(lastDice);

      const hand = resolveFinalHand(newRolls);
      if (hand !== null || newRolls.length >= 3) {
        const finalHand = hand ?? { type: 'menashi' as const };
        const strength = handStrength(finalHand);
        if (!isBanker) {
          await supabase.from('bets').update({ rolls: newRolls, hand: finalHand.type, hand_value: strength }).eq('round_id', round.id).eq('player_id', user.id);
        } else {
          await supabase.from('rounds').update({ banker_rolls: newRolls, banker_hand: finalHand.type, banker_hand_value: strength, status: 'settling' }).eq('id', round.id);
        }
        setLocalRolls([]);
      } else {
        setLocalRolls(newRolls);
      }
    } finally {
      setIsRolling(false);
    }
  }

  async function doSettle() {
    if (!round || !isBanker || settling) return;
    setSettling(true);
    setError('');
    try {
      const { error: err } = await supabase.rpc('settle_round', { p_round_id: round.id });
      if (err) throw err;
      await refreshProfile();
      const { data: finalBets } = await supabase.from('bets').select('*').eq('round_id', round.id);
      if (finalBets) {
        const map = new Map<string, 'win' | 'lose' | 'draw'>();
        finalBets.forEach(b => { if (b.result) map.set(b.player_id, b.result); });
        setRoundResult(map);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '精算に失敗しました');
    } finally {
      setSettling(false);
    }
  }

  async function nextRound() {
    if (!room || !isBanker) return;
    setRoundResult(null); setShowDice(null); setLocalRolls([]);
    const nextSeat = (room.current_banker_seat + 1) % players.length;
    const { data: updatedRoom } = await supabase.from('rooms').update({ current_banker_seat: nextSeat }).eq('id', room.id).select().single();
    if (updatedRoom) await createNewRound(updatedRoom, players);
    await Promise.all(players.map(async p => {
      const { data: prof } = await supabase.from('profiles').select('money').eq('id', p.player_id).single();
      if (prof && prof.money <= 0) await supabase.from('room_players').update({ is_active: false }).eq('id', p.id);
    }));
  }

  async function leaveRoom() {
    if (!myPlayer) return;
    await supabase.from('room_players').update({ is_active: false }).eq('id', myPlayer.id);
    const { count } = await supabase.from('room_players').select('*', { count: 'exact', head: true }).eq('room_id', roomId).eq('is_active', true);
    if ((count ?? 0) === 0) {
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId);
    }
    router.push('/lobby');
  }

  if (pageLoading || authLoading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 font-mono text-sm">Loading...</p>
    </div>
  );
  if (!room) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-400 text-sm">ルームが見つかりません</p>
    </div>
  );

  const roundPhaseLabel: Record<string, string> = { betting: 'ベット中', rolling: 'サイコロ', settling: '精算', done: '終了' };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={leaveRoom} className="text-zinc-500 hover:text-zinc-300 text-xs font-mono">← ロビー</button>
          <span className="text-zinc-700">|</span>
          <h1 className="text-sm font-semibold">{room.name}</h1>
          {round && room.status === 'playing' && (
            <span className="text-xs font-mono text-zinc-500">R{round.round_number} · {roundPhaseLabel[round.status]}</span>
          )}
        </div>
        <button onClick={leaveRoom} className="text-zinc-600 text-xs hover:text-red-400 font-mono">退席</button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* メインテーブル */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-2xl p-6">

            {/* 親 */}
            {banker && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full font-bold">親</span>
                    <span className="font-semibold">{banker.profile.username}</span>
                    {isBanker && <span className="text-xs text-zinc-500 font-mono">(あなた)</span>}
                  </div>
                  <span className="text-yellow-400 text-xs font-mono">{formatMoney(banker.profile.money)}</span>
                </div>
                <div className="bg-zinc-800 rounded-xl p-4 flex flex-col items-center gap-3">
                  {isBanker && isMyTurnToRoll ? (
                    <>
                      <DiceRow dice={showDice} rolling={isRolling} />
                      {localRolls.length > 0 && !isRolling && <p className="text-zinc-500 text-xs font-mono">目なし — あと{3 - localRolls.length}回振れます</p>}
                      <button onClick={performRoll} disabled={isRolling} className="px-6 py-2.5 bg-yellow-500 text-black rounded-lg font-bold text-sm hover:bg-yellow-400 disabled:opacity-50">
                        {isRolling ? '振り中...' : localRolls.length === 0 ? 'サイコロを振る' : '振り直す'}
                      </button>
                    </>
                  ) : round?.banker_hand ? (
                    <>
                      <DiceRow dice={round.banker_rolls?.[round.banker_rolls.length - 1] ?? null} rolling={false} />
                      <HandBadge hand={{ type: round.banker_hand, value: round.banker_hand_value ?? undefined }} />
                    </>
                  ) : (
                    <p className="text-zinc-600 text-sm font-mono py-2">待機中...</p>
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-zinc-700 my-4" />

            {/* 子プレイヤー */}
            <div className="flex flex-col gap-3">
              <p className="text-xs text-zinc-500 font-mono">子プレイヤー</p>
              {children.map(child => {
                const childBet = bets.find(b => b.player_id === child.player_id);
                const isMe = child.player_id === user?.id;
                const isCurrentRoller = nextRoller?.player_id === child.player_id;
                const result = roundResult?.get(child.player_id);

                return (
                  <div key={child.id} className={`bg-zinc-800 rounded-xl p-3 ${isCurrentRoller ? 'ring-1 ring-blue-500' : ''} ${isMe ? 'ring-1 ring-zinc-500' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isMe && <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded font-mono">YOU</span>}
                        <span className="text-sm font-medium">{child.profile.username}</span>
                        <span className="text-zinc-500 text-xs font-mono">{formatMoney(child.profile.money)}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {childBet ? (
                          <>
                            <span className="text-xs font-mono text-zinc-400">{formatMoney(childBet.amount)}</span>
                            {childBet.rolls && <DiceRow dice={childBet.rolls[childBet.rolls.length - 1]} rolling={false} />}
                            {childBet.hand && <HandBadge hand={{ type: childBet.hand, value: childBet.hand_value ?? undefined }} result={result} />}
                            {result && (
                              <span className={`text-xs font-bold ${result === 'win' ? 'text-green-400' : result === 'lose' ? 'text-red-400' : 'text-zinc-400'}`}>
                                {result === 'win' ? '勝ち' : result === 'lose' ? '負け' : '引き分け'}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-zinc-700 text-xs font-mono">未ベット</span>
                        )}
                      </div>
                    </div>
                    {/* 自分のロールターン */}
                    {isMe && isMyTurnToRoll && childBet && !childBet.rolls && (
                      <div className="mt-3 flex flex-col items-center gap-2">
                        <DiceRow dice={showDice} rolling={isRolling} />
                        {localRolls.length > 0 && !isRolling && <p className="text-zinc-500 text-xs font-mono">目なし — あと{3 - localRolls.length}回</p>}
                        <button onClick={performRoll} disabled={isRolling} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-500 disabled:opacity-50">
                          {isRolling ? '...' : localRolls.length === 0 ? 'サイコロを振る' : '振り直す'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
        </div>

        {/* サイドパネル */}
        <div className="w-full lg:w-64 border-t lg:border-t-0 lg:border-l border-zinc-800 p-4 flex flex-col gap-4 shrink-0">

          {room.status === 'waiting' && (
            <div className="flex flex-col gap-3">
              <p className="text-zinc-400 text-xs font-mono">参加者: {players.length} / {room.max_players}</p>
              {players.length >= 2 ? (
                <button onClick={startGame} className="w-full py-3 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-500">ゲーム開始</button>
              ) : (
                <p className="text-zinc-600 text-xs font-mono text-center">2人以上で開始できます</p>
              )}
            </div>
          )}

          {room.status === 'playing' && round?.status === 'betting' && !isBanker && !myBet && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-zinc-300">賭け金を決める</p>
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>1万</span><span className="text-yellow-400">{formatMoney(betAmount)}</span>
              </div>
              <input type="range" min={10000} max={Math.min(profile?.money ?? 10000, 500000)} step={10000} value={betAmount} onChange={e => setBetAmount(Number(e.target.value))} className="w-full accent-yellow-400" />
              <div className="grid grid-cols-3 gap-1">
                {[10000, 50000, 100000].map(v => (
                  <button key={v} onClick={() => setBetAmount(v)} className="py-1 text-xs rounded bg-zinc-800 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-mono">{v/10000}万</button>
                ))}
              </div>
              <button onClick={placeBet} className="w-full py-3 bg-yellow-500 text-black rounded-lg font-bold text-sm hover:bg-yellow-400">ベットする</button>
            </div>
          )}

          {room.status === 'playing' && round?.status === 'betting' && !isBanker && myBet && (
            <div className="text-center">
              <p className="text-zinc-400 text-xs font-mono mb-1">ベット済み</p>
              <p className="text-yellow-400 font-mono text-lg">{formatMoney(myBet.amount)}</p>
              <p className="text-zinc-600 text-xs font-mono mt-2">待機中...</p>
            </div>
          )}

          {room.status === 'playing' && round?.status === 'settling' && !roundResult && (() => {
            const total = SETTLE_SECS;
            const current = settleCountdown ?? total;
            const size = 64;
            const sw = 4;
            const r = (size - sw) / 2;
            const circ = 2 * Math.PI * r;
            const offset = circ * (1 - current / total);
            return (
              <div className="flex flex-col items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#3f3f46" strokeWidth={sw} />
                    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#a855f7" strokeWidth={sw}
                      strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s linear' }} />
                  </svg>
                  <span className="absolute text-white font-mono font-bold text-sm">{current}</span>
                </div>
                {isBanker && (
                  <button onClick={doSettle} disabled={settling} className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold text-sm hover:bg-purple-500 disabled:opacity-50">
                    {settling ? '精算中...' : '今すぐ精算'}
                  </button>
                )}
              </div>
            );
          })()}

          {roundResult && isBanker && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-zinc-500 text-xs font-mono">{nextRoundCountdown ?? 0}秒後に次のラウンドへ</p>
              <button onClick={() => { setNextRoundCountdown(null); nextRound(); }} className="w-full py-3 bg-zinc-700 text-white rounded-lg font-bold text-sm hover:bg-zinc-600">
                今すぐ次のラウンドへ →
              </button>
            </div>
          )}

          <div className="mt-auto border border-zinc-800 rounded-xl p-3">
            <p className="text-xs font-semibold text-zinc-500 mb-2 font-mono">役の強さ（強い順）</p>
            {[['ピンゾロ','1-1-1','2倍'],['ゾロ目','x-x-x','6→2'],['シゴロ','4-5-6',''],['目あり','ペア+目',''],['目なし','3回失敗',''],['ヒフミ','1-2-3','最弱']].map(([n,d,note]) => (
              <div key={n} className="flex items-center justify-between py-1 border-b border-zinc-900 last:border-0">
                <span className="text-xs text-zinc-300">{n}</span>
                <span className="text-xs text-zinc-600 font-mono">{d}{note ? ` (${note})` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
