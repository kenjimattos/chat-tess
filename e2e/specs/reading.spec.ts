import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

test.describe('Leitura da resposta', () => {
  test.use({ viewport: { width: 1000, height: 500 } });

  test('não rola a tela sozinha e avisa que há mais conteúdo abaixo', async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.startNewConversation();
    // O LLM falso repete o texto: uma mensagem longa enche a tela.
    await chat.send(Array.from({ length: 30 }, (_, line) => `Linha ${line + 1}`).join('\n'));

    const scrollArea = page.getByRole('region', { name: 'Chat' }).locator('.overflow-y-auto');
    const scrollTop = () => scrollArea.evaluate((element) => element.scrollTop);
    const waitForScrollToSettle = async () => {
      let previous = -1;
      await expect
        .poll(async () => {
          const current = await scrollTop();
          const settled = current === previous;
          previous = current;
          return settled;
        })
        .toBe(true);
    };
    await scrollArea.evaluate((element) => element.scrollTo({ top: 0 }));
    const indicator = page.getByRole('button', { name: 'Mais conteúdo abaixo ↓' });
    await expect(indicator).toBeVisible();

    // Enquanto a resposta chega, a posição de leitura fica onde o usuário deixou.
    // Ao enviar, a tela desce uma vez para mostrar a pergunta; depois o usuário sobe.
    await chat.messageInput.fill('/slow');
    await chat.sendButton.click();
    await expect(page.getByRole('article', { name: 'Resposta em andamento' })).toBeInViewport();
    await waitForScrollToSettle();
    await scrollArea.evaluate((element) => element.scrollTo({ top: 0 }));
    await page.waitForTimeout(1500);
    expect(await scrollTop()).toBe(0);
    await expect(page.getByRole('article', { name: 'Resposta em andamento' })).toBeAttached();

    await indicator.click();
    await expect(indicator).toBeHidden();
  });
});
