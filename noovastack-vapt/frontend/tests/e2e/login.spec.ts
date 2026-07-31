import { expect, test } from '@playwright/test';

test('login page has accessible primary controls', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /NoovaStack VAPT Platform/i })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});
