'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatMoney } from '@/lib/game-logic';

const GOAL = 500000;
const EARN_PER_CLICK = 1000;
const CLICK_COOLDOWN = 100;
const AD_REWARD = 50000;
const AD_DURATION = 30; // 秒
const AD_COOLDOWN_SEC = 300; // 5分

export default function WorkPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [clicks, setClicks] = useState(0);
  const [earned, setEarned] = useState(0);
  const [isWorking, setIsWorking] = useState(false);
  const [currentMoney, setCurrentMoney] = useState(0);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; text: string }[]>([]);

  // 広告視聴State
  const [adWatching, setAdWatching] = useState(false);
  const [adCountdown, setAdCountdown] = useState(0);
  const [adCooldownLeft, setAdCooldownLeft] = useState(0);
  const adIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lastClick = useRef(0);
  const pendingEarnings = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (profile) {
      setCurrentMoney(profile.money);
      if (profile.money >= GOAL) router.replace('/lobby');
    }
  }, [profile, router]);

  const flushEarnings = useCallback(async (amount: number, base: number) => {
    if (!user || amount === 0) return;
    await supabase.from('profiles').update({ money: base + amount }).eq('id', user.id);
    await refreshProfile();
  }, [user, refreshProfile]);

  function scheduleFlush(toAdd: number, base: number) {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushEarnings(toAdd, base);
    }, 500);
  }

  function spawnParticle(e: React.MouseEvent<HTMLButtonElement>, text: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pid = Date.now() + Math.random();
    setParticles(p => [...p, { id: pid, x: e.clientX - rect.left, y: e.clientY - rect.top, text }]);
    setTimeout(() => setParticles(p => p.filter(pt => pt.id !== pid)), 700);
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const now = Date.now();
    if (now - lastClick.current < CLICK_COOLDOWN) return;
    lastClick.current = now;

    pendingEarnings.current += EARN_PER_CLICK;
    setEarned(v => v + EARN_PER_CLICK);
    setClicks(c => c + 1);
    setCurrentMoney(m => {
      const next = m + EARN_PER_CLICK;
      scheduleFlush(pendingEarnings.current, m);
      return next;
    });
    spawnParticle(e, `+${EARN_PER_CLICK.toLocaleString()}`);
    setIsWorking(true);
    setTimeout(() => setIsWorking(false), 150);
  }

  function startWatchAd() {
    if (adWatching || adCooldownLeft > 0) return;
    setAdWatching(true);
    setAdCountdown(AD_DURATION);

    adIntervalRef.current = setInterval(() => {
      setAdCountdown(prev => {
        if (prev <= 1) {
          clearInterval(adIntervalRef.current!);
          finishAd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function finishAd() {
    setAdWatching(false);
    setCurrentMoney(m => {
      const next = m + AD_REWARD;
      flushEarnings(AD_REWARD, m);
      return next;
    });
    setEarned(v => v + AD_REWARD);

    // クールダウン開始
    setAdCooldownLeft(AD_COOLDOWN_SEC);
    adCooldownRef.current = setInterval(() => {
      setAdCooldownLeft(prev => {
        if (prev <= 1) { clearInterval(adCooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (adIntervalRef.current) clearInterval(adIntervalRef.current);
      if (adCooldownRef.current) clearInterval(adCooldownRef.current);
    };
  }, []);

  const progress = Math.min(currentMoney / GOAL, 1);
  const remaining = Math.max(GOAL - currentMoney, 0);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 font-mono text-sm">Loading...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">

      {/* 上部広告枠 */}
      <div className="w-full bg-zinc-900 border-b border-zinc-800 flex items-center justify-center min-h-16 px-6 py-3">
        <div className="text-zinc-700 text-xs font-mono border border-dashed border-zinc-800 px-8 py-2 rounded">
          Advertisement (728×90)
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row">

        {/* 左広告枠 */}
        <div className="hidden lg:flex w-36 border-r border-zinc-800 items-start justify-center pt-12 shrink-0">
          <div className="text-zinc-700 text-xs font-mono border border-dashed border-zinc-800 px-3 py-8 rounded" style={{ writingMode: 'vertical-rl' }}>
            Advertisement (160×600)
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6">

          <div className="text-center">
            <p className="text-red-400 text-sm font-mono mb-1">⚠ 所持金が底をついた</p>
            <h1 className="text-3xl font-bold tracking-tight">労働センター</h1>
            <p className="text-zinc-500 text-sm mt-1 font-mono">50万ソツー貯まったらゲームに戻れます</p>
          </div>

          {/* 所持金 */}
          <div className="text-center">
            <p className="text-zinc-500 text-xs font-mono">現在の所持金</p>
            <p className="text-3xl font-bold text-yellow-400 font-mono">{formatMoney(currentMoney)}</p>
          </div>

          {/* プログレスバー */}
          <div className="w-full max-w-sm">
            <div className="flex justify-between text-xs font-mono text-zinc-500 mb-2">
              <span>目標: {formatMoney(GOAL)}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="w-full h-4 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
              <div className="h-full bg-yellow-500 rounded-full transition-all duration-200" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="text-zinc-600 text-xs font-mono mt-2 text-center">
              あと {formatMoney(remaining)}
            </p>
          </div>

          {/* クリックボタン */}
          <div className="relative">
            <button
              onClick={handleClick}
              className={`relative w-36 h-36 rounded-full font-bold bg-gradient-to-b from-zinc-700 to-zinc-900 border-4 border-zinc-600 shadow-[0_8px_0_rgba(0,0,0,0.5)] active:shadow-[0_2px_0_rgba(0,0,0,0.5)] active:translate-y-1.5 hover:from-zinc-600 hover:to-zinc-800 hover:border-zinc-500 transition-all duration-75 select-none ${isWorking ? 'scale-95' : 'scale-100'}`}
            >
              <span className="text-4xl block">⛏️</span>
              <span className="text-xs font-mono text-zinc-400 mt-1 block">クリック</span>
              {particles.map(p => (
                <div key={p.id} className="absolute pointer-events-none text-yellow-400 text-xs font-bold font-mono"
                  style={{ left: p.x, top: p.y, transform: 'translate(-50%,-100%)', animation: 'floatUp 0.7s ease-out forwards' }}>
                  {p.text}
                </div>
              ))}
            </button>
          </div>

          {/* 広告視聴ボタン */}
          <div className="w-full max-w-sm">
            {adWatching ? (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-center">
                {/* 広告プレースホルダー */}
                <div className="bg-zinc-800 border border-dashed border-zinc-600 rounded-lg h-24 flex items-center justify-center mb-3">
                  <span className="text-zinc-600 text-xs font-mono">広告視聴中... ({adCountdown}s)</span>
                </div>
                <div className="w-full bg-zinc-700 rounded-full h-2">
                  <div className="bg-yellow-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${((AD_DURATION - adCountdown) / AD_DURATION) * 100}%` }} />
                </div>
                <p className="text-zinc-500 text-xs font-mono mt-2">視聴後に {formatMoney(AD_REWARD)} 獲得</p>
              </div>
            ) : (
              <button
                onClick={startWatchAd}
                disabled={adCooldownLeft > 0}
                className="w-full py-3 rounded-xl bg-zinc-800 border border-zinc-600 text-white font-semibold text-sm hover:bg-zinc-700 hover:border-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <span>📺</span>
                {adCooldownLeft > 0
                  ? `広告視聴 (次まで ${Math.floor(adCooldownLeft / 60)}:${String(adCooldownLeft % 60).padStart(2,'0')})`
                  : `広告を視聴して ${formatMoney(AD_REWARD)} ゲット`}
              </button>
            )}
          </div>

          {/* 統計 */}
          <div className="flex gap-8 text-center">
            <div>
              <p className="text-2xl font-bold font-mono">{clicks.toLocaleString()}</p>
              <p className="text-zinc-600 text-xs font-mono">クリック数</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-yellow-400">{(earned / 10000).toFixed(1)}万</p>
              <p className="text-zinc-600 text-xs font-mono">今日の稼ぎ</p>
            </div>
          </div>

          {currentMoney >= GOAL && (
            <button onClick={() => router.push('/lobby')} className="px-8 py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-500">
              テーブルに戻る 🎲
            </button>
          )}
        </div>

        {/* 右広告枠 */}
        <div className="hidden lg:flex w-36 border-l border-zinc-800 items-start justify-center pt-12 shrink-0">
          <div className="text-zinc-700 text-xs font-mono border border-dashed border-zinc-800 px-3 py-8 rounded" style={{ writingMode: 'vertical-rl' }}>
            Advertisement (160×600)
          </div>
        </div>
      </div>

      {/* 下部広告枠 */}
      <div className="w-full bg-zinc-900 border-t border-zinc-800 flex items-center justify-center min-h-16 px-6 py-3">
        <div className="text-zinc-700 text-xs font-mono border border-dashed border-zinc-800 px-8 py-2 rounded">
          Advertisement (728×90)
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0%   { opacity:1; transform: translate(-50%,-100%); }
          100% { opacity:0; transform: translate(-50%,-280%); }
        }
      `}</style>
    </main>
  );
}
