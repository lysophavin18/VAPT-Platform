import { expect, test, type Page } from '@playwright/test';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('noovastack.token', 'test-token');
    sessionStorage.setItem('noovastack.user', JSON.stringify({ id: 'u1', email: 'admin@noovastack.local', username: 'admin', full_name: 'System Administrator', role: 'admin', is_active: true }));
  });
}

test('Local AI chat page renders workspace sections', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/ai-agents/local-model/health', (route) => route.fulfill({ json: { provider: 'ollama', model: 'qwen3-coder:30b-64k', context_window: '64K', deployment: 'Local', available: true, status: 'healthy' } }));
  await page.goto('/ai-agents');
  await expect(page.locator('h1', { hasText: 'NoovaStack Security Assistant' })).toBeVisible();
  await expect(page.getByText('Local AI Assistance for Authorized VAPT Workflows')).toBeVisible();
  await expect(page.getByText('Conversations')).toBeVisible();
  await expect(page.getByText('General')).toBeVisible();
  await expect(page.getByText('Scope Lock')).toBeVisible();
});

test('Local AI chat sends prompt and renders response', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/ai-agents/local-model/health', (route) => route.fulfill({ json: { provider: 'ollama', model: 'qwen3-coder:30b-64k', context_window: '64K', deployment: 'Local', available: true, status: 'healthy' } }));
  await page.route('**/api/ai-agents/local-chat', (route) => route.fulfill({
    contentType: 'text/event-stream',
    body: 'data: {"type":"token","token":"{\\"type\\":\\"plain\\",\\"message\\":\\"Mocked local model response.\\"}"}\n\ndata: {"type":"done"}\n\n',
  }));
  await page.goto('/ai-agents');
  await page.getByPlaceholder(/Ask the local AI/).fill('Validate this finding');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Mocked local model response.')).toBeVisible();
});

test('Local AI chat identifies an unavailable provider', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/ai-agents/local-model/health', (route) => route.fulfill({ json: { provider: 'ollama', model: 'qwen3-coder:30b-64k', context_window: '64K', deployment: 'Local', available: false, status: 'unavailable' } }));
  await page.route('**/api/ai-agents/local-chat', (route) => route.fulfill({ status: 503, json: { detail: 'Cannot connect to the local AI provider at http://192.168.220.204:11434/v1' } }));
  await page.goto('/ai-agents');
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await page.getByPlaceholder(/Ask the local AI/).fill('Validate this finding');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Local AI unavailable')).toBeVisible();
  await expect(page.getByText('Cannot connect to the local AI provider at http://192.168.220.204:11434/v1')).toBeVisible();
});
