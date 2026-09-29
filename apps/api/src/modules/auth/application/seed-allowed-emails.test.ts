import { describe, expect, it } from 'vitest';
import { InMemoryAllowedEmailRepository } from '../infra/in-memory-allowed-email-repository';
import { SeedAllowedEmails } from './seed-allowed-emails';

describe('SeedAllowedEmails', () => {
  it('adiciona os padrões normalizados e mantém os que já existiam', async () => {
    const allowedEmails = new InMemoryAllowedEmailRepository(['antigo@empresa.com']);

    await new SeedAllowedEmails(allowedEmails).execute([' Ana@Empresa.com', '@parceiro.com']);

    expect(await allowedEmails.listPatterns()).toEqual([
      'antigo@empresa.com',
      'ana@empresa.com',
      '@parceiro.com',
    ]);
  });

  it('não duplica um padrão já cadastrado', async () => {
    const allowedEmails = new InMemoryAllowedEmailRepository(['ana@empresa.com']);

    await new SeedAllowedEmails(allowedEmails).execute(['ANA@empresa.com']);

    expect(await allowedEmails.listPatterns()).toEqual(['ana@empresa.com']);
  });

  it('recusa a lista inteira quando há um padrão inválido', async () => {
    const allowedEmails = new InMemoryAllowedEmailRepository();

    const seeding = new SeedAllowedEmails(allowedEmails).execute([
      'ana@empresa.com',
      'empresa.com',
    ]);

    await expect(seeding).rejects.toThrow(/empresa\.com/);
    expect(await allowedEmails.listPatterns()).toEqual([]);
  });
});
