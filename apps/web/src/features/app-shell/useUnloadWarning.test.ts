import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUnloadWarning } from './useUnloadWarning';

/** Dispara o `beforeunload` e diz se a página pediu a confirmação do navegador. */
function unloadAsksForConfirmation(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('useUnloadWarning', () => {
  it('pede confirmação para sair enquanto está ativo', () => {
    renderHook(() => useUnloadWarning(true));

    expect(unloadAsksForConfirmation()).toBe(true);
  });

  it('deixa sair sem aviso quando não está ativo', () => {
    renderHook(() => useUnloadWarning(false));

    expect(unloadAsksForConfirmation()).toBe(false);
  });

  it('para de avisar quando deixa de estar ativo', () => {
    const { rerender } = renderHook(({ isActive }) => useUnloadWarning(isActive), {
      initialProps: { isActive: true },
    });

    rerender({ isActive: false });

    expect(unloadAsksForConfirmation()).toBe(false);
  });

  it('para de avisar quando o componente sai da tela', () => {
    const { unmount } = renderHook(() => useUnloadWarning(true));

    unmount();

    expect(unloadAsksForConfirmation()).toBe(false);
  });
});
