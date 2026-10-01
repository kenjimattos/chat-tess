import type { RequestHandler } from 'express';

/**
 * O que as páginas do site podem carregar e para onde podem enviar dados: só a
 * própria origem. É a segunda barreira contra o vazamento da conversa por uma
 * resposta manipulada do LLM: mesmo que algum conteúdo externo chegue à tela, o
 * navegador não faz a requisição para o servidor de terceiros.
 */
const DIRECTIVES: Record<string, string> = {
  'default-src': "'self'",
  // Anexos vêm da própria API; `data:` e `blob:` cobrem ícones do CSS e prévias locais.
  'img-src': "'self' data: blob:",
  // O React escreve estilos no atributo `style` (a barra de consumo, por exemplo).
  'style-src': "'self' 'unsafe-inline'",
  'object-src': "'none'",
  'base-uri': "'self'",
  'form-action': "'self'",
  'frame-ancestors': "'none'",
};

export const CONTENT_SECURITY_POLICY = Object.entries(DIRECTIVES)
  .map(([directive, sources]) => `${directive} ${sources}`)
  .join('; ');

export const contentSecurityPolicy: RequestHandler = (_request, response, next) => {
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  next();
};
