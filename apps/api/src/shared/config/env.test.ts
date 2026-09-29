import { describe, expect, it } from 'vitest';
import { InvalidConfigError, loadConfig } from './env';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
const SESSION_SECRET = 'um-segredo-de-sessao-com-mais-de-32-caracteres';

const requiredEnv = {
  DATABASE_URL,
  SESSION_SECRET,
  GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
};

describe('loadConfig', () => {
  it('aplica os valores padrão quando só o obrigatório é informado', () => {
    const config = loadConfig(requiredEnv);

    expect(config).toEqual({
      environment: 'development',
      isProduction: false,
      http: { port: 3000, publicBaseUrl: 'http://localhost:5173' },
      logging: { level: 'info', pretty: true },
      database: { url: DATABASE_URL },
      web: { distDir: undefined },
      session: { secret: SESSION_SECRET, ttlSeconds: 7 * 24 * 60 * 60, secureCookie: false },
      auth: {
        mode: 'google',
        google: {
          clientId: 'client-id.apps.googleusercontent.com',
          clientSecret: 'client-secret',
        },
      },
      allowedEmails: [],
    });
  });

  it('lê os valores informados e converte os tipos', () => {
    const config = loadConfig({
      ...requiredEnv,
      NODE_ENV: 'production',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      WEB_DIST_DIR: '/app/web',
      PUBLIC_BASE_URL: 'https://chat.example.com/',
      SESSION_TTL_HOURS: '2',
    });

    expect(config).toMatchObject({
      environment: 'production',
      isProduction: true,
      http: { port: 8080, publicBaseUrl: 'https://chat.example.com' },
      logging: { level: 'warn', pretty: false },
      web: { distDir: '/app/web' },
      session: { ttlSeconds: 7200, secureCookie: true },
    });
  });

  it('separa a lista de e-mails permitidos por vírgula', () => {
    const config = loadConfig({
      ...requiredEnv,
      ALLOWED_EMAILS: 'ana@empresa.com, @parceiro.com,,',
    });

    expect(config.allowedEmails).toEqual(['ana@empresa.com', '@parceiro.com']);
  });

  it('trata variável em branco como não definida', () => {
    const config = loadConfig({ ...requiredEnv, PORT: '', WEB_DIST_DIR: '  ' });

    expect(config.http.port).toBe(3000);
    expect(config.web.distDir).toBeUndefined();
  });

  it('lista todas as variáveis inválidas no erro', () => {
    const load = () => loadConfig({ NODE_ENV: 'staging', PORT: 'abc', SESSION_SECRET: 'curto' });

    expect(load).toThrow(InvalidConfigError);
    expect(load).toThrow(/NODE_ENV/);
    expect(load).toThrow(/PORT/);
    expect(load).toThrow(/DATABASE_URL/);
    expect(load).toThrow(/SESSION_SECRET/);
  });

  describe('modo de autenticação', () => {
    it('exige as credenciais do Google no modo "google"', () => {
      const load = () => loadConfig({ DATABASE_URL, SESSION_SECRET, AUTH_MODE: 'google' });

      expect(load).toThrow(/GOOGLE_OAUTH_CLIENT_ID/);
      expect(load).toThrow(/GOOGLE_OAUTH_CLIENT_SECRET/);
    });

    it('dispensa as credenciais do Google no modo "test"', () => {
      const config = loadConfig({ DATABASE_URL, SESSION_SECRET, AUTH_MODE: 'test' });

      expect(config.auth).toEqual({ mode: 'test' });
    });

    it('proíbe o modo "test" em produção', () => {
      const load = () => loadConfig({ ...requiredEnv, AUTH_MODE: 'test', NODE_ENV: 'production' });

      expect(load).toThrow(/AUTH_MODE/);
    });
  });
});
