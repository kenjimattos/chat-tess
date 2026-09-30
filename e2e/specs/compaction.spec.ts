import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';

/**
 * A API dos testes usa um limite de contexto baixo (test-environment.ts), então
 * a compactação acontece depois de poucas mensagens longas.
 */
test.describe('Compactação automática do histórico', () => {
  test('resume o início da conversa sem interromper o chat e sem apagar mensagens', async ({
    page,
  }) => {
    await loginAs(page);
    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.startNewConversation();
    const longText = (label: string) =>
      `${label}: ${'conteúdo extenso para encher o contexto. '.repeat(30)}`;

    for (const label of ['Mensagem 1', 'Mensagem 2', 'Mensagem 3']) {
      await chat.send(longText(label));
    }
    await chat.send('E agora, você lembra do início?');

    await expect(page.getByRole('status').filter({ hasText: 'resumido' })).toHaveText(
      'O início da conversa foi resumido para caber no contexto do modelo. Nada foi apagado.',
    );
    await expect(chat.assistantReplies().last()).toContainText(
      '(Estou usando o resumo do início da conversa.)',
    );

    await page.reload();
    await expect(chat.userMessages()).toHaveCount(4);
    await expect(chat.userMessages().first()).toContainText('Mensagem 1');
  });
});
