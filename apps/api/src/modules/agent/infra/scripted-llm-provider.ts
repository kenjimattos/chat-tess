import type { TokenUsage, ToolCallPart } from '@chat-tess/shared';
import { estimateTokens } from '../domain/compaction-policy';
import type { LlmFinishReason, LlmProvider, LlmRequest, LlmStreamEvent } from '../domain/llm';

export interface ScriptedReply {
  text?: string;
  toolCalls?: ToolCallPart[];
  /** Quando ausente, o consumo é estimado a partir do tamanho do texto. */
  usage?: Partial<TokenUsage>;
  /** Lança este erro em vez de responder. */
  error?: Error;
  /** Motivo de término informado no fim do stream; o padrão é `stop`. */
  finishReason?: LlmFinishReason;
}

/** Decide a resposta de cada chamada; `callIndex` começa em 0. */
export type Responder = (request: LlmRequest, callIndex: number) => ScriptedReply;

/**
 * LLM falso e determinístico. Usado nos testes unitários e no modo
 * `LLM_MODE=fake` dos testes ponta a ponta. Registra as requisições recebidas.
 */
export class ScriptedLlmProvider implements LlmProvider {
  readonly model = 'scripted-llm';
  readonly requests: LlmRequest[] = [];

  constructor(private readonly responder: Responder) {}

  /** Responde as chamadas na ordem da lista; falha se houver mais chamadas que respostas. */
  static replyingInOrder(...replies: ScriptedReply[]): ScriptedLlmProvider {
    return new ScriptedLlmProvider((_request, callIndex) => {
      const reply = replies[callIndex];
      if (!reply) {
        throw new Error(`Nenhuma resposta roteirizada para a chamada ${callIndex + 1}.`);
      }
      return reply;
    });
  }

  async *stream(request: LlmRequest, signal?: AbortSignal): AsyncIterable<LlmStreamEvent> {
    const callIndex = this.requests.push(request) - 1;
    const reply = this.responder(request, callIndex);
    if (reply.error) {
      throw reply.error;
    }

    const text = reply.text ?? '';
    for (const chunk of splitIntoChunks(text)) {
      signal?.throwIfAborted();
      yield { type: 'text_delta', text: chunk };
    }
    for (const call of reply.toolCalls ?? []) {
      yield { type: 'tool_call', call };
    }

    const inputTokens = reply.usage?.inputTokens ?? estimateTokens(JSON.stringify(request));
    const outputTokens = reply.usage?.outputTokens ?? estimateTokens(text);
    yield {
      type: 'completed',
      finishReason: reply.finishReason ?? 'stop',
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    };
  }
}

/** Divide o texto em pedaços de até três palavras, imitando um stream real. */
function splitIntoChunks(text: string): string[] {
  return text.match(/(?:\S+\s*){1,3}/g) ?? [];
}
