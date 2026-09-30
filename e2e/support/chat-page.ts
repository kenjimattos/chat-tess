import { expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../fixtures');

export function fixture(fileName: string): string {
  return path.join(FIXTURES_DIR, fileName);
}

/** Ações e consultas da tela de chat, para os specs lerem como roteiros de uso. */
export class ChatPage {
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly conversationList: Locator;

  constructor(private readonly page: Page) {
    this.messageInput = page.getByRole('textbox', { name: 'Mensagem' });
    this.sendButton = page.getByRole('button', { name: 'Enviar' });
    this.conversationList = page.getByRole('navigation', { name: 'Conversas' });
  }

  /**
   * Cria a conversa e espera ela abrir: a URL muda e o chat aparece vazio.
   * Sem essa espera, o texto poderia ser digitado no chat anterior, que ainda
   * está na tela até a conversa nova ser criada.
   */
  async startNewConversation(): Promise<void> {
    const previousUrl = this.page.url();
    // Conversas ainda sem título também se chamam "Nova conversa";
    // o botão de criar vem antes delas na barra lateral.
    await this.conversationList
      .getByRole('button', { name: 'Nova conversa', exact: true })
      .first()
      .click();
    await expect(this.page).not.toHaveURL(previousUrl);
    await expect(
      this.page.getByText('Envie uma mensagem, uma imagem ou um PDF para começar.'),
    ).toBeVisible();
  }

  /** Envia e espera a resposta terminar (o botão Parar some e Enviar volta). */
  async send(text: string): Promise<void> {
    await this.messageInput.fill(text);
    await this.sendButton.click();
    await expect(this.page.getByRole('button', { name: 'Parar' })).toBeHidden();
    await expect(this.messageInput).toHaveValue('');
  }

  async attach(...fileNames: string[]): Promise<void> {
    await this.page.getByLabel('Anexar arquivos').setInputFiles(fileNames.map(fixture));
  }

  assistantReplies(): Locator {
    return this.page.getByRole('article', { name: 'Resposta do assistente' });
  }

  userMessages(): Locator {
    return this.page.getByRole('article', { name: 'Mensagem do usuário' });
  }

  conversationNamed(title: string): Locator {
    return this.conversationList.getByRole('button', { name: title, exact: true });
  }
}
