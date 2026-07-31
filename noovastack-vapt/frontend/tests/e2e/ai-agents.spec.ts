import { expect, test } from '@playwright/test';

async function authenticate(page) {
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
  await page.route('**/api/ai-agents/local-chat', (route) => route.fulfill({ json: { conversation_id: 'chat-001', message_id: 'msg-002', role: 'assistant', mode: 'general', content: { type: 'plain', message: 'Mocked local model response.', human_review_required: true }, model: { provider: 'ollama', name: 'qwen3-coder:30b-64k' }, created_at: new Date().toISOString() } }));
  await page.goto('/ai-agents');
  await page.getByPlaceholder(/Ask the local AI/).fill('Validate this finding');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Mocked local model response.')).toBeVisible();
});
