import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app';
import { AppError } from './shared/errors/app-error';
import { silentLogger } from './shared/logging/logger';

function buildApp(configureRoutes: (router: Router) => void = () => {}, webDistDir?: string) {
  const router = Router();
  configureRoutes(router);
  return createApp({
    logger: silentLogger,
    apiRouters: [router],
    readinessChecks: {},
    webDistDir,
  });
}

describe('createApp', () => {
  it('responde ao health check', async () => {
    const response = await request(buildApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('devolve 404 em JSON para rota de API desconhecida', async () => {
    const response = await request(buildApp()).get('/api/inexistente');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('route_not_found');
  });

  it('traduz AppError para o status HTTP correspondente', async () => {
    const app = buildApp((router) => {
      router.get('/conversations/1', () => {
        throw new AppError('not_found', 'conversation_not_found', 'Conversa não encontrada.');
      });
    });

    const response = await request(app).get('/api/conversations/1');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'conversation_not_found', message: 'Conversa não encontrada.' },
    });
  });

  it('traduz erro de validação do Zod para 400 com os campos inválidos', async () => {
    const app = buildApp((router) => {
      router.post('/echo', (request) => {
        z.object({ title: z.string() }).parse(request.body);
      });
    });

    const response = await request(app).post('/api/echo').send({ title: 42 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_request');
    expect(response.body.error.details).toEqual([expect.objectContaining({ path: 'title' })]);
  });

  it('esconde os detalhes de um erro inesperado', async () => {
    const app = buildApp((router) => {
      router.get('/boom', () => {
        throw new Error('senha do banco: 1234');
      });
    });

    const response = await request(app).get('/api/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'internal_error', message: 'Erro interno do servidor.' },
    });
  });

  describe('com o build do frontend', () => {
    const webDistDir = mkdtempSync(path.join(tmpdir(), 'chat-tess-web-'));
    writeFileSync(path.join(webDistDir, 'index.html'), '<html>chat-tess</html>');
    writeFileSync(path.join(webDistDir, 'app.js'), 'console.log("app")');

    it('serve arquivos estáticos', async () => {
      const response = await request(buildApp(undefined, webDistDir)).get('/app.js');

      expect(response.status).toBe(200);
      expect(response.text).toContain('console.log');
    });

    it('devolve o index.html para rotas do lado do cliente', async () => {
      const response = await request(buildApp(undefined, webDistDir))
        .get('/conversations/abc')
        .set('Accept', 'text/html');

      expect(response.status).toBe(200);
      expect(response.text).toContain('chat-tess');
    });

    it('envia as páginas com a política que só deixa carregar conteúdo da própria origem', async () => {
      const response = await request(buildApp(undefined, webDistDir))
        .get('/conversations/abc')
        .set('Accept', 'text/html');

      const policy = response.headers['content-security-policy'];
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("img-src 'self' data: blob:");
      expect(policy).toContain("frame-ancestors 'none'");
    });

    it('não devolve o index.html para rota de API desconhecida', async () => {
      const response = await request(buildApp(undefined, webDistDir))
        .get('/api/inexistente')
        .set('Accept', 'text/html');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('route_not_found');
    });
  });
});
