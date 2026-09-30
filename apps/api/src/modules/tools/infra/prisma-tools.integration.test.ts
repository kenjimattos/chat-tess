import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../shared/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaToolCallLog } from './prisma-tool-call-log';
import { PrismaToolPreferences } from './prisma-tool-preferences';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const preferences = new PrismaToolPreferences(database);
const toolCalls = new PrismaToolCallLog(database);

describe('persistência de tools', () => {
  let userId: string;
  let conversationId: string;

  beforeEach(async () => {
    await resetDatabase(database);
    userId = (await database.user.create({ data: { email: 'ana@empresa.com', name: 'Ana' } })).id;
    conversationId = (await database.conversation.create({ data: { userId, title: 'x' } })).id;
  });
  afterAll(() => database.$disconnect());

  it('guarda e atualiza as preferências do usuário, inclusive de tools fora do catálogo', async () => {
    await preferences.set(userId, 'web_search', false);
    await preferences.set(userId, 'mcp_github_search', false);
    await preferences.set(userId, 'web_search', true);

    expect(await preferences.settingsOf(userId)).toEqual(
      new Map([
        ['web_search', true],
        ['mcp_github_search', false],
      ]),
    );
  });

  it('registra cada execução com status, duração e saída compactada', async () => {
    await toolCalls.record({
      userId,
      conversationId,
      callId: 'call-1',
      toolName: 'web_scrape',
      input: { url: 'https://example.com' },
      output: 'x'.repeat(5000),
      isError: false,
      durationMs: 320,
      occurredAt: new Date('2026-09-30T10:00:00Z'),
    });

    const [stored] = await database.toolCall.findMany();
    expect(stored).toMatchObject({ toolName: 'web_scrape', status: 'SUCCEEDED', durationMs: 320 });
    expect(String(stored?.output).length).toBeLessThan(2100);
  });

  it('sincroniza o catálogo de tools sem duplicar', async () => {
    const tool = {
      name: 'web_search',
      description: 'v1',
      inputSchema: {},
      source: 'built_in' as const,
    };
    await toolCalls.sync([tool]);
    await toolCalls.sync([{ ...tool, description: 'v2' }]);

    const catalog = await database.tool.findMany();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({ name: 'web_search', description: 'v2', source: 'BUILT_IN' });
  });
});
