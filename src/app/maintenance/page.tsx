export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center flex flex-col items-center gap-6">
        <div className="text-6xl">🎲</div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">メンテナンス中</h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono">しばらくお待ちください</p>
        </div>
        <div className="border border-zinc-800 rounded-xl px-6 py-4 text-zinc-600 text-xs font-mono">
          UNDER MAINTENANCE
        </div>
      </div>
    </main>
  );
}
