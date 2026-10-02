import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app';
import { RecordingEventPublisher } from '../../../test/recording-event-publisher';
import { silentLogger } from '../../../infra/logging/logger';
import { ManualClock } from '../../../shared/time/clock';
import {
  TEST_ROLE_HEADER,
  TEST_USER_HEADER,
  fakeRequireAuthentication,
} from '../../auth/http/fake-authentication.test-support';
import { InMemoryUserRepository } from '../../auth/infra/in-memory-user-repository';
import { GetUsageSummary } from '../application/get-usage-summary';
import { SetCreditLimit } from '../application/set-credit-limit';
import { InMemoryUsageLedger } from '../infra/in-memory-usage-ledger';
import { createBillingRouter } from './billing-router';

describe('rotas de consumo', () => {
  let app: ReturnType<typeof createApp>;
  let ledger: InMemoryUsageLedger;
  let anaId: string;

  beforeEach(async () => {
    const users = new InMemoryUserRepository();
    anaId = (await users.create({ email: 'ana@empresa.com', name: 'Ana', avatarUrl: null })).id;
    ledger = new InMemoryUsageLedger(1000);
    await ledger.record({
      userId: anaId,
      conversationId: 'c1',
      model: 'gemini-teste',
      purpose: 'chat',
      usage: { inputTokens: 90, outputTokens: 10, totalTokens: 100 },
      occurredAt: new Date('2026-09-30T10:00:00Z'),
    });
    const clock = new ManualClock('2026-09-30T12:00:00Z');
    const router = createBillingRouter({
      requireAuthentication: fakeRequireAuthentication,
      getUsageSummary: new GetUsageSummary(ledger),
      setCreditLimit: new SetCreditLimit(users, ledger, new RecordingEventPublisher(), clock),
    });
    app = createApp({ logger: silentLogger, apiRouters: [router], readinessChecks: {} });
  });

  it('GET /api/usage devolve o consumo do usuário', async () => {
    const response = await request(app).get('/api/usage').set(TEST_USER_HEADER, anaId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      tokenLimit: 1000,
      tokensUsed: 100,
      remainingTokens: 900,
      recentUsage: [
        {
          conversationId: 'c1',
          model: 'gemini-teste',
          purpose: 'chat',
          usage: { inputTokens: 90, outputTokens: 10, totalTokens: 100 },
          occurredAt: '2026-09-30T10:00:00.000Z',
        },
      ],
    });
  });

  it('PUT /api/admin/credit-limits muda o limite quando quem pede é administrador', async () => {
    const response = await request(app)
      .put('/api/admin/credit-limits')
      .set(TEST_USER_HEADER, 'admin-1')
      .set(TEST_ROLE_HEADER, 'admin')
      .send({ email: 'ana@empresa.com', tokenLimit: 50 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: anaId, tokenLimit: 50, tokensUsed: 100 });
  });

  it('PUT /api/admin/credit-limits recusa quem não é administrador', async () => {
    const response = await request(app)
      .put('/api/admin/credit-limits')
      .set(TEST_USER_HEADER, anaId)
      .send({ email: 'ana@empresa.com', tokenLimit: 999_999 });

    expect(response.status).toBe(403);
    expect((await ledger.accountOf(anaId)).tokenLimit).toBe(1000);
  });
});
