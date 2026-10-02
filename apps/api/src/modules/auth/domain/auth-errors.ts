import { AppError } from '../../../kernel/errors/app-error';

export class EmailNotAllowedError extends AppError {
  constructor(email: string) {
    super(
      'forbidden',
      'email_not_allowed',
      'Este e-mail não tem permissão para acessar a aplicação.',
      { email },
    );
  }
}

export class NotAuthenticatedError extends AppError {
  constructor() {
    super('unauthenticated', 'not_authenticated', 'É necessário entrar para continuar.');
  }
}
