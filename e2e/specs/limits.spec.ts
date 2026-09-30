import { expect, test, type Page } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';
import { E2E_MESSAGES_PER_MINUTE } from '../test-environment';

interface AuditEvent {
  type: string;
  payload: Record<string, unknown>;
}

function conversationIdOf(page: Page): string {
  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

function postMessage(page: Page, conversationId: string, text: string) {
  return page.request.post(`/api/conversations/${conversationId}/messages`, { data: { text } });
}

test.describe('Limites de uso', () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    chat = new ChatPage(page);
    await chat.startNewConversation();
  });

  test('avisa quando o usuário manda mensagens rápido demais', async ({ page }) => {
    const conversationId = conversationIdOf(page);
    for (let index = 1; index <= E2E_MESSAGES_PER_MINUTE; index++) {
      expect((await postMessage(page, conversationId, `Mensagem ${index}`)).ok()).toBe(true);
    }

    await chat.messageInput.fill('Mais uma');
    await chat.sendButton.click();

    await expect(page.getByRole('alert')).toContainText('Muitas requisições em pouco tempo');
    const events = (await (await page.request.get('/api/audit-events')).json()) as AuditEvent[];
    expect(events.find(({ type }) => type === 'rate_limit.exceeded')?.payload).toMatchObject({
      policy: 'messages',
      limit: E2E_MESSAGES_PER_MINUTE,
    });
  });

  test('recusa uma segunda mensagem enquanto a conversa ainda responde', async ({ page }) => {
    const conversationId = conversationIdOf(page);

    const [first, second] = await Promise.all([
      postMessage(page, conversationId, '/slow'),
      postMessage(page, conversationId, 'Outra pergunta ao mesmo tempo'),
    ]);

    expect([first.status(), second.status()].sort()).toEqual([200, 409]);
    const refused = first.status() === 409 ? first : second;
    expect((await refused.json()).error.code).toBe('turn_in_progress');
  });
});
