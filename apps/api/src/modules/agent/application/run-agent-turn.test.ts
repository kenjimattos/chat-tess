import type { StreamEvent } from '@chat-tess/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../kernel/errors/app-error';
import { RecordingEventPublisher } from '../../../test/recording-event-publisher';
import { ManualClock } from '../../../kernel/time/clock';
import { ConversationNotFoundError } from '../../conversations/domain/conversation-errors';
import { InMemoryConversationStore } from '../../conversations/infra/in-memory-conversation-store';
import {
  ContextWindowExceededError,
  EmptyMessageError,
  NoPendingApprovalError,
} from '../domain/agent-errors';
import { TooManyActiveTurnsError, TurnInProgressError } from '../domain/active-turns';
import { DENIED_BY_USER, LEFT_UNANSWERED } from '../domain/tool-approval';
import { unlimitedUsage, type UsageLimiter } from '../domain/usage-limiter';
import { FakeToolbox } from '../infra/fake-toolbox';
import { InMemoryActiveTurns } from '../infra/in-memory-active-turns';
import { InMemoryAttachmentCatalog } from '../infra/in-memory-attachment-catalog';
import { InMemoryConversationMemory } from '../infra/in-memory-conversation-memory';
import { ScriptedLlmProvider } from '../infra/scripted-llm-provider';
import { CompactConversation } from './compact-conversation';
import { RunAgentTurn, type AgentSettings } from './run-agent-turn';

const ANA = 'user-ana';
const BIA = 'user-bia';

const defaultSettings: AgentSettings = {
  contextTokenLimit: 100_000,
  thresholdRatio: 0.8,
  maxToolRounds: 3,
  maxParallelToolCalls: 3,
  maxConcurrentTurnsPerUser: 2,
};

