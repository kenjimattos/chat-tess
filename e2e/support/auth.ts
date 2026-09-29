import { expect, type Page } from '@playwright/test';
import { ALLOWED_TEST_EMAIL } from '../test-environment';

/**
 * Abre uma sessão pelo login de teste da API. A requisição compartilha os
 * cookies com o navegador da página, então a página passa a estar logada.
 */
export async function loginAs(page: Page, email = ALLOWED_TEST_EMAIL, name = 'Ana E2E') {
  const response = await page.request.post('/api/auth/test-login', { data: { email, name } });
  expect(response.ok(), `login de teste falhou com status ${response.status()}`).toBe(true);
  return response.json();
}
