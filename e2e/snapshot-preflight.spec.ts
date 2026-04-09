import { test } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

test('preflight screenshot', async ({ page }) => {
  const dir = join(__dirname, 'screenshots');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  await page.goto('/');
  await page.waitForTimeout(2000);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: join(dir, `preflight-${timestamp}.png`),
    fullPage: true
  });
});
