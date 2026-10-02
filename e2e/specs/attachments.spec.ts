import { MAX_ATTACHMENTS_PER_MESSAGE } from '@chat-tess/shared';
import { expect, test, type Page } from '@playwright/test';
import { globSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { loginAs } from '../support/auth';
import { ChatPage, fixture } from '../support/chat-page';
import { API_URL, E2E_MAX_PENDING_ATTACHMENTS_MB } from '../test-environment';

/** Pasta do armazenamento local da API nos testes (LOCAL_STORAGE_DIR). */
const STORAGE_DIR = path.resolve(import.meta.dirname, '../.storage');

/** Arquivos que a API guardou para uma conversa, de qualquer usuário. */
function storedFilesOf(conversationId: string): string[] {
  return globSync(`users/*/conversations/${conversationId}/*`, { cwd: STORAGE_DIR });
}

/**
 * Começa um upload do usuário da página direto na API e o deixa pela metade,
 * como um arquivo grande ainda subindo. `finish()` conclui o envio.
 */
async function startUnfinishedUpload(page: Page, conversationId: string) {
  const cookies = await page.context().cookies();
  const boundary = 'limite-do-teste';
  const upload = http.request(`${API_URL}/api/conversations/${conversationId}/attachments`, {
    method: 'POST',
    headers: {
      Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Transfer-Encoding': 'chunked',
    },
  });
  const finished = new Promise<number>((resolve, reject) => {
    upload.on('response', (response) => resolve(response.statusCode ?? 0)).on('error', reject);
  });
  const firstHalf =
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="file"; filename="demorado.pdf"\r\n' +
    'Content-Type: application/pdf\r\n\r\n%PDF-1.7\n';
  await new Promise<void>((resolve) => upload.write(firstHalf, () => resolve()));

  return {
    /** Conclui o envio e devolve o status da resposta. */
    finish(): Promise<number> {
      upload.end(`conteúdo\r\n--${boundary}--\r\n`);
      return finished;
    },
  };
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

  test('a imagem enviada amplia sobre o chat, sem sair da conversa', async ({ page }) => {
    await chat.attach('faixa-azul.png');
    await chat.send('Veja a imagem');
    const conversationUrl = page.url();

    await chat
      .userMessages()
      .last()
      .getByRole('button', { name: 'Ampliar faixa-azul.png' })
      .click();

    const viewer = page.getByRole('dialog', { name: 'Imagem faixa-azul.png' });
    const enlarged = viewer.getByRole('img', { name: 'faixa-azul.png' });
    await expect(enlarged).toBeVisible();
    expect(await enlarged.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(64);
    expect(page.context().pages()).toHaveLength(1);
    await expect(page).toHaveURL(conversationUrl);

    await page.keyboard.press('Escape');

    await expect(viewer).toBeHidden();
  });

  test('a imagem grande é guardada reduzida', async ({ page }) => {
    // A faixa tem 4096 px de largura; a API guarda imagens com até 2048 px no maior lado.
    await chat.attach('faixa-larga.png');
    await chat.send('Veja a imagem grande');

    await chat
      .userMessages()
      .last()
      .getByRole('button', { name: 'Ampliar faixa-larga.png' })
      .click();

    const enlarged = page.getByRole('dialog').getByRole('img', { name: 'faixa-larga.png' });
    await expect
      .poll(() => enlarged.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(2048);
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

  test('aceita só os anexos que cabem em uma mensagem', async ({ page }) => {
    const pdf = (name: string) => ({
      name,
      mimeType: 'application/pdf',
      buffer: readFileSync(fixture('codigo-secreto.pdf')),
    });
    const oneTooMany = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, (_, index) =>
      pdf(`arquivo-${index + 1}.pdf`),
    );

    await page.getByLabel('Anexar arquivos').setInputFiles(oneTooMany);

    const pendingAttachments = page.getByRole('list', { name: 'Anexos a enviar' });
    await expect(pendingAttachments.getByRole('listitem')).toHaveCount(MAX_ATTACHMENTS_PER_MESSAGE);
    await expect(page.getByRole('alert')).toHaveText(
      'Cada mensagem leva até 10 anexos. Ficaram de fora 1 dos arquivos escolhidos.',
    );
    await expect(page.getByRole('button', { name: 'Anexar' })).toBeDisabled();

    // A API também recusa, para quem não passa pela tela.
    const conversationId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    const refused = await page.request.post(`/api/conversations/${conversationId}/attachments`, {
      multipart: { file: pdf('excedente.pdf') },
    });
    expect(refused.status()).toBe(429);
    expect(storedFilesOf(conversationId)).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE);

    // Enviada a mensagem, a conversa volta a aceitar anexos.
    await chat.send('Seguem os arquivos');
    await expect(chat.assistantReplies().last()).toContainText('Recebi 10 anexo(s)');
    await expect(page.getByRole('button', { name: 'Anexar' })).toBeEnabled();
  });

  test('recusa anexos por enviar além do teto do usuário, somando as conversas', async ({
    page,
  }) => {
    const maxPendingBytes = E2E_MAX_PENDING_ATTACHMENTS_MB * 1024 * 1024;
    /** PDF que ocupa pouco mais da metade do teto: cabe um, não cabem dois. */
    const largePdf = (name: string) => ({
      name,
      mimeType: 'application/pdf',
      buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(maxPendingBytes * 0.6)]),
    });
    const fileInput = page.getByLabel('Anexar arquivos');
    const pendingAttachments = page.getByRole('list', { name: 'Anexos a enviar' });
    await fileInput.setInputFiles(largePdf('primeiro.pdf'));
    await expect(pendingAttachments.getByRole('listitem')).toHaveText([/primeiro\.pdf/]);

    await chat.startNewConversation();
    await fileInput.setInputFiles(largePdf('segundo.pdf'));

    await expect(page.getByRole('alert')).toContainText(
      'Seus anexos ainda não enviados passariam de 1 MB',
    );
    await expect(pendingAttachments).toHaveCount(0);

    // Removido o anexo que ocupava o teto, o segundo passa.
    await page.goBack();
    await page.getByRole('button', { name: 'Remover primeiro.pdf' }).click();
    await expect(pendingAttachments).toHaveCount(0);
    await page.goForward();
    await fileInput.setInputFiles(largePdf('segundo.pdf'));
    await expect(pendingAttachments.getByRole('listitem')).toHaveText([/segundo\.pdf/]);
  });

  test('anexar outro arquivo enquanto o primeiro sobe espera a vez, sem erro', async ({ page }) => {
    const steps: string[] = [];
    const uploadUrl = /\/api\/conversations\/[^/]+\/attachments$/;
    // Atrasa cada upload, como um arquivo grande ainda subindo.
    await page.route(uploadUrl, async (route) => {
      steps.push('upload começa');
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });
    page.on('response', (response) => {
      if (uploadUrl.test(response.url())) {
        steps.push('upload termina');
      }
    });

    await chat.attach('codigo-secreto.pdf');
    await chat.attach('faixa-azul.png');

    const pendingAttachments = page.getByRole('list', { name: 'Anexos a enviar' });
    await expect(pendingAttachments.getByRole('listitem')).toHaveText([
      /codigo-secreto\.pdf/,
      /faixa-azul\.png/,
    ]);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(steps).toEqual(['upload começa', 'upload termina', 'upload começa', 'upload termina']);
  });

  test('avisa quando o usuário já tem um upload em andamento fora desta aba', async ({ page }) => {
    const conversationId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    const otherUpload = await startUnfinishedUpload(page, conversationId);

    await chat.attach('codigo-secreto.pdf');

    await expect(page.getByRole('alert')).toHaveText(
      'Você já tem um envio de arquivo em andamento. Aguarde ele terminar e tente de novo.',
    );
    expect(storedFilesOf(conversationId)).toHaveLength(0);

    // Terminado o outro upload, o usuário volta a poder anexar.
    expect(await otherUpload.finish()).toBe(201);
    await chat.attach('codigo-secreto.pdf');
    const pendingAttachments = page.getByRole('list', { name: 'Anexos a enviar' });
    await expect(pendingAttachments.getByRole('listitem')).toHaveText([/codigo-secreto\.pdf/]);
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
