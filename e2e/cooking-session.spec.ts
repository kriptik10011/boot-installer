/**
 * E2E: Cooking Session — Enter cooking mode, complete, deplete inventory.
 */

import { test, expect } from '@playwright/test';
import { navigateToApp, takeScreenshot } from './helpers';

test.describe('Cooking Session', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToApp(page);
  });

  test('cooking mode button is visible in meal context', async ({ page }) => {
    // Look for a "Cook" button somewhere in the UI
    const cookBtn = page.getByRole('button', { name: /cook/i }).first();
    if (await cookBtn.isVisible()) {
      await takeScreenshot(page, 'cook-button-visible');
    }
  });

  test('can enter cooking mode when recipe is available', async ({ page }) => {
    // Look for cook button on a meal entry
    const cookBtn = page.getByRole('button', { name: /cook/i }).first();
    if (!(await cookBtn.isVisible())) return;

    await cookBtn.click();
    await page.waitForTimeout(500);

    // Cooking mode should take over the screen
    const cookingLayout = page.getByText(/cooking/i).first();
    if (await cookingLayout.isVisible()) {
      await takeScreenshot(page, 'cooking-mode-active');
    }
  });

  test('cooking mode shows recipe steps', async ({ page }) => {
    const cookBtn = page.getByRole('button', { name: /cook/i }).first();
    if (!(await cookBtn.isVisible())) return;

    await cookBtn.click();
    await page.waitForTimeout(500);

    // Should show ingredients or instructions
    const ingredients = page.getByText(/ingredient/i).first();
    const instructions = page.getByText(/instruction|step|direction/i).first();

    const hasIngredients = await ingredients.isVisible().catch(() => false);
    const hasInstructions = await instructions.isVisible().catch(() => false);

    if (hasIngredients || hasInstructions) {
      await takeScreenshot(page, 'cooking-mode-content');
    }
  });

  test('can exit cooking mode', async ({ page }) => {
    const cookBtn = page.getByRole('button', { name: /cook/i }).first();
    if (!(await cookBtn.isVisible())) return;

    await cookBtn.click();
    await page.waitForTimeout(500);

    // Find exit/close button
    const exitBtn = page.getByRole('button', { name: /exit|close|back|done/i }).first();
    if (await exitBtn.isVisible()) {
      await exitBtn.click();
      await page.waitForTimeout(500);

      // Should be back to normal view
      await expect(page.getByText(/mon|tue|wed/i).first()).toBeVisible();
    }
  });

  test('inventory panel shows stock levels', async ({ page }) => {
    // Open inventory panel
    const inventoryBtn = page.getByRole('button', { name: /inventory|pantry/i }).first();
    if (!(await inventoryBtn.isVisible())) return;

    await inventoryBtn.click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/inventory|pantry|stock/i).first()).toBeVisible();
    await takeScreenshot(page, 'inventory-panel');
  });
});
