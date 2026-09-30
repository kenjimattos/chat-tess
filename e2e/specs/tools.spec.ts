import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';
import { servePage } from '../support/local-page';

test.describe('Tools', () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    chat = new ChatPage(page);
    await chat.startNewConversation();
  });

  test('o agente usa a busca na web e responde com o resultado', async () => {
    await chat.send('/tool web_search {"query":"novidades do Vitest"}');

    const reply = chat.assistantReplies();
    await expect(reply.filter({ hasText: 'Usou a ferramenta web_search' })).toBeVisible();
    await expect(reply.last()).toContainText('Resultado da tool: web_search');
    // A resposta é Markdown: as aspas aparecem sem a barra de escape do JSON.
    await expect(reply.last()).toContainText('Resultados simulados para "novidades do Vitest"');
  });

  test('o agente lê uma página da web com o scraping', async () => {
    const { server, url } = await servePage(
      '<html><title>Bolo</title><body><nav>menu</nav><main><p>Use 3 cenouras.</p></main></body></html>',
    );

    await chat.send(`/tool web_scrape {"url":"${url}"}`);

    await expect(chat.assistantReplies().last()).toContainText('Use 3 cenouras.');
    await expect(chat.assistantReplies().last()).not.toContainText('menu');
    server.close();
  });

  test('a tool desligada nas configurações não é executada', async ({ page }) => {
    await page.getByRole('button', { name: 'Ferramentas' }).click();
    const panel = page.getByRole('dialog', { name: 'Ferramentas' });
    await panel.getByRole('checkbox', { name: 'web_search' }).uncheck();
    await panel.getByRole('button', { name: 'Fechar' }).click();

    await chat.send('/tool web_search {"query":"qualquer coisa"}');

    await expect(chat.assistantReplies().last()).toContainText('web_search falhou');
    await expect(chat.assistantReplies().last()).toContainText('não está habilitada');
  });

  test('a preferência de tools continua salva depois de recarregar', async ({ page }) => {
    await page.getByRole('button', { name: 'Ferramentas' }).click();
    await page.getByRole('checkbox', { name: 'web_scrape' }).uncheck();

    await page.reload();
    await page.getByRole('button', { name: 'Ferramentas' }).click();

    await expect(page.getByRole('checkbox', { name: 'web_scrape' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'web_search' })).toBeChecked();
  });

  test('cada execução de tool fica na auditoria', async ({ page }) => {
    await chat.send('/tool web_search {"query":"auditoria"}');

    const events = (await (
      await page.request.get('/api/audit-events?type=tool.executed')
    ).json()) as {
      payload: { toolName: string; isError: boolean };
    }[];

    expect(events).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ toolName: 'web_search', isError: false }),
      }),
    ]);
  });
});
