/**
 * Diagnostic test — captures screenshots to understand what view is
 * shown after admin PIN login, and what text is on screen.
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOTS = 'e2e/screenshots';

test('login-diagnostic', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true });

  // 1. Start at root
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SHOTS, 'diag-01-start.png') });

  // 2. Click admin user card
  const adminCard = page.getByRole('button', { name: /admin/i }).first();
  await adminCard.waitFor({ state: 'visible', timeout: 10_000 });
  await adminCard.click();
  await page.screenshot({ path: path.join(SHOTS, 'diag-02-pin-screen.png') });

  // 3. Enter PIN 1234
  for (const digit of ['1', '2', '3', '4']) {
    const btn = page.getByRole('button', { name: digit, exact: true });
    const btnCount = await btn.count();
    console.log(`DIGIT ${digit}: button count = ${btnCount}`);
    if (btnCount > 0) {
      await btn.first().click();
    }
    await page.waitForTimeout(200);
    const bodyAfter = await page.locator('body').textContent().catch(() => '');
    console.log(`AFTER_DIGIT_${digit}: body first 100 chars = ${bodyAfter?.substring(0, 100)}`);
  }
  await page.screenshot({ path: path.join(SHOTS, 'diag-03-after-pin.png') });

  // 4. Wait for login to complete
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: path.join(SHOTS, 'diag-03b-after-networkidle.png') });

  // 5. Check if view picker dialog is showing
  const viewPickerHeading = page.getByText(/choose your default view/i);
  const pickerVisible = await viewPickerHeading.isVisible({ timeout: 3_000 }).catch(() => false);
  console.log(`VIEW_PICKER_VISIBLE: ${pickerVisible}`);
  await page.screenshot({ path: path.join(SHOTS, 'diag-04-after-wait.png') });

  if (pickerVisible) {
    console.log('Clicking Weekly Grid button...');
    // Try by text content (the card has "Weekly Grid" text)
    const weeklyGridCard = page.getByText('Weekly Grid', { exact: true }).first();
    const weeklyGridCardVisible = await weeklyGridCard.isVisible().catch(() => false);
    console.log(`WEEKLY_GRID_CARD_VISIBLE: ${weeklyGridCardVisible}`);

    // Also try by role button
    const weeklyGridBtn = page.getByRole('button', { name: /weekly grid/i });
    const weeklyGridBtnCount = await weeklyGridBtn.count();
    console.log(`WEEKLY_GRID_BTN_COUNT: ${weeklyGridBtnCount}`);

    if (weeklyGridBtnCount > 0) {
      await weeklyGridBtn.first().click();
      console.log('Clicked Weekly Grid button via role');
    } else if (weeklyGridCardVisible) {
      await weeklyGridCard.click();
      console.log('Clicked Weekly Grid card via text');
    }

    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    await page.screenshot({ path: path.join(SHOTS, 'diag-05-after-weekly-grid-click.png') });
    await page.waitForTimeout(2_000);
  }

  // 6. Log the page text content
  const bodyText = await page.locator('body').textContent();
  console.log('BODY_TEXT_FIRST_500:', bodyText?.substring(0, 500));

  // 7. Log page URL
  console.log('CURRENT_URL:', page.url());

  // 8. Check for common elements
  const elementsToCheck = [
    'choose your default view',
    'radial hub',
    'weekly grid',
    'weekly review',
    'Mon',
    'Tue',
    'Wed',
    'Finance',
  ];
  for (const el of elementsToCheck) {
    const visible = await page.getByText(el, { exact: false }).first().isVisible().catch(() => false);
    console.log(`ELEMENT "${el}": visible=${visible}`);
  }

  // 9. Final screenshot
  await page.screenshot({ path: path.join(SHOTS, 'diag-06-final.png'), fullPage: true });
});
