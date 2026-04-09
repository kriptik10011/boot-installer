import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const screenshotDir = join(__dirname, 'screenshots');

test.describe('Post-Edit Assertions', () => {
  test.beforeAll(() => {
    if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('no console errors during load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.reload();
    await page.waitForTimeout(3000);

    // Filter out known harmless errors (e.g., favicon 404)
    const realErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('manifest') &&
      !e.includes('net::ERR')
    );

    expect(realErrors).toEqual([]);
  });

  test('main view rendered', async ({ page }) => {
    // Either day cards (traditional/smart) or canvas (radial)
    const dayCard = page.getByText(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i).first();
    const canvas = page.locator('canvas').first();

    const dayVisible = await dayCard.isVisible().catch(() => false);
    const canvasVisible = await canvas.isVisible().catch(() => false);

    expect(dayVisible || canvasVisible).toBe(true);
  });

  test('no undefined/null text leaked into DOM', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();

    // Check for common leak patterns
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('[object Object]');
    // "null" can appear legitimately, so check for isolated patterns
    const nullPatterns = bodyText.match(/\bnull\b/gi) || [];
    // Allow up to 0 isolated "null" strings
    expect(nullPatterns.length).toBe(0);
  });

  test('post-edit screenshot', async ({ page }) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({
      path: join(screenshotDir, `post-edit-${timestamp}.png`),
      fullPage: true
    });
  });
});
