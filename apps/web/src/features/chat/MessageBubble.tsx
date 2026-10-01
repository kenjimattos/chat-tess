import type { AttachmentPart, ConversationMessage, MessagePart } from '@chat-tess/shared';
import { attachmentUrl } from '../../api/attachments-api';
import { Markdown } from '../../components/Markdown';

export interface MessageBubbleProps {
  message: ConversationMessage;
  /** Endereço dos anexos; muda na conversa aberta por link de compartilhamento. */
  attachmentUrlOf?(attachmentId: string): string;
}

/** Uma mensagem do usuário ou do assistente. Mensagens de resultado de tool não são exibidas. */
export function MessageBubble({ message, attachmentUrlOf = attachmentUrl }: MessageBubbleProps) {
  if (message.role === 'tool') {
    return null;
  }

  const isUser = message.role === 'user';
  return (
    <article
      aria-label={isUser ? 'Mensagem do usuário' : 'Resposta do assistente'}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-3 ${
          isUser ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 shadow-sm'
        }`}
      >
        {message.parts.map((part, index) => (
          <MessagePartView
            key={index}
            part={part}
            isUser={isUser}
            attachmentUrlOf={attachmentUrlOf}
          />
        ))}
      </div>
    </article>
  );
}

interface MessagePartViewProps {
  part: MessagePart;
  isUser: boolean;
  attachmentUrlOf(attachmentId: string): string;
}

function MessagePartView({ part, isUser, attachmentUrlOf }: MessagePartViewProps) {
  switch (part.type) {
    case 'text':
      return isUser ? (
        <p className="whitespace-pre-wrap">{part.text}</p>
      ) : (
        <Markdown>{part.text}</Markdown>
      );
    case 'attachment':
      return <AttachmentPreview attachment={part} url={attachmentUrlOf(part.attachmentId)} />;
    case 'tool_call':
      return (
        <p className="text-xs text-slate-500">
          {part.requiresApproval ? 'Pediu autorização para usar' : 'Usou'} a ferramenta{' '}
          <code>{part.toolName}</code>
        </p>
      );
    case 'tool_result':
      return null;
  }
}

export interface AttachmentPreviewProps {
  attachment: AttachmentPart;
  url?: string;
}

export function AttachmentPreview({
  attachment,
  url = attachmentUrl(attachment.attachmentId),
}: AttachmentPreviewProps) {
  if (attachment.mimeType.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={attachment.fileName} className="max-h-60 rounded-lg" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800"
    >
      📄 {attachment.fileName}
    </a>
  );
}
