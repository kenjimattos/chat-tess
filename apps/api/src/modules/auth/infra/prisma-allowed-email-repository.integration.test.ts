import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../infra/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaAllowedEmailRepository } from './prisma-allowed-email-repository';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const allowedEmails = new PrismaAllowedEmailRepository(database);

describe('PrismaAllowedEmailRepository', () => {
  beforeEach(() => resetDatabase(database));
  afterAll(() => database.$disconnect());

  it('lista os padrões na ordem em que foram adicionados', async () => {
    await allowedEmails.addPatterns(['ana@empresa.com']);
    await allowedEmails.addPatterns(['@parceiro.com']);

    expect(await allowedEmails.listPatterns()).toEqual(['ana@empresa.com', '@parceiro.com']);
  });

  it('ignora padrões que já existem', async () => {
    await allowedEmails.addPatterns(['ana@empresa.com']);

    await allowedEmails.addPatterns(['ana@empresa.com', '@parceiro.com']);

    expect(await allowedEmails.listPatterns()).toEqual(['ana@empresa.com', '@parceiro.com']);
  });

  it('devolve lista vazia quando não há padrões', async () => {
    expect(await allowedEmails.listPatterns()).toEqual([]);
  });
});
