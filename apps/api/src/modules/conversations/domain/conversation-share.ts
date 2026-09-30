/**
 * Link somente leitura de uma conversa. Quem tem o token e está logado vê a
 * conversa; só o dono gera e revoga o link.
 */
export interface ConversationShare {
  conversationId: string;
  token: string;
  createdAt: Date;
}

/** 24 bytes aleatórios em base64url: 32 caracteres, impossível de adivinhar. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
