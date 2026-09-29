import { expect, test } from '@playwright/test';

test.describe('Estado do sistema', () => {
  test('a página inicial mostra que a API e o banco estão no ar', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'chat-tess' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('API e banco de dados no ar');
  });
});
