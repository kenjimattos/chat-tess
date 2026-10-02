import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

test.describe('Conversas', () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    chat = new ChatPage(page);
  });

  test('envia uma mensagem e recebe a resposta do agente', async () => {
    await chat.startNewConversation();

    await chat.send('Olá, agente!');

    await expect(chat.userMessages().last()).toHaveText('Olá, agente!');
    await expect(chat.assistantReplies().last()).toHaveText('Você disse: "Olá, agente!".');
  });

  test('funciona com o armazenamento do site bloqueado no navegador', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        get() {
          throw new DOMException('Armazenamento bloqueado', 'SecurityError');
        },
      });
    });
    await page.reload();
    await chat.startNewConversation();

    await chat.send('Sem armazenamento');

    await expect(chat.assistantReplies().last()).toHaveText('Você disse: "Sem armazenamento".');
  });

  test('dá à conversa o título da primeira mensagem', async () => {
    await chat.startNewConversation();

    await chat.send('Planejar a viagem de férias');

    await expect(chat.conversationNamed('Planejar a viagem de férias')).toBeVisible();
  });

  test('mantém o histórico depois de recarregar a página', async ({ page }) => {
    await chat.startNewConversation();
    await chat.send('Primeira pergunta');
    await chat.send('Segunda pergunta');

    await page.reload();

    await expect(chat.userMessages()).toHaveText(['Primeira pergunta', 'Segunda pergunta']);
    await expect(chat.assistantReplies()).toHaveCount(2);
  });

  test('alterna entre conversas sem misturar os históricos', async () => {
    await chat.startNewConversation();
    await chat.send('Assunto A');
    await chat.startNewConversation();
    await chat.send('Assunto B');

    await chat.conversationNamed('Assunto A').click();

    await expect(chat.userMessages()).toHaveText(['Assunto A']);
  });

  test('a resposta continua chegando enquanto o usuário usa outra conversa', async ({ page }) => {
    await chat.startNewConversation();
    // O LLM falso responde a "/slow" em cerca de 4 segundos.
    await chat.messageInput.fill('/slow');
    await chat.sendButton.click();
    await expect(page.getByRole('status', { name: /^Respondendo em/ })).toBeVisible();

    await chat.startNewConversation();
    await chat.send('Enquanto isso, na conversa B');
    await chat.conversationNamed('/slow').click();

    // Se a troca de conversa tivesse cortado a resposta, o fim dela não estaria gravado.
    await expect(chat.assistantReplies().last()).toContainText('Fim da resposta lenta.');
    await expect(page.getByRole('status', { name: /^Respondendo em/ })).toHaveCount(0);
  });

  test('pede confirmação para fechar a aba só enquanto a resposta chega', async ({ page }) => {
    await chat.startNewConversation();
    await chat.messageInput.fill('/slow');
    await chat.sendButton.click();
    await expect(page.getByRole('status', { name: /^Respondendo em/ })).toBeVisible();

    const warning = page.waitForEvent('dialog');
    void page.close({ runBeforeUnload: true });
    const dialog = await warning;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();

    // Com a resposta terminada, a aba fecha sem aviso.
    await expect(chat.assistantReplies().last()).toContainText('Fim da resposta lenta.');
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => page.isClosed()).toBe(true);
  });

  test('renomeia uma conversa', async ({ page }) => {
    await chat.startNewConversation();
    await chat.send('Título provisório');
    page.once('dialog', (dialog) => void dialog.accept('Título definitivo'));

    await page.getByRole('button', { name: 'Renomear Título provisório' }).click();

    await expect(chat.conversationNamed('Título definitivo')).toBeVisible();
  });

  test('apaga uma conversa', async ({ page }) => {
    await chat.startNewConversation();
    await chat.send('Conversa descartável');
    page.once('dialog', (dialog) => void dialog.accept());

    await page.getByRole('button', { name: 'Apagar Conversa descartável' }).click();

    await expect(chat.conversationNamed('Conversa descartável')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Começar uma conversa' })).toBeVisible();
  });
});
