import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

export type Database = PrismaClient;

export function createDatabase(connectionString: string): Database {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export async function assertDatabaseIsReachable(database: Database): Promise<void> {
  await database.$queryRaw`SELECT 1`;
}
