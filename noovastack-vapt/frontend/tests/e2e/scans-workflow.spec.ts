import { expect, test } from '@playwright/test';

async function authenticate(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('noovastack.token', 'test-token');
    sessionStorage.setItem('noovastack.user', JSON.stringify({ id: 'u1', email: 'admin@noovastack.local', username: 'admin', full_name: 'System Administrator', role: 'admin', is_active: true }));
  });
}

test('new scan page renders professional template workflow and selectors', async ({ page }) => {
  await authenticate(page);
  await page.goto('/scans/new');
  await expect(page.getByRole('heading', { name: 'New Scan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a scan type' })).toBeVisible();
  await expect(page.getByText('Step 1')).toBeVisible();
  await expect(page.getByText('Step 3')).toBeVisible();
  await expect(page.getByRole('button', { name: /Vulnerability Scan/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Web Application/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Container/ })).toBeVisible();
  await expect(page.getByText('Scan Templates')).toBeVisible();
  await expect(page.getByText('Live Preview')).toBeVisible();
  await page.getByPlaceholder('Search templates, checks, or scan types').fill('container');
  await expect(page.getByRole('button', { name: /Container/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Web Application/ })).not.toBeVisible();
  await page.getByRole('button', { name: 'All' }).click();
  await page.getByPlaceholder('Search templates, checks, or scan types').fill('');
  await expect(page.getByRole('button', { name: /Web Application/ })).toBeVisible();
});

test('scan progress, process, and results routes render shell sections', async ({ page }) => {
  await authenticate(page);
  await page.goto('/scans/test-scan-id/progress');
  await expect(page.getByRole('heading', { name: 'Live Scan Progress' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Safety Controls' })).toBeVisible();
  await page.goto('/scans/test-scan-id/process');
  await expect(page.getByRole('heading', { name: 'Scan Process and Results' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence Pipeline' })).toBeVisible();
  await page.goto('/scans/test-scan-id/results');
  await expect(page.getByRole('heading', { name: 'Scan Results' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Findings Queue' })).toBeVisible();
});
