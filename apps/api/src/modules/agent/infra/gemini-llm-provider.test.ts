import {
  ApiError,
  FinishReason,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';
import { describe, expect, it } from 'vitest';
import { ContextWindowExceededError } from '../domain/agent-errors';
import type { LlmRequest, LlmStreamEvent } from '../domain/llm';
import { GeminiLlmProvider, type GeminiModelsClient } from './gemini-llm-provider';

/** Cliente falso: grava a requisição e devolve os pedaços informados. */
function fakeClient(chunks: Partial<GenerateContentResponse>[] | Error) {
  const requests: GenerateContentParameters[] = [];
  const client: GeminiModelsClient = {
    async generateContentStream(parameters) {
      requests.push(parameters);
      if (chunks instanceof Error) {
        throw chunks;
      }
      return (async function* () {
        for (const chunk of chunks) {
          yield chunk as GenerateContentResponse;
        }
      })();
    },
  };
  return { client, requests };
}

async function collect(
  provider: GeminiLlmProvider,
  request: LlmRequest,
): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const event of provider.stream(request)) {
    events.push(event);
  }
  return events;
}

const simpleRequest: LlmRequest = {
  systemPrompt: 'Seja breve.',
  tools: [],
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'Oi' }] }],
};

describe('GeminiLlmProvider', () => {
  describe('requisição', () => {
    it('traduz o histórico, os anexos e as tools para o formato do Gemini', async () => {
      const { client, requests } = fakeClient([]);
      const provider = new GeminiLlmProvider('gemini-teste', client);

      await collect(provider, {
        systemPrompt: 'Seja breve.',
        tools: [{ name: 'weather', description: 'Clima', inputSchema: { type: 'object' } }],
        messages: [
          {
            role: 'user',
            parts: [
              { type: 'text', text: 'Veja' },
              {
                type: 'attachment',
                fileName: 'a.pdf',
                mimeType: 'application/pdf',
                source: { kind: 'uri', uri: 'gs://bucket/a.pdf' },
              },
              {
                type: 'attachment',
                fileName: 'b.png',
                mimeType: 'image/png',
                source: { kind: 'inline', base64Data: 'aW1n' },
              },
            ],
          },
          {
            role: 'assistant',
            parts: [
              {
                type: 'tool_call',
                callId: 'call-1',
                toolName: 'weather',
                input: { city: 'Recife' },
                providerMetadata: { thoughtSignature: 'assinatura' },
              },
            ],
          },
          {
            role: 'tool',
            parts: [
              {
                type: 'tool_result',
                callId: 'call-1',
                toolName: 'weather',
                output: '29°C',
                isError: false,
              },
              {
                type: 'tool_result',
                callId: 'call-2',
                toolName: 'weather',
                output: 'falhou',
                isError: true,
              },
            ],
          },
        ],
      });

      expect(requests[0]).toMatchObject({
        model: 'gemini-teste',
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Veja' },
              { fileData: { fileUri: 'gs://bucket/a.pdf', mimeType: 'application/pdf' } },
              { inlineData: { data: 'aW1n', mimeType: 'image/png' } },
            ],
          },
          {
            role: 'model',
            parts: [
              {
                functionCall: { id: 'call-1', name: 'weather', args: { city: 'Recife' } },
                thoughtSignature: 'assinatura',
              },
            ],
          },
          {
            role: 'user',
            parts: [
              { functionResponse: { id: 'call-1', name: 'weather', response: { output: '29°C' } } },
              {
                functionResponse: { id: 'call-2', name: 'weather', response: { error: 'falhou' } },
              },
            ],
          },
        ],
        config: {
          systemInstruction: 'Seja breve.',
          tools: [
            {
              functionDeclarations: [
                { name: 'weather', description: 'Clima', parametersJsonSchema: { type: 'object' } },
              ],
            },
          ],
        },
      });
    });

    it('não envia a lista de tools quando não há nenhuma', async () => {
      const { client, requests } = fakeClient([]);

      await collect(new GeminiLlmProvider('gemini-teste', client), simpleRequest);

      expect(requests[0]?.config).not.toHaveProperty('tools');
    });
  });

  describe('resposta', () => {
    it('transmite o texto e captura a chamada de função que vem no meio do stream', async () => {
      const { client } = fakeClient([
        { candidates: [{ content: { parts: [{ text: 'Vou ' }] } }] },
        {
          candidates: [
            {
              content: {
                parts: [
                  { text: 'raciocínio interno', thought: true },
                  {
                    functionCall: { id: 'call_1', name: 'weather', args: { city: 'Recife' } },
                    thoughtSignature: 'AY89a18z',
                  },
                ],
              },
            },
          ],
        },
        {
          candidates: [{ content: { parts: [{ text: '' }] }, finishReason: FinishReason.STOP }],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 20,
            thoughtsTokenCount: 36,
          },
        },
      ]);

      const events = await collect(new GeminiLlmProvider('gemini-teste', client), simpleRequest);

      expect(events).toEqual([
        { type: 'text_delta', text: 'Vou ' },
        {
          type: 'tool_call',
          call: {
            type: 'tool_call',
            callId: 'call_1',
            toolName: 'weather',
            input: { city: 'Recife' },
            providerMetadata: { thoughtSignature: 'AY89a18z' },
          },
        },
        {
          type: 'completed',
          finishReason: 'stop',
          usage: { inputTokens: 100, outputTokens: 56, totalTokens: 156 },
        },
      ]);
    });

    it('gera um id para a chamada de função quando o Gemini não envia', async () => {
      const { client } = fakeClient([
        { candidates: [{ content: { parts: [{ functionCall: { name: 'weather', args: {} } }] } }] },
      ]);

      const events = await collect(new GeminiLlmProvider('gemini-teste', client), simpleRequest);

      expect(events[0]).toMatchObject({ type: 'tool_call', call: { callId: expect.any(String) } });
    });

    it.each([
      [FinishReason.MAX_TOKENS, 'max_tokens'],
      [FinishReason.SAFETY, 'blocked'],
      [FinishReason.RECITATION, 'other'],
    ])('traduz o motivo de término %s para "%s"', async (reason, expected) => {
      const { client } = fakeClient([{ candidates: [{ finishReason: reason }] }]);

      const events = await collect(new GeminiLlmProvider('gemini-teste', client), simpleRequest);

      expect(events.at(-1)).toMatchObject({ type: 'completed', finishReason: expected });
    });
  });

  describe('erros', () => {
    it('traduz o estouro de contexto para ContextWindowExceededError', async () => {
      const overflow = new ApiError({
        status: 400,
        message:
          '{"error":{"code":400,"message":"The input token count (1200000) exceeds the maximum number of tokens allowed (1048576)."}}',
      });
      const { client } = fakeClient(overflow);

      await expect(
        collect(new GeminiLlmProvider('gemini-teste', client), simpleRequest),
      ).rejects.toThrow(ContextWindowExceededError);
    });

    it('repassa os demais erros sem alteração', async () => {
      const unavailable = new ApiError({ status: 503, message: 'Service Unavailable' });
      const { client } = fakeClient(unavailable);

      await expect(
        collect(new GeminiLlmProvider('gemini-teste', client), simpleRequest),
      ).rejects.toBe(unavailable);
    });
  });
});
