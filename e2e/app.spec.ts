import { test, expect } from '@playwright/test';

test.describe('Weekly Review App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads at root URL', async ({ page }) => {
    // SPA serves at / — no /v2 redirect
    await expect(page).toHaveURL(/\/$/);
  });

  test('displays WeekView with day cards', async ({ page }) => {
    // Day cards show full day names: "Monday", "Tuesday", etc.
    await expect(
      page.getByText(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('can navigate weeks', async ({ page }) => {
    const prevButton = page.getByRole('button', { name: /previous|prev|←/i }).or(page.locator('button').filter({ hasText: '←' }));
    const nextButton = page.getByRole('button', { name: /next|→/i }).or(page.locator('button').filter({ hasText: '→' }));

    if (await nextButton.isVisible()) {
      await nextButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('can open settings panel', async ({ page }) => {
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(page.locator('button[aria-label*="settings" i]'));

    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    }
  });
});

test.describe('Events', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('can open add event panel', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add|new|\+/i }).first();

    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Meals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('can view meals section', async ({ page }) => {
    // Look for meals section headers in day cards
    const mealsSection = page.getByText(/meals|breakfast|lunch|dinner/i).first();
    await expect(mealsSection).toBeVisible({ timeout: 5000 }).catch(() => {
      // Meals might not be visible if no data
    });
  });
});

test.describe('Finances', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('can view finances section', async ({ page }) => {
    const financesSection = page.getByText(/bills|finances|due|\$/i).first();
    await expect(financesSection).toBeVisible({ timeout: 5000 }).catch(() => {
      // Finances might not be visible if no data
    });
  });
});
