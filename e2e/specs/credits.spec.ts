import { expect, test, type Browser } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';
import { ADMIN_TEST_EMAIL } from '../test-environment';

/** Um administrador, em outro navegador, muda o limite de tokens de um usuário. */
async function setTokenLimitAsAdmin(browser: Browser, email: string, tokenLimit: number) {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginAs(adminPage, ADMIN_TEST_EMAIL, 'Administradora');
  const response = await adminPage.request.put('/api/admin/credit-limits', {
    data: { email, tokenLimit },
  });
  expect(response.ok(), `falha ao mudar o limite: ${response.status()}`).toBe(true);
  await adminContext.close();
}

test.describe('Créditos', () => {
  test('mostra o consumo no cabeçalho e o atualiza a cada resposta', async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    const chat = new ChatPage(page);
    const meter = page.getByRole('meter', { name: 'Consumo de tokens' });
    await expect(meter).toHaveAttribute('aria-valuenow', '0');

    await chat.startNewConversation();
    await chat.send('Quanto isso custa?');

    await expect(meter).not.toHaveAttribute('aria-valuenow', '0');
  });

  test('bloqueia novas mensagens quando o limite é atingido', async ({ page, browser }) => {
    const user = await loginAs(page);
    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.startNewConversation();
    await chat.send('Primeira pergunta, dentro do limite');

    await setTokenLimitAsAdmin(browser, user.email, 1);
    await chat.messageInput.fill('Segunda pergunta, já sem crédito');
    await chat.sendButton.click();

    await expect(page.getByRole('alert')).toContainText('Você atingiu o limite de uso de 1 tokens');
    await page.reload();
    await expect(chat.assistantReplies()).toHaveCount(1);
  });

  test('um usuário comum não consegue mudar o próprio limite', async ({ page }) => {
    const user = await loginAs(page);

    const response = await page.request.put('/api/admin/credit-limits', {
      data: { email: user.email, tokenLimit: 999_999_999 },
    });

    expect(response.status()).toBe(403);
  });
});
