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

const positiveInteger = z.coerce.number().int().positive();

const envSchema = z
  .object({
    // Servidor
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: positiveInteger.default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    /** Pasta com o build do frontend; quando definida, a API também serve o site. */
    WEB_DIST_DIR: z.string().optional(),
    /** Endereço pelo qual o navegador acessa a aplicação. */
    PUBLIC_BASE_URL: z.url().default('http://localhost:5173'),

    // Sessão e login
    SESSION_SECRET: z.string().min(32, 'precisa ter pelo menos 32 caracteres'),
    SESSION_TTL_HOURS: positiveInteger.default(24 * 7),
    AUTH_MODE: z.enum(['google', 'test']).default('google'),
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    ALLOWED_EMAILS: commaSeparatedList,

    // LLM e agente
    LLM_MODE: z.enum(['gemini', 'fake']).default('gemini'),
    GCP_PROJECT_ID: z.string().optional(),
    GCP_LOCATION: z.string().default('global'),
    GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
    CONTEXT_TOKEN_LIMIT: positiveInteger.default(1_000_000),
    COMPACTION_THRESHOLD_RATIO: z.coerce.number().gt(0).lt(1).default(0.8),
    COMPACTION_KEEP_RECENT_MESSAGES: positiveInteger.default(6),
    MAX_TOOL_ROUNDS: positiveInteger.default(8),

    // Arquivos
    FILE_STORAGE: z.enum(['local', 'gcs']).default('local'),
    GCS_BUCKET: z.string().optional(),
    LOCAL_STORAGE_DIR: z.string().default('.storage'),
    MAX_UPLOAD_MB: positiveInteger.default(20),
  })
  .superRefine((env, context) => {
    const fail = (key: keyof typeof env, message: string) =>
      context.addIssue({ code: 'custom', path: [key], message });

    if (env.NODE_ENV === 'production') {
      if (env.AUTH_MODE === 'test') {
        fail('AUTH_MODE', 'o modo "test" permite entrar sem senha e é proibido em produção');
      }
      if (env.LLM_MODE === 'fake') {
        fail('LLM_MODE', 'o modo "fake" responde com texto roteirizado e é proibido em produção');
      }
    }

    const requiredWhen = (condition: boolean, keys: (keyof typeof env)[], reason: string) => {
      for (const key of condition ? keys : []) {
        if (!env[key]) {
          fail(key, `obrigatório ${reason}`);
        }
      }
    };
    requiredWhen(
      env.AUTH_MODE === 'google',
      ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
      'no modo de login "google"',
    );
    requiredWhen(env.LLM_MODE === 'gemini', ['GCP_PROJECT_ID'], 'com LLM_MODE "gemini"');
    requiredWhen(env.FILE_STORAGE === 'gcs', ['GCS_BUCKET'], 'com FILE_STORAGE "gcs"');
  });

type Env = z.infer<typeof envSchema>;

export type AuthConfig =
  { mode: 'google'; google: { clientId: string; clientSecret: string } } | { mode: 'test' };

export type LlmConfig =
  { mode: 'gemini'; project: string; location: string; model: string } | { mode: 'fake' };

export type FileStorageConfig =
  { kind: 'local'; rootDir: string } | { kind: 'gcs'; bucket: string };

export interface AgentConfig {
  contextTokenLimit: number;
  thresholdRatio: number;
  keepRecentMessages: number;
  maxToolRounds: number;
}

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
  llm: LlmConfig;
  agent: AgentConfig;
  files: { storage: FileStorageConfig; maxSizeBytes: number };
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
    llm: toLlmConfig(env),
    agent: {
      contextTokenLimit: env.CONTEXT_TOKEN_LIMIT,
      thresholdRatio: env.COMPACTION_THRESHOLD_RATIO,
      keepRecentMessages: env.COMPACTION_KEEP_RECENT_MESSAGES,
      maxToolRounds: env.MAX_TOOL_ROUNDS,
    },
    files: {
      storage:
        env.FILE_STORAGE === 'gcs'
          ? { kind: 'gcs', bucket: env.GCS_BUCKET ?? '' }
          : { kind: 'local', rootDir: env.LOCAL_STORAGE_DIR },
      maxSizeBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    },
  };
}

// Nas funções abaixo, a presença das variáveis condicionais é garantida pelo superRefine.

function toAuthConfig(env: Env): AuthConfig {
  if (env.AUTH_MODE === 'test') {
    return { mode: 'test' };
  }
  return {
    mode: 'google',
    google: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    },
  };
}

function toLlmConfig(env: Env): LlmConfig {
  if (env.LLM_MODE === 'fake') {
    return { mode: 'fake' };
  }
  return {
    mode: 'gemini',
    project: env.GCP_PROJECT_ID ?? '',
    location: env.GCP_LOCATION,
    model: env.GEMINI_MODEL,
  };
}

/** Em arquivos .env, `CHAVE=` significa "não definida", e não "string vazia". */
function withoutBlankValues(source: EnvSource): EnvSource {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
}
