import { test, expect } from '@playwright/test';

test.describe('Security Checks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('XSS: script injection in text fields is escaped', async ({ page }) => {
    // Try to find any text input and inject XSS
    const inputs = page.locator('input[type="text"], textarea').first();

    if (await inputs.isVisible().catch(() => false)) {
      let alertFired = false;
      page.on('dialog', async dialog => {
        alertFired = true;
        await dialog.dismiss();
      });

      await inputs.fill('<script>alert("XSS")</script>');
      await inputs.press('Enter');
      await page.waitForTimeout(1000);

      expect(alertFired).toBe(false);
    }
  });

  test('no red shame colors (DEC-045)', async ({ page }) => {
    // DEC-045: Ban #dc2626 and #ef4444 red text
    const shameColors = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const found: string[] = [];
      elements.forEach(el => {
        const style = getComputedStyle(el);
        const color = style.color.toLowerCase();
        // Check for the banned reds in rgb format
        // #dc2626 = rgb(220, 38, 38), #ef4444 = rgb(239, 68, 68)
        if (color === 'rgb(220, 38, 38)' || color === 'rgb(239, 68, 68)') {
          found.push(`${el.tagName}.${el.className}: ${color}`);
        }
      });
      return found;
    });

    expect(shameColors).toEqual([]);
  });

  test('no sensitive data in console output', async ({ page }) => {
    const sensitivePatterns: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (/bearer|token|password|secret|api.?key/i.test(text)) {
        sensitivePatterns.push(text.substring(0, 100));
      }
    });

    await page.reload();
    await page.waitForTimeout(3000);

    expect(sensitivePatterns).toEqual([]);
  });
});
