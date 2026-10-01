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
});
