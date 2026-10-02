import type {
  AttachmentPart,
  MessagePart,
  StreamEvent,
  ToolCallPart,
  TokenUsage,
} from '@chat-tess/shared';
import { mapWithConcurrency } from './map-with-concurrency';
import { AppError } from '../../../kernel/errors/app-error';
import type { EventPublisher } from '../../../kernel/events/domain-event';
import type { Clock } from '../../../kernel/time/clock';
import { findOwnedConversation } from '../../conversations/application/find-owned-conversation';
import {
  DEFAULT_CONVERSATION_TITLE,
  titleFromFirstMessage,
  type Conversation,
  type Message,
} from '../../conversations/domain/conversation';
import type { ConversationRepository, MessageRepository } from '../../conversations/domain/ports';
import {
  STALE_TURN_AFTER_MS,
  TooManyActiveTurnsError,
  TurnInProgressError,
  type ActiveTurns,
} from '../domain/active-turns';
import {
  ContextWindowExceededError,
  EmptyMessageError,
  NoMessageToResendError,
  NoPendingApprovalError,
  ResponseBlockedError,
  ResponseTruncatedError,
} from '../domain/agent-errors';
import type {
  AgentTurnFailed,
  LlmCallCompleted,
  MessageResent,
  MessageSent,
  ToolApprovalDecided,
  ToolApprovalRequested,
} from '../domain/agent-events';
import type { AttachmentCatalog } from '../domain/attachment-catalog';
import { shouldCompact, type CompactionThreshold } from '../domain/compaction-policy';
import type {
  ConversationMemoryRepository,
  ConversationSummary,
} from '../domain/conversation-memory';
import type { LlmFinishReason, LlmProvider, LlmRequest } from '../domain/llm';
import { buildSystemPrompt } from '../domain/system-prompt';
import { DENIED_BY_USER, LEFT_UNANSWERED, notExecuted, toolCallsIn } from '../domain/tool-approval';
import type { ToolExecutionContext, Toolbox } from '../domain/toolbox';
import type { UsageLimiter } from '../domain/usage-limiter';
import { buildLlmMessages } from './build-llm-messages';
import type { CompactConversation } from './compact-conversation';

/** O que todo pedido de turno traz. */
interface TurnRequest {
  userId: string;
  conversationId: string;
  /** Disparado quando o cliente desconecta; interrompe a geração. */
  signal?: AbortSignal;
}

export interface RunAgentTurnInput extends TurnRequest {
  text: string;
  attachmentIds: string[];
}

export interface ResendLastMessageInput extends TurnRequest {
  /** Novo texto da mensagem; sem ele, a mensagem é reenviada como está. */
  text?: string;
}

export interface DecideToolApprovalsInput extends TurnRequest {
  /** Chamadas autorizadas; as demais que esperavam autorização são negadas. */
  approvedCallIds: string[];
}

export interface AgentSettings extends CompactionThreshold {
  /**
   * Rodadas de tool por turno cujo resultado volta ao LLM. Se, depois delas, o
   * modelo ainda pedir tools, o turno é interrompido sem executá-las; o texto
   * dessa resposta é gravado. A contagem recomeça quando o turno é retomado
   * após uma autorização.
   */
  maxToolRounds: number;
  /**
   * Tools executando ao mesmo tempo numa rodada. O modelo pode pedir várias de
   * uma vez, e cada página lida ocupa memória enquanto é processada.
   */
  maxParallelToolCalls: number;
  /** Respostas simultâneas por usuário, somando todas as conversas. */
  maxConcurrentTurnsPerUser: number;
}

export interface AgentTurnDependencies {
  conversations: ConversationRepository;
  messages: MessageRepository;
  memory: ConversationMemoryRepository;
  attachments: AttachmentCatalog;
  toolbox: Toolbox;
  usageLimiter: UsageLimiter;
  activeTurns: ActiveTurns;
  llm: LlmProvider;
  compactConversation: CompactConversation;
  events: EventPublisher;
  clock: Clock;
  settings: AgentSettings;
}

/** Estado de um turno em andamento. */
interface Turn {
  /** Reserva em `ActiveTurns`, liberada quando o turno termina. */
  id: string;
  userId: string;
  conversation: Conversation;
  signal?: AbortSignal;
  summary: ConversationSummary | null;
  /** A compactação forçada por estouro de contexto só é tentada uma vez por turno. */
  hasForcedCompaction: boolean;
}

/** Uma rodada de tools já pedida pelo LLM, à espera de execução. */
interface ToolRound {
  calls: ToolCallPart[];
  /** Chamadas que o usuário não autorizou: o LLM recebe a recusa no lugar do resultado. */
  deniedCallIds: ReadonlySet<string>;
}

