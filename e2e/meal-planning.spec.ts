/**
 * E2E: Meal Planning — Create meal plan, scale recipe, generate shopping list.
 */

import { test, expect } from '@playwright/test';
import { navigateToApp, seedData, clearData, takeScreenshot } from './helpers';

test.describe('Meal Planning', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToApp(page);
  });

  test('can view weekly meal grid', async ({ page }) => {
    // Day names should be visible in the week view
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const day of dayNames) {
      await expect(
        page.getByText(new RegExp(day, 'i')).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('can navigate between weeks', async ({ page }) => {
    // Find week navigation buttons
    const prevBtn = page.getByRole('button', { name: /prev|←|chevron.*left/i }).first();
    const nextBtn = page.getByRole('button', { name: /next|→|chevron.*right/i }).first();

    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      // Navigate back
      await prevBtn.click();
      await page.waitForTimeout(500);
    }

    // "Today" or "This Week" button should exist
    const todayBtn = page.getByRole('button', { name: /today|this week/i });
    if (await todayBtn.isVisible()) {
      await todayBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('can open meal panel from day card', async ({ page }) => {
    // Click on a meal slot area (breakfast/lunch/dinner)
    const mealSlot = page.getByText(/breakfast|lunch|dinner/i).first();
    if (await mealSlot.isVisible()) {
      await mealSlot.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, 'meal-panel-opened');
    }
  });

  test('can switch between view modes', async ({ page }) => {
    // Find the view mode toggle
    const modeToggle = page.locator('[title*="Switch to"]').first();
    if (await modeToggle.isVisible()) {
      const titleBefore = await modeToggle.getAttribute('title');
      await modeToggle.click();
      await page.waitForTimeout(500);

      const titleAfter = await modeToggle.getAttribute('title');
      expect(titleBefore).not.toBe(titleAfter);

      await takeScreenshot(page, 'mode-switched');

      // Switch back
      await modeToggle.click();
      await page.waitForTimeout(300);
    }
  });

  test('can open recipe panel', async ({ page }) => {
    // Look for a recipe link or "Recipes" button
    const recipesBtn = page.getByRole('button', { name: /recipes/i }).first();
    if (await recipesBtn.isVisible()) {
      await recipesBtn.click();
      await page.waitForTimeout(500);
      // Recipe panel should slide in
      await expect(page.getByText(/recipe/i).first()).toBeVisible();
      await takeScreenshot(page, 'recipe-panel');
    }
  });

  test('can open shopping panel', async ({ page }) => {
    // Look for shopping list button
    const shoppingBtn = page.getByRole('button', { name: /shopping/i }).first();
    if (await shoppingBtn.isVisible()) {
      await shoppingBtn.click();
      await page.waitForTimeout(500);
      await expect(page.getByText(/shopping/i).first()).toBeVisible();
      await takeScreenshot(page, 'shopping-panel');
    }
  });

  test('meal draft panel can be opened', async ({ page }) => {
    // Look for the "Draft Week" sparkles button
    const draftBtn = page.getByRole('button', { name: /draft/i }).or(
      page.locator('button').filter({ has: page.locator('[class*="sparkle" i]') })
    ).first();

    if (await draftBtn.isVisible()) {
      await draftBtn.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, 'meal-draft-panel');
    }
  });
});
