import { describe, expect, it } from 'vitest';
import { createLogger, type Logger } from './logger';

function captureLogLines(writeLogs: (logger: Logger) => void): Record<string, unknown>[] {
  const lines: string[] = [];
  const logger = createLogger(
    { level: 'info', pretty: false },
    { write: (line) => lines.push(line) },
  );

  writeLogs(logger);

  return lines.map((line) => JSON.parse(line));
}

describe('createLogger', () => {
  it('oculta cookies e tokens dos cabeçalhos', () => {
    const [line] = captureLogLines((logger) =>
      logger.info({
        req: { headers: { cookie: 'session=segredo', authorization: 'Bearer abc', host: 'x' } },
        res: { headers: { 'set-cookie': 'session=segredo' } },
      }),
    );

    expect(line?.req).toEqual({
      headers: { cookie: '[Redacted]', authorization: '[Redacted]', host: 'x' },
    });
    expect(line?.res).toEqual({ headers: { 'set-cookie': '[Redacted]' } });
  });

  it('registra a severidade no formato do Cloud Logging', () => {
    const [line] = captureLogLines((logger) => logger.warn('atenção'));

    expect(line).toMatchObject({ severity: 'WARN', msg: 'atenção' });
  });

  it('ignora mensagens abaixo do nível configurado', () => {
    const lines = captureLogLines((logger) => logger.debug('detalhe'));

    expect(lines).toEqual([]);
  });
});
