const STORAGE_KEY = 'chat-tess:return-path';

/**
 * Guarda a página em que o usuário estava antes de ir ao Google, para que um
 * link de conversa compartilhada continue valendo depois do login. O Google
 * sempre volta para "/", e a sessionStorage sobrevive ao redirecionamento na
 * mesma aba.
 */
export function rememberReturnPath(path: string): void {
  if (path === '/') {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // Sem armazenamento, o usuário só volta para a página inicial.
  }
}

/** Depois do login, leva o usuário de volta à página guardada, se houver. */
export function restoreReturnPath(): void {
  const path = takeReturnPath();
  if (path && window.location.pathname === '/') {
    window.history.replaceState(null, '', path);
  }
}

function takeReturnPath(): string | null {
  try {
    const path = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return path && isSameOriginPath(path) ? path : null;
  } catch {
    return null;
  }
}

/** "//site" seria outro domínio; só caminhos locais são aceitos. */
function isSameOriginPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}
