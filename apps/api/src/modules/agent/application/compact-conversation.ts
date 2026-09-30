import type { EventPublisher } from '../../../shared/events/domain-event';
import type { Clock } from '../../../shared/time/clock';
import type { Message } from '../../conversations/domain/conversation';
import type { ConversationCompacted, LlmCallCompleted } from '../domain/agent-events';
import { countMessagesToSummarize } from '../domain/compaction-policy';
import type {
  ConversationMemoryRepository,
  ConversationSummary,
} from '../domain/conversation-memory';
import type { LlmProvider } from '../domain/llm';
import { COMPACTION_INSTRUCTIONS } from '../domain/system-prompt';
import { renderTranscript } from '../domain/transcript';

export interface CompactConversationInput {
  userId: string;
  conversationId: string;
  /** Histórico completo da conversa, em ordem. */
  messages: readonly Message[];
  currentSummary: ConversationSummary | null;
}

/**
 * Resume as mensagens antigas que ainda não estão no resumo, mantendo as
 * mais recentes intactas. As mensagens originais continuam salvas: só o
 * contexto enviado ao LLM passa a usar o resumo.
 */
export class CompactConversation {
  constructor(
    private readonly llm: LlmProvider,
    private readonly memory: ConversationMemoryRepository,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
    private readonly keepRecentMessages: number,
  ) {}

  /** Devolve o novo resumo, ou `null` quando não há mensagens suficientes para resumir. */
  async execute({
    userId,
    conversationId,
    messages,
    currentSummary,
  }: CompactConversationInput): Promise<ConversationSummary | null> {
    const unsummarized = messages.filter(
      (message) => message.sequence > (currentSummary?.coversUntilSequence ?? 0),
    );
    const count = countMessagesToSummarize(unsummarized, this.keepRecentMessages);
    const toSummarize = unsummarized.slice(0, count);
    const lastSummarized = toSummarize.at(-1);
    if (!lastSummarized) {
      return null;
    }

    const content = await this.summarize(userId, conversationId, currentSummary, toSummarize);
    const summary: ConversationSummary = {
      content,
      coversUntilSequence: lastSummarized.sequence,
      summarizedMessageCount: (currentSummary?.summarizedMessageCount ?? 0) + toSummarize.length,
    };
    await this.memory.saveSummary(conversationId, summary);

    await this.events.publish({
      type: 'conversation.compacted',
      occurredAt: this.clock.now(),
      actorUserId: userId,
      payload: {
        conversationId,
        summarizedMessageCount: summary.summarizedMessageCount,
        coversUntilSequence: summary.coversUntilSequence,
      },
    } satisfies ConversationCompacted);

    return summary;
  }

  private async summarize(
    userId: string,
    conversationId: string,
    currentSummary: ConversationSummary | null,
    messages: readonly Message[],
  ): Promise<string> {
    const previous = currentSummary ? `Resumo anterior:\n${currentSummary.content}\n\n` : '';
    const request = {
      systemPrompt: COMPACTION_INSTRUCTIONS,
      tools: [],
      messages: [
        {
          role: 'user' as const,
          parts: [
            {
              type: 'text' as const,
              text: `${previous}Conversa a resumir:\n\n${renderTranscript(messages)}`,
            },
          ],
        },
      ],
    };

    let summaryText = '';
    for await (const event of this.llm.stream(request)) {
      if (event.type === 'text_delta') {
        summaryText += event.text;
      } else if (event.type === 'completed') {
        await this.events.publish({
          type: 'llm.call_completed',
          occurredAt: this.clock.now(),
          actorUserId: userId,
          payload: {
            conversationId,
            model: event.modelVersion ?? this.llm.model,
            purpose: 'compaction',
            usage: event.usage,
          },
        } satisfies LlmCallCompleted);
      }
    }

    return summaryText.trim();
  }
}
