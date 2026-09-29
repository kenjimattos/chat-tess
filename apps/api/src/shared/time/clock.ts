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

/** Relógio controlado pelo teste: o tempo só avança quando o teste pede. */
export class ManualClock implements Clock {
  private current: Date;

  constructor(start: Date | string) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceBy(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
