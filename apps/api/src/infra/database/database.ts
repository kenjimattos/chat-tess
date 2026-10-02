import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

export type Database = PrismaClient;

/**
 * `poolMax` limita as conexões abertas por instância. O Cloud SQL pequeno aceita
 * poucas conexões: 2 instâncias do Cloud Run somadas à migração precisam caber nelas.
 */
export function createDatabase(connectionString: string, poolMax?: number): Database {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, ...(poolMax && { max: poolMax }) }),
  });
}

export async function assertDatabaseIsReachable(database: Database): Promise<void> {
  await database.$queryRaw`SELECT 1`;
}
