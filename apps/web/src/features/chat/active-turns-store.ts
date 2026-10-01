import type { ResendLastMessageRequest, SendMessageRequest, StreamEvent } from '@chat-tess/shared';
import { ApiError } from '../../api/http-client';
import { resendLastMessage, sendMessage } from '../../api/messages-api';
import { applyStreamEvent, emptyReply, type StreamingReply } from './streaming-reply';

type SendMessage = (
  conversationId: string,
  message: SendMessageRequest,
  signal: AbortSignal,
) => Promise<AsyncIterable<StreamEvent>>;

type ResendLastMessage = (
  conversationId: string,
  request: ResendLastMessageRequest,
  signal: AbortSignal,
) => Promise<AsyncIterable<StreamEvent>>;

interface Turn {
  reply: StreamingReply;
  controller: AbortController;
}

const SEND_FAILURE_MESSAGE = 'Não foi possível enviar a mensagem.';

/**
 * Respostas em andamento, por conversa, no nível do app. Ficam fora dos
 * componentes para que trocar de conversa não interrompa a resposta: só o
 * botão "Parar" e o fechamento da aba encerram o stream.
 *
 * Os snapshots são imutáveis, no formato que o `useSyncExternalStore` espera.
 */
export class ActiveTurnsStore {
  private readonly turns = new Map<string, Turn>();
  private readonly finishedCounts = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private respondingIds: ReadonlySet<string> = new Set();

  constructor(
    private readonly send: SendMessage = sendMessage,
    private readonly resendLast: ResendLastMessage = resendLastMessage,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Resposta mais recente da conversa, em andamento ou já terminada. */
  replyOf = (conversationId: string): StreamingReply | null =>
    this.turns.get(conversationId)?.reply ?? null;

  /** Quantos turnos da conversa já terminaram: muda quando o histórico precisa ser relido. */
  finishedTurnsOf = (conversationId: string): number =>
    this.finishedCounts.get(conversationId) ?? 0;

  /** Conversas com resposta chegando agora. */
  responding = (): ReadonlySet<string> => this.respondingIds;

  /**
   * Envia a mensagem e acompanha a resposta até o fim, mesmo que a tela da
   * conversa seja fechada. `onFinished` roda quando o turno termina, com ou sem erro.
   */
  start(
    conversationId: string,
    message: SendMessageRequest,
    onFinished: () => void,
  ): Promise<void> {
    return this.follow(
      conversationId,
      (signal) => this.send(conversationId, message, signal),
      onFinished,
    );
  }

  /** Refaz o último turno da conversa e acompanha a nova resposta, como em `start`. */
  resend(
    conversationId: string,
    request: ResendLastMessageRequest,
    onFinished: () => void,
  ): Promise<void> {
    return this.follow(
      conversationId,
      (signal) => this.resendLast(conversationId, request, signal),
      onFinished,
    );
  }

  private async follow(
    conversationId: string,
    openReply: (signal: AbortSignal) => Promise<AsyncIterable<StreamEvent>>,
    onFinished: () => void,
  ): Promise<void> {
    const controller = new AbortController();
    this.update(conversationId, { reply: emptyReply, controller });

    try {
      const events = await openReply(controller.signal);
      for await (const event of events) {
        this.updateReply(conversationId, (reply) => applyStreamEvent(reply, event));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof ApiError ? error.message : SEND_FAILURE_MESSAGE;
        this.updateReply(conversationId, (reply) => ({ ...reply, error: message }));
      }
    } finally {
      this.finishedCounts.set(conversationId, this.finishedTurnsOf(conversationId) + 1);
      this.updateReply(conversationId, (reply) => ({ ...reply, isFinished: true }));
      onFinished();
    }
  }

  stop(conversationId: string): void {
    this.turns.get(conversationId)?.controller.abort();
  }

  /** Esquece uma resposta que já terminou, depois que o histórico a mostrou. */
  dismiss(conversationId: string): void {
    if (this.turns.get(conversationId)?.reply.isFinished) {
      this.turns.delete(conversationId);
      this.notify();
    }
  }

  private updateReply(
    conversationId: string,
    change: (reply: StreamingReply) => StreamingReply,
  ): void {
    const turn = this.turns.get(conversationId);
    if (turn) {
      this.update(conversationId, { ...turn, reply: change(turn.reply) });
    }
  }

  private update(conversationId: string, turn: Turn): void {
    this.turns.set(conversationId, turn);
    this.notify();
  }

  private notify(): void {
    this.respondingIds = new Set(
      [...this.turns].flatMap(([id, { reply }]) => (reply.isFinished ? [] : [id])),
    );
    this.listeners.forEach((listener) => listener());
  }
}

/** Instância única do app. */
export const activeTurns = new ActiveTurnsStore();
