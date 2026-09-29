import { LoginPage } from './features/auth/LoginPage';
import { useCurrentUser } from './features/auth/useCurrentUser';
import { SystemStatus } from './features/system-status/SystemStatus';

export function App() {
  const { session, signOut } = useCurrentUser();

  switch (session.status) {
    case 'loading':
      return <FullScreenMessage>Carregando…</FullScreenMessage>;
    case 'error':
      return <FullScreenMessage>Não foi possível conectar à API.</FullScreenMessage>;
    case 'anonymous':
      return <LoginPage />;
    case 'authenticated':
      return (
        <div className="flex min-h-screen flex-col bg-slate-50">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <span className="font-semibold text-slate-900">chat-tess</span>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-700">{session.user.name}</span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                Sair
              </button>
            </div>
          </header>
          <main className="flex flex-1 items-center justify-center">
            <SystemStatus />
          </main>
        </div>
      );
  }
}

function FullScreenMessage({ children }: { children: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
      {children}
    </main>
  );
}
