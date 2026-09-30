import { AppShell } from './features/app-shell/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { useCurrentUser } from './features/auth/useCurrentUser';

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
      return <AppShell user={session.user} onSignOut={() => void signOut()} />;
  }
}

function FullScreenMessage({ children }: { children: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
      {children}
    </main>
  );
}
