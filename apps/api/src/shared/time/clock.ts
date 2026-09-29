/** Fonte do horário atual; permite fixar o tempo nos testes. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function fixedClock(instant: Date | string): Clock {
  const fixedInstant = new Date(instant);
  return { now: () => new Date(fixedInstant) };
}
