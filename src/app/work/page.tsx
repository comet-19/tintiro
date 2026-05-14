'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatMoney } from '@/lib/game-logic';

const GOAL = 500000;
const EARN_PER_CLEAR = 10000;

function shuffle(arr: number[]): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGrid(): number[] {
  return shuffle(Array.from({ length: 25 }, (_, i) => i + 1));
}

export default function WorkPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [grid, setGrid] = useState<number[]>(() => newGrid());
  const [target, setTarget] = useState(1);
  const [cleared, setCleared] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number | null>(null);
  const [currentMoney, setCurrentMoney] = useState(0);
  const [flashClear, setFlashClear] = useState(false);
  const [totalClears, setTotalClears] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (profile) {
      setCurrentMoney(profile.money);
      if (profile.money >= GOAL) router.replace('/lobby');
    }
  }, [profile, router]);

  const handleCell = useCallback(async (num: number) => {
    if (num === target) {
      const newCleared = new Set(cleared);
      newCleared.add(num);
      setCleared(newCleared);

      if (num === 25) {
        // grid cleared
        setFlashClear(true);
        setTimeout(() => setFlashClear(false), 600);
        setTotalClears(c => c + 1);
        setGrid(newGrid());
        setTarget(1);
        setCleared(new Set());

        if (user) {
          const next = currentMoney + EARN_PER_CLEAR;
          setCurrentMoney(next);
          await supabase.from('profiles').update({ money: next }).eq('id', user.id);
          await refreshProfile();
        }
      } else {
        setTarget(target + 1);
      }
    } else {
      setWrong(num);
      setTimeout(() => setWrong(null), 400);
    }
  }, [target, cleared, currentMoney, user, refreshProfile]);

  const progress = Math.min(currentMoney / GOAL, 1);
  const remaining = Math.max(GOAL - currentMoney, 0);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 font-mono text-sm">Loading...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-start px-4 py-8 gap-6">

      <div className="text-center">
        <p className="text-red-400 text-xs font-mono mb-1">⚠ 所持金が底をついた</p>
        <h1 className="text-2xl font-bold tracking-tight">労働センター</h1>
        <p className="text-zinc-500 text-xs mt-1 font-mono">50万ソツー貯まったらゲームに戻れます</p>
      </div>

      {/* 所持金 */}
      <div className="text-center">
        <p className="text-zinc-500 text-xs font-mono">現在の所持金</p>
        <p className="text-2xl font-bold text-yellow-400 font-mono">{formatMoney(currentMoney)}</p>
      </div>

      {/* プログレスバー */}
      <div className="w-full max-w-sm">
        <div className="flex justify-between text-xs font-mono text-zinc-500 mb-1">
          <span>目標: {formatMoney(GOAL)}</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
          <div className="h-full bg-yellow-500 rounded-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="text-zinc-600 text-xs font-mono mt-1 text-center">あと {formatMoney(remaining)}</p>
      </div>

      {/* ゲーム説明 */}
      <div className="text-center text-xs text-zinc-500 font-mono">
        <span className="text-white font-bold text-sm">{target}</span> を探してタップ
        <span className="ml-3 text-yellow-500">+{(EARN_PER_CLEAR / 10000).toFixed(0)}万/クリア</span>
        {totalClears > 0 && <span className="ml-3 text-zinc-400">×{totalClears}クリア</span>}
      </div>

      {/* 5×5グリッド */}
      <div className={`grid grid-cols-5 gap-1.5 p-3 rounded-xl border transition-all duration-200 ${flashClear ? 'bg-yellow-500/10 border-yellow-500' : 'bg-zinc-900 border-zinc-800'}`}>
        {grid.map((num, i) => {
          const isCleared = cleared.has(num);
          const isWrong = wrong === num;
          return (
            <button
              key={i}
              onClick={() => !isCleared && handleCell(num)}
              disabled={isCleared}
              className={`w-14 h-14 rounded-lg font-bold text-lg font-mono transition-all duration-100 select-none
                ${isCleared
                  ? 'bg-zinc-800 text-zinc-700 cursor-default'
                  : isWrong
                    ? 'bg-red-900 border-2 border-red-500 text-red-300 scale-95'
                    : num === target
                      ? 'bg-zinc-700 border-2 border-yellow-400 text-yellow-300 hover:bg-zinc-600 active:scale-95'
                      : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 active:scale-95'
                }`}
            >
              {isCleared ? '✓' : num}
            </button>
          );
        })}
      </div>

      {/* 広告サイトへ */}
      <button
        onClick={() => router.push('/ads')}
        className="w-full max-w-sm py-3 rounded-xl bg-zinc-800 border border-zinc-600 text-white text-sm font-semibold hover:bg-zinc-700 hover:border-zinc-400 transition-all flex items-center justify-center gap-2"
      >
        <span>📺</span>
        広告視聴サイトへ (+5万/視聴)
      </button>

      <button
        onClick={() => router.push('/lobby')}
        className="text-zinc-600 text-xs font-mono hover:text-zinc-400 transition-colors"
      >
        ← ロビーへ戻る
      </button>
    </main>
  );
}
