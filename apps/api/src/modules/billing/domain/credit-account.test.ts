import { describe, expect, it } from 'vitest';
import { hasCredit, remainingTokens } from './credit-account';

const account = (tokensUsed: number) => ({ userId: 'u1', tokenLimit: 1000, tokensUsed });

describe('conta de créditos', () => {
  it('tem crédito enquanto o consumo está abaixo do limite', () => {
    expect(hasCredit(account(999))).toBe(true);
    expect(remainingTokens(account(999))).toBe(1);
  });

  it('fica sem crédito ao atingir o limite', () => {
    expect(hasCredit(account(1000))).toBe(false);
    expect(remainingTokens(account(1000))).toBe(0);
  });

  it('nunca informa saldo negativo quando o último turno passou do limite', () => {
    expect(remainingTokens(account(1250))).toBe(0);
  });
});
