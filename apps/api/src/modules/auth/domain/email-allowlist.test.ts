import { describe, expect, it } from 'vitest';
import { isEmailAllowed, isValidAllowlistPattern } from './email-allowlist';

describe('isEmailAllowed', () => {
  it('libera um e-mail que está na lista', () => {
    expect(isEmailAllowed('ana@empresa.com', ['ana@empresa.com'])).toBe(true);
  });

  it('barra um e-mail que não está na lista', () => {
    expect(isEmailAllowed('bia@empresa.com', ['ana@empresa.com'])).toBe(false);
  });

  it('barra qualquer e-mail quando a lista está vazia', () => {
    expect(isEmailAllowed('ana@empresa.com', [])).toBe(false);
  });

  it('libera todos os e-mails de um domínio permitido', () => {
    expect(isEmailAllowed('qualquer.pessoa@empresa.com', ['@empresa.com'])).toBe(true);
  });

  it('não confunde um domínio permitido com outro de final parecido', () => {
    expect(isEmailAllowed('ana@outraempresa.com', ['@empresa.com'])).toBe(false);
    expect(isEmailAllowed('ana@empresa.com.br', ['@empresa.com'])).toBe(false);
  });

  it('ignora maiúsculas e espaços nas duas pontas', () => {
    expect(isEmailAllowed('  Ana@Empresa.COM ', [' ANA@empresa.com'])).toBe(true);
    expect(isEmailAllowed('ana@EMPRESA.com', ['@Empresa.Com '])).toBe(true);
  });
});

describe('isValidAllowlistPattern', () => {
  it.each(['ana@empresa.com', '@empresa.com', ' Ana@Empresa.com '])('aceita "%s"', (pattern) => {
    expect(isValidAllowlistPattern(pattern)).toBe(true);
  });

  it.each(['empresa.com', 'ana@', '@', 'ana @empresa.com', ''])('rejeita "%s"', (pattern) => {
    expect(isValidAllowlistPattern(pattern)).toBe(false);
  });
});
