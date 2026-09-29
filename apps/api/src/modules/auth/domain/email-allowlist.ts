/**
 * Lista de permitidos. Cada padrão é um e-mail completo ("ana@empresa.com")
 * ou um domínio iniciado por "@" ("@empresa.com"), que libera todos os
 * endereços daquele domínio. A comparação ignora maiúsculas e espaços.
 */
export function isEmailAllowed(email: string, allowedPatterns: readonly string[]): boolean {
  const normalizedEmail = normalizeEmail(email);

  return allowedPatterns.map(normalizeEmail).some((pattern) => {
    const isDomainPattern = pattern.startsWith('@');
    return isDomainPattern ? normalizedEmail.endsWith(pattern) : normalizedEmail === pattern;
  });
}

export function isValidAllowlistPattern(pattern: string): boolean {
  return ALLOWLIST_PATTERN.test(normalizeEmail(pattern));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "usuario@dominio.tld" ou "@dominio.tld". */
const ALLOWLIST_PATTERN = /^[^\s@]*@[^\s@]+\.[^\s@]+$/;
