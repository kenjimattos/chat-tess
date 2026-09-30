import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

test.describe('Anexos', () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    chat = new ChatPage(page);
    await chat.startNewConversation();
  });

  test('envia um PDF e uma imagem junto com a mensagem', async ({ page }) => {
    await chat.attach('codigo-secreto.pdf', 'faixa-azul.png');
    const pendingAttachments = page.getByRole('list', { name: 'Anexos a enviar' });
    await expect(pendingAttachments.getByRole('listitem')).toHaveCount(2);

    await chat.send('Analise estes arquivos');

    await expect(chat.assistantReplies().last()).toHaveText(
      'Você disse: "Analise estes arquivos". Recebi 2 anexo(s): codigo-secreto.pdf, faixa-azul.png.',
    );
    const userMessage = chat.userMessages().last();
    await expect(userMessage.getByRole('link', { name: /codigo-secreto\.pdf/ })).toBeVisible();
    await expect(userMessage.getByRole('img', { name: 'faixa-azul.png' })).toBeVisible();
  });

  test('a imagem enviada abre a partir da conversa', async ({ page }) => {
    await chat.attach('faixa-azul.png');
    await chat.send('Veja a imagem');

    const image = chat.userMessages().last().getByRole('img', { name: 'faixa-azul.png' });
    const naturalWidth = await image.evaluate((element: HTMLImageElement) => element.naturalWidth);

    expect(naturalWidth).toBe(64);
    await expect(page).toHaveURL(/\/conversations\//);
  });

  test('envia só o anexo, sem texto', async () => {
    await chat.attach('codigo-secreto.pdf');

    await chat.sendButton.click();

    await expect(chat.assistantReplies().last()).toContainText(
      'Recebi 1 anexo(s): codigo-secreto.pdf.',
    );
    await expect(chat.conversationNamed('codigo-secreto.pdf')).toBeVisible();
  });

  test('recusa um tipo de arquivo não suportado', async ({ page }) => {
    await chat.attach('notas.txt');

    await expect(page.getByRole('alert')).toHaveText(
      'Tipo de arquivo não suportado. Envie PDF, PNG, JPEG ou WEBP.',
    );
  });
});
