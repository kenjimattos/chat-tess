import { useEffect, useState } from 'react';

/** Caracteres mostrados por quadro quando o texto está em dia com o stream (~60 por segundo). */
const MIN_CHARACTERS_PER_FRAME = 1;
/** Quadros para alcançar o texto recebido quando ele chega em blocos grandes (~0,5 s). */
const CATCH_UP_FRAMES = 30;

/**
 * Quantos caracteres mostrar no próximo quadro. O ritmo acompanha o atraso:
 * blocos grandes do stream aparecem aos poucos, mas sem ficar muito para trás.
 */
export function nextRevealLength(shown: number, received: number): number {
  const backlog = received - shown;
  if (backlog <= 0) {
    return received;
  }
  return shown + Math.max(MIN_CHARACTERS_PER_FRAME, Math.ceil(backlog / CATCH_UP_FRAMES));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Revela `text` aos poucos, um pedaço por quadro de animação. */
export function useGradualText(text: string): string {
  const [shownLength, setShownLength] = useState(0);
  const isBehind = shownLength < text.length;

  useEffect(() => {
    if (!isBehind) {
      return;
    }
    const frame = requestAnimationFrame(() =>
      setShownLength((shown) =>
        prefersReducedMotion() ? text.length : nextRevealLength(shown, text.length),
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [isBehind, shownLength, text.length]);

  return text.slice(0, shownLength);
}
