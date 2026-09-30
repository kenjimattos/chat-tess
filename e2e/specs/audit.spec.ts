import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

interface AuditEvent {
  type: string;
  payload: Record<string, unknown>;
}

test.describe('Auditoria', () => {
  test('registra o login, a conversa, a mensagem e o consumo do LLM', async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.startNewConversation();
    await chat.send('Mensagem auditada');

    const response = await page.request.get('/api/audit-events');
    const events = (await response.json()) as AuditEvent[];

    expect(response.ok()).toBe(true);
    expect(events.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        'auth.login_succeeded',
        'conversation.created',
        'message.sent',
        'llm.call_completed',
      ]),
    );
    const llmCall = events.find(({ type }) => type === 'llm.call_completed');
    expect(llmCall?.payload).toMatchObject({ purpose: 'chat', model: 'scripted-llm' });
  });

  test('um usuário não vê os eventos de outro', async ({ page, browser }) => {
    await loginAs(page);
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    const other = await loginAs(otherPage);

    const events = (await (await page.request.get('/api/audit-events')).json()) as AuditEvent[];

    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain(other.email);
    await otherContext.close();
  });
});
