import { beforeEach, describe, expect, it } from 'vitest';
import { RecordingEventPublisher } from '../../../shared/events/recording-event-publisher';
import { ManualClock } from '../../../shared/time/clock';
import type { LlmCallCompleted } from '../../agent/domain/agent-events';
import type { User } from '../../auth/domain/user';
import { InMemoryUserRepository } from '../../auth/infra/in-memory-user-repository';
import { CreditLimitReachedError } from '../domain/billing-errors';
import { InMemoryUsageLedger } from '../infra/in-memory-usage-ledger';
import { CreditGuard } from './credit-guard';
import { GetUsageSummary } from './get-usage-summary';
import { RecordLlmUsage } from './record-llm-usage';
import { SetCreditLimit } from './set-credit-limit';

const DEFAULT_LIMIT = 1000;

function llmCall(userId: string, totalTokens: number, minute = 0): LlmCallCompleted {
  return {
    type: 'llm.call_completed',
    occurredAt: new Date(`2026-09-30T10:0${minute}:00Z`),
    actorUserId: userId,
    payload: {
      conversationId: 'conversation-1',
      model: 'gemini-teste',
      purpose: 'chat',
      usage: { inputTokens: totalTokens - 10, outputTokens: 10, totalTokens },
    },
  };
}

describe('créditos', () => {
  let ledger: InMemoryUsageLedger;
  let events: RecordingEventPublisher;
  let clock: ManualClock;
  let users: InMemoryUserRepository;
  let ana: User;
  let admin: User;

  beforeEach(async () => {
    ledger = new InMemoryUsageLedger(DEFAULT_LIMIT);
    events = new RecordingEventPublisher();
    clock = new ManualClock('2026-09-30T12:00:00Z');
    users = new InMemoryUserRepository();
    ana = await users.create({ email: 'ana@empresa.com', name: 'Ana', avatarUrl: null });
    admin = {
      ...(await users.create({ email: 'admin@empresa.com', name: 'Admin', avatarUrl: null })),
      role: 'admin',
    };
  });

  describe('RecordLlmUsage', () => {
    it('registra a chamada e soma os tokens ao consumo do usuário', async () => {
      const recordUsage = new RecordLlmUsage(ledger);

      await recordUsage.execute(llmCall(ana.id, 300));
      await recordUsage.execute(llmCall(ana.id, 200));

      expect((await ledger.accountOf(ana.id)).tokensUsed).toBe(500);
      expect(ledger.records).toHaveLength(2);
    });

    it('ignora chamadas sem usuário', async () => {
      await new RecordLlmUsage(ledger).execute({ ...llmCall(ana.id, 300), actorUserId: null });

      expect(ledger.records).toEqual([]);
    });
  });

  describe('CreditGuard', () => {
    it('libera quem ainda tem crédito', async () => {
      await ledger.record({ ...toRecord(llmCall(ana.id, 999)) });

      await expect(
        new CreditGuard(ledger, events, clock).assertCanSpend(ana.id),
      ).resolves.toBeUndefined();
    });

    it('bloqueia quem atingiu o limite e publica o evento', async () => {
      await ledger.record(toRecord(llmCall(ana.id, 1000)));

      await expect(new CreditGuard(ledger, events, clock).assertCanSpend(ana.id)).rejects.toThrow(
        CreditLimitReachedError,
      );
      expect(events.ofType('credits.limit_reached')[0]).toMatchObject({
        actorUserId: ana.id,
        payload: { tokenLimit: 1000, tokensUsed: 1000 },
      });
    });

    it('explica o limite na mensagem de erro', async () => {
      await ledger.setLimit(ana.id, 0);

      await expect(
        new CreditGuard(ledger, events, clock).assertCanSpend(ana.id),
      ).rejects.toMatchObject({
        code: 'credit_limit_reached',
        message: expect.stringContaining('limite de uso de 0 tokens'),
      });
    });
  });

  describe('GetUsageSummary', () => {
    it('resume limite, consumo, saldo e chamadas recentes', async () => {
      const recordUsage = new RecordLlmUsage(ledger);
      await recordUsage.execute(llmCall(ana.id, 300, 1));
      await recordUsage.execute(llmCall(ana.id, 200, 2));

      const summary = await new GetUsageSummary(ledger).execute(ana.id);

      expect(summary).toMatchObject({ tokenLimit: 1000, tokensUsed: 500, remainingTokens: 500 });
      expect(summary.recentUsage.map(({ usage }) => usage.totalTokens)).toEqual([200, 300]);
    });
  });

  describe('SetCreditLimit', () => {
    it('muda o limite do usuário e registra quem mudou', async () => {
      const account = await new SetCreditLimit(users, ledger, events, clock).execute({
        admin,
        email: ' ANA@empresa.com ',
        tokenLimit: 5000,
      });

      expect(account.tokenLimit).toBe(5000);
      expect(events.ofType('credits.limit_changed')[0]).toMatchObject({
        actorUserId: admin.id,
        payload: { userId: ana.id, previousLimit: 1000, newLimit: 5000 },
      });
    });

    it('recusa um usuário inexistente', async () => {
      const setting = new SetCreditLimit(users, ledger, events, clock).execute({
        admin,
        email: 'ninguem@empresa.com',
        tokenLimit: 10,
      });

      await expect(setting).rejects.toMatchObject({ code: 'user_not_found' });
    });

    it.each([-1, 1.5])('recusa o limite %s', async (tokenLimit) => {
      const setting = new SetCreditLimit(users, ledger, events, clock).execute({
        admin,
        email: 'ana@empresa.com',
        tokenLimit,
      });

      await expect(setting).rejects.toMatchObject({ code: 'invalid_token_limit' });
    });
  });
});

function toRecord(event: LlmCallCompleted) {
  return {
    userId: event.actorUserId ?? '',
    conversationId: event.payload.conversationId,
    model: event.payload.model,
    purpose: event.payload.purpose,
    usage: event.payload.usage,
    occurredAt: event.occurredAt,
  };
}
