import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '../../shared/events/domain-event';
import { InProcessEventBus } from './in-process-event-bus';

const buildEvent = (type: string): DomainEvent => ({
  type,
  occurredAt: new Date('2026-09-29T12:00:00Z'),
  actorUserId: 'user-1',
  payload: {},
});

describe('InProcessEventBus', () => {
  it('entrega o evento apenas aos handlers inscritos no tipo dele', async () => {
    const bus = new InProcessEventBus(vi.fn());
    const onMessageSent = vi.fn();
    const onToolExecuted = vi.fn();
    bus.subscribe('message.sent', onMessageSent);
    bus.subscribe('tool.executed', onToolExecuted);
    const event = buildEvent('message.sent');

    await bus.publish(event);

    expect(onMessageSent).toHaveBeenCalledExactlyOnceWith(event);
    expect(onToolExecuted).not.toHaveBeenCalled();
  });

  it('entrega todos os eventos a quem se inscreve em todos', async () => {
    const bus = new InProcessEventBus(vi.fn());
    const onAnyEvent = vi.fn();
    bus.subscribeToAll(onAnyEvent);

    await bus.publish(buildEvent('message.sent'));
    await bus.publish(buildEvent('tool.executed'));

    expect(onAnyEvent).toHaveBeenCalledTimes(2);
  });

  it('reporta a falha de um handler e continua entregando aos demais', async () => {
    const reportHandlerFailure = vi.fn();
    const bus = new InProcessEventBus(reportHandlerFailure);
    const failure = new Error('banco fora do ar');
    const healthyHandler = vi.fn();
    bus.subscribe('message.sent', () => {
      throw failure;
    });
    bus.subscribe('message.sent', healthyHandler);
    const event = buildEvent('message.sent');

    await expect(bus.publish(event)).resolves.toBeUndefined();

    expect(reportHandlerFailure).toHaveBeenCalledExactlyOnceWith(failure, event);
    expect(healthyHandler).toHaveBeenCalledOnce();
  });
});
