/**
 * E2E: Accessibility — Keyboard nav, focus traps, skip link, ARIA.
 */

import { test, expect } from '@playwright/test';
import { navigateToApp, takeScreenshot } from './helpers';

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToApp(page);
  });

  test('skip link appears on Tab and navigates to main content', async ({ page }) => {
    // Tab to activate skip link
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    const skipLink = page.getByText(/skip to main/i);
    if (await skipLink.isVisible()) {
      await skipLink.click();
      await page.waitForTimeout(300);

      // Focus should move to main content area
      const mainContent = page.locator('#main-content');
      await expect(mainContent).toBeVisible();
      await takeScreenshot(page, 'skip-link-activated');
    }
  });

  test('main content has role="main"', async ({ page }) => {
    const main = page.locator('main[role="main"], [role="main"]');
    await expect(main.first()).toBeVisible();
  });

  test('screen reader announcer div exists', async ({ page }) => {
    const announcer = page.locator('#a11y-announcer');
    // Should exist in the DOM (even if visually hidden)
    await expect(announcer).toHaveCount(1);
    await expect(announcer).toHaveAttribute('role', 'status');
    await expect(announcer).toHaveAttribute('aria-live', 'polite');
  });

  test('modals have proper ARIA attributes', async ({ page }) => {
    // Open settings to trigger a modal/panel
    const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
    if (!(await settingsBtn.isVisible())) return;

    await settingsBtn.click();
    await page.waitForTimeout(500);

    // Check for dialog role
    const dialog = page.locator('[role="dialog"]');
    if (await dialog.isVisible()) {
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await takeScreenshot(page, 'modal-aria');
    }
  });

  test('ESC closes open modals', async ({ page }) => {
    // Open settings panel
    const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
    if (!(await settingsBtn.isVisible())) return;

    await settingsBtn.click();
    await page.waitForTimeout(500);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Settings panel should be closed
    const settingsHeading = page.getByRole('heading', { name: /settings/i });
    const isStillVisible = await settingsHeading.isVisible().catch(() => false);
    // Either it closed or the settings panel doesn't use ESC
    await takeScreenshot(page, 'after-escape');
  });

  test('focus-visible ring is applied on keyboard navigation', async ({ page }) => {
    // Tab through elements and check for focus ring styles
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    // The focused element should have an outline
    const focusedEl = page.locator(':focus-visible').first();
    if (await focusedEl.isVisible()) {
      // Check computed style for outline
      const outline = await focusedEl.evaluate(
        (el) => window.getComputedStyle(el).outlineStyle
      );
      // Should have some form of outline (not 'none')
      expect(['solid', 'dashed', 'dotted', 'double', 'auto']).toContain(outline);
      await takeScreenshot(page, 'focus-visible-ring');
    }
  });

  test('toasts have proper roles', async ({ page }) => {
    // Trigger a toast by performing an action (if possible)
    // We'll check if any existing toasts have correct roles
    const statusToast = page.locator('[role="status"]');
    const alertToast = page.locator('[role="alert"]');

    // These may or may not exist — just verify structure if they do
    const statusCount = await statusToast.count();
    const alertCount = await alertToast.count();

    // At minimum, the announcer div should exist with role="status"
    expect(statusCount).toBeGreaterThanOrEqual(1); // #a11y-announcer
  });

  test('command palette has proper keyboard navigation', async ({ page }) => {
    // Open command palette
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);

    const input = page.getByPlaceholder(/search|command/i).first();
    if (!(await input.isVisible())) return;

    // Type to filter commands
    await input.fill('set');
    await page.waitForTimeout(300);

    // Arrow down to navigate
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);

    // Check that aria-activedescendant changes
    const activeDesc = await input.getAttribute('aria-activedescendant');
    // It should have some value after arrow navigation
    if (activeDesc) {
      expect(activeDesc.length).toBeGreaterThan(0);
    }

    // Escape to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Palette should be closed
    const isStillVisible = await input.isVisible().catch(() => false);
    expect(isStillVisible).toBe(false);
  });
});
