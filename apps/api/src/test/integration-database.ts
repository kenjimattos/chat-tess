import type { Database } from '../infra/database/database';

/**
 * Banco dos testes de integração. É separado do banco dos testes ponta a ponta
 * para que as duas suítes possam rodar sem apagar os dados uma da outra.
 */
export const INTEGRATION_DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  'postgresql://chat_tess:chat_tess@localhost:5433/chat_tess_integration';

/** Apaga os dados de todas as tabelas, mantendo o histórico de migrações. */
export async function resetDatabase(database: Database): Promise<void> {
  const tables = await database.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const tableList = tables.map(({ tablename }) => `"${tablename}"`).join(', ');

  await database.$executeRawUnsafe(`TRUNCATE ${tableList} CASCADE`);
}
