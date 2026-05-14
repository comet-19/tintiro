'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatMoney } from '@/lib/game-logic';
import type { Room, Profile } from '@/types/game';

interface RoomWithCount extends Room { player_count: number; }

export default function LobbyPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomWithCount[]>([]);
  const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(5);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchRooms = useCallback(async () => {
    const { data } = await supabase.from('rooms').select('*').in('status', ['waiting', 'playing']).order('created_at', { ascending: false });
    if (!data) return;
    const withCounts = await Promise.all(data.map(async room => {
      const { count } = await supabase.from('room_players').select('*', { count: 'exact', head: true }).eq('room_id', room.id).eq('is_active', true);
      return { ...room, player_count: count ?? 0 };
    }));
    setRooms(withCounts);
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('money', { ascending: false }).limit(10);
    if (data) setLeaderboard(data);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    fetchRooms();
    fetchLeaderboard();
    const ch = supabase.channel('lobby')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchRooms)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players' }, fetchRooms)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchLeaderboard)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchRooms, fetchLeaderboard]);

  function extractErrorMessage(err: unknown, fallback: string): string {
    if (!err) return fallback;
    if (typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (typeof e.message === 'string') return e.message;
      if (typeof e.details === 'string') return e.details;
      if (typeof e.hint === 'string') return e.hint;
    }
    return fallback;
  }

  async function createRoom() {
    if (!user || !profile) return;
    setError('');
    setCreating(true);
    try {
      const name = roomName.trim() || `${profile.username}のテーブル`;
      const { data: room, error: rErr } = await supabase.from('rooms').insert({ name, max_players: maxPlayers, created_by: user.id }).select().single();
      if (rErr) { setError(`rooms insert: ${rErr.message} (${rErr.code}) ${rErr.details ?? ''}`); return; }
      const { error: jErr } = await supabase.from('room_players').insert({ room_id: room.id, player_id: user.id, seat_index: 0 });
      if (jErr) { setError(`room_players insert: ${jErr.message} (${jErr.code}) ${jErr.details ?? ''}`); return; }
      router.push(`/room/${room.id}`);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'ルーム作成に失敗しました'));
    } finally {
      setCreating(false);
    }
  }

  async function joinRoom(roomId: string) {
    if (!user || !profile) return;
    setJoining(roomId);
    setError('');
    try {
      // Check if already have a row (active or inactive)
      const { data: existing } = await supabase.from('room_players').select('id, is_active').eq('room_id', roomId).eq('player_id', user.id).maybeSingle();
      if (existing) {
        if (!existing.is_active) {
          await supabase.from('room_players').update({ is_active: true }).eq('id', existing.id);
        }
        router.push(`/room/${roomId}`);
        return;
      }

      const room = rooms.find(r => r.id === roomId);
      if (!room) throw new Error('ルームが見つかりません');

      // Query ALL rows (including inactive) to respect unique(room_id, seat_index) constraint
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: seats, error: seatsErr } = await supabase.from('room_players').select('seat_index').eq('room_id', roomId);
        if (seatsErr) throw seatsErr;

        const taken = new Set((seats ?? []).map(s => s.seat_index));
        let nextSeat = -1;
        for (let i = 0; i < room.max_players; i++) { if (!taken.has(i)) { nextSeat = i; break; } }
        if (nextSeat === -1) throw new Error('満席です');

        const { error: jErr } = await supabase.from('room_players').insert({ room_id: roomId, player_id: user.id, seat_index: nextSeat });
        if (!jErr) { router.push(`/room/${roomId}`); return; }

        if (jErr.code === '23505') {
          // player+room constraint = already in room
          if (jErr.message.includes('room_id_player_id')) { router.push(`/room/${roomId}`); return; }
          continue; // seat taken by race condition, retry
        }
        throw jErr;
      }
      throw new Error('座席の確保に失敗しました。もう一度お試しください');
    } catch (err: unknown) {
      setError(extractErrorMessage(err, '参加に失敗しました'));
    } finally {
      setJoining(null);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 font-mono text-sm">Loading...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">チンチロバトル</h1>
          <p className="text-zinc-500 text-xs font-mono">CHINCHIRO ONLINE</p>
        </div>
        <div className="flex items-center gap-4">
          {profile && (
            <div className="text-right">
              <p className="text-sm font-medium">{profile.username}</p>
              <p className="text-yellow-400 text-xs font-mono">{formatMoney(profile.money)}</p>
            </div>
          )}
          {profile && profile.money < 500000 && (
            <button onClick={() => router.push('/work')}
              className="text-zinc-500 text-xs hover:text-yellow-400 transition-colors font-mono border border-zinc-700 hover:border-yellow-600 px-2 py-1 rounded">
              ⛏ 労働
            </button>
          )}
          <button onClick={() => router.push('/settings')}
            className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors font-mono">
            設定
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col gap-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">新しいテーブルを作る</h2>
            <div className="flex gap-3 mb-3">
              <input type="text" placeholder={profile ? `${profile.username}のテーブル` : 'テーブル名'} value={roomName} onChange={e => setRoomName(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
              <select value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
                className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none">
                <option value={2}>2人</option>
                <option value={3}>3人</option>
                <option value={4}>4人</option>
                <option value={5}>5人</option>
              </select>
            </div>
            {error && <p className="text-red-400 text-xs font-mono mb-3">{error}</p>}
            <button onClick={createRoom} disabled={creating}
              className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-zinc-100 disabled:opacity-50 transition-all">
              {creating ? '作成中...' : 'テーブルを作成する'}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-400">テーブル一覧</h2>
            {rooms.length === 0 && (
              <p className="text-zinc-600 text-sm font-mono text-center py-8">テーブルがありません。最初に作ってみましょう</p>
            )}
            {rooms.map(room => (
              <div key={room.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between hover:border-zinc-600 transition-all">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm">{room.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${room.status === 'waiting' ? 'bg-green-900/50 text-green-400 border border-green-800' : 'bg-yellow-900/50 text-yellow-400 border border-yellow-800'}`}>
                      {room.status === 'waiting' ? '待機中' : '対戦中'}
                    </span>
                  </div>
                  <p className="text-zinc-500 text-xs mt-1 font-mono">{room.player_count} / {room.max_players} 人 · R{room.current_round}</p>
                </div>
                <button onClick={() => joinRoom(room.id)} disabled={joining === room.id}
                  className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs font-medium hover:bg-zinc-700 hover:border-zinc-500 disabled:opacity-40 transition-all">
                  {joining === room.id ? '...' : room.status === 'waiting' ? '参加する' : '観戦する'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-400">所持金ランキング</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {leaderboard.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${i < leaderboard.length - 1 ? 'border-b border-zinc-800' : ''} ${p.id === user?.id ? 'bg-zinc-800/60' : ''}`}>
                <span className={`text-xs font-mono w-5 text-center ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-amber-600' : 'text-zinc-600'}`}>{i + 1}</span>
                <span className="flex-1 text-sm text-zinc-200 truncate">{p.username}</span>
                <span className="text-yellow-400 text-xs font-mono">{(p.money / 10000).toFixed(0)}万</span>
              </div>
            ))}
          </div>
          <p className="text-zinc-700 text-xs font-mono text-center">所持金が0になると労働に出されます</p>
        </div>
      </div>
    </main>
  );
}
