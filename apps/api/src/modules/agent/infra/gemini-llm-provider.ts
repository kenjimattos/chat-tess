import { randomUUID } from 'node:crypto';
import type { TokenUsage } from '@chat-tess/shared';
import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  type Content,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type GenerateContentResponseUsageMetadata,
  type Part,
} from '@google/genai';
import { ContextWindowExceededError } from '../domain/agent-errors';
import type {
  LlmContentPart,
  LlmFinishReason,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmStreamEvent,
} from '../domain/llm';
import { defaultRetryPolicy, retryTransient, type RetryPolicy } from './retry-transient';

/** Parte do SDK usada aqui; permite trocar o cliente real por um falso nos testes. */
export interface GeminiModelsClient {
  generateContentStream(
    parameters: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;
}

export interface GeminiConnection {
  project: string;
  location: string;
}

/** Mensagem do Vertex quando a entrada passa do limite de contexto do modelo. */
const CONTEXT_OVERFLOW_PATTERN = /input token count.*exceeds|exceeds the maximum number of tokens/i;

/** Adapter do Gemini no Vertex AI, com autenticação pelas credenciais padrão do Google Cloud. */
export class GeminiLlmProvider implements LlmProvider {
  constructor(
    readonly model: string,
    private readonly client: GeminiModelsClient,
    private readonly retryPolicy: RetryPolicy = defaultRetryPolicy,
  ) {}

  static connect(model: string, { project, location }: GeminiConnection): GeminiLlmProvider {
    const genAi = new GoogleGenAI({ vertexai: true, project, location });
    return new GeminiLlmProvider(model, genAi.models);
  }

  async *stream(request: LlmRequest, signal?: AbortSignal): AsyncIterable<LlmStreamEvent> {
    try {
      // Sobrecarga do Vertex (429/503) é repetida aqui, antes de qualquer texto chegar.
      const chunks = await retryTransient(
        () => this.client.generateContentStream(this.toParameters(request, signal)),
        this.retryPolicy,
        signal,
      );

      let usage: GenerateContentResponseUsageMetadata | undefined;
      let finishReason: FinishReason | undefined;
      let modelVersion: string | undefined;

      // As partes chegam espalhadas pelos pedaços do stream, inclusive as chamadas
      // de função: nada garante que estejam no último pedaço.
      for await (const chunk of chunks) {
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          yield* toStreamEvents(part);
        }
        usage = chunk.usageMetadata ?? usage;
        finishReason = candidate?.finishReason ?? finishReason;
        modelVersion = chunk.modelVersion ?? modelVersion;
      }

      yield {
        type: 'completed',
        usage: toTokenUsage(usage),
        finishReason: toFinishReason(finishReason),
        ...(modelVersion && { modelVersion }),
      };
    } catch (error) {
      throw translateError(error);
    }
  }

  private toParameters(request: LlmRequest, signal?: AbortSignal): GenerateContentParameters {
    return {
      model: this.model,
      contents: request.messages.map(toContent),
      config: {
        systemInstruction: request.systemPrompt,
        abortSignal: signal,
        ...(request.tools.length > 0 && {
          tools: [
            {
              functionDeclarations: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: tool.inputSchema,
              })),
            },
          ],
        }),
      },
    };
  }
}

function* toStreamEvents(part: Part): Generator<LlmStreamEvent> {
  // Resumos de raciocínio não fazem parte da resposta.
  if (part.thought) {
    return;
  }
  if (part.text) {
    yield { type: 'text_delta', text: part.text };
  }
  if (part.functionCall?.name) {
    yield {
      type: 'tool_call',
      call: {
        type: 'tool_call',
        callId: part.functionCall.id ?? randomUUID(),
        toolName: part.functionCall.name,
        input: part.functionCall.args ?? {},
        // O Gemini exige a assinatura de volta no turno seguinte, intacta.
        ...(part.thoughtSignature && {
          providerMetadata: { thoughtSignature: part.thoughtSignature },
        }),
      },
    };
  }
}

function toContent(message: LlmMessage): Content {
  return {
    // O Gemini só conhece "user" e "model"; resultados de tool vão como "user".
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: message.parts.map(toPart),
  };
}

function toPart(part: LlmContentPart): Part {
  switch (part.type) {
    case 'text':
      return { text: part.text };
    case 'attachment':
      return part.source.kind === 'uri'
        ? { fileData: { fileUri: part.source.uri, mimeType: part.mimeType } }
        : { inlineData: { data: part.source.base64Data, mimeType: part.mimeType } };
    case 'tool_call': {
      const thoughtSignature = part.providerMetadata?.thoughtSignature;
      return {
        functionCall: { id: part.callId, name: part.toolName, args: part.input },
        ...(typeof thoughtSignature === 'string' && { thoughtSignature }),
      };
    }
    case 'tool_result':
      return {
        functionResponse: {
          id: part.callId,
          name: part.toolName,
          response: part.isError ? { error: part.output } : { output: part.output },
        },
      };
  }
}

function toTokenUsage(usage: GenerateContentResponseUsageMetadata | undefined): TokenUsage {
  const inputTokens = usage?.promptTokenCount ?? 0;
  // Os tokens de raciocínio são cobrados como saída, mas vêm separados.
  const outputTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

function toFinishReason(reason: FinishReason | undefined): LlmFinishReason {
  switch (reason) {
    case undefined:
    case FinishReason.STOP:
      return 'stop';
    case FinishReason.MAX_TOKENS:
      return 'max_tokens';
    case FinishReason.SAFETY:
    case FinishReason.BLOCKLIST:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.SPII:
      return 'blocked';
    default:
      return 'other';
  }
}

function translateError(error: unknown): unknown {
  if (
    error instanceof ApiError &&
    error.status === 400 &&
    CONTEXT_OVERFLOW_PATTERN.test(error.message)
  ) {
    return new ContextWindowExceededError();
  }
  return error;
}