/** Como o turno começa, depois de o histórico estar pronto. */
interface TurnOpening {
  /** Texto que acabou de entrar, para estimar se o contexto precisa de compactação. */
  incomingText: string;
  /** Rodada que esperava a autorização do usuário: roda antes de chamar o LLM de novo. */
  pendingRound?: ToolRound;
}

const NO_DENIED_CALLS: ReadonlySet<string> = new Set();

interface LlmCallResult {
  text: string;
  toolCalls: ToolCallPart[];
  usage: TokenUsage;
  finishReason: LlmFinishReason;
  modelVersion?: string;
}

const GENERIC_FAILURE_MESSAGE = 'Não foi possível gerar a resposta. Tente novamente.';

/**
 * Um turno do agente: grava a mensagem do usuário e gera a resposta em
 * stream, compactando o histórico e executando tools quando necessário.
 * Quando uma tool depende da autorização do usuário, o turno para e é
 * retomado por `decideToolApprovals`.
 */
export class RunAgentTurn {
  constructor(private readonly deps: AgentTurnDependencies) {}

  /**
   * Valida e grava a mensagem do usuário. Erros desta fase (conversa
   * inexistente, mensagem vazia, conversa já respondendo, limite de respostas
   * simultâneas do usuário, anexo inválido, crédito esgotado) são lançados
   * normalmente.
   * Devolve o stream da resposta; a partir dele, erros viram eventos `error`.
   */
  async start(input: RunAgentTurnInput): Promise<AsyncIterable<StreamEvent>> {
    const text = input.text.trim();
    if (!text && input.attachmentIds.length === 0) {
      throw new EmptyMessageError();
    }

    return this.beginTurn(input, async (conversation) => {
      const attachmentParts = input.attachmentIds.length
        ? await this.deps.attachments.findPendingForMessage(input.attachmentIds, {
            userId: input.userId,
            conversationId: conversation.id,
          })
        : [];
      await this.closeUnansweredToolCalls(conversation);
      await this.saveUserMessage(input.userId, conversation, text, attachmentParts);
      return { incomingText: text };
    });
  }

  /**
   * Refaz o último turno: apaga a resposta à última mensagem do usuário e gera
   * outra. Com `text`, a mensagem é editada antes; os anexos dela continuam.
   * A resposta anterior é substituída, não guardada. Erros e stream como em `start`.
   */
  async resend(input: ResendLastMessageInput): Promise<AsyncIterable<StreamEvent>> {
    return this.beginTurn(input, async (conversation) => ({
      incomingText: await this.rewindToLastUserMessage(input.userId, conversation, input.text),
    }));
  }

  /**
   * Retoma o turno que parou à espera de autorização: executa as chamadas
   * autorizadas, devolve a recusa das demais ao LLM e segue com a resposta.
   * Erros e stream como em `start`.
   */
  async decideToolApprovals(input: DecideToolApprovalsInput): Promise<AsyncIterable<StreamEvent>> {
    return this.beginTurn(input, async (conversation) => {
      const calls = await this.unansweredToolCalls(conversation);
      const awaitingApproval = calls.filter((call) => call.requiresApproval);
      if (awaitingApproval.length === 0) {
        throw new NoPendingApprovalError();
      }

      const approvedCallIds = awaitingApproval
        .map((call) => call.callId)
        .filter((callId) => input.approvedCallIds.includes(callId));
      const deniedCallIds = awaitingApproval
        .map((call) => call.callId)
        .filter((callId) => !approvedCallIds.includes(callId));

      await this.deps.events.publish({
        type: 'tool.approval_decided',
        occurredAt: this.deps.clock.now(),
        actorUserId: input.userId,
        payload: { conversationId: conversation.id, approvedCallIds, deniedCallIds },
      } satisfies ToolApprovalDecided);

      return { incomingText: '', pendingRound: { calls, deniedCallIds: new Set(deniedCallIds) } };
    });
  }

  /**
   * Passos comuns a todo turno: confere a conversa, reserva o turno e confere
   * o crédito. `prepareHistory` deixa o histórico pronto para o agente
   * continuar e diz como o turno começa.
   */
  private async beginTurn(
    { userId, conversationId, signal }: TurnRequest,
    prepareHistory: (conversation: Conversation) => Promise<TurnOpening>,
  ): Promise<AsyncIterable<StreamEvent>> {
    const conversation = await findOwnedConversation(
      this.deps.conversations,
      conversationId,
      userId,
    );
    const turnId = await this.reserveTurn(userId, conversation.id);

    let opening: TurnOpening;
    try {
      await this.deps.usageLimiter.assertCanSpend(userId);
      opening = await prepareHistory(conversation);
    } catch (error) {
      await this.deps.activeTurns.release(turnId);
      throw error;
    }

    const turn: Turn = {
      id: turnId,
      userId,
      conversation,
      signal,
      summary: null,
      hasForcedCompaction: false,
    };
    return this.respond(turn, opening);
  }

