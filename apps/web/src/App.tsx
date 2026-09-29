import { SystemStatus } from './features/system-status/SystemStatus';

export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
      <h1 className="text-3xl font-semibold text-slate-900">chat-tess</h1>
      <SystemStatus />
    </main>
  );
}
