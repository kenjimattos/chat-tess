import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { INTEGRATION_DATABASE_URL } from './integration-database';

const API_ROOT = path.resolve(import.meta.dirname, '../..');

/** Setup global do Vitest: cria o banco de integração, se preciso, e aplica as migrações. */
export default async function prepareIntegrationDatabase(): Promise<void> {
  await createDatabaseIfMissing(INTEGRATION_DATABASE_URL);

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: INTEGRATION_DATABASE_URL },
    stdio: 'pipe',
  });
}

async function createDatabaseIfMissing(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.slice(1);
  url.pathname = '/postgres';

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }
}
