/**
 * Erro esperado da aplicação. O `kind` descreve a natureza do problema em termos
 * de negócio; a tradução para status HTTP acontece só na camada http.
 */
export type AppErrorKind =
  'validation' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'limit_exceeded';

export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
