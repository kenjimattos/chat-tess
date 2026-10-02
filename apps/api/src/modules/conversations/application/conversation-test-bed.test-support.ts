import { RecordingEventPublisher } from '../../../test/recording-event-publisher';
import { ManualClock } from '../../../kernel/time/clock';
import { InMemoryConversationStore } from '../infra/in-memory-conversation-store';

export const ANA_ID = 'user-ana';
export const BIA_ID = 'user-bia';
export const START = new Date('2026-09-30T10:00:00Z');

/** Cenário comum aos testes dos use cases de conversa. */
export function conversationTestBed() {
  const clock = new ManualClock(START);
  return {
    clock,
    store: new InMemoryConversationStore(clock),
    events: new RecordingEventPublisher(),
  };
}