async function collect(stream: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function textOf(events: StreamEvent[]): string {
  return events.flatMap((event) => (event.type === 'text_delta' ? [event.text] : [])).join('');
}

describe('RunAgentTurn', () => {
  let clock: ManualClock;
  let store: InMemoryConversationStore;
  let memory: InMemoryConversationMemory;
  let attachments: InMemoryAttachmentCatalog;
  let events: RecordingEventPublisher;
  let activeTurns: InMemoryActiveTurns;
  let conversationId: string;

  beforeEach(async () => {
    clock = new ManualClock('2026-09-30T10:00:00Z');
    store = new InMemoryConversationStore(clock);
    memory = new InMemoryConversationMemory();
    attachments = new InMemoryAttachmentCatalog();
    events = new RecordingEventPublisher();
    activeTurns = new InMemoryActiveTurns(() => clock.now());
    conversationId = (await store.create(ANA, 'Nova conversa')).id;
  });

  function buildAgent(
    llm: ScriptedLlmProvider,
    {
      toolbox = new FakeToolbox(),
      settings = defaultSettings,
      keepRecentMessages = 2,
      usageLimiter = unlimitedUsage as UsageLimiter,
    } = {},
  ) {
    return new RunAgentTurn({
      conversations: store,
      messages: store,
      memory,
      attachments,
      toolbox,
      usageLimiter,
      activeTurns,
      llm,
      compactConversation: new CompactConversation(llm, memory, events, clock, keepRecentMessages),
      events,
      clock,
      settings,
    });
  }

  async function send(
    agent: RunAgentTurn,
    text: string,
    extra: Partial<{ attachmentIds: string[]; signal: AbortSignal }> = {},
  ) {
    const stream = await agent.start({
      userId: ANA,
      conversationId,
      text,
      attachmentIds: extra.attachmentIds ?? [],
      signal: extra.signal,
    });
    return collect(stream);
  }

  /** Preenche a conversa com pares pergunta/resposta já respondidos. */
  async function seedHistory(turns: number): Promise<void> {
    for (let index = 1; index <= turns; index++) {
      await store.append(conversationId, {
        role: 'user',
        parts: [{ type: 'text', text: `pergunta ${index}` }],
      });
      await store.append(conversationId, {
        role: 'assistant',
        parts: [{ type: 'text', text: `resposta ${index}` }],
      });
    }
  }

  describe('resposta simples', () => {
    it('grava a pergunta, transmite a resposta e grava a resposta', async () => {
      const llm = ScriptedLlmProvider.replyingInOrder({
        text: 'Olá! Como posso ajudar?',
        usage: { inputTokens: 50, outputTokens: 7 },
      });

      const streamed = await send(buildAgent(llm), '  Oi  ');

      const saved = await store.listByConversation(conversationId);
      expect(saved.map(({ role, parts }) => [role, parts])).toEqual([
        ['user', [{ type: 'text', text: 'Oi' }]],
        ['assistant', [{ type: 'text', text: 'Olá! Como posso ajudar?' }]],
      ]);
      expect(textOf(streamed)).toBe('Olá! Como posso ajudar?');
      expect(streamed.slice(-2)).toEqual([
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 7, totalTokens: 57 } },
        { type: 'done', messageId: saved[1]?.id },
      ]);
    });

    it('envia ao LLM o histórico da conversa e o prompt de sistema', async () => {
      await seedHistory(1);
      const llm = ScriptedLlmProvider.replyingInOrder({ text: 'ok' });

      await send(buildAgent(llm), 'E agora?');

      const [request] = llm.requests;
      expect(request?.systemPrompt).toContain('chat-tess');
      expect(request?.systemPrompt).toContain('Você roda no modelo scripted-llm.');
      expect(request?.messages.map(({ role, parts }) => [role, parts])).toEqual([
        ['user', [{ type: 'text', text: 'pergunta 1' }]],
        ['assistant', [{ type: 'text', text: 'resposta 1' }]],
        ['user', [{ type: 'text', text: 'E agora?' }]],
      ]);
    });

    it('dá à conversa o título da primeira mensagem', async () => {
      await send(
        buildAgent(ScriptedLlmProvider.replyingInOrder({ text: 'ok' })),
        'Plano de viagem\nDetalhes...',
      );

      expect((await store.findOwned(conversationId, ANA))?.title).toBe('Plano de viagem');
    });

    it('não troca o título nas mensagens seguintes', async () => {
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder({ text: 'ok' }, { text: 'ok' }));
      await send(agent, 'Primeira');

      await send(agent, 'Segunda');

      expect((await store.findOwned(conversationId, ANA))?.title).toBe('Primeira');
    });

    it('registra o consumo e o tamanho do contexto', async () => {
      const llm = ScriptedLlmProvider.replyingInOrder({
        text: 'ok',
        usage: { inputTokens: 120, outputTokens: 30 },
      });

      await send(buildAgent(llm), 'Oi');

      expect(events.ofType('llm.call_completed')).toEqual([
        expect.objectContaining({
          actorUserId: ANA,
          payload: {
            conversationId,
            model: 'scripted-llm',
            purpose: 'chat',
            usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
          },
        }),
      ]);
      expect((await memory.load(conversationId)).lastContextTokens).toBe(150);
    });

    it('registra a versão do modelo informada pelo provedor', async () => {
      const llm = ScriptedLlmProvider.replyingInOrder({
        text: 'ok',
        modelVersion: 'scripted-llm-002',
      });

      await send(buildAgent(llm), 'Oi');

      expect(events.ofType('llm.call_completed')[0]?.payload).toMatchObject({
        model: 'scripted-llm-002',
      });
    });

    it('publica o evento de mensagem enviada', async () => {
      await send(buildAgent(ScriptedLlmProvider.replyingInOrder({ text: 'ok' })), 'Oi');

      expect(events.ofType('message.sent')).toEqual([
        expect.objectContaining({
          actorUserId: ANA,
          payload: { conversationId, messageId: expect.any(String), attachmentCount: 0 },
        }),
      ]);
    });
  });

  describe('validação antes do stream', () => {
    it('recusa mensagem vazia sem anexos', async () => {
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder());

      await expect(send(agent, '   ')).rejects.toThrow(EmptyMessageError);
      expect(await store.listByConversation(conversationId)).toEqual([]);
    });

    it('recusa quando o usuário não tem mais crédito, sem gravar a mensagem', async () => {
      const noCredit = new AppError('limit_exceeded', 'credit_limit_reached', 'Sem crédito.');
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder(), {
        usageLimiter: {
          assertCanSpend: async () => {
            throw noCredit;
          },
        },
      });

      await expect(send(agent, 'Oi')).rejects.toBe(noCredit);
      expect(await store.listByConversation(conversationId)).toEqual([]);
      expect(activeTurns.activeCount).toBe(0);
    });

    it('recusa a conversa de outro usuário', async () => {
      const conversationOfBia = await store.create(BIA, 'Da Bia');
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder());

      const starting = agent.start({
        userId: ANA,
        conversationId: conversationOfBia.id,
        text: 'Oi',
        attachmentIds: [],
      });

      await expect(starting).rejects.toThrow(ConversationNotFoundError);
    });
  });

  describe('turnos simultâneos', () => {
    function startTurn(agent: RunAgentTurn, conversation: string, userId = ANA) {
      return agent.start({ userId, conversationId: conversation, text: 'Oi', attachmentIds: [] });
    }

    it('recusa uma segunda mensagem enquanto a conversa ainda responde', async () => {
      const agent = buildAgent(
        ScriptedLlmProvider.replyingInOrder({ text: 'primeira' }, { text: 'segunda' }),
      );
      const firstReply = await startTurn(agent, conversationId);

      await expect(startTurn(agent, conversationId)).rejects.toThrow(TurnInProgressError);
      expect((await store.listByConversation(conversationId)).map(({ role }) => role)).toEqual([
        'user',
      ]);

      await collect(firstReply);
      await collect(await startTurn(agent, conversationId));
      expect(await store.listByConversation(conversationId)).toHaveLength(4);
    });

    it('limita as respostas simultâneas do usuário somando todas as conversas', async () => {
      const agent = buildAgent(new ScriptedLlmProvider(() => ({ text: 'ok' })));
      const second = (await store.create(ANA, 'Segunda')).id;
      const third = (await store.create(ANA, 'Terceira')).id;
      await startTurn(agent, conversationId);
      await startTurn(agent, second);

      await expect(startTurn(agent, third)).rejects.toThrow(TooManyActiveTurnsError);
    });

    it('não limita um usuário pelas respostas de outro', async () => {
      const agent = buildAgent(new ScriptedLlmProvider(() => ({ text: 'ok' })));
      const conversationOfBia = (await store.create(BIA, 'Da Bia')).id;
      await startTurn(agent, conversationId);
      await startTurn(agent, (await store.create(ANA, 'Segunda')).id);

      await expect(startTurn(agent, conversationOfBia, BIA)).resolves.toBeDefined();
    });

    it('libera a conversa quando a resposta falha', async () => {
      const agent = buildAgent(
        ScriptedLlmProvider.replyingInOrder({ error: new Error('503') }, { text: 'ok' }),
      );

      await send(agent, 'Oi');

      expect(activeTurns.activeCount).toBe(0);
    });

    it('descarta a reserva de uma instância que caiu no meio da resposta', async () => {
      const agent = buildAgent(new ScriptedLlmProvider(() => ({ text: 'ok' })));
      await startTurn(agent, conversationId);

      clock.advanceBy(16 * 60 * 1000);

      await expect(startTurn(agent, conversationId)).resolves.toBeDefined();
    });
  });

  describe('anexos', () => {
    const pdf = {
      type: 'attachment' as const,
      attachmentId: 'att-pdf',
      fileName: 'contrato.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    };

    it('grava os anexos na mensagem e os envia resolvidos ao LLM', async () => {
      attachments.add(pdf, { userId: ANA, conversationId });
      const llm = ScriptedLlmProvider.replyingInOrder({ text: 'Li o contrato.' });

      await send(buildAgent(llm), 'Resuma', { attachmentIds: ['att-pdf'] });

      const [userMessage] = await store.listByConversation(conversationId);
      expect(userMessage?.parts).toEqual([{ type: 'text', text: 'Resuma' }, pdf]);
      expect(llm.requests[0]?.messages[0]?.parts.at(-1)).toEqual({
        type: 'attachment',
        fileName: 'contrato.pdf',
        mimeType: 'application/pdf',
        source: { kind: 'uri', uri: 'memory://att-pdf' },
      });
    });

    it('aceita uma mensagem só com anexo e usa o nome do arquivo como título', async () => {
      attachments.add(pdf, { userId: ANA, conversationId });

      await send(buildAgent(ScriptedLlmProvider.replyingInOrder({ text: 'ok' })), '', {
        attachmentIds: ['att-pdf'],
      });

      expect((await store.findOwned(conversationId, ANA))?.title).toBe('contrato.pdf');
    });

    it('não permite reutilizar um anexo já enviado', async () => {
      attachments.add(pdf, { userId: ANA, conversationId });
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder({ text: 'ok' }));
      await send(agent, 'Primeira', { attachmentIds: ['att-pdf'] });

      await expect(send(agent, 'De novo', { attachmentIds: ['att-pdf'] })).rejects.toMatchObject({
        code: 'invalid_attachment',
      });
    });

    it('recusa o anexo de outro usuário', async () => {
      attachments.add(pdf, { userId: BIA, conversationId });
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder());

      await expect(send(agent, 'Resuma', { attachmentIds: ['att-pdf'] })).rejects.toMatchObject({
        code: 'invalid_attachment',
      });
    });
  });

  describe('reenvio da última mensagem', () => {
    async function resend(agent: RunAgentTurn, text?: string) {
      return collect(await agent.resend({ userId: ANA, conversationId, text }));
    }

    async function savedMessages() {
      const saved = await store.listByConversation(conversationId);
      return saved.map(({ role, parts }) => [role, parts]);
    }

    it('substitui a resposta anterior por uma nova para a mesma pergunta', async () => {
      await seedHistory(2);
      const llm = ScriptedLlmProvider.replyingInOrder({ text: 'resposta nova' });

      const streamed = await resend(buildAgent(llm));

      expect(await savedMessages()).toEqual([
        ['user', [{ type: 'text', text: 'pergunta 1' }]],
        ['assistant', [{ type: 'text', text: 'resposta 1' }]],
        ['user', [{ type: 'text', text: 'pergunta 2' }]],
        ['assistant', [{ type: 'text', text: 'resposta nova' }]],
      ]);
      expect(textOf(streamed)).toBe('resposta nova');
      expect(llm.requests[0]?.messages.at(-1)).toEqual({
        role: 'user',
        parts: [{ type: 'text', text: 'pergunta 2' }],
      });
    });

    it('apaga também as chamadas de tools do turno refeito', async () => {
      const call = { type: 'tool_call' as const, callId: 'c1', toolName: 'weather', input: {} };
      const toolbox = new FakeToolbox({ weather: () => 'sol' });
      const agent = buildAgent(
        ScriptedLlmProvider.replyingInOrder(
          { toolCalls: [call] },
          { text: 'Faz sol.' },
          { text: 'Sem consultar: não sei.' },
        ),
        { toolbox },
      );
      await send(agent, 'Clima?');

      await resend(agent);

      expect(await savedMessages()).toEqual([
        ['user', [{ type: 'text', text: 'Clima?' }]],
        ['assistant', [{ type: 'text', text: 'Sem consultar: não sei.' }]],
      ]);
    });

    it('edita o texto da última mensagem e mantém os anexos dela', async () => {
      const pdf = {
        type: 'attachment' as const,
        attachmentId: 'att-pdf',
        fileName: 'contrato.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      };
      attachments.add(pdf, { userId: ANA, conversationId });
      const agent = buildAgent(
        ScriptedLlmProvider.replyingInOrder({ text: 'Resumo.' }, { text: 'Tradução.' }),
      );
      await send(agent, 'Resuma', { attachmentIds: ['att-pdf'] });

      await resend(agent, '  Traduza  ');

      expect(await savedMessages()).toEqual([
        ['user', [{ type: 'text', text: 'Traduza' }, pdf]],
        ['assistant', [{ type: 'text', text: 'Tradução.' }]],
      ]);
    });

    it('registra o reenvio e se a mensagem foi editada', async () => {
      await seedHistory(1);
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder({ text: 'a' }, { text: 'b' }));
      const [question] = await store.listByConversation(conversationId);

      await resend(agent);
      await resend(agent, 'pergunta melhor');

      expect(events.ofType('message.resent').map(({ payload }) => payload)).toEqual([
        { conversationId, messageId: question?.id, edited: false },
        { conversationId, messageId: question?.id, edited: true },
      ]);
    });

    it('recusa quando a conversa ainda não tem mensagem do usuário', async () => {
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder());

      await expect(resend(agent)).rejects.toMatchObject({ code: 'no_message_to_resend' });
      expect(activeTurns.activeCount).toBe(0);
    });

    it('recusa a edição que deixaria a mensagem vazia, sem apagar a resposta', async () => {
      await seedHistory(1);
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder());

      await expect(resend(agent, '   ')).rejects.toMatchObject({ code: 'empty_message' });
      expect(await store.listByConversation(conversationId)).toHaveLength(2);
    });

    it('recusa sem crédito, sem apagar a resposta', async () => {
      await seedHistory(1);
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder(), {
        usageLimiter: {
          assertCanSpend: async () => {
            throw new AppError('limit_exceeded', 'credit_limit_reached', 'Sem crédito.');
          },
        },
      });

      await expect(resend(agent)).rejects.toMatchObject({ code: 'credit_limit_reached' });
      expect(await store.listByConversation(conversationId)).toHaveLength(2);
    });

    it('recusa a conversa de outro usuário', async () => {
      await seedHistory(1);
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder());

      const resending = agent.resend({ userId: BIA, conversationId });

      await expect(resending).rejects.toMatchObject({ code: 'conversation_not_found' });
    });
  });

  describe('tools', () => {
    const weatherCall = {
      type: 'tool_call' as const,
      callId: 'call-1',
      toolName: 'weather',
      input: { city: 'Recife' },
      providerMetadata: { thoughtSignature: 'assinatura-opaca' },
    };

    it('executa a tool pedida e devolve o resultado ao LLM na rodada seguinte', async () => {
      const toolbox = new FakeToolbox({ weather: ({ city }) => `${String(city)}: 29°C` });
      const llm = ScriptedLlmProvider.replyingInOrder(
        { text: 'Vou consultar.', toolCalls: [weatherCall] },
        { text: 'Está 29°C em Recife.' },
      );

      const streamed = await send(buildAgent(llm, { toolbox }), 'Clima em Recife?');

      expect(streamed.filter(({ type }) => type.startsWith('tool_'))).toEqual([
        { type: 'tool_started', callId: 'call-1', toolName: 'weather', input: { city: 'Recife' } },
        { type: 'tool_finished', callId: 'call-1', toolName: 'weather', isError: false },
      ]);
      expect(toolbox.executions[0]?.context).toMatchObject({ userId: ANA, conversationId });
      expect(llm.requests[1]?.messages.slice(-2)).toEqual([
        { role: 'assistant', parts: [{ type: 'text', text: 'Vou consultar.' }, weatherCall] },
        {
          role: 'tool',
          parts: [
            {
              type: 'tool_result',
              callId: 'call-1',
              toolName: 'weather',
              output: 'Recife: 29°C',
              isError: false,
            },
          ],
        },
      ]);
      expect(textOf(streamed)).toBe('Vou consultar.Está 29°C em Recife.');
    });

    it('envia ao LLM as tools disponíveis', async () => {
      const toolbox = new FakeToolbox({ weather: () => 'ok' });
      const llm = ScriptedLlmProvider.replyingInOrder({ text: 'ok' });

      await send(buildAgent(llm, { toolbox }), 'Oi');

      expect(llm.requests[0]?.tools.map(({ name }) => name)).toEqual(['weather']);
    });

    it('limita quantas tools executam ao mesmo tempo numa rodada', async () => {
      let running = 0;
      let peak = 0;
      const toolbox = new FakeToolbox({
        weather: async () => {
          peak = Math.max(peak, ++running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          running--;
          return 'ok';
        },
      });
      const calls = ['a', 'b', 'c', 'd', 'e'].map((callId) => ({ ...weatherCall, callId }));
      const llm = ScriptedLlmProvider.replyingInOrder({ toolCalls: calls }, { text: 'Pronto.' });

      await send(
        buildAgent(llm, { toolbox, settings: { ...defaultSettings, maxParallelToolCalls: 2 } }),
        'Clima em cinco cidades?',
      );

      expect(peak).toBe(2);
      expect(toolbox.executions.map(({ call }) => call.callId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('devolve ao LLM a falha da tool, sem interromper o turno', async () => {
      const toolbox = new FakeToolbox({
        weather: () => {
          throw new Error('serviço fora do ar');
        },
      });
      const llm = ScriptedLlmProvider.replyingInOrder(
        { toolCalls: [weatherCall] },
        { text: 'Não consegui consultar o clima.' },
      );

      const streamed = await send(buildAgent(llm, { toolbox }), 'Clima?');

      expect(streamed).toContainEqual({
        type: 'tool_finished',
        callId: 'call-1',
        toolName: 'weather',
        isError: true,
      });
      expect(streamed.at(-1)?.type).toBe('done');
    });

    it('interrompe o turno quando o LLM pede tools demais', async () => {
      const toolbox = new FakeToolbox({ weather: () => 'ok' });
      const llm = new ScriptedLlmProvider(() => ({ toolCalls: [weatherCall] }));

      const streamed = await send(
        buildAgent(llm, { toolbox, settings: { ...defaultSettings, maxToolRounds: 2 } }),
        'Clima?',
      );

      expect(llm.requests).toHaveLength(3);
      expect(toolbox.executions).toHaveLength(2);
      expect(streamed.at(-1)).toEqual({
        type: 'error',
        code: 'tool_rounds_exceeded',
        message: 'O agente usou tools demais neste turno e foi interrompido.',
      });
    });

    it('guarda o texto já transmitido e descarta as tools da resposta que passou do limite', async () => {
      const toolbox = new FakeToolbox({ weather: () => 'ok' });
      const llm = ScriptedLlmProvider.replyingInOrder(
        { text: 'Vou consultar.', toolCalls: [weatherCall] },
        { text: 'Vou consultar de novo.', toolCalls: [weatherCall] },
      );

      await send(
        buildAgent(llm, { toolbox, settings: { ...defaultSettings, maxToolRounds: 1 } }),
        'Clima?',
      );

      const saved = await store.listByConversation(conversationId);
      expect(saved.at(-1)).toMatchObject({
        role: 'assistant',
        parts: [{ type: 'text', text: 'Vou consultar de novo.' }],
      });
      expect(toolbox.executions).toHaveLength(1);
    });
  });

  describe('autorização do usuário para tools', () => {
    const emailCall = {
      type: 'tool_call' as const,
      callId: 'call-email',
      toolName: 'send_email',
      input: { to: 'fora@atacante.example' },
    };
    const weatherCall = {
      type: 'tool_call' as const,
      callId: 'call-weather',
      toolName: 'weather',
      input: { city: 'Recife' },
    };

    function toolboxWithEmailRequiringApproval() {
      return new FakeToolbox({ send_email: () => 'enviado', weather: () => 'Recife: 29°C' }, [
        'send_email',
      ]);
    }

    async function decide(agent: RunAgentTurn, approvedCallIds: string[]) {
      return collect(
        await agent.decideToolApprovals({ userId: ANA, conversationId, approvedCallIds }),
      );
    }

    it('para o turno e pede a autorização, sem executar a tool', async () => {
      const toolbox = toolboxWithEmailRequiringApproval();
      const llm = ScriptedLlmProvider.replyingInOrder({
        text: 'Vou enviar.',
        toolCalls: [emailCall],
      });

      const streamed = await send(buildAgent(llm, { toolbox }), 'Envie o relatório');

      expect(streamed.at(-1)).toEqual({
        type: 'approval_required',
        calls: [
          { callId: 'call-email', toolName: 'send_email', input: { to: 'fora@atacante.example' } },
        ],
      });
      expect(toolbox.executions).toEqual([]);
      const saved = await store.listByConversation(conversationId);
      expect(saved.at(-1)).toMatchObject({
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Vou enviar.' },
          { ...emailCall, requiresApproval: true },
        ],
      });
    });

    it('executa a chamada autorizada e segue com a resposta', async () => {
      const toolbox = toolboxWithEmailRequiringApproval();
      const llm = ScriptedLlmProvider.replyingInOrder(
        { toolCalls: [emailCall] },
        { text: 'Relatório enviado.' },
      );
      const agent = buildAgent(llm, { toolbox });
      await send(agent, 'Envie o relatório');

      const streamed = await decide(agent, ['call-email']);

      expect(toolbox.executions.map(({ call }) => call.callId)).toEqual(['call-email']);
      expect(streamed.filter(({ type }) => type.startsWith('tool_'))).toEqual([
        {
          type: 'tool_started',
          callId: 'call-email',
          toolName: 'send_email',
          input: emailCall.input,
        },
        { type: 'tool_finished', callId: 'call-email', toolName: 'send_email', isError: false },
      ]);
      expect(textOf(streamed)).toBe('Relatório enviado.');
      expect(streamed.at(-1)?.type).toBe('done');
      expect(llm.requests[1]?.messages.at(-1)).toMatchObject({
        role: 'tool',
        parts: [{ callId: 'call-email', output: 'enviado', isError: false }],
      });
    });

    it('devolve a recusa ao LLM, sem executar a tool negada', async () => {
      const toolbox = toolboxWithEmailRequiringApproval();
      const llm = ScriptedLlmProvider.replyingInOrder(
        { toolCalls: [emailCall] },
        { text: 'Certo, não enviei.' },
      );
      const agent = buildAgent(llm, { toolbox });
      await send(agent, 'Envie o relatório');

      const streamed = await decide(agent, []);

      expect(toolbox.executions).toEqual([]);
      expect(streamed.some(({ type }) => type.startsWith('tool_'))).toBe(false);
      expect(textOf(streamed)).toBe('Certo, não enviei.');
      expect(llm.requests[1]?.messages.at(-1)).toEqual({
        role: 'tool',
        parts: [
          {
            type: 'tool_result',
            callId: 'call-email',
            toolName: 'send_email',
            output: DENIED_BY_USER,
            isError: true,
          },
        ],
      });
    });

    it('segura a rodada inteira: as chamadas sem autorização executam na retomada', async () => {
      const toolbox = toolboxWithEmailRequiringApproval();
      const llm = ScriptedLlmProvider.replyingInOrder(
        { toolCalls: [weatherCall, emailCall] },
        { text: 'Está 29°C; o e-mail não foi enviado.' },
      );
      const agent = buildAgent(llm, { toolbox });

      const asked = await send(agent, 'Clima e e-mail');
      expect(toolbox.executions).toEqual([]);
      expect(asked.at(-1)).toMatchObject({
        type: 'approval_required',
        calls: [{ callId: 'call-email' }],
      });

      await decide(agent, []);

      expect(toolbox.executions.map(({ call }) => call.callId)).toEqual(['call-weather']);
      expect(llm.requests[1]?.messages.at(-1)?.parts).toMatchObject([
        { callId: 'call-weather', output: 'Recife: 29°C', isError: false },
        { callId: 'call-email', output: DENIED_BY_USER, isError: true },
      ]);
    });

    it('ignora na decisão as chamadas que não esperavam autorização', async () => {
      const toolbox = toolboxWithEmailRequiringApproval();
      const llm = ScriptedLlmProvider.replyingInOrder(
        { toolCalls: [emailCall] },
        { text: 'Pronto.' },
      );
      const agent = buildAgent(llm, { toolbox });
      await send(agent, 'Envie o relatório');

      await decide(agent, ['call-desconhecida']);

      expect(toolbox.executions).toEqual([]);
      expect(events.ofType('tool.approval_decided').at(-1)?.payload).toEqual({
        conversationId,
        approvedCallIds: [],
        deniedCallIds: ['call-email'],
      });
    });

    it('registra o pedido e a decisão', async () => {
      const llm = ScriptedLlmProvider.replyingInOrder(
        { toolCalls: [emailCall] },
        { text: 'Relatório enviado.' },
      );
      const agent = buildAgent(llm, { toolbox: toolboxWithEmailRequiringApproval() });

      await send(agent, 'Envie o relatório');
      await decide(agent, ['call-email']);

      expect(events.ofType('tool.approval_requested')).toMatchObject([
        {
          actorUserId: ANA,
          payload: {
            conversationId,
            calls: [{ callId: 'call-email', toolName: 'send_email', input: emailCall.input }],
          },
        },
      ]);
      expect(events.ofType('tool.approval_decided')).toMatchObject([
        {
          actorUserId: ANA,
          payload: { conversationId, approvedCallIds: ['call-email'], deniedCallIds: [] },
        },
      ]);
    });

    it('libera a conversa enquanto espera a decisão', async () => {
      const llm = ScriptedLlmProvider.replyingInOrder({ toolCalls: [emailCall] });

      await send(buildAgent(llm, { toolbox: toolboxWithEmailRequiringApproval() }), 'Envie');

      expect(activeTurns.activeCount).toBe(0);
    });

    it('recusa a decisão quando não há pedido em aberto, e libera a conversa', async () => {
      await seedHistory(1);
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder());

      await expect(decide(agent, [])).rejects.toBeInstanceOf(NoPendingApprovalError);
      expect(activeTurns.activeCount).toBe(0);
    });

    it('recusa a decisão sobre a conversa de outro usuário', async () => {
      const agent = buildAgent(ScriptedLlmProvider.replyingInOrder());

      await expect(
        agent.decideToolApprovals({ userId: BIA, conversationId, approvedCallIds: [] }),
      ).rejects.toBeInstanceOf(ConversationNotFoundError);
    });

    it('fecha o pedido sem resposta quando o usuário envia outra mensagem', async () => {
      const toolbox = toolboxWithEmailRequiringApproval();
      const llm = ScriptedLlmProvider.replyingInOrder(
        { toolCalls: [emailCall] },
        { text: 'Tudo bem, mudando de assunto.' },
      );
      const agent = buildAgent(llm, { toolbox });
      await send(agent, 'Envie o relatório');

      await send(agent, 'Deixa pra lá');

      expect(toolbox.executions).toEqual([]);
      expect(llm.requests[1]?.messages.slice(-2)).toEqual([
        {
          role: 'tool',
          parts: [
            {
              type: 'tool_result',
              callId: 'call-email',
              toolName: 'send_email',
              output: LEFT_UNANSWERED,
              isError: true,
            },
          ],
        },
        { role: 'user', parts: [{ type: 'text', text: 'Deixa pra lá' }] },
      ]);
      await expect(decide(agent, ['call-email'])).rejects.toBeInstanceOf(NoPendingApprovalError);
    });
  });

  describe('compactação automática', () => {
    const lowLimit: AgentSettings = {
      ...defaultSettings,
      contextTokenLimit: 1000,
    };

    it('resume o início da conversa quando o contexto se aproxima do limite', async () => {
      await seedHistory(3);
      await memory.recordContextTokens(conversationId, 900);
      const llm = ScriptedLlmProvider.replyingInOrder(
        { text: 'Resumo: o usuário fez as perguntas 1 e 2.' },
        { text: 'Resposta 4' },
      );

      const streamed = await send(
        buildAgent(llm, { settings: lowLimit, keepRecentMessages: 2 }),
        'pergunta 4',
      );

      const [compactionRequest, chatRequest] = llm.requests;
      expect(compactionRequest?.messages[0]?.parts[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('pergunta 1'),
      });
      expect(chatRequest?.systemPrompt).toContain('Resumo: o usuário fez as perguntas 1 e 2.');
      expect(chatRequest?.messages.map(({ parts }) => parts[0])).toEqual([
        { type: 'text', text: 'pergunta 3' },
        { type: 'text', text: 'resposta 3' },
        { type: 'text', text: 'pergunta 4' },
      ]);
      expect(streamed[0]).toEqual({ type: 'compacted', summarizedMessageCount: 4 });
      expect(textOf(streamed)).toBe('Resposta 4');
    });

    it('preserva todas as mensagens originais', async () => {
      await seedHistory(3);
      await memory.recordContextTokens(conversationId, 900);
      const llm = ScriptedLlmProvider.replyingInOrder({ text: 'Resumo' }, { text: 'ok' });

      await send(buildAgent(llm, { settings: lowLimit }), 'pergunta 4');

      expect(await store.listByConversation(conversationId)).toHaveLength(8);
    });

    it('acumula resumos em compactações seguidas', async () => {
      await seedHistory(3);
      await memory.saveSummary(conversationId, {
        content: 'Resumo antigo',
        coversUntilSequence: 2,
        summarizedMessageCount: 2,
      });
      await memory.recordContextTokens(conversationId, 900);
      const llm = ScriptedLlmProvider.replyingInOrder({ text: 'Resumo novo' }, { text: 'ok' });

      await send(buildAgent(llm, { settings: lowLimit, keepRecentMessages: 2 }), 'pergunta 4');

      expect(llm.requests[0]?.messages[0]?.parts[0]).toMatchObject({
        text: expect.stringContaining('Resumo antigo'),
      });
      expect((await memory.load(conversationId)).summary).toEqual({
        content: 'Resumo novo',
        // Mensagens 3 e 4; o corte recua para manter o turno 5-7 inteiro.
        coversUntilSequence: 4,
        summarizedMessageCount: 4,
      });
    });

    it('registra o consumo da compactação separado do consumo do chat', async () => {
      await seedHistory(3);
      await memory.recordContextTokens(conversationId, 900);
      const llm = ScriptedLlmProvider.replyingInOrder({ text: 'Resumo' }, { text: 'ok' });

      await send(buildAgent(llm, { settings: lowLimit }), 'pergunta 4');

      const purposes = events
        .ofType('llm.call_completed')
        .map((event) => (event.payload as { purpose: string }).purpose);
      expect(purposes).toEqual(['compaction', 'chat']);
      expect(events.ofType('conversation.compacted')).toHaveLength(1);
    });

    it('compacta e tenta de novo quando o modelo recusa por excesso de contexto', async () => {
      await seedHistory(3);
      const llm = ScriptedLlmProvider.replyingInOrder(
        { error: new ContextWindowExceededError() },
        { text: 'Resumo' },
        { text: 'Resposta depois da compactação' },
      );

      const streamed = await send(buildAgent(llm), 'pergunta 4');

      expect(streamed.map(({ type }) => type)).toContain('compacted');
      expect(textOf(streamed)).toBe('Resposta depois da compactação');
      expect(streamed.at(-1)?.type).toBe('done');
    });

    it('informa o erro quando não há o que compactar e o contexto continua grande demais', async () => {
      const llm = new ScriptedLlmProvider(() => ({ error: new ContextWindowExceededError() }));

      const streamed = await send(buildAgent(llm), 'mensagem enorme');

      expect(streamed.at(-1)).toMatchObject({ type: 'error', code: 'context_window_exceeded' });
    });
  });

  describe('resposta bloqueada ou cortada pelo provedor', () => {
    it('informa o bloqueio sem gravar resposta vazia', async () => {
      const llm = ScriptedLlmProvider.replyingInOrder({ finishReason: 'blocked' });

      const streamed = await send(buildAgent(llm), 'pedido problemático');

      expect(streamed.at(-1)).toEqual({
        type: 'error',
        code: 'response_blocked',
        message: expect.stringContaining('política de segurança'),
      });
      expect(events.ofType('agent.turn_failed')[0]?.payload).toMatchObject({
        errorCode: 'response_blocked',
      });
      expect((await store.listByConversation(conversationId)).map(({ role }) => role)).toEqual([
        'user',
      ]);
    });

    it('guarda o texto já transmitido e descarta as tools de uma resposta bloqueada', async () => {
      const toolbox = new FakeToolbox();
      const llm = ScriptedLlmProvider.replyingInOrder({
        text: 'Começo da resposta',
        toolCalls: [{ type: 'tool_call', callId: 'c1', toolName: 'web_search', input: {} }],
        finishReason: 'blocked',
      });

      await send(buildAgent(llm, { toolbox }), 'Oi');

      const saved = await store.listByConversation(conversationId);
      expect(saved.at(-1)).toMatchObject({
        role: 'assistant',
        parts: [{ type: 'text', text: 'Começo da resposta' }],
      });
      expect(toolbox.executions).toEqual([]);
    });

    it('guarda a resposta cortada pelo limite de saída e avisa o usuário', async () => {
      const llm = ScriptedLlmProvider.replyingInOrder({
        text: 'Uma resposta enorme que',
        finishReason: 'max_tokens',
      });

      const streamed = await send(buildAgent(llm), 'Escreva um livro');

      expect(streamed.at(-1)).toMatchObject({ type: 'error', code: 'response_truncated' });
      expect((await store.listByConversation(conversationId)).at(-1)).toMatchObject({
        role: 'assistant',
        parts: [{ type: 'text', text: 'Uma resposta enorme que' }],
      });
    });
  });

  describe('falhas e desconexão', () => {
    it('informa a falha do LLM sem expor detalhes e mantém a pergunta salva', async () => {
      const llm = ScriptedLlmProvider.replyingInOrder({ error: new Error('503 do provedor') });

      const streamed = await send(buildAgent(llm), 'Oi');

      expect(streamed.at(-1)).toEqual({
        type: 'error',
        code: 'agent_failed',
        message: 'Não foi possível gerar a resposta. Tente novamente.',
      });
      expect(events.ofType('agent.turn_failed')[0]?.payload).toMatchObject({
        errorCode: 'agent_failed',
        errorMessage: '503 do provedor',
      });
      expect((await store.listByConversation(conversationId)).map(({ role }) => role)).toEqual([
        'user',
      ]);
    });

    it('grava a parte já gerada quando o cliente desconecta', async () => {
      const controller = new AbortController();
      const llm = ScriptedLlmProvider.replyingInOrder({
        text: 'uma resposta bem longa que será interrompida',
      });
      const stream = await buildAgent(llm).start({
        userId: ANA,
        conversationId,
        text: 'Oi',
        attachmentIds: [],
        signal: controller.signal,
      });

      const received: StreamEvent[] = [];
      for await (const event of stream) {
        received.push(event);
        if (event.type === 'text_delta') {
          controller.abort();
        }
      }

      const saved = await store.listByConversation(conversationId);
      expect(saved.at(-1)).toMatchObject({
        role: 'assistant',
        parts: [{ type: 'text', text: 'uma resposta bem ' }],
      });
      expect(received.some(({ type }) => type === 'error')).toBe(false);
    });
  });
});
