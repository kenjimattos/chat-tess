import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';

test.describe('Autenticação', () => {
  test('sem sessão, a página inicial oferece o login com Google', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Entrar com Google' })).toHaveAttribute(
      'href',
      '/api/auth/google',
    );
  });

  test('um e-mail permitido entra e vê o próprio nome', async ({ page }) => {
    await loginAs(page);

    await page.goto('/');

    await expect(page.getByText('Ana E2E')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  });

  test('a sessão continua depois de recarregar a página', async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    await expect(page.getByText('Ana E2E')).toBeVisible();

    await page.reload();

    await expect(page.getByText('Ana E2E')).toBeVisible();
  });

  test('sair encerra a sessão', async ({ page }) => {
    await loginAs(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Sair' }).click();

    await expect(page.getByRole('link', { name: 'Entrar com Google' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Entrar com Google' })).toBeVisible();
  });

  test('um e-mail fora da lista de permitidos é barrado', async ({ page }) => {
    const response = await page.request.post('/api/auth/test-login', {
      data: { email: 'intruso@fora-da-lista.test' },
    });

    expect(response.status()).toBe(403);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Entrar com Google' })).toBeVisible();
  });

  test('explica o motivo quando o login com Google é recusado', async ({ page }) => {
    await page.goto('/?login_error=email_not_allowed');

    await expect(page.getByRole('alert')).toHaveText(
      'Este e-mail não tem permissão para acessar a aplicação.',
    );
  });
});
