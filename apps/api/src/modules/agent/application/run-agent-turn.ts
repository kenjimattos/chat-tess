import type {
  AttachmentPart,
  MessagePart,
  StreamEvent,
  ToolCallPart,
  TokenUsage,
} from '@chat-tess/shared';
import { AppError } from '../../../shared/errors/app-error';
import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import { findOwnedConversation } from '../../conversations/application/find-owned-conversation';
import {
  DEFAULT_CONVERSATION_TITLE,
  titleFromFirstMessage,
  type Conversation,
} from '../../conversations/domain/conversation';
import type { ConversationRepository, MessageRepository } from '../../conversations/domain/ports';
import { ContextWindowExceededError, EmptyMessageError } from '../domain/agent-errors';
import type { AgentTurnFailed, LlmCallCompleted, MessageSent } from '../domain/agent-events';
import type { AttachmentCatalog } from '../domain/attachment-catalog';
import { shouldCompact, type CompactionThreshold } from '../domain/compaction-policy';
import type {
  ConversationMemoryRepository,
  ConversationSummary,
} from '../domain/conversation-memory';
import type { LlmProvider, LlmRequest } from '../domain/llm';
import { buildSystemPrompt } from '../domain/system-prompt';
import type { Toolbox } from '../domain/toolbox';
import type { UsageLimiter } from '../domain/usage-limiter';
import { buildLlmMessages } from './build-llm-messages';
import type { CompactConversation } from './compact-conversation';

export interface RunAgentTurnInput {
  userId: string;
  conversationId: string;
  text: string;
  attachmentIds: string[];
  /** Disparado quando o cliente desconecta; interrompe a geração. */
  signal?: AbortSignal;
}

export interface AgentSettings extends CompactionThreshold {
  /** Limite de rodadas de tool por turno, para evitar laços infinitos. */
  maxToolRounds: number;
}

export interface AgentTurnDependencies {
  conversations: ConversationRepository;
  messages: MessageRepository;
  memory: ConversationMemoryRepository;
  attachments: AttachmentCatalog;
  toolbox: Toolbox;
  usageLimiter: UsageLimiter;
  llm: LlmProvider;
  compactConversation: CompactConversation;
  events: EventPublisher;
  clock: Clock;
  settings: AgentSettings;
}

/** Estado de um turno em andamento. */
interface Turn {
  userId: string;
  conversation: Conversation;
  signal?: AbortSignal;
  summary: ConversationSummary | null;
  /** A compactação forçada por estouro de contexto só é tentada uma vez por turno. */
  hasForcedCompaction: boolean;
}

interface LlmCallResult {
  text: string;
  toolCalls: ToolCallPart[];
  usage: TokenUsage;
}

const GENERIC_FAILURE_MESSAGE = 'Não foi possível gerar a resposta. Tente novamente.';

/**
 * Um turno do agente: grava a mensagem do usuário e gera a resposta em
 * stream, compactando o histórico e executando tools quando necessário.
 */
export class RunAgentTurn {
  constructor(private readonly deps: AgentTurnDependencies) {}

  /**
   * Valida e grava a mensagem do usuário. Erros desta fase (conversa
   * inexistente, mensagem vazia, anexo inválido, crédito esgotado) são
   * lançados normalmente.
   * Devolve o stream da resposta; a partir dele, erros viram eventos `error`.
   */
  async start(input: RunAgentTurnInput): Promise<AsyncIterable<StreamEvent>> {
    const { conversations, attachments } = this.deps;
    const text = input.text.trim();
    if (!text && input.attachmentIds.length === 0) {
      throw new EmptyMessageError();
    }

    const conversation = await findOwnedConversation(
      conversations,
      input.conversationId,
      input.userId,
    );
    await this.deps.usageLimiter.assertCanSpend(input.userId);
    const attachmentParts = input.attachmentIds.length
      ? await attachments.findPendingForMessage(input.attachmentIds, {
          userId: input.userId,
          conversationId: conversation.id,
        })
      : [];

    await this.saveUserMessage(input.userId, conversation, text, attachmentParts);

    const turn: Turn = {
      userId: input.userId,
      conversation,
      signal: input.signal,
      summary: null,
      hasForcedCompaction: false,
    };
    return this.respond(turn, text);
  }

