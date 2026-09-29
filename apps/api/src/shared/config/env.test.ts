import { describe, expect, it } from 'vitest';
import { InvalidConfigError, loadConfig } from './env';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
const requiredEnv = { DATABASE_URL };

describe('loadConfig', () => {
  it('aplica os valores padrão quando só o obrigatório é informado', () => {
    const config = loadConfig(requiredEnv);

    expect(config).toEqual({
      environment: 'development',
      isProduction: false,
      http: { port: 3000 },
      logging: { level: 'info', pretty: true },
      database: { url: DATABASE_URL },
      web: { distDir: undefined },
    });
  });

  it('lê os valores informados e converte os tipos', () => {
    const config = loadConfig({
      ...requiredEnv,
      NODE_ENV: 'production',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      WEB_DIST_DIR: '/app/web',
    });

    expect(config).toMatchObject({
      environment: 'production',
      isProduction: true,
      http: { port: 8080 },
      logging: { level: 'warn', pretty: false },
      web: { distDir: '/app/web' },
    });
  });

  it('trata variável em branco como não definida', () => {
    const config = loadConfig({ ...requiredEnv, PORT: '', WEB_DIST_DIR: '  ' });

    expect(config.http.port).toBe(3000);
    expect(config.web.distDir).toBeUndefined();
  });

  it('lista todas as variáveis inválidas no erro', () => {
    const load = () => loadConfig({ NODE_ENV: 'staging', PORT: 'abc' });

    expect(load).toThrow(InvalidConfigError);
    expect(load).toThrow(/NODE_ENV/);
    expect(load).toThrow(/PORT/);
    expect(load).toThrow(/DATABASE_URL/);
  });
});
