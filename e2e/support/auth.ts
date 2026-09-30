import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { ALLOWED_TEST_DOMAIN } from '../test-environment';

/** E-mail novo e permitido: cada teste começa sem conversas de outros testes. */
export function uniqueTestEmail(): string {
  return `usuario-${randomUUID().slice(0, 8)}${ALLOWED_TEST_DOMAIN}`;
}

/**
 * Abre uma sessão pelo login de teste da API. A requisição compartilha os
 * cookies com o navegador da página, então a página passa a estar logada.
 */
export async function loginAs(page: Page, email = uniqueTestEmail(), name = 'Ana E2E') {
  const response = await page.request.post('/api/auth/test-login', { data: { email, name } });
  expect(response.ok(), `login de teste falhou com status ${response.status()}`).toBe(true);
  return response.json();
}
