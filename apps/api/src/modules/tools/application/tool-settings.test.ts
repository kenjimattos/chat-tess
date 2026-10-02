import { describe, expect, it } from 'vitest';
import { RecordingEventPublisher } from '../../../test/recording-event-publisher';
import { ManualClock } from '../../../kernel/time/clock';
import type { Tool } from '../domain/tool';
import { InMemoryToolPreferences } from '../infra/in-memory-tool-preferences';
import { ListTools } from './list-tools';
import { SetToolEnabled } from './set-tool-enabled';
import { ToolRegistry } from './tool-registry';

const webSearch: Tool = {
  name: 'web_search',
  description: 'Busca',
  inputSchema: { type: 'object' },
  returnsExternalContent: false,
  requiresApproval: async () => false,
  execute: async () => 'ok',
};

function scenario() {
  const preferences = new InMemoryToolPreferences();
  const events = new RecordingEventPublisher();
  const clock = new ManualClock('2026-09-30T10:00:00Z');
  const registry = new ToolRegistry(
    [{ source: 'built_in', toolsFor: async () => [webSearch] }],
    preferences,
    events,
    clock,
  );
  return {
    events,
    listTools: new ListTools(registry),
    setToolEnabled: new SetToolEnabled(registry, preferences, events, clock),
  };
}

describe('configuração de tools', () => {
  it('desliga e religa uma tool para o usuário', async () => {
    const { listTools, setToolEnabled } = scenario();

    await setToolEnabled.execute({ userId: 'user-ana', toolName: 'web_search', enabled: false });
    const afterDisabling = await listTools.execute('user-ana');
    await setToolEnabled.execute({ userId: 'user-ana', toolName: 'web_search', enabled: true });
    const afterEnabling = await listTools.execute('user-ana');

    expect(afterDisabling[0]?.enabled).toBe(false);
    expect(afterEnabling[0]?.enabled).toBe(true);
  });

  it('publica a mudança de preferência', async () => {
    const { setToolEnabled, events } = scenario();

    await setToolEnabled.execute({ userId: 'user-ana', toolName: 'web_search', enabled: false });

    expect(events.ofType('tool.preference_changed')[0]).toMatchObject({
      actorUserId: 'user-ana',
      payload: { toolName: 'web_search', enabled: false },
    });
  });

  it('recusa uma tool que não existe', async () => {
    const { setToolEnabled } = scenario();

    await expect(
      setToolEnabled.execute({ userId: 'user-ana', toolName: 'inexistente', enabled: false }),
    ).rejects.toMatchObject({ code: 'tool_not_found' });
  });
});
