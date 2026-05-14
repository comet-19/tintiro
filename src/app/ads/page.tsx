'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatMoney } from '@/lib/game-logic';

const AD_REWARD = 50000;
const AD_DURATION = 30;

export default function AdsPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [watching, setWatching] = useState(false);
  const [countdown, setCountdown] = useState(AD_DURATION);
  const [done, setDone] = useState(false);
  const [earned, setEarned] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  async function startAd() {
    if (watching || done) return;
    setWatching(true);
    setCountdown(AD_DURATION);

    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          finishAd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function finishAd() {
    setWatching(false);
    setDone(true);
    if (user && profile) {
      const next = profile.money + AD_REWARD;
      setEarned(AD_REWARD);
      await supabase.from('profiles').update({ money: next }).eq('id', user.id);
      await refreshProfile();
    }
  }

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - (AD_DURATION - countdown) / AD_DURATION);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 font-mono text-sm">Loading...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-4 gap-6">

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">広告視聴</h1>
        <p className="text-zinc-500 text-xs mt-1 font-mono">1視聴 = +{formatMoney(AD_REWARD)}</p>
      </div>

      {!watching && !done && (
        <div className="flex flex-col items-center gap-4">
          <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl w-72 h-40 flex items-center justify-center">
            <span className="text-zinc-600 text-xs font-mono">広告エリア (準備中)</span>
          </div>
          <button
            onClick={startAd}
            className="px-8 py-3 rounded-xl bg-yellow-500 text-black font-bold text-sm hover:bg-yellow-400 transition-all"
          >
            📺 広告を視聴する ({AD_DURATION}秒)
          </button>
        </div>
      )}

      {watching && (
        <div className="flex flex-col items-center gap-4">
          <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl w-72 h-40 flex items-center justify-center">
            <span className="text-zinc-600 text-xs font-mono">広告視聴中...</span>
          </div>

          {/* カウントダウンリング */}
          <div className="relative flex items-center justify-center">
            <svg width="100" height="100" className="-rotate-90">
              <circle cx="50" cy="50" r={radius} fill="none" stroke="#27272a" strokeWidth="6" />
              <circle
                cx="50" cy="50" r={radius}
                fill="none"
                stroke="#eab308"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <span className="absolute text-xl font-bold font-mono text-yellow-400">{countdown}</span>
          </div>
          <p className="text-zinc-500 text-xs font-mono">視聴完了後に {formatMoney(AD_REWARD)} 獲得</p>
        </div>
      )}

      {done && (
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl">🎉</div>
          <p className="text-xl font-bold text-yellow-400 font-mono">+{formatMoney(earned)} 獲得！</p>
          <div className="flex gap-3">
            <button
              onClick={() => { setDone(false); setCountdown(AD_DURATION); }}
              className="px-6 py-3 rounded-xl bg-zinc-800 border border-zinc-600 text-white text-sm font-semibold hover:bg-zinc-700 transition-all"
            >
              もう一度視聴
            </button>
            <button
              onClick={() => router.push('/work')}
              className="px-6 py-3 rounded-xl bg-zinc-800 border border-zinc-600 text-white text-sm font-semibold hover:bg-zinc-700 transition-all"
            >
              労働センターへ
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => router.push('/lobby')}
        className="text-zinc-600 text-xs font-mono hover:text-zinc-400 transition-colors"
      >
        ← ロビーへ戻る
      </button>
    </main>
  );
}
