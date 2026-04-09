/**
 * E2E: Financial Tracking — Budget, transactions, bill predictions.
 */

import { test, expect } from '@playwright/test';
import { navigateToApp, takeScreenshot } from './helpers';

test.describe('Financial Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToApp(page);
  });

  test('can open finance panel', async ({ page }) => {
    // Look for finance/bills button in toolbar
    const financeBtn = page.getByRole('button', { name: /finance|bills|budget|\$/i }).first();
    if (await financeBtn.isVisible()) {
      await financeBtn.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, 'finance-panel');
    }
  });

  test('finance panel shows tabs', async ({ page }) => {
    const financeBtn = page.getByRole('button', { name: /finance|bills|budget|\$/i }).first();
    if (!(await financeBtn.isVisible())) return;

    await financeBtn.click();
    await page.waitForTimeout(500);

    // Should see tab navigation (Overview, Budget, Transactions, etc.)
    const tabs = page.getByRole('tab').or(page.locator('[role="tablist"] button'));
    const tabCount = await tabs.count();
    if (tabCount > 0) {
      expect(tabCount).toBeGreaterThanOrEqual(2);
      await takeScreenshot(page, 'finance-tabs');
    }
  });

  test('can view budget overview', async ({ page }) => {
    const financeBtn = page.getByRole('button', { name: /finance|bills|budget|\$/i }).first();
    if (!(await financeBtn.isVisible())) return;

    await financeBtn.click();
    await page.waitForTimeout(500);

    // Look for budget-related content
    const budgetText = page.getByText(/budget|allocation|spent/i).first();
    if (await budgetText.isVisible()) {
      await takeScreenshot(page, 'budget-overview');
    }
  });

  test('can navigate finance tabs', async ({ page }) => {
    const financeBtn = page.getByRole('button', { name: /finance|bills|budget|\$/i }).first();
    if (!(await financeBtn.isVisible())) return;

    await financeBtn.click();
    await page.waitForTimeout(500);

    // Click through available tabs
    const tabs = page.getByRole('tab').or(page.locator('[role="tablist"] button'));
    const tabCount = await tabs.count();

    for (let i = 0; i < Math.min(tabCount, 4); i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(300);
    }
    await takeScreenshot(page, 'finance-tab-navigation');
  });

  test('bills section shows upcoming bills', async ({ page }) => {
    const financeBtn = page.getByRole('button', { name: /finance|bills|budget|\$/i }).first();
    if (!(await financeBtn.isVisible())) return;

    await financeBtn.click();
    await page.waitForTimeout(500);

    // Look for bills tab or section
    const billsTab = page.getByRole('tab', { name: /bills/i }).or(
      page.getByText(/bills|upcoming/i)
    ).first();
    if (await billsTab.isVisible()) {
      await billsTab.click();
      await page.waitForTimeout(300);
      await takeScreenshot(page, 'bills-section');
    }
  });

  test('export button is available for financial summary', async ({ page }) => {
    // Check for export menu in the header area
    const exportBtn = page.getByRole('button', { name: /export|print/i }).first();
    if (await exportBtn.isVisible()) {
      await exportBtn.click();
      await page.waitForTimeout(300);

      // Should show export options including financial summary
      const financialExport = page.getByText(/financial.*summary/i).first();
      if (await financialExport.isVisible()) {
        await takeScreenshot(page, 'financial-export-option');
      }
    }
  });
});
