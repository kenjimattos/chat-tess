import { useEffect, useRef } from 'react';
import { Markdown } from '../../components/Markdown';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';
import type { StreamingReply, ToolActivity } from './streaming-reply';
import { useChat } from './useChat';

export interface ChatViewProps {
  conversationId: string;
  onTurnFinished(): void;
}

export function ChatView({ conversationId, onTurnFinished }: ChatViewProps) {
  const { messages, isLoading, loadError, reply, isStreaming, send, stop } = useChat(
    conversationId,
    {
      onTurnFinished,
    },
  );
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, reply?.text]);

  return (
    <section aria-label="Chat" className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {isLoading && <p className="text-center text-sm text-slate-500">Carregando conversa…</p>}
        {!isLoading && messages.length === 0 && !reply && (
          <p className="pt-16 text-center text-slate-500">
            Envie uma mensagem, uma imagem ou um PDF para começar.
          </p>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {reply && <ReplyStatus reply={reply} isStreaming={isStreaming} />}
        {loadError && (
          <p role="alert" className="text-center text-sm text-red-700">
            {loadError}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <Composer
        conversationId={conversationId}
        isStreaming={isStreaming}
        onSend={send}
        onStop={stop}
      />
    </section>
  );
}

/** Estado do turno em andamento: avisos, tools e o texto que ainda está chegando. */
function ReplyStatus({ reply, isStreaming }: { reply: StreamingReply; isStreaming: boolean }) {
  return (
    <div className="space-y-2">
      {reply.wasCompacted && (
        <p role="status" className="text-center text-xs text-slate-500">
          O início da conversa foi resumido para caber no contexto do modelo. Nada foi apagado.
        </p>
      )}
      {reply.tools.map((tool) => (
        <ToolActivityLine key={tool.callId} tool={tool} />
      ))}
      {isStreaming && (
        <article aria-label="Resposta em andamento" className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl bg-white px-4 py-3 text-slate-900 shadow-sm">
            {reply.text ? (
              <Markdown>{reply.text}</Markdown>
            ) : (
              <span className="animate-pulse">…</span>
            )}
          </div>
        </article>
      )}
      {reply.error && (
        <p role="alert" className="text-center text-sm text-red-700">
          {reply.error}
        </p>
      )}
    </div>
  );
}

const TOOL_STATUS_LABEL: Record<ToolActivity['status'], string> = {
  running: 'usando',
  succeeded: 'usou',
  failed: 'falhou ao usar',
};

function ToolActivityLine({ tool }: { tool: ToolActivity }) {
  return (
    <p className="text-xs text-slate-500">
      O assistente {TOOL_STATUS_LABEL[tool.status]} a ferramenta <code>{tool.toolName}</code>
      {tool.status === 'running' && '…'}
    </p>
  );
}