  private async reserveTurn(userId: string, conversationId: string): Promise<string> {
    const maxPerUser = this.deps.settings.maxConcurrentTurnsPerUser;
    const result = await this.deps.activeTurns.tryAcquire({
      userId,
      conversationId,
      maxPerUser,
      staleBefore: new Date(this.deps.clock.now().getTime() - STALE_TURN_AFTER_MS),
    });

    switch (result.status) {
      case 'acquired':
        return result.turnId;
      case 'conversation_busy':
        throw new TurnInProgressError();
      case 'user_limit_reached':
        throw new TooManyActiveTurnsError(maxPerUser);
    }
  }

  /** Chamadas da última mensagem do assistente que ainda não têm resultado gravado. */
  private async unansweredToolCalls(conversation: Conversation): Promise<ToolCallPart[]> {
    const { messages } = await this.deps.messages.listPage(conversation.id, { limit: 1 });
    const lastMessage = messages[0];
    return lastMessage?.role === 'assistant' ? toolCallsIn(lastMessage.parts) : [];
  }

  /**
   * O usuário seguiu a conversa sem responder ao pedido de autorização. O LLM
   * exige um resultado para cada chamada: as que ficaram sem resposta recebem o aviso.
   */
  private async closeUnansweredToolCalls(conversation: Conversation): Promise<void> {
    const calls = await this.unansweredToolCalls(conversation);
    if (calls.length > 0) {
      await this.deps.messages.append(conversation.id, {
        role: 'tool',
        parts: calls.map((call) => notExecuted(call, LEFT_UNANSWERED)),
      });
    }
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

  /**
   * Volta a conversa ao ponto em que a última mensagem do usuário acabou de
   * chegar: apaga o que veio depois dela e, se houver texto novo, troca o dela.
   */
  private async rewindToLastUserMessage(
    userId: string,
    conversation: Conversation,
    newText: string | undefined,
  ): Promise<string> {
    const { messages } = await this.deps.messages.listPage(conversation.id, {
      limit: 1,
      roles: ['user'],
    });
    const lastUserMessage = messages[0];
    if (!lastUserMessage) {
      throw new NoMessageToResendError();
    }

    const isEdited = newText !== undefined;
    const parts = isEdited
      ? withText(lastUserMessage.parts, newText.trim())
      : lastUserMessage.parts;
    if (parts.length === 0) {
      throw new EmptyMessageError();
    }

    await this.deps.messages.deleteAfter(conversation.id, lastUserMessage.sequence);
    if (isEdited) {
      await this.deps.messages.replaceParts(lastUserMessage.id, parts);
    }

    await this.deps.events.publish({
      type: 'message.resent',
      occurredAt: this.deps.clock.now(),
      actorUserId: userId,
      payload: { conversationId: conversation.id, messageId: lastUserMessage.id, edited: isEdited },
    } satisfies MessageResent);

    return textOf(parts);
  }

  private async *respond(
    turn: Turn,
    { incomingText, pendingRound }: TurnOpening,
  ): AsyncGenerator<StreamEvent> {
    try {
      if (pendingRound) {
        yield* this.runTools(turn, pendingRound);
      }

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
        yield* this.rejectIncompleteResponse(turn, result);

        if (result.toolCalls.length === 0) {
          yield* this.saveAssistantMessage(turn, result.text, []);
          return;
        }

        if (round === this.deps.settings.maxToolRounds) {
          // O usuário viu este texto chegar. As chamadas ficam de fora: não serão executadas.
          yield* this.saveAssistantMessage(turn, result.text, [], { final: false });
          break;
        }
        const toolCalls = await this.flagCallsRequiringApproval(turn, result.toolCalls);
        yield* this.saveAssistantMessage(turn, result.text, toolCalls, { final: false });
        if (toolCalls.some((call) => call.requiresApproval)) {
          yield await this.askForApproval(turn, toolCalls);
          return;
        }
        yield* this.runTools(turn, { calls: toolCalls, deniedCallIds: NO_DENIED_CALLS });
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
    } finally {
      await this.deps.activeTurns.release(turn.id);
    }
  }

  private async *compact(turn: Turn): AsyncGenerator<StreamEvent, boolean> {
    const messages = await this.unsummarizedMessages(turn);
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
      finishReason: 'stop',
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
            result.finishReason = event.finishReason;
            result.modelVersion = event.modelVersion;
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

    await this.recordUsage(turn, result);
    yield { type: 'usage', usage: result.usage };
    return result;
  }

  /**
   * Resposta bloqueada ou cortada pelo provedor: guarda o texto que o usuário
   * já viu, descarta tools pedidas pela metade e encerra o turno com o motivo.
   */
  private async *rejectIncompleteResponse(
    turn: Turn,
    result: LlmCallResult,
  ): AsyncGenerator<StreamEvent> {
    if (result.finishReason !== 'blocked' && result.finishReason !== 'max_tokens') {
      return;
    }
    yield* this.saveAssistantMessage(turn, result.text, [], { final: false });
    throw result.finishReason === 'blocked'
      ? new ResponseBlockedError()
      : new ResponseTruncatedError();
  }

  private async buildRequest(turn: Turn): Promise<LlmRequest> {
    const recentMessages = await this.unsummarizedMessages(turn);

    return {
      systemPrompt: buildSystemPrompt({
        model: this.deps.llm.model,
        now: this.deps.clock.now(),
        summary: turn.summary,
      }),
      messages: await buildLlmMessages(recentMessages, this.deps.attachments),
      tools: await this.deps.toolbox.definitionsFor(turn.userId),
    };
  }

  /** Só o que o resumo ainda não cobre: o histórico já resumido fica no banco. */
  private unsummarizedMessages(turn: Turn): Promise<Message[]> {
    return this.deps.messages.listByConversation(
      turn.conversation.id,
      turn.summary?.coversUntilSequence ?? 0,
    );
  }

  private async recordUsage(turn: Turn, { usage, modelVersion }: LlmCallResult): Promise<void> {
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
        model: modelVersion ?? this.deps.llm.model,
        purpose: 'chat',
        usage,
      },
    } satisfies LlmCallCompleted);
  }

  private flagCallsRequiringApproval(turn: Turn, calls: ToolCallPart[]): Promise<ToolCallPart[]> {
    const context = toolContextOf(turn);
    return Promise.all(
      calls.map(async (call) =>
        (await this.deps.toolbox.requiresApproval(call, context))
          ? { ...call, requiresApproval: true }
          : call,
      ),
    );
  }

  /**
   * Para o turno sem executar nenhuma tool da rodada: o LLM espera os
   * resultados de todas as chamadas juntos, então elas aguardam a decisão juntas.
   */
  private async askForApproval(turn: Turn, calls: ToolCallPart[]): Promise<StreamEvent> {
    const awaitingApproval = calls
      .filter((call) => call.requiresApproval)
      .map(({ callId, toolName, input }) => ({ callId, toolName, input }));

    await this.deps.events.publish({
      type: 'tool.approval_requested',
      occurredAt: this.deps.clock.now(),
      actorUserId: turn.userId,
      payload: { conversationId: turn.conversation.id, calls: awaitingApproval },
    } satisfies ToolApprovalRequested);

    return { type: 'approval_required', calls: awaitingApproval };
  }

  private async *runTools(
    turn: Turn,
    { calls, deniedCallIds }: ToolRound,
  ): AsyncGenerator<StreamEvent> {
    const isAllowed = (call: { callId: string }) => !deniedCallIds.has(call.callId);

    for (const call of calls.filter(isAllowed)) {
      yield {
        type: 'tool_started',
        callId: call.callId,
        toolName: call.toolName,
        input: call.input,
      };
    }

    const context = toolContextOf(turn);
    const results = await mapWithConcurrency(
      calls,
      this.deps.settings.maxParallelToolCalls,
      async (call) =>
        isAllowed(call)
          ? this.deps.toolbox.execute(call, context)
          : notExecuted(call, DENIED_BY_USER),
    );
    await this.deps.messages.append(turn.conversation.id, { role: 'tool', parts: results });

    for (const result of results.filter(isAllowed)) {
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

function toolContextOf(turn: Turn): ToolExecutionContext {
  return { userId: turn.userId, conversationId: turn.conversation.id, signal: turn.signal };
}

/** As partes da mensagem com o texto trocado, mantendo os anexos. */
function withText(parts: readonly MessagePart[], text: string): MessagePart[] {
  const attachments = parts.filter((part) => part.type === 'attachment');
  return [...(text ? [{ type: 'text' as const, text }] : []), ...attachments];
}

function textOf(parts: readonly MessagePart[]): string {
  return parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}
