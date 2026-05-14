'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export default function SettingsPage() {
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [usernameError, setUsernameError] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (profile) setUsername(profile.username);
  }, [profile]);

  async function handleUsernameChange(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 2) { setUsernameError('2文字以上にしてください'); return; }
    if (trimmed === profile?.username) { setUsernameError('現在と同じ名前です'); return; }

    setUsernameError('');
    setUsernameStatus('saving');
    try {
      const { error } = await supabase.from('profiles').update({ username: trimmed }).eq('id', user!.id);
      if (error) throw error;
      await refreshProfile();
      setUsernameStatus('done');
      setTimeout(() => setUsernameStatus('idle'), 2000);
    } catch {
      setUsernameError('変更に失敗しました');
      setUsernameStatus('error');
    }
  }

  function toInternalEmail(name: string) {
    return `${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}@chinchiro.game`;
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== newPasswordConfirm) { setPasswordError('新しいパスワードが一致しません'); return; }
    if (newPassword.length < 6) { setPasswordError('6文字以上にしてください'); return; }

    setPasswordError('');
    setPasswordStatus('saving');
    try {
      const email = toInternalEmail(profile!.username);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (signInError) { setPasswordError('現在のパスワードが間違っています'); setPasswordStatus('error'); return; }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword(''); setNewPassword(''); setNewPasswordConfirm('');
      setPasswordStatus('done');
      setTimeout(() => setPasswordStatus('idle'), 2000);
    } catch {
      setPasswordError('変更に失敗しました');
      setPasswordStatus('error');
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 font-mono text-sm">Loading...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-start px-4 py-8 gap-6">

      <div className="w-full max-w-sm flex items-center gap-3">
        <button onClick={() => router.push('/lobby')} className="text-zinc-500 hover:text-zinc-300 text-xs font-mono">← ロビー</button>
        <h1 className="text-lg font-bold">設定</h1>
      </div>

      {/* プレイヤー名変更 */}
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-300">プレイヤー名の変更</h2>
        <form onSubmit={handleUsernameChange} className="flex flex-col gap-3">
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setUsernameStatus('idle'); setUsernameError(''); }}
            placeholder="新しいプレイヤー名"
            minLength={2}
            required
            className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
          />
          {usernameError && <p className="text-red-400 text-xs font-mono">{usernameError}</p>}
          <button
            type="submit"
            disabled={usernameStatus === 'saving'}
            className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
              usernameStatus === 'done'
                ? 'bg-green-600 text-white'
                : 'bg-white text-black hover:bg-zinc-100 disabled:opacity-50'
            }`}
          >
            {usernameStatus === 'saving' ? '保存中...' : usernameStatus === 'done' ? '✓ 変更しました' : '変更する'}
          </button>
        </form>
      </div>

      {/* パスワード変更 */}
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-300">パスワードの変更</h2>
        <form onSubmit={handlePasswordChange} className="flex flex-col gap-3">
          <input
            type="password"
            value={currentPassword}
            onChange={e => { setCurrentPassword(e.target.value); setPasswordStatus('idle'); setPasswordError(''); }}
            placeholder="現在のパスワード"
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
          />
          <input
            type="password"
            value={newPassword}
            onChange={e => { setNewPassword(e.target.value); setPasswordStatus('idle'); setPasswordError(''); }}
            placeholder="新しいパスワード"
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
          />
          <input
            type="password"
            value={newPasswordConfirm}
            onChange={e => { setNewPasswordConfirm(e.target.value); setPasswordStatus('idle'); setPasswordError(''); }}
            placeholder="新しいパスワード（確認）"
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
          />
          {passwordError && <p className="text-red-400 text-xs font-mono">{passwordError}</p>}
          <button
            type="submit"
            disabled={passwordStatus === 'saving'}
            className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
              passwordStatus === 'done'
                ? 'bg-green-600 text-white'
                : 'bg-white text-black hover:bg-zinc-100 disabled:opacity-50'
            }`}
          >
            {passwordStatus === 'saving' ? '変更中...' : passwordStatus === 'done' ? '✓ 変更しました' : 'パスワードを変更する'}
          </button>
        </form>
      </div>

      {/* ログアウト */}
      <div className="w-full max-w-sm">
        <button
          onClick={handleSignOut}
          className="w-full py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm font-semibold hover:border-red-700 hover:text-red-400 transition-all"
        >
          ログアウト
        </button>
      </div>
    </main>
  );
}
