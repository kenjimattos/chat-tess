import type { RequestHandler, Router } from 'express';
import type { LlmConfig, ToolsConfig } from '../../infra/config/env';
import type { Database } from '../../infra/database/database';
import type { InProcessEventBus } from '../../infra/events/in-process-event-bus';
import type { Clock } from '../../kernel/time/clock';
import type { Toolbox } from '../agent/domain/toolbox';
import { BuiltInToolProvider } from './application/built-in/built-in-tool-provider';
import { createWebScrapeTool } from './application/built-in/web-scrape-tool';
import { createWebSearchTool } from './application/built-in/web-search-tool';
import { ListTools } from './application/list-tools';
import { RecordToolCall } from './application/record-tool-call';
import { SetToolEnabled } from './application/set-tool-enabled';
import { ToolRegistry } from './application/tool-registry';
import type { ConversationHistory, WebSearchEngine } from './domain/ports';
import type { ToolProvider } from './domain/tool';
import type { ToolExecuted } from './domain/tool-events';
import { createToolsRouter } from './http/tools-router';
import { FakeWebSearch } from './infra/fake-web-search';
import { GeminiGroundedSearch } from './infra/gemini-grounded-search';
import { HtmlPageReader } from './infra/html-page-reader';
import { PrismaToolCallLog } from './infra/prisma-tool-call-log';
import { PrismaToolPreferences } from './infra/prisma-tool-preferences';
import { SafeHttpFetcher } from './infra/safe-http-fetcher';

export interface ToolsModuleDependencies {
  database: Database;
  eventBus: InProcessEventBus;
  clock: Clock;
  requireAuthentication: RequestHandler;
  llmConfig: LlmConfig;
  toolsConfig: ToolsConfig;
  conversationHistory: ConversationHistory;
  /** Fontes adicionais: conectores e servidores MCP. */
  extraProviders?: ToolProvider[];
}

export interface ToolsModule {
  router: Router;
  toolbox: Toolbox;
  /** Grava no banco o catálogo das tools nativas. */
  syncCatalog(): Promise<void>;
}

export function createToolsModule(deps: ToolsModuleDependencies): ToolsModule {
  const preferences = new PrismaToolPreferences(deps.database);
  const toolCallLog = new PrismaToolCallLog(deps.database);
  const pageReader = new HtmlPageReader(new SafeHttpFetcher(deps.toolsConfig.webFetch));

  const builtInTools = new BuiltInToolProvider([
    createWebSearchTool(createSearchEngine(deps.llmConfig), deps.eventBus, deps.clock),
    createWebScrapeTool(pageReader, deps.conversationHistory),
  ]);
  const registry = new ToolRegistry(
    [builtInTools, ...(deps.extraProviders ?? [])],
    preferences,
    deps.eventBus,
    deps.clock,
  );

  const recordToolCall = new RecordToolCall(toolCallLog);
  deps.eventBus.subscribe('tool.executed', (event) =>
    recordToolCall.execute(event as ToolExecuted),
  );

  return {
    toolbox: registry,
    router: createToolsRouter({
      requireAuthentication: deps.requireAuthentication,
      listTools: new ListTools(registry),
      setToolEnabled: new SetToolEnabled(registry, preferences, deps.eventBus, deps.clock),
    }),
    syncCatalog: async () => {
      const tools = await builtInTools.toolsFor();
      await toolCallLog.sync(tools.map((tool) => ({ ...tool, source: 'built_in' })));
    },
  };
}

function createSearchEngine(config: LlmConfig): WebSearchEngine {
  return config.mode === 'gemini'
    ? new GeminiGroundedSearch(config.model, { project: config.project, location: config.location })
    : new FakeWebSearch();
}
