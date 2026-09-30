import { describe, expect, it } from 'vitest';
import { windowStartOf } from './rate-limit';

describe('windowStartOf', () => {
  it('alinha o instante ao início da janela fixa', () => {
    expect(windowStartOf(new Date('2026-09-30T10:00:42.500Z'), 60)).toEqual(
      new Date('2026-09-30T10:00:00Z'),
    );
    expect(windowStartOf(new Date('2026-09-30T10:07:00Z'), 300)).toEqual(
      new Date('2026-09-30T10:05:00Z'),
    );
  });
});
