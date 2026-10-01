import { useEffect } from 'react';

/**
 * Enquanto `isActive`, o navegador pede confirmação antes de fechar ou
 * recarregar a aba. O texto do aviso é do navegador: a página não o escolhe.
 */
export function useUnloadWarning(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // O Chrome antigo só mostra o aviso com `returnValue` preenchido.
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isActive]);
}
