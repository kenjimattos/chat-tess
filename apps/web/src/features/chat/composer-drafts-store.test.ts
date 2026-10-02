import type { AttachmentPart } from '@chat-tess/shared';
import { describe, expect, it, vi } from 'vitest';
import { ComposerDraftsStore } from './composer-drafts-store';

function attachment(attachmentId: string): AttachmentPart {
  return {
    type: 'attachment',
    attachmentId,
    fileName: `${attachmentId}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 10,
  };
}

describe('ComposerDraftsStore', () => {
  it('começa com o rascunho vazio', () => {
    const drafts = new ComposerDraftsStore();

    expect(drafts.draftOf('a')).toEqual({ text: '', attachments: [], uploadingCount: 0 });
  });

  it('guarda texto e anexos separados por conversa', () => {
    const drafts = new ComposerDraftsStore();

    drafts.setText('a', 'Veja o arquivo');
    drafts.uploadStarted('a');
    drafts.uploadFinished('a', attachment('relatorio'));
    drafts.setText('b', 'Outro assunto');

    expect(drafts.draftOf('a')).toEqual({
      text: 'Veja o arquivo',
      attachments: [attachment('relatorio')],
      uploadingCount: 0,
    });
    expect(drafts.draftOf('b')).toEqual({
      text: 'Outro assunto',
      attachments: [],
      uploadingCount: 0,
    });
  });

  it('conta os uploads em andamento e não anexa o que falhou', () => {
    const drafts = new ComposerDraftsStore();

    drafts.uploadStarted('a');
    drafts.uploadStarted('a');
    expect(drafts.draftOf('a').uploadingCount).toBe(2);

    drafts.uploadFinished('a');
    drafts.uploadFinished('a', attachment('ok'));

    expect(drafts.draftOf('a')).toMatchObject({
      attachments: [attachment('ok')],
      uploadingCount: 0,
    });
  });

  it('remove um anexo do rascunho', () => {
    const drafts = new ComposerDraftsStore();
    drafts.uploadStarted('a');
    drafts.uploadFinished('a', attachment('um'));
    drafts.uploadStarted('a');
    drafts.uploadFinished('a', attachment('dois'));

    drafts.removeAttachment('a', 'um');

    expect(drafts.draftOf('a').attachments).toEqual([attachment('dois')]);
  });

  it('limpa texto e anexos depois do envio, sem perder a conta dos uploads em andamento', () => {
    const drafts = new ComposerDraftsStore();
    drafts.setText('a', 'Pronto');
    drafts.uploadStarted('a');
    drafts.uploadFinished('a', attachment('um'));
    drafts.uploadStarted('a');

    drafts.clearSent('a');

    expect(drafts.draftOf('a')).toEqual({ text: '', attachments: [], uploadingCount: 1 });
  });

  it('avisa os inscritos a cada mudança e mantém o snapshot entre mudanças', () => {
    const drafts = new ComposerDraftsStore();
    const listener = vi.fn();
    const unsubscribe = drafts.subscribe(listener);

    drafts.setText('a', 'oi');
    const snapshot = drafts.draftOf('a');
    unsubscribe();
    drafts.setText('b', 'sem aviso');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(drafts.draftOf('a')).toBe(snapshot);
  });

  describe('depois de recarregar a página', () => {
    /** Dublê do sessionStorage: sobrevive à troca de store, como a aba sobrevive ao reload. */
    function fakeTextStorage() {
      const items = new Map<string, string>();
      return {
        items,
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
        removeItem: (key: string) => void items.delete(key),
      };
    }

    it('recupera o texto digitado', () => {
      const textStorage = fakeTextStorage();
      new ComposerDraftsStore(textStorage).setText('a', 'Texto por terminar');

      const afterReload = new ComposerDraftsStore(textStorage);

      expect(afterReload.draftOf('a').text).toBe('Texto por terminar');
      expect(afterReload.draftOf('b').text).toBe('');
    });

    it('esquece o texto depois do envio', () => {
      const textStorage = fakeTextStorage();
      const drafts = new ComposerDraftsStore(textStorage);
      drafts.setText('a', 'Enviado');

      drafts.clearSent('a');

      expect(textStorage.items.size).toBe(0);
      expect(new ComposerDraftsStore(textStorage).draftOf('a').text).toBe('');
    });

    it('junta os anexos pendentes da API aos que a tela já conhece, sem repetir', () => {
      const drafts = new ComposerDraftsStore();
      drafts.uploadStarted('a');
      drafts.uploadFinished('a', attachment('novo'));

      drafts.restoreAttachments('a', [attachment('antigo'), attachment('novo')]);

      expect(drafts.draftOf('a').attachments).toEqual([attachment('novo'), attachment('antigo')]);
    });

    it('não traz de volta o anexo enviado enquanto a lista da API vinha', () => {
      const drafts = new ComposerDraftsStore();
      drafts.restoreAttachments('a', [attachment('enviado')]);

      drafts.clearSent('a');
      drafts.restoreAttachments('a', [attachment('enviado'), attachment('outro')]);

      expect(drafts.draftOf('a').attachments).toEqual([attachment('outro')]);
    });

    it('não traz de volta o anexo removido enquanto a lista da API vinha', () => {
      const drafts = new ComposerDraftsStore();
      drafts.restoreAttachments('a', [attachment('removido')]);

      drafts.removeAttachment('a', 'removido');
      drafts.restoreAttachments('a', [attachment('removido')]);

      expect(drafts.draftOf('a').attachments).toEqual([]);
    });

    it('não repete o anexo que a lista da API trouxe antes de o upload dele responder', () => {
      const drafts = new ComposerDraftsStore();
      drafts.uploadStarted('a');

      drafts.restoreAttachments('a', [attachment('subindo')]);
      drafts.uploadFinished('a', attachment('subindo'));

      expect(drafts.draftOf('a')).toMatchObject({
        attachments: [attachment('subindo')],
        uploadingCount: 0,
      });
    });

    it('não avisa os inscritos quando a API não traz nada de novo', () => {
      const drafts = new ComposerDraftsStore();
      const listener = vi.fn();
      drafts.subscribe(listener);

      drafts.restoreAttachments('a', []);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
