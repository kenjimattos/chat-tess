import pino, { type DestinationStream, type Logger } from 'pino';

export type { Logger };

export interface LoggerOptions {
  level: string;
  pretty: boolean;
}

/** Credenciais nunca devem aparecer nos logs de requisição. */
const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

export function createLogger(
  { level, pretty }: LoggerOptions,
  destination?: DestinationStream,
): Logger {
  const options = {
    level,
    redact: REDACTED_PATHS,
    // Cloud Logging lê a severidade do campo "severity".
    formatters: { level: (label: string) => ({ severity: label.toUpperCase() }) },
    ...(pretty && { transport: { target: 'pino-pretty' } }),
  };

  return destination ? pino(options, destination) : pino(options);
}

export const silentLogger: Logger = pino({ level: 'silent' });