  private async saveUserMessage(
    userId: string,
    conversation: Conversation,
    text: string,
    attachmentParts: AttachmentPart[],
  ): Promise<void> {
    const parts: MessagePart[] = [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...attachmentParts,
    ];
    const message = await this.deps.messages.append(conversation.id, { role: 'user', parts });

    if (attachmentParts.length) {
      await this.deps.attachments.attachToMessage(
        attachmentParts.map((part) => part.attachmentId),
        message.id,
      );
    }
    if (message.sequence === 1 && conversation.title === DEFAULT_CONVERSATION_TITLE) {
      const firstAttachmentName = attachmentParts[0]?.fileName ?? '';
      await this.deps.conversations.rename(
        conversation.id,
        titleFromFirstMessage(text || firstAttachmentName),
      );
    }

    await this.deps.events.publish({
      type: 'message.sent',
      occurredAt: this.deps.clock.now(),
      actorUserId: userId,
      payload: {
        conversationId: conversation.id,
        messageId: message.id,
        attachmentCount: attachmentParts.length,
      },
    } satisfies MessageSent);
  }

  private async *respond(turn: Turn, incomingText: string): AsyncGenerator<StreamEvent> {
    try {
      const memory = await this.deps.memory.load(turn.conversation.id);
      turn.summary = memory.summary;

      if (shouldCompact(memory.lastContextTokens, incomingText, this.deps.settings)) {
        yield* this.compact(turn);
      }

      for (let round = 0; round <= this.deps.settings.maxToolRounds; round++) {
        const result = yield* this.callLlmWithOverflowRecovery(turn);
        if (turn.signal?.aborted) {
          yield* this.saveAssistantMessage(turn, result.text, []);
          return;
        }

        if (result.toolCalls.length === 0) {
          yield* this.saveAssistantMessage(turn, result.text, []);
          return;
        }

        yield* this.saveAssistantMessage(turn, result.text, result.toolCalls, { final: false });
        yield* this.runTools(turn, result.toolCalls);
      }

      throw new AppError(
        'limit_exceeded',
        'tool_rounds_exceeded',
        'O agente usou tools demais neste turno e foi interrompido.',
      );
    } catch (error) {
      if (turn.signal?.aborted) {
        return;
      }
      yield await this.reportFailure(turn, error);
    }
  }

  private async *compact(turn: Turn): AsyncGenerator<StreamEvent, boolean> {
    const messages = await this.deps.messages.listByConversation(turn.conversation.id);
    const summary = await this.deps.compactConversation.execute({
      userId: turn.userId,
      conversationId: turn.conversation.id,
      messages,
      currentSummary: turn.summary,
    });
    if (!summary) {
      return false;
    }

    turn.summary = summary;
    yield { type: 'compacted', summarizedMessageCount: summary.summarizedMessageCount };
    return true;
  }

  /**
   * Se o provedor recusar por excesso de contexto apesar da estimativa,
   * compacta na hora e tenta de novo, sem interromper o usuário.
   */
  private async *callLlmWithOverflowRecovery(
    turn: Turn,
  ): AsyncGenerator<StreamEvent, LlmCallResult> {
    try {
      return yield* this.callLlm(turn);
    } catch (error) {
      if (!(error instanceof ContextWindowExceededError) || turn.hasForcedCompaction) {
        throw error;
      }
      turn.hasForcedCompaction = true;
      const compacted = yield* this.compact(turn);
      if (!compacted) {
        throw error;
      }
      return yield* this.callLlm(turn);
    }
  }

