import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../../../http/error-handler';
import { silentLogger } from '../../../shared/logging/logger';
import {
  TEST_USER_HEADER,
  fakeRequireAuthentication,
} from '../../auth/http/fake-authentication.test-support';
import { createOneUploadAtATime } from './one-upload-at-a-time';

/**
 * App com uma rota de upload que só responde quando o teste manda.
 * `uploadStarted()` espera o próximo upload chegar à rota; `finishUploads()` libera todos.
 */
function appWithSlowUpload() {
  let announceStart = () => {};
  let finishUploads = () => {};
  const finished = new Promise<void>((resolve) => {
    finishUploads = resolve;
  });

  const app = express();
  app.post(
    '/upload',
    fakeRequireAuthentication,
    createOneUploadAtATime(),
    async (_request, response) => {
      announceStart();
      await finished;
      response.status(201).end();
    },
  );
  app.post('/failing-upload', fakeRequireAuthentication, createOneUploadAtATime(), () => {
    throw new Error('falha ao gravar');
  });
  app.use(createErrorHandler(silentLogger));

  const uploadStarted = () =>
    new Promise<void>((resolve) => {
      announceStart = resolve;
    });
  return { app, uploadStarted, finishUploads };
}

describe('createOneUploadAtATime', () => {
  it('recusa o segundo upload do usuário enquanto o primeiro está em andamento', async () => {
    const { app, uploadStarted, finishUploads } = appWithSlowUpload();
    const started = uploadStarted();
    const first = request(app).post('/upload').set(TEST_USER_HEADER, 'ana').then();
    await started;

    const second = await request(app).post('/upload').set(TEST_USER_HEADER, 'ana');

    expect(second.status).toBe(429);
    expect(second.body.error).toMatchObject({
      code: 'upload_in_progress',
      message:
        'Você já tem um envio de arquivo em andamento. Aguarde ele terminar e tente de novo.',
    });
    finishUploads();
    expect((await first).status).toBe(201);
  });

  it('aceita o upload seguinte depois que o anterior termina', async () => {
    const { app, finishUploads } = appWithSlowUpload();
    finishUploads();
    await request(app).post('/upload').set(TEST_USER_HEADER, 'ana');

    const next = await request(app).post('/upload').set(TEST_USER_HEADER, 'ana');

    expect(next.status).toBe(201);
  });

  it('aceita o upload seguinte depois que o anterior falha', async () => {
    const { app, finishUploads } = appWithSlowUpload();
    finishUploads();
    await request(app).post('/failing-upload').set(TEST_USER_HEADER, 'ana');

    const next = await request(app).post('/upload').set(TEST_USER_HEADER, 'ana');

    expect(next.status).toBe(201);
  });

  it('não segura o upload de outro usuário', async () => {
    const { app, uploadStarted, finishUploads } = appWithSlowUpload();
    const started = uploadStarted();
    const fromAna = request(app).post('/upload').set(TEST_USER_HEADER, 'ana').then();
    await started;

    const bia = uploadStarted();
    const fromBia = request(app).post('/upload').set(TEST_USER_HEADER, 'bia').then();
    await bia;

    finishUploads();
    expect((await fromAna).status).toBe(201);
    expect((await fromBia).status).toBe(201);
  });
});
