import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { retryTransient, type RetryPolicy } from './retry-transient';

function recordingPolicy(delaysMs: number[] = [500, 1000, 2000]) {
  const waits: number[] = [];
  const policy: RetryPolicy = {
    delaysMs,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
  };
  return { policy, waits };
}

function failingTimes(times: number, error: unknown) {
  let calls = 0;
  const operation = async () => {
    calls++;
    if (calls <= times) {
      throw error;
    }
    return 'ok';
  };
  return { operation, calls: () => calls };
}

const tooManyRequests = new ApiError({ status: 429, message: 'Resource exhausted' });

describe('retryTransient', () => {
  it('tenta de novo com espera crescente quando o provedor está sobrecarregado', async () => {
    const { policy, waits } = recordingPolicy();
    const { operation, calls } = failingTimes(2, tooManyRequests);

    await expect(retryTransient(operation, policy)).resolves.toBe('ok');
    expect(calls()).toBe(3);
    expect(waits).toEqual([500, 1000]);
  });

  it('desiste depois da última tentativa e repassa o erro', async () => {
    const { policy } = recordingPolicy([10]);
    const { operation, calls } = failingTimes(5, tooManyRequests);

    await expect(retryTransient(operation, policy)).rejects.toBe(tooManyRequests);
    expect(calls()).toBe(2);
  });

  it.each([500, 503])('também repete o status %i', async (status) => {
    const { policy } = recordingPolicy();
    const { operation } = failingTimes(1, new ApiError({ status, message: 'falha' }));

    await expect(retryTransient(operation, policy)).resolves.toBe('ok');
  });

  it('não repete erros que não são passageiros', async () => {
    const { policy, waits } = recordingPolicy();
    const badRequest = new ApiError({ status: 400, message: 'Invalid argument' });
    const { operation, calls } = failingTimes(1, badRequest);

    await expect(retryTransient(operation, policy)).rejects.toBe(badRequest);
    expect(calls()).toBe(1);
    expect(waits).toEqual([]);
  });

  it('não repete quando o cliente já desconectou', async () => {
    const { policy } = recordingPolicy();
    const { operation, calls } = failingTimes(1, tooManyRequests);
    const controller = new AbortController();
    controller.abort();

    await expect(retryTransient(operation, policy, controller.signal)).rejects.toBe(
      tooManyRequests,
    );
    expect(calls()).toBe(1);
  });
});
