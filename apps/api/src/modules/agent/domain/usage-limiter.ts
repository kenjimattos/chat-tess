/** Consultado antes de cada turno; o controle de créditos fica no módulo de billing. */
export interface UsageLimiter {
  /** Lança erro quando o usuário não tem mais crédito para usar o LLM. */
  assertCanSpend(userId: string): Promise<void>;
}

export const unlimitedUsage: UsageLimiter = {
  assertCanSpend: async () => {},
};
