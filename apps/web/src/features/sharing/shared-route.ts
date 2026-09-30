const SHARED_PATH = /^\/shared\/([A-Za-z0-9_-]+)$/;

/** Token do link de compartilhamento, quando a página aberta é uma conversa compartilhada. */
export function sharedTokenFromLocation(): string | null {
  return SHARED_PATH.exec(window.location.pathname)?.[1] ?? null;
}