  private async *callLlm(turn: Turn): AsyncGenerator<StreamEvent, LlmCallResult> {
    const request = await this.buildRequest(turn);
    const result: LlmCallResult = {
      text: '',
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };

    try {
      for await (const event of this.deps.llm.stream(request, turn.signal)) {
        switch (event.type) {
          case 'text_delta':
            result.text += event.text;
            yield { type: 'text_delta', text: event.text };
            break;
          case 'tool_call':
            result.toolCalls.push(event.call);
            break;
          case 'completed':
            result.usage = event.usage;
            break;
        }
      }
    } catch (error) {
      // Cliente desconectou: devolve o que já foi gerado, sem tools pendentes.
      if (turn.signal?.aborted) {
        return { ...result, toolCalls: [] };
      }
      throw error;
    }

    await this.recordUsage(turn, result.usage);
    yield { type: 'usage', usage: result.usage };
    return result;
  }

  private async buildRequest(turn: Turn): Promise<LlmRequest> {
    const history = await this.deps.messages.listByConversation(turn.conversation.id);
    const coveredUntil = turn.summary?.coversUntilSequence ?? 0;
    const recentMessages = history.filter((message) => message.sequence > coveredUntil);

    return {
      systemPrompt: buildSystemPrompt({ now: this.deps.clock.now(), summary: turn.summary }),
      messages: await buildLlmMessages(recentMessages, this.deps.attachments),
      tools: await this.deps.toolbox.definitionsFor(turn.userId),
    };
  }

  private async recordUsage(turn: Turn, usage: TokenUsage): Promise<void> {
    // O contexto da próxima chamada é, aproximadamente, a entrada e a saída desta.
    await this.deps.memory.recordContextTokens(
      turn.conversation.id,
      usage.inputTokens + usage.outputTokens,
    );
    await this.deps.events.publish({
      type: 'llm.call_completed',
      occurredAt: this.deps.clock.now(),
      actorUserId: turn.userId,
      payload: {
        conversationId: turn.conversation.id,
        model: this.deps.llm.model,
        purpose: 'chat',
        usage,
      },
    } satisfies LlmCallCompleted);
  }

  private async *runTools(turn: Turn, calls: ToolCallPart[]): AsyncGenerator<StreamEvent> {
    for (const call of calls) {
      yield {
        type: 'tool_started',
        callId: call.callId,
        toolName: call.toolName,
        input: call.input,
      };
    }

    const results = await Promise.all(
      calls.map((call) =>
        this.deps.toolbox.execute(call, {
          userId: turn.userId,
          conversationId: turn.conversation.id,
          signal: turn.signal,
        }),
      ),
    );
    await this.deps.messages.append(turn.conversation.id, { role: 'tool', parts: results });

    for (const result of results) {
      yield {
        type: 'tool_finished',
        callId: result.callId,
        toolName: result.toolName,
        isError: result.isError,
      };
    }
  }

  private async *saveAssistantMessage(
    turn: Turn,
    text: string,
    toolCalls: ToolCallPart[],
    { final } = { final: true },
  ): AsyncGenerator<StreamEvent> {
    const parts: MessagePart[] = [...(text ? [{ type: 'text' as const, text }] : []), ...toolCalls];
    if (parts.length === 0) {
      return;
    }

    const message = await this.deps.messages.append(turn.conversation.id, {
      role: 'assistant',
      parts,
    });
    if (final) {
      yield { type: 'done', messageId: message.id };
    }
  }

  private async reportFailure(turn: Turn, error: unknown): Promise<StreamEvent> {
    const isExpected = error instanceof AppError;
    const code = isExpected ? error.code : 'agent_failed';
    const message = isExpected ? error.message : GENERIC_FAILURE_MESSAGE;

    await this.deps.events.publish({
      type: 'agent.turn_failed',
      occurredAt: this.deps.clock.now(),
      actorUserId: turn.userId,
      payload: {
        conversationId: turn.conversation.id,
        errorCode: code,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    } satisfies AgentTurnFailed);

    return { type: 'error', code, message };
  }
}
