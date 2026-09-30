import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

interface AuditEvent {
  type: string;
  payload: Record<string, unknown>;
}

test.describe('Guardrails', () => {
  test('resposta bloqueada pelo modelo mostra o motivo e não deixa resposta vazia', async ({
    page,
  }) => {
    await loginAs(page);
    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.startNewConversation();

    // O LLM falso responde a "/blocked" como uma resposta barrada por política de segurança.
    await chat.send('/blocked');

    await expect(page.getByRole('alert')).toContainText('política de segurança');
    await page.reload();
    await expect(chat.userMessages()).toHaveCount(1);
    await expect(chat.assistantReplies()).toHaveCount(0);

    const events = (await (await page.request.get('/api/audit-events')).json()) as AuditEvent[];
    const failure = events.find(({ type }) => type === 'agent.turn_failed');
    expect(failure?.payload).toMatchObject({ errorCode: 'response_blocked' });
  });
});
