import type { RequestHandler, Router } from 'express';
import type { AgentConfig, LlmConfig } from '../../infra/config/env';
import type { Database } from '../../infra/database/database';
import type { EventPublisher } from '../../kernel/events/domain-event';
import type { Clock } from '../../kernel/time/clock';
import type { ConversationRepository, MessageRepository } from '../conversations/domain/ports';
import { CompactConversation } from './application/compact-conversation';
import { RunAgentTurn } from './application/run-agent-turn';
import type { AttachmentCatalog } from './domain/attachment-catalog';
import type { LlmProvider } from './domain/llm';
import type { Toolbox } from './domain/toolbox';
import type { UsageLimiter } from './domain/usage-limiter';
import { createMessagesRouter } from './http/messages-router';
import { fakeChatResponder } from './infra/fake-chat-responder';
import { GeminiLlmProvider } from './infra/gemini-llm-provider';
import { PrismaActiveTurns } from './infra/prisma-active-turns';
import { PrismaConversationMemory } from './infra/prisma-conversation-memory';
import { ScriptedLlmProvider } from './infra/scripted-llm-provider';

export interface AgentModuleDependencies {
  llmConfig: LlmConfig;
  agentConfig: AgentConfig;
  database: Database;
  events: EventPublisher;
  clock: Clock;
  requireAuthentication: RequestHandler;
  limitMessages: RequestHandler;
  conversations: ConversationRepository;
  messages: MessageRepository;
  attachments: AttachmentCatalog;
  toolbox: Toolbox;
  usageLimiter: UsageLimiter;
}

export interface AgentModule {
  router: Router;
}

export function createAgentModule(deps: AgentModuleDependencies): AgentModule {
  const llm = createLlmProvider(deps.llmConfig);
  const memory = new PrismaConversationMemory(deps.database);

  const runAgentTurn = new RunAgentTurn({
    conversations: deps.conversations,
    messages: deps.messages,
    memory,
    attachments: deps.attachments,
    toolbox: deps.toolbox,
    usageLimiter: deps.usageLimiter,
    activeTurns: new PrismaActiveTurns(deps.database),
    llm,
    compactConversation: new CompactConversation(
      llm,
      memory,
      deps.events,
      deps.clock,
      deps.agentConfig.keepRecentMessages,
    ),
    events: deps.events,
    clock: deps.clock,
    settings: deps.agentConfig,
  });

  return {
    router: createMessagesRouter({
      requireAuthentication: deps.requireAuthentication,
      rateLimit: deps.limitMessages,
      runAgentTurn,
    }),
  };
}

function createLlmProvider(config: LlmConfig): LlmProvider {
  return config.mode === 'gemini'
    ? GeminiLlmProvider.connect(config.model, {
        project: config.project,
        location: config.location,
      })
    : new ScriptedLlmProvider(fakeChatResponder);
}
