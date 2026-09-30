import { afterEach, describe, expect, it } from 'vitest';
import { rememberReturnPath, restoreReturnPath } from './return-path';

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('caminho de volta depois do login', () => {
  it('volta à página guardada antes do login', () => {
    rememberReturnPath('/shared/abc');

    restoreReturnPath();

    expect(window.location.pathname).toBe('/shared/abc');
  });

  it('usa o caminho uma vez só', () => {
    rememberReturnPath('/shared/abc');
    restoreReturnPath();
    window.history.replaceState(null, '', '/');

    restoreReturnPath();

    expect(window.location.pathname).toBe('/');
  });

  it('não guarda a página inicial', () => {
    rememberReturnPath('/');

    expect(window.sessionStorage.length).toBe(0);
  });

  it('ignora um endereço de outro site', () => {
    window.sessionStorage.setItem('chat-tess:return-path', '//malicioso.example');

    restoreReturnPath();

    expect(window.location.pathname).toBe('/');
  });
});
