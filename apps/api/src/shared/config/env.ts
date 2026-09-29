import { z } from 'zod';

/**
 * Única porta de entrada das variáveis de ambiente. O restante do código recebe
 * um `AppConfig` tipado e nunca lê `process.env` diretamente.
 */

const commaSeparatedList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    /** Pasta com o build do frontend; quando definida, a API também serve o site. */
    WEB_DIST_DIR: z.string().optional(),
    /** Endereço pelo qual o navegador acessa a aplicação. */
    PUBLIC_BASE_URL: z.url().default('http://localhost:5173'),

    SESSION_SECRET: z.string().min(32, 'precisa ter pelo menos 32 caracteres'),
    SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(24 * 7),
    AUTH_MODE: z.enum(['google', 'test']).default('google'),
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    ALLOWED_EMAILS: commaSeparatedList,
  })
  .superRefine((env, context) => {
    if (env.AUTH_MODE === 'test' && env.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'o modo "test" permite entrar sem senha e é proibido em produção',
      });
    }
    if (env.AUTH_MODE === 'google') {
      for (const key of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'] as const) {
        if (!env[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: 'obrigatório no modo "google"',
          });
        }
      }
    }
  });

export type AuthConfig =
  { mode: 'google'; google: { clientId: string; clientSecret: string } } | { mode: 'test' };

export interface AppConfig {
  environment: 'development' | 'test' | 'production';
  isProduction: boolean;
  http: { port: number; publicBaseUrl: string };
  logging: { level: string; pretty: boolean };
  database: { url: string };
  web: { distDir: string | undefined };
  session: { secret: string; ttlSeconds: number; secureCookie: boolean };
  auth: AuthConfig;
  /** Padrões garantidos na lista de permitidos durante a inicialização. */
  allowedEmails: string[];
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
    http: { port: env.PORT, publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, '') },
    logging: { level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' },
    database: { url: env.DATABASE_URL },
    web: { distDir: env.WEB_DIST_DIR },
    session: {
      secret: env.SESSION_SECRET,
      ttlSeconds: env.SESSION_TTL_HOURS * 60 * 60,
      secureCookie: isProduction,
    },
    auth: toAuthConfig(env),
    allowedEmails: env.ALLOWED_EMAILS,
  };
}

function toAuthConfig(env: z.infer<typeof envSchema>): AuthConfig {
  if (env.AUTH_MODE === 'test') {
    return { mode: 'test' };
  }
  // Presença garantida pelo superRefine do schema.
  return {
    mode: 'google',
    google: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    },
  };
}

/** Em arquivos .env, `CHAVE=` significa "não definida", e não "string vazia". */
function withoutBlankValues(source: EnvSource): EnvSource {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
}
