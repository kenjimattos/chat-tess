import { expect, test } from '@playwright/test';
import { globSync } from 'node:fs';
import path from 'node:path';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

/** Pasta do armazenamento local da API nos testes (LOCAL_STORAGE_DIR). */
const STORAGE_DIR = path.resolve(import.meta.dirname, '../.storage');

/** Arquivos que a API guardou para uma conversa, de qualquer usuário. */
function storedFilesOf(conversationId: string): string[] {
  return globSync(`users/*/conversations/${conversationId}/*`, { cwd: STORAGE_DIR });
}

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

  test('o rascunho com anexo continua na conversa depois de visitar outra', async ({ page }) => {
    await chat.send('Assunto A');
    await chat.attach('codigo-secreto.pdf');
    const pendingAttachments = page.getByRole('list', { name: 'Anexos a enviar' });
    await expect(pendingAttachments.getByRole('listitem')).toHaveText(/codigo-secreto\.pdf/);
    await chat.messageInput.fill('Analise depois');

    await chat.startNewConversation();
    await expect(pendingAttachments).toBeHidden();
    await chat.conversationNamed('Assunto A').click();

    await expect(pendingAttachments.getByRole('listitem')).toHaveText(/codigo-secreto\.pdf/);
    await expect(chat.messageInput).toHaveValue('Analise depois');

    await chat.sendButton.click();

    await expect(chat.assistantReplies().last()).toContainText(
      'Recebi 1 anexo(s): codigo-secreto.pdf.',
    );
    await expect(pendingAttachments).toBeHidden();
  });

  test('o rascunho continua como o usuário deixou depois de recarregar a página', async ({
    page,
  }) => {
    await chat.send('Assunto A');
    await chat.attach('codigo-secreto.pdf');
    const pendingAttachments = page.getByRole('list', { name: 'Anexos a enviar' });
    await expect(pendingAttachments.getByRole('listitem')).toHaveCount(1);
    await chat.messageInput.fill('Texto por terminar');

    await page.reload();

    await expect(pendingAttachments.getByRole('listitem')).toHaveText(/codigo-secreto\.pdf/);
    await expect(chat.messageInput).toHaveValue('Texto por terminar');

    await chat.sendButton.click();

    await expect(chat.assistantReplies().last()).toContainText(
      'Recebi 1 anexo(s): codigo-secreto.pdf.',
    );
    await page.reload();
    await expect(chat.assistantReplies()).toHaveCount(2);
    await expect(pendingAttachments).toBeHidden();
    await expect(chat.messageInput).toHaveValue('');
  });

  test('remover um anexo ainda não enviado apaga o arquivo do armazenamento', async ({ page }) => {
    await chat.send('Assunto A');
    const conversationId = new URL(page.url()).pathname.split('/').pop() ?? '';
    await chat.attach('codigo-secreto.pdf', 'faixa-azul.png');
    const pendingAttachments = page.getByRole('list', { name: 'Anexos a enviar' });
    await expect(pendingAttachments.getByRole('listitem')).toHaveCount(2);
    expect(storedFilesOf(conversationId)).toHaveLength(2);

    await page.getByRole('button', { name: 'Remover codigo-secreto.pdf' }).click();

    await expect(pendingAttachments.getByRole('listitem')).toHaveText([/faixa-azul\.png/]);
    expect(storedFilesOf(conversationId)).toHaveLength(1);
    await page.reload();
    await expect(pendingAttachments.getByRole('listitem')).toHaveText([/faixa-azul\.png/]);
  });

  test('recusa um tipo de arquivo não suportado', async ({ page }) => {
    await chat.attach('notas.txt');

    await expect(page.getByRole('alert')).toHaveText(
      'Tipo de arquivo não suportado. Envie PDF, PNG, JPEG ou WEBP.',
    );
  });

  test('apagar a conversa apaga os arquivos dela do armazenamento', async ({ page }) => {
    await chat.attach('codigo-secreto.pdf', 'faixa-azul.png');
    await chat.send('Arquivos temporários');
    const conversationId = new URL(page.url()).pathname.split('/').pop() ?? '';
    expect(storedFilesOf(conversationId)).toHaveLength(2);
    page.once('dialog', (dialog) => void dialog.accept());

    await page.getByRole('button', { name: 'Apagar Arquivos temporários' }).click();

    await expect(chat.conversationNamed('Arquivos temporários')).toBeHidden();
    expect(storedFilesOf(conversationId)).toEqual([]);
  });
});
