import { useEffect, useState, type RefObject } from 'react';

/** Distância do fim, em pixels, abaixo da qual a lista conta como "no fim". */
const BOTTOM_TOLERANCE_PX = 48;

/**
 * Acompanha se há conteúdo abaixo da área visível de uma lista rolável. A
 * lista não rola sozinha enquanto a resposta chega; quem decide descer é o usuário.
 */
export function useScrollPosition(container: RefObject<HTMLElement | null>) {
  const [hasContentBelow, setHasContentBelow] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) {
      return;
    }
    const update = () =>
      setHasContentBelow(
        element.scrollHeight - element.scrollTop - element.clientHeight > BOTTOM_TOLERANCE_PX,
      );
    // O conteúdo cresce com a resposta sem gerar evento de rolagem.
    const growth = new MutationObserver(update);
    growth.observe(element, { childList: true, subtree: true, characterData: true });
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      growth.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [container]);

  return { hasContentBelow };
}

export function scrollToBottom(element: HTMLElement | null, behavior: ScrollBehavior = 'smooth') {
  element?.scrollTo?.({ top: element.scrollHeight, behavior });
}
