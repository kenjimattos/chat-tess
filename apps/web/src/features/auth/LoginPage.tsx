import { loginErrorSchema, type LoginError } from '@chat-tess/shared';
import { GOOGLE_LOGIN_URL } from '../../api/auth-api';
import { SystemStatus } from '../system-status/SystemStatus';

const LOGIN_ERROR_MESSAGE: Record<LoginError, string> = {
  cancelled: 'O login foi cancelado.',
  invalid_state: 'O login expirou ou foi iniciado em outra aba. Tente novamente.',
  email_not_allowed: 'Este e-mail não tem permissão para acessar a aplicação.',
  login_failed: 'Não foi possível concluir o login. Tente novamente.',
};

export function LoginPage() {
  const loginError = readLoginError(window.location.search);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-slate-900">chat-tess</h1>
          <p className="text-sm text-slate-500">Chat com agente de IA</p>
        </div>

        {loginError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {LOGIN_ERROR_MESSAGE[loginError]}
          </p>
        )}

        <a
          href={GOOGLE_LOGIN_URL}
          className="block rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-700"
        >
          Entrar com Google
        </a>
      </div>
      <SystemStatus />
    </main>
  );
}

function readLoginError(search: string): LoginError | null {
  const result = loginErrorSchema.safeParse(new URLSearchParams(search).get('login_error'));
  return result.success ? result.data : null;
}
