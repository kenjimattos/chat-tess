import { expect, test, type Page } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

/** Quantas vezes o usuário logado refez um turno, segundo a auditoria. */
async function resendCount(page: Page): Promise<number> {
  const response = await page.request.get('/api/audit-events?type=message.resent');
  return (await response.json()).length;
}

test.describe('Reenviar e editar a última mensagem', () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    chat = new ChatPage(page);
    await chat.startNewConversation();
  });

  test('reenviar substitui a resposta, sem duplicar a pergunta', async ({ page }) => {
    await chat.send('Primeira pergunta');
    await chat.send('Segunda pergunta');

    await page.getByRole('button', { name: 'Reenviar', exact: true }).click();

    await expect.poll(() => resendCount(page)).toBe(1);
    await expect(chat.assistantReplies().last()).toHaveText('Você disse: "Segunda pergunta".');
    await expect(chat.userMessages()).toHaveText(['Primeira pergunta', 'Segunda pergunta']);
    await expect(chat.assistantReplies()).toHaveCount(2);

    await page.reload();
    await expect(chat.userMessages()).toHaveText(['Primeira pergunta', 'Segunda pergunta']);
    await expect(chat.assistantReplies()).toHaveCount(2);
  });

  test('editar troca a pergunta e a resposta', async ({ page }) => {
    await chat.send('Pergunta errada');

    await page.getByRole('button', { name: 'Editar' }).click();
    await page.getByRole('textbox', { name: 'Editar mensagem' }).fill('Pergunta certa');
    await page.getByRole('button', { name: 'Salvar e reenviar' }).click();

    await expect(chat.assistantReplies()).toHaveText(['Você disse: "Pergunta certa".']);
    await expect(chat.userMessages()).toHaveText(['Pergunta certa']);

    await page.reload();
    await expect(chat.userMessages()).toHaveText(['Pergunta certa']);
    await expect(chat.assistantReplies()).toHaveText(['Você disse: "Pergunta certa".']);
  });

  test('editar mantém os anexos da mensagem', async ({ page }) => {
    await chat.attach('codigo-secreto.pdf');
    await chat.send('Resuma');

    await page.getByRole('button', { name: 'Editar' }).click();
    await page.getByRole('textbox', { name: 'Editar mensagem' }).fill('Traduza');
    await page.getByRole('button', { name: 'Salvar e reenviar' }).click();

    await expect(chat.assistantReplies()).toHaveText([
      'Você disse: "Traduza". Recebi 1 anexo(s): codigo-secreto.pdf.',
    ]);
    await expect(
      chat
        .userMessages()
        .last()
        .getByRole('link', { name: /codigo-secreto\.pdf/ }),
    ).toBeVisible();
  });

  test('cancelar a edição deixa a conversa como estava', async ({ page }) => {
    await chat.send('Pergunta original');

    await page.getByRole('button', { name: 'Editar' }).click();
    await page.getByRole('textbox', { name: 'Editar mensagem' }).fill('Outra coisa');
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(chat.userMessages()).toHaveText(['Pergunta original']);
    await expect(chat.assistantReplies()).toHaveText(['Você disse: "Pergunta original".']);
    expect(await resendCount(page)).toBe(0);
  });

  test('só a última mensagem do usuário tem as ações', async ({ page }) => {
    await chat.send('Primeira pergunta');
    await chat.send('Segunda pergunta');

    await expect(page.getByRole('button', { name: 'Reenviar', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(1);
  });
});
