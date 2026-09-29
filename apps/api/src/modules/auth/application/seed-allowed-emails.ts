import { AppError } from '../../../shared/errors/app-error';
import { isValidAllowlistPattern, normalizeEmail } from '../domain/email-allowlist';
import type { AllowedEmailRepository } from '../domain/ports';

/**
 * Garante que os padrões vindos da configuração estejam na lista de permitidos.
 * Executado na inicialização; nunca remove padrões já cadastrados.
 */
export class SeedAllowedEmails {
  constructor(private readonly allowedEmails: AllowedEmailRepository) {}

  async execute(patterns: readonly string[]): Promise<void> {
    const invalidPatterns = patterns.filter((pattern) => !isValidAllowlistPattern(pattern));
    if (invalidPatterns.length > 0) {
      throw new AppError(
        'validation',
        'invalid_allowlist_pattern',
        `Padrões inválidos na lista de permitidos: ${invalidPatterns.join(', ')}`,
      );
    }

    await this.allowedEmails.addPatterns(patterns.map(normalizeEmail));
  }
}
