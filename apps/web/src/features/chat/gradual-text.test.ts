import { describe, expect, it } from 'vitest';
import { nextRevealLength } from './gradual-text';

describe('nextRevealLength', () => {
  it('mostra pelo menos um caractere por quadro', () => {
    expect(nextRevealLength(10, 12)).toBe(11);
  });

  it('acelera quando um bloco grande chega de uma vez', () => {
    expect(nextRevealLength(0, 3000)).toBe(100);
  });

  it('alcança o texto recebido em poucos quadros', () => {
    let shown = 0;
    let frames = 0;
    while (shown < 3000) {
      shown = nextRevealLength(shown, 3000);
      frames++;
    }
    expect(frames).toBeLessThan(200);
  });

  it('não passa do texto recebido', () => {
    expect(nextRevealLength(50, 50)).toBe(50);
    expect(nextRevealLength(60, 50)).toBe(50);
  });
});
