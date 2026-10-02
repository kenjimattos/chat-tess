import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './map-with-concurrency';

/** Tarefa que registra quantas execuções estavam em andamento ao mesmo tempo. */
function trackingTask() {
  let running = 0;
  const tracker = {
    peak: 0,
    async run(value: number): Promise<number> {
      running++;
      tracker.peak = Math.max(tracker.peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return value * 2;
    },
  };
  return tracker;
}

describe('mapWithConcurrency', () => {
  it('nunca passa do limite de tarefas simultâneas', async () => {
    const task = trackingTask();

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, task.run);

    expect(task.peak).toBe(3);
  });

  it('devolve os resultados na ordem dos itens', async () => {
    const delaysMs = [15, 1, 8];

    const results = await mapWithConcurrency(delaysMs, 3, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });

    expect(results).toEqual(delaysMs);
  });

  it('roda tudo de uma vez quando há menos itens que o limite', async () => {
    const task = trackingTask();

    expect(await mapWithConcurrency([1, 2], 10, task.run)).toEqual([2, 4]);
    expect(task.peak).toBe(2);
  });

  it('devolve lista vazia sem itens', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  it('propaga a falha de uma tarefa', async () => {
    const failing = mapWithConcurrency([1, 2], 2, async (value) => {
      if (value === 2) {
        throw new Error('falhou');
      }
      return value;
    });

    await expect(failing).rejects.toThrow('falhou');
  });
});
