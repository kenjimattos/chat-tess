import { z } from 'zod';

/**
 * Única porta de entrada das variáveis de ambiente. O restante do código recebe
 * um `AppConfig` tipado e nunca lê `process.env` diretamente.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  /** Pasta com o build do frontend; quando definida, a API também serve o site. */
  WEB_DIST_DIR: z.string().optional(),
});

export interface AppConfig {
  environment: 'development' | 'test' | 'production';
  isProduction: boolean;
  http: { port: number };
  logging: { level: string; pretty: boolean };
  database: { url: string };
  web: { distDir: string | undefined };
}

export class InvalidConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Configuração inválida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'InvalidConfigError';
  }
}

export type EnvSource = Record<string, string | undefined>;

export function loadConfig(source: EnvSource = process.env): AppConfig {
  const parsed = envSchema.safeParse(withoutBlankValues(source));
  if (!parsed.success) {
    throw new InvalidConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  return {
    environment: env.NODE_ENV,
    isProduction,
    http: { port: env.PORT },
    logging: { level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' },
    database: { url: env.DATABASE_URL },
    web: { distDir: env.WEB_DIST_DIR },
  };
}

/** Em arquivos .env, `CHAVE=` significa "não definida", e não "string vazia". */
function withoutBlankValues(source: EnvSource): EnvSource {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
}
