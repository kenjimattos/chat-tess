import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app';
import { silentLogger } from '../../../shared/logging/logger';
import {
  TEST_USER_HEADER,
  fakeRequireAuthentication,
} from '../../auth/http/fake-authentication.test-support';
import { ReadAttachment } from '../application/read-attachment';
import { ReadSharedAttachment } from '../application/read-shared-attachment';
import {
  ANA,
  BIA,
  MAX_SIZE_BYTES,
  PDF_CONTENT,
  filesTestBed,
} from '../application/files-test-bed.test-support';
import { noRateLimit } from '../../rate-limiting/http/no-rate-limit.test-support';
import { createFilesRouter } from './files-router';

describe('rotas de arquivos', () => {
  let app: ReturnType<typeof createApp>;
  let bed: Awaited<ReturnType<typeof filesTestBed>>;
  let anaConversationId: string;

  beforeEach(async () => {
    bed = await filesTestBed();
    anaConversationId = bed.anaConversation.id;
    const router = createFilesRouter({
      requireAuthentication: fakeRequireAuthentication,
      uploadRateLimit: noRateLimit,
      uploadAttachment: bed.upload,
      readAttachment: new ReadAttachment(bed.attachments, bed.storage),
      readSharedAttachment: new ReadSharedAttachment(
        bed.conversations,
        bed.attachments,
        bed.storage,
      ),
      maxSizeBytes: MAX_SIZE_BYTES,
    });
    app = createApp({ logger: silentLogger, apiRouters: [router], readinessChecks: {} });
  });

  const as = (userId: string) => ({ [TEST_USER_HEADER]: userId });

  function uploadPdf(fileName = 'relatório.pdf', content = PDF_CONTENT) {
    return request(app)
      .post(`/api/conversations/${anaConversationId}/attachments`)
      .set(as(ANA))
      .attach('file', content, fileName);
  }

  it('recebe o arquivo e devolve o anexo', async () => {
    const response = await uploadPdf();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      type: 'attachment',
      fileName: 'relatório.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF_CONTENT.length,
    });
  });

  it('recusa arquivo acima do limite com erro claro', async () => {
    const response = await uploadPdf('grande.pdf', Buffer.alloc(MAX_SIZE_BYTES + 1, 0x25));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('file_too_large');
  });

  it('recusa requisição sem arquivo', async () => {
    const response = await request(app)
      .post(`/api/conversations/${anaConversationId}/attachments`)
      .set(as(ANA))
      .field('outro', 'valor');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('missing_file');
  });

  it('exige autenticação', async () => {
    const response = await request(app)
      .post(`/api/conversations/${anaConversationId}/attachments`)
      .attach('file', PDF_CONTENT, 'a.pdf');

    expect(response.status).toBe(401);
  });

  it('devolve o arquivo ao dono com cabeçalhos seguros', async () => {
    const { body } = await uploadPdf();

    const response = await request(app).get(`/api/attachments/${body.attachmentId}`).set(as(ANA));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toBe(
      "inline; filename*=UTF-8''relat%C3%B3rio.pdf",
    );
    expect(Buffer.from(response.body)).toEqual(PDF_CONTENT);
  });

  it('não devolve o arquivo a outro usuário', async () => {
    const { body } = await uploadPdf();

    const response = await request(app).get(`/api/attachments/${body.attachmentId}`).set(as(BIA));

    expect(response.status).toBe(404);
  });

  it('devolve a outro usuário o anexo de uma conversa compartilhada, sem cache', async () => {
    const { body } = await uploadPdf();
    await bed.attachments.linkToMessage([body.attachmentId], 'message-1');
    const { token } = await bed.conversations.createIfAbsent(anaConversationId, 'a'.repeat(32));

    const response = await request(app)
      .get(`/api/shared/${token}/attachments/${body.attachmentId}`)
      .set(as(BIA));

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(response.body)).toEqual(PDF_CONTENT);
  });

  it('exige login para o anexo compartilhado', async () => {
    const { body } = await uploadPdf();
    await bed.attachments.linkToMessage([body.attachmentId], 'message-1');
    const { token } = await bed.conversations.createIfAbsent(anaConversationId, 'a'.repeat(32));

    const response = await request(app).get(
      `/api/shared/${token}/attachments/${body.attachmentId}`,
    );

    expect(response.status).toBe(401);
  });
});
