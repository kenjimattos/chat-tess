import { useEffect, useRef } from 'react';
import { Markdown } from '../../components/Markdown';
import { Composer } from './Composer';
import { EarlierMessagesButton } from './EarlierMessagesButton';
import { LastUserMessage } from './LastUserMessage';
import { MessageBubble } from './MessageBubble';
import { ToolApprovalRequest } from './ToolApprovalRequest';
import { useGradualText } from './gradual-text';
import type { StreamingReply, ToolActivity } from './streaming-reply';
import { useChat } from './useChat';
import { scrollToBottom, useKeepPositionOnPrepend, useScrollPosition } from './useScrollPosition';

export interface ChatViewProps {
  conversationId: string;
  onTurnFinished(): void;
}

export function ChatView({ conversationId, onTurnFinished }: ChatViewProps) {
  const {
    messages,
    isLoading,
    loadError,
    hasEarlierMessages,
    isLoadingEarlier,
    loadEarlier,
    reply,
    isStreaming,
    awaitingApproval,
    send,
    resend,
    decideApprovals,
    stop,
  } = useChat(conversationId, { onTurnFinished });
  const scrollArea = useRef<HTMLDivElement>(null);
  const { hasContentBelow } = useScrollPosition(scrollArea);
  const { rememberPosition } = useKeepPositionOnPrepend(scrollArea, messages[0]?.id);

  // Rola até o fim só ao abrir a conversa. Enquanto a resposta chega, a tela
  // fica parada e o indicador avisa que há mais conteúdo abaixo.
  useEffect(() => {
    if (!isLoading) {
      scrollToBottom(scrollArea.current, 'instant');
    }
  }, [isLoading]);

  async function sendAndShowQuestion(...args: Parameters<typeof send>) {
    const sending = send(...args);
    requestAnimationFrame(() => scrollToBottom(scrollArea.current));
    await sending;
  }

  // Só a última mensagem do usuário pode ser refeita, e só com a conversa parada
  // e a mensagem já gravada (a provisória ainda não existe na API).
  const lastUserMessage = messages.findLast((message) => message.role === 'user');
  const canRedoLastTurn =
    !isStreaming && lastUserMessage !== undefined && !lastUserMessage.id.startsWith('pending-');

  async function resendAndShowQuestion(...args: Parameters<typeof resend>) {
    const resending = resend(...args);
    requestAnimationFrame(() => scrollToBottom(scrollArea.current));
    await resending;
  }

  function loadEarlierKeepingPosition() {
    rememberPosition();
    void loadEarlier();
  }

  return (
    <section aria-label="Chat" className="relative flex h-full min-h-0 flex-col">
      <div ref={scrollArea} className="flex-1 space-y-4 overflow-y-auto p-4">
        {isLoading && <p className="text-center text-sm text-slate-500">Carregando conversa…</p>}
        {!isLoading && messages.length === 0 && !reply && (
          <p className="pt-16 text-center text-slate-500">
            Envie uma mensagem, uma imagem ou um PDF para começar.
          </p>
        )}

        {hasEarlierMessages && (
          <EarlierMessagesButton isLoading={isLoadingEarlier} onLoad={loadEarlierKeepingPosition} />
        )}
        {messages.map((message) =>
          canRedoLastTurn && message === lastUserMessage ? (
            <LastUserMessage
              key={message.id}
              message={message}
              onResend={() => void resendAndShowQuestion(message)}
              onEdit={(text) => void resendAndShowQuestion(message, text)}
            />
          ) : (
            <MessageBubble key={message.id} message={message} />
          ),
        )}

        {awaitingApproval.length > 0 && (
          <ToolApprovalRequest
            calls={awaitingApproval}
            onDecide={(isApproved) => void decideApprovals(isApproved)}
          />
        )}
        {reply && <ReplyStatus reply={reply} isStreaming={isStreaming} />}
        {loadError && (
          <p role="alert" className="text-center text-sm text-red-700">
            {loadError}
          </p>
        )}
      </div>

      {hasContentBelow && (
        <button
          type="button"
          onClick={() => scrollToBottom(scrollArea.current)}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1.5 text-xs text-white shadow-md hover:bg-slate-700"
        >
          Mais conteúdo abaixo ↓
        </button>
      )}

      <Composer
        conversationId={conversationId}
        isStreaming={isStreaming}
        onSend={sendAndShowQuestion}
        onStop={stop}
      />
    </section>
  );
}

/**
 * Estado do turno: avisos, tools e o texto que ainda está chegando. Depois do
 * fim ficam só os avisos; as tools e o texto já estão no histórico.
 */
function ReplyStatus({ reply, isStreaming }: { reply: StreamingReply; isStreaming: boolean }) {
  return (
    <div className="space-y-2">
      {reply.wasCompacted && (
        <p role="status" className="text-center text-xs text-slate-500">
          O início da conversa foi resumido para caber no contexto do modelo. Nada foi apagado.
        </p>
      )}
      {isStreaming && reply.tools.map((tool) => <ToolActivityLine key={tool.callId} tool={tool} />)}
      {isStreaming && (
        <article aria-label="Resposta em andamento" className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl bg-white px-4 py-3 text-slate-900 shadow-sm">
            <GradualReply text={reply.text} />
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

/** Texto em stream revelado aos poucos, para não surgir em blocos. */
function GradualReply({ text }: { text: string }) {
  const shown = useGradualText(text);
  return shown ? <Markdown>{shown}</Markdown> : <span className="animate-pulse">…</span>;
}
