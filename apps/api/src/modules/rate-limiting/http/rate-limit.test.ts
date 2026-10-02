import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../../../shared/http/error-handler';
import { silentLogger } from '../../../shared/logging/logger';
import { RecordingEventPublisher } from '../../../test/recording-event-publisher';
import { ManualClock } from '../../../shared/time/clock';
import {
  TEST_USER_HEADER,
  fakeRequireAuthentication,
} from '../../auth/http/fake-authentication.test-support';
import { ConsumeRateLimit } from '../application/consume-rate-limit';
import { InMemoryRateLimitCounter } from '../infra/in-memory-rate-limit-counter';
import { createRateLimit } from './rate-limit';

function appLimitedTo(limit: number) {
  const consume = new ConsumeRateLimit(
    new InMemoryRateLimitCounter(),
    new RecordingEventPublisher(),
    new ManualClock('2026-09-30T10:00:50Z'),
  );
  const app = express();
  app.post(
    '/limited',
    fakeRequireAuthentication,
    createRateLimit(consume, { name: 'test', limit, windowSeconds: 60 }),
    (_request, response) => {
      response.status(204).end();
    },
  );
  app.use(createErrorHandler(silentLogger));
  return app;
}

describe('createRateLimit', () => {
  it('deixa passar dentro do limite', async () => {
    const response = await request(appLimitedTo(1)).post('/limited').set(TEST_USER_HEADER, 'ana');

    expect(response.status).toBe(204);
  });

  it('responde 429 com Retry-After acima do limite', async () => {
    const app = appLimitedTo(1);
    await request(app).post('/limited').set(TEST_USER_HEADER, 'ana');

    const response = await request(app).post('/limited').set(TEST_USER_HEADER, 'ana');

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('10');
    expect(response.body.error).toMatchObject({
      code: 'rate_limited',
      details: { retryAfterSeconds: 10 },
    });
  });
});
