'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Mode = 'login' | 'signup';

function toInternalEmail(username: string) {
  return `${username.toLowerCase().replace(/[^a-z0-9_]/g, '_')}@chinchiro.game`;
}

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/lobby');
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'signup' && password !== passwordConfirm) {
      setError('パスワードが一致しません');
      return;
    }
    if (username.trim().length < 2) {
      setError('プレイヤー名は2文字以上にしてください');
      return;
    }

    setSubmitting(true);
    const email = toInternalEmail(username.trim());

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: username.trim() } },
        });
        if (error) throw error;
        router.replace('/lobby');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError('プレイヤー名またはパスワードが間違っています');
          return;
        }
        router.replace('/lobby');
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'エラーが発生しました';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('このプレイヤー名は既に使われています');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 font-mono text-sm">Loading...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">チンチロバトル</h1>
          <p className="text-zinc-500 text-sm mt-1 font-mono">100万ソツーを賭けて戦え</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="プレイヤー名"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
          />
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
          />
          {mode === 'signup' && (
            <input
              type="password"
              placeholder="パスワード（確認）"
              value={passwordConfirm}
              onChange={e => setPasswordConfirm(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
            />
          )}

          {error && <p className="text-red-400 text-xs font-mono">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-white text-black text-sm font-semibold hover:bg-zinc-100 disabled:opacity-50 transition-all"
          >
            {submitting ? '処理中...' : mode === 'login' ? 'ログイン' : '新規登録'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setPasswordConfirm(''); }}
          className="text-zinc-500 text-xs text-center hover:text-zinc-300 transition-colors font-mono"
        >
          {mode === 'login' ? 'アカウントをお持ちでない方はこちら →' : 'すでにアカウントをお持ちの方はこちら →'}
        </button>
      </div>
    </main>
  );
}
