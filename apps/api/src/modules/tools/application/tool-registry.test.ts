import { describe, expect, it } from 'vitest';
import { RecordingEventPublisher } from '../../../shared/events/recording-event-publisher';
import { ManualClock } from '../../../shared/time/clock';
import type { Tool, ToolProvider } from '../domain/tool';
import { ToolRegistry } from './tool-registry';

const context = { userId: 'user-ana', conversationId: 'conversation-1' };

function tool(name: string, execute: Tool['execute']): Tool {
  return { name, description: `Tool ${name}`, inputSchema: { type: 'object' }, execute };
}

function provider(...tools: Tool[]): ToolProvider {
  return { toolsFor: async () => tools };
}

function callOf(toolName: string, input: Record<string, unknown> = {}) {
  return { type: 'tool_call' as const, callId: 'call-1', toolName, input };
}

describe('ToolRegistry', () => {
  it('junta as definições de todas as fontes', async () => {
    const registry = new ToolRegistry(
      [
        provider(tool('web_search', async () => 'ok')),
        provider(tool('drive_search', async () => 'ok')),
      ],
      new RecordingEventPublisher(),
      new ManualClock('2026-09-30T10:00:00Z'),
    );

    const definitions = await registry.definitionsFor('user-ana');

    expect(definitions).toEqual([
      { name: 'web_search', description: 'Tool web_search', inputSchema: { type: 'object' } },
      { name: 'drive_search', description: 'Tool drive_search', inputSchema: { type: 'object' } },
    ]);
  });

  it('executa a tool e devolve o resultado', async () => {
    const registry = new ToolRegistry(
      [provider(tool('echo', async (input, { userId }) => `${userId}: ${String(input.text)}`))],
      new RecordingEventPublisher(),
      new ManualClock('2026-09-30T10:00:00Z'),
    );

    const result = await registry.execute(callOf('echo', { text: 'oi' }), context);

    expect(result).toEqual({
      type: 'tool_result',
      callId: 'call-1',
      toolName: 'echo',
      output: 'user-ana: oi',
      isError: false,
    });
  });

  it('transforma a falha da tool em resultado de erro', async () => {
    const registry = new ToolRegistry(
      [
        provider(
          tool('broken', async () => {
            throw new Error('site fora do ar');
          }),
        ),
      ],
      new RecordingEventPublisher(),
      new ManualClock('2026-09-30T10:00:00Z'),
    );

    const result = await registry.execute(callOf('broken'), context);

    expect(result).toMatchObject({ output: 'site fora do ar', isError: true });
  });

  it('aceita falhas que não são instâncias de Error', async () => {
    const registry = new ToolRegistry(
      [
        provider(
          tool('legacy', async () => {
            throw 'tempo esgotado';
          }),
        ),
      ],
      new RecordingEventPublisher(),
      new ManualClock('2026-09-30T10:00:00Z'),
    );

    const result = await registry.execute(callOf('legacy'), context);

    expect(result).toMatchObject({ output: 'tempo esgotado', isError: true });
  });

  it('responde com erro quando a tool não existe', async () => {
    const registry = new ToolRegistry(
      [],
      new RecordingEventPublisher(),
      new ManualClock('2026-09-30T10:00:00Z'),
    );

    const result = await registry.execute(callOf('inexistente'), context);

    expect(result).toMatchObject({ isError: true, output: expect.stringContaining('inexistente') });
  });

  it('publica cada execução com entrada, saída e duração', async () => {
    const clock = new ManualClock('2026-09-30T10:00:00Z');
    const events = new RecordingEventPublisher();
    const slow = tool('slow', async () => {
      clock.advanceBy(250);
      return 'pronto';
    });
    const registry = new ToolRegistry([provider(slow)], events, clock);

    await registry.execute(callOf('slow', { q: 1 }), context);

    expect(events.ofType('tool.executed')).toEqual([
      {
        type: 'tool.executed',
        occurredAt: new Date('2026-09-30T10:00:00.250Z'),
        actorUserId: 'user-ana',
        payload: {
          conversationId: 'conversation-1',
          callId: 'call-1',
          toolName: 'slow',
          input: { q: 1 },
          output: 'pronto',
          isError: false,
          durationMs: 250,
        },
      },
    ]);
  });
});
