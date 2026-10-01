import { describe, expect, it } from 'vitest';
import type { Message } from '../../conversations/domain/conversation';
import { attachmentNotice } from '../domain/attachment-notice';
import { InMemoryAttachmentCatalog } from '../infra/in-memory-attachment-catalog';
import { buildLlmMessages } from './build-llm-messages';

const pdf = {
  type: 'attachment' as const,
  attachmentId: 'att-pdf',
  fileName: 'contrato.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
};

function userMessage(parts: Message['parts']): Message {
  return {
    id: 'm1',
    conversationId: 'conversation-1',
    sequence: 1,
    role: 'user',
    parts,
    createdAt: new Date('2026-10-01T12:00:00Z'),
  };
}

describe('buildLlmMessages', () => {
  it('envia cada anexo logo depois do aviso de que o conteúdo é material a analisar', async () => {
    const attachments = new InMemoryAttachmentCatalog();
    attachments.add(pdf, { userId: 'user-ana', conversationId: 'conversation-1' });

    const [message] = await buildLlmMessages(
      [userMessage([{ type: 'text', text: 'Resuma' }, pdf])],
      attachments,
    );

    expect(message).toEqual({
      role: 'user',
      parts: [
        { type: 'text', text: 'Resuma' },
        attachmentNotice('contrato.pdf'),
        {
          type: 'attachment',
          fileName: 'contrato.pdf',
          mimeType: 'application/pdf',
          source: { kind: 'uri', uri: 'memory://att-pdf' },
        },
      ],
    });
  });

  it('avisa que o anexo está indisponível quando ele não pode ser resolvido', async () => {
    const [message] = await buildLlmMessages([userMessage([pdf])], new InMemoryAttachmentCatalog());

    expect(message?.parts).toEqual([{ type: 'text', text: '[anexo indisponível: contrato.pdf]' }]);
  });

  it('mantém as mensagens sem anexo como estão', async () => {
    const [message] = await buildLlmMessages(
      [userMessage([{ type: 'text', text: 'Oi' }])],
      new InMemoryAttachmentCatalog(),
    );

    expect(message).toEqual({ role: 'user', parts: [{ type: 'text', text: 'Oi' }] });
  });
});
