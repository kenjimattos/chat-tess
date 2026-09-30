import { expect, test, type Browser, type Page } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

/** Abre uma segunda janela, sem os cookies da primeira. */
async function openAnotherBrowser(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test.describe('Compartilhamento', () => {
  let chat: ChatPage;
  let link: string;

  /** Ana cria uma conversa com imagem, gera o link e o lê do diálogo. */
  test.beforeEach(async ({ page }) => {
    await loginAs(page, undefined, 'Ana E2E');
    await page.goto('/');
    chat = new ChatPage(page);
    await chat.startNewConversation();
    await chat.attach('faixa-azul.png');
    await chat.send('Receita de bolo');

    await page.getByRole('button', { name: 'Compartilhar Receita de bolo' }).click();
    await page.getByRole('button', { name: 'Gerar link' }).click();
    link = await page.getByRole('textbox', { name: 'Link de compartilhamento' }).inputValue();
  });

  test('outro usuário vê a conversa, com anexos, sem poder enviar mensagens', async ({
    browser,
  }) => {
    const other = await openAnotherBrowser(browser);
    await loginAs(other, undefined, 'Bia E2E');

    await other.goto(link);

    await expect(other.getByRole('heading', { name: 'Receita de bolo' })).toBeVisible();
    await expect(other.getByText('Conversa compartilhada · somente leitura')).toBeVisible();
    const sharedChat = new ChatPage(other);
    await expect(sharedChat.userMessages()).toHaveText(['Receita de bolo']);
    await expect(sharedChat.assistantReplies().first()).toContainText('Receita de bolo');
    const image = sharedChat.userMessages().getByRole('img', { name: 'faixa-azul.png' });
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBe(64);
    await expect(sharedChat.messageInput).toHaveCount(0);
    await other.context().close();
  });

  test('o link revogado deixa de mostrar a conversa', async ({ page, browser }) => {
    const other = await openAnotherBrowser(browser);
    await loginAs(other, undefined, 'Bia E2E');
    await other.goto(link);
    await expect(other.getByRole('heading', { name: 'Receita de bolo' })).toBeVisible();

    await page.getByRole('button', { name: 'Revogar link' }).click();
    await expect(page.getByRole('button', { name: 'Gerar link' })).toBeVisible();
    await other.reload();

    await expect(other.getByRole('alert')).toHaveText(
      'Este link de compartilhamento não existe ou foi revogado.',
    );
    await other.context().close();
  });

  test('quem não está logado passa pelo login e volta ao link', async ({ browser }) => {
    const visitor = await openAnotherBrowser(browser);
    await visitor.goto(link);

    const googleLogin = visitor.getByRole('link', { name: 'Entrar com Google' });
    await expect(googleLogin).toBeVisible();
    // No ambiente de teste não há Google: o clique guarda o link e sai da página,
    // e o login de teste faz o papel da volta do Google para "/".
    await googleLogin.click();
    await loginAs(visitor, undefined, 'Caio E2E');
    await visitor.goto('/');

    await expect(visitor).toHaveURL(link);
    await expect(visitor.getByRole('heading', { name: 'Receita de bolo' })).toBeVisible();
    await visitor.context().close();
  });

  test('a auditoria registra quem abriu o link', async ({ browser }) => {
    const other = await openAnotherBrowser(browser);
    await loginAs(other, undefined, 'Bia E2E');
    await other.goto(link);
    await expect(other.getByRole('heading', { name: 'Receita de bolo' })).toBeVisible();

    // A auditoria grava o evento logo depois da resposta. Usuários comuns só veem os
    // próprios eventos, então achar o evento aqui prova que ele é da Bia. O front do e2e
    // roda em modo dev, onde o StrictMode carrega a página duas vezes.
    await expect
      .poll(async () => {
        const response = await other.request.get(
          '/api/audit-events?type=conversation.share_viewed',
        );
        return (await response.json()).length;
      })
      .toBeGreaterThanOrEqual(1);
    await other.context().close();
  });
});
