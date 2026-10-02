import { AppError } from '../../../kernel/errors/app-error';

export class CreditLimitReachedError extends AppError {
  constructor(tokenLimit: number) {
    super(
      'limit_exceeded',
      'credit_limit_reached',
      `Você atingiu o limite de uso de ${tokenLimit.toLocaleString('pt-BR')} tokens. Fale com um administrador para ampliar o limite.`,
      { tokenLimit },
    );
  }
}
