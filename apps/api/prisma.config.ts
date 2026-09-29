import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Em desenvolvimento as variáveis vêm do .env da raiz; em produção, do ambiente.
const envFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` não acessa o banco, então a URL pode faltar no build.
    url: process.env.DATABASE_URL ?? '',
  },
});
