import type { EventPublisher } from '../../shared/events/domain-event';
import type { Clock } from '../../shared/time/clock';
import type { Toolbox } from '../agent/domain/toolbox';
import { ToolRegistry } from './application/tool-registry';
import type { ToolProvider } from './domain/tool';

export interface ToolsModuleDependencies {
  events: EventPublisher;
  clock: Clock;
}

export interface ToolsModule {
  toolbox: Toolbox;
}

export function createToolsModule({ events, clock }: ToolsModuleDependencies): ToolsModule {
  // As fontes de tools (nativas, conectores e MCP) entram aqui.
  const providers: ToolProvider[] = [];

  return { toolbox: new ToolRegistry(providers, events, clock) };
}
