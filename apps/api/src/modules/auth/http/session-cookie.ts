import type { Request, Response } from 'express';

const COOKIE_NAME = 'chat_tess_session';

export interface SessionCookieOptions {
  /** Envia o cookie só por HTTPS; ligado em produção. */
  secure: boolean;
  ttlSeconds: number;
}

/** Guarda o token de sessão em um cookie que o JavaScript da página não consegue ler. */
export class SessionCookie {
  constructor(private readonly options: SessionCookieOptions) {}

  read(request: Request): string | undefined {
    const value: unknown = request.cookies?.[COOKIE_NAME];
    return typeof value === 'string' ? value : undefined;
  }

  write(response: Response, sessionToken: string): void {
    response.cookie(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: this.options.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: this.options.ttlSeconds * 1000,
    });
  }

  clear(response: Response): void {
    response.clearCookie(COOKIE_NAME, { path: '/' });
  }
}
