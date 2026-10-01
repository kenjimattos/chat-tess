import { expect, test, type Page } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

const LOAD_EARLIER = 'Carregar mensagens anteriores';

/**
 * A API devolve 50 mensagens por página. Para não precisar de uma conversa
 * longa, o spec pede páginas de 4 mensagens nas requisições que abrem a conversa.
 */
async function useSmallHistoryPages(page: Page): Promise<void> {
  await page.route(/\/api\/(conversations|shared)\/[^/?]+(\?.*)?$/, (route) => {
    if (route.request().method() !== 'GET') {
      return route.continue();
    }
    const url = new URL(route.request().url());
    url.searchParams.set('limit', '4');
    return route.continue({ url: url.href });
  });
}

test.describe('Histórico em páginas', () => {
  let chat: ChatPage;

  /** Conversa com três perguntas e três respostas: seis mensagens. */
  test.beforeEach(async ({ page }) => {
    await loginAs(page, undefined, 'Ana E2E');
    await page.goto('/');
    chat = new ChatPage(page);
    await chat.startNewConversation();
    await chat.send('Pergunta um');
    await chat.send('Pergunta dois');
    await chat.send('Pergunta três');
  });

  test('abre pelas mensagens mais recentes e carrega as anteriores a pedido', async ({ page }) => {
    await useSmallHistoryPages(page);
    await page.reload();

    await expect(chat.userMessages()).toHaveText(['Pergunta dois', 'Pergunta três']);

    await page.getByRole('button', { name: LOAD_EARLIER }).click();

    await expect(chat.userMessages()).toHaveText(['Pergunta um', 'Pergunta dois', 'Pergunta três']);
    await expect(chat.assistantReplies()).toHaveCount(3);
    await expect(page.getByRole('button', { name: LOAD_EARLIER })).toBeHidden();
  });

  test('mantém as mensagens antigas carregadas depois de uma nova resposta', async ({ page }) => {
    await useSmallHistoryPages(page);
    await page.reload();
    await page.getByRole('button', { name: LOAD_EARLIER }).click();
    await expect(chat.userMessages()).toHaveCount(3);

    await chat.send('Pergunta quatro');

    await expect(chat.userMessages()).toHaveText([
      'Pergunta um',
      'Pergunta dois',
      'Pergunta três',
      'Pergunta quatro',
    ]);
    await expect(chat.assistantReplies()).toHaveCount(4);
  });

  test('a conversa compartilhada também abre em páginas', async ({ page, browser }) => {
    await page.getByRole('button', { name: 'Compartilhar Pergunta um' }).click();
    await page.getByRole('button', { name: 'Gerar link' }).click();
    const link = await page.getByRole('textbox', { name: 'Link de compartilhamento' }).inputValue();
    const other = await (await browser.newContext()).newPage();
    await loginAs(other, undefined, 'Bia E2E');
    await useSmallHistoryPages(other);

    await other.goto(link);

    const sharedChat = new ChatPage(other);
    await expect(sharedChat.userMessages()).toHaveText(['Pergunta dois', 'Pergunta três']);

    await other.getByRole('button', { name: LOAD_EARLIER }).click();

    await expect(sharedChat.userMessages()).toHaveText([
      'Pergunta um',
      'Pergunta dois',
      'Pergunta três',
    ]);
    await expect(other.getByRole('button', { name: LOAD_EARLIER })).toBeHidden();
    await other.context().close();
  });
});
