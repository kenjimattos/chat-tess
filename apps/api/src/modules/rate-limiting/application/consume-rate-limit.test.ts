import { beforeEach, describe, expect, it } from 'vitest';
import { RecordingEventPublisher } from '../../../test/recording-event-publisher';
import { ManualClock } from '../../../kernel/time/clock';
import { RateLimitExceededError, type RateLimitPolicy } from '../domain/rate-limit';
import { InMemoryRateLimitCounter } from '../infra/in-memory-rate-limit-counter';
import { ConsumeRateLimit } from './consume-rate-limit';

const messages: RateLimitPolicy = { name: 'messages', limit: 2, windowSeconds: 60 };

describe('ConsumeRateLimit', () => {
  let clock: ManualClock;
  let events: RecordingEventPublisher;
  let consume: ConsumeRateLimit;

  beforeEach(() => {
    clock = new ManualClock('2026-09-30T10:00:15Z');
    events = new RecordingEventPublisher();
    consume = new ConsumeRateLimit(new InMemoryRateLimitCounter(), events, clock);
  });

  it('aceita requisições até o limite da janela', async () => {
    await consume.execute(messages, 'ana');
    await consume.execute(messages, 'ana');

    expect(events.ofType('rate_limit.exceeded')).toEqual([]);
  });

  it('recusa a requisição acima do limite e informa quando tentar de novo', async () => {
    await consume.execute(messages, 'ana');
    await consume.execute(messages, 'ana');

    const refusal = consume.execute(messages, 'ana');

    await expect(refusal).rejects.toThrow(RateLimitExceededError);
    await expect(refusal).rejects.toMatchObject({ retryAfterSeconds: 45 });
  });

  it('libera de novo na janela seguinte', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await consume.execute(messages, 'ana');
    }

    clock.advanceBy(45_000);

    await expect(consume.execute(messages, 'ana')).resolves.toBeUndefined();
  });

  it('conta cada usuário e cada política separadamente', async () => {
    await consume.execute(messages, 'ana');
    await consume.execute(messages, 'ana');

    await expect(consume.execute(messages, 'bia')).resolves.toBeUndefined();
    await expect(consume.execute({ ...messages, name: 'uploads' }, 'ana')).resolves.toBeUndefined();
  });

  it('registra na auditoria só a primeira recusa da janela', async () => {
    await consume.execute(messages, 'ana');
    await consume.execute(messages, 'ana');

    await expect(consume.execute(messages, 'ana')).rejects.toThrow();
    await expect(consume.execute(messages, 'ana')).rejects.toThrow();

    expect(events.ofType('rate_limit.exceeded')).toEqual([
      expect.objectContaining({
        actorUserId: 'ana',
        payload: { policy: 'messages', limit: 2, windowSeconds: 60 },
      }),
    ]);
  });
});
