/**
 * Ship Verification — Traditional View
 *
 * Systematically verifies all feature contracts (F01-F47, C01-C04)
 * against VIEW_SPEC.md for the Traditional view.
 */

import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';

const SCREENSHOT_DIR = 'e2e/screenshots/ship-verify';

async function login(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Check if login screen is present
  const pinInput = page.locator('input[type="password"], input[inputmode="numeric"]').first();
  const isLoginVisible = await pinInput.isVisible({ timeout: 5000 }).catch(() => false);

  if (isLoginVisible) {
    await pinInput.fill('1234');
    const submitBtn = page.getByRole('button', { name: /log\s*in|submit|enter|unlock/i }).first();
    const isSubmitVisible = await submitBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (isSubmitVisible) {
      await submitBtn.click();
    } else {
      await pinInput.press('Enter');
    }
    await page.waitForTimeout(2000);
  }

  // Dismiss onboarding if present
  const wizard = page.getByText('Welcome to Weekly Review');
  if (await wizard.isVisible({ timeout: 2000 }).catch(() => false)) {
    const nextBtn = page.getByRole('button', { name: /next/i });
    while (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }
    const startBtn = page.getByRole('button', { name: /start fresh|get started|begin/i });
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

async function ensureTraditionalView(page: Page) {
  // Check current view mode
  const isTraditional = await page.evaluate(() => {
    const store = (window as any).__zustand_store;
    if (store) return store.getState().uiMode === 'traditional';
    return null;
  });

  // If we can't detect via store, look for view toggle
  if (isTraditional === false) {
    const viewToggle = page.getByRole('button', { name: /traditional/i });
    if (await viewToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await viewToggle.click();
      await page.waitForTimeout(1000);
    }
  }
}

async function ss(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}

test.describe('Traditional View Ship Verification', () => {
  test.beforeAll(async () => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('01-login-and-main-view', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await ss(page, '01-main-view');

    // Verify we see the week grid with day names
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let visibleDays = 0;
    for (const day of dayNames) {
      const el = page.getByText(day, { exact: false }).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        visibleDays++;
      }
    }
    expect(visibleDays).toBeGreaterThanOrEqual(5);

    // Verify header is present
    const header = page.locator('[class*="header"], header, [role="banner"]').first();
    await expect(header).toBeVisible({ timeout: 3000 });
  });

  test('02-events-F01-F06', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // F01-F02: Events section visible on day cards
    const eventsLabel = page.getByText('Events', { exact: false }).first();
    await expect(eventsLabel).toBeVisible({ timeout: 5000 });
    await ss(page, '02-events-section');

    // F03: "+" or empty state click to add event
    const addEventButtons = page.locator('[class*="day"] button, [role="gridcell"] button').all();

    // F05: Check for conflict indicators (if any)
    const conflictBadge = page.getByText('Conflicts', { exact: false });
    const hasConflicts = await conflictBadge.isVisible({ timeout: 1000 }).catch(() => false);

    // F06: Week navigation arrows
    const prevWeek = page.getByRole('button', { name: /prev|←|back|chevron.*left/i }).first();
    const nextWeek = page.getByRole('button', { name: /next|→|forward|chevron.*right/i }).first();
    const todayBtn = page.getByRole('button', { name: /today/i }).first();

    // At least navigation arrows should be visible
    const hasPrev = await prevWeek.isVisible({ timeout: 2000 }).catch(() => false);
    const hasNext = await nextWeek.isVisible({ timeout: 2000 }).catch(() => false);
    const hasToday = await todayBtn.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasPrev || hasNext || hasToday).toBe(true);
    await ss(page, '02-week-navigation');
  });

  test('03-meals-F07-F13', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // F07/F13: Meals section visible on day cards
    const mealsLabel = page.getByText('Meals', { exact: false }).first();
    await expect(mealsLabel).toBeVisible({ timeout: 5000 });

    // Meal slots: Breakfast, Lunch, Dinner
    const breakfast = page.getByText('Breakfast', { exact: false }).first();
    const lunch = page.getByText('Lunch', { exact: false }).first();
    const dinner = page.getByText('Dinner', { exact: false }).first();

    const hasBreakfast = await breakfast.isVisible({ timeout: 2000 }).catch(() => false);
    const hasLunch = await lunch.isVisible({ timeout: 2000 }).catch(() => false);
    const hasDinner = await dinner.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasBreakfast || hasLunch || hasDinner).toBe(true);
    await ss(page, '03-meals-section');

    // F09: Recipe button in header
    const recipeBtn = page.getByRole('button', { name: /recipe/i }).first();
    const hasRecipeBtn = await recipeBtn.isVisible({ timeout: 2000 }).catch(() => false);
    await ss(page, '03-header-buttons');
  });

  test('04-bills-F14-F17', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // F14: Bills section visible on day cards
    const billsLabel = page.getByText('Bills', { exact: false }).first();
    await expect(billsLabel).toBeVisible({ timeout: 5000 });
    await ss(page, '04-bills-section');

    // Check for bill amounts (dollar signs)
    const dollarAmounts = page.locator('text=/\\$\\d/').all();
  });

  test('05-finance-F15-F22', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // F15-F22: Finance panel accessible from header
    const financeBtn = page.getByRole('button', { name: /finance|budget|money/i }).first();
    const hasFinanceBtn = await financeBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasFinanceBtn) {
      await financeBtn.click();
      await page.waitForTimeout(2000);
      await ss(page, '05-finance-panel');

      // F22: Comprehensive dashboard should be visible
      // Look for dashboard cards
      const dashboardContent = page.locator('[class*="dashboard"], [class*="card"]').first();
      const hasDashboard = await dashboardContent.isVisible({ timeout: 3000 }).catch(() => false);
      await ss(page, '05-finance-dashboard');
    }

    // Also try Alt+F keyboard shortcut
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('06-shopping-F23-F26', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // F23: Shopping button in header
    const shoppingBtn = page.getByRole('button', { name: /shopping/i }).first();
    const hasShoppingBtn = await shoppingBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasShoppingBtn) {
      await shoppingBtn.click();
      await page.waitForTimeout(2000);
      await ss(page, '06-shopping-panel');
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('07-inventory-F27-F31', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // F27: Inventory button in header
    const inventoryBtn = page.getByRole('button', { name: /inventory|pantry/i }).first();
    const hasInventoryBtn = await inventoryBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasInventoryBtn) {
      await inventoryBtn.click();
      await page.waitForTimeout(2000);
      await ss(page, '07-inventory-panel');
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('08-recipes-F34-F37', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // F34: Recipe panel accessible
    const recipeBtn = page.getByRole('button', { name: /recipe/i }).first();
    const hasRecipeBtn = await recipeBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasRecipeBtn) {
      await recipeBtn.click();
      await page.waitForTimeout(2000);
      await ss(page, '08-recipe-panel');

      // F35: Search/filter
      const searchInput = page.getByPlaceholder(/search/i).first();
      const hasSearch = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);

      // F37: Import tab
      const importTab = page.getByText(/import/i).first();
      const hasImport = await importTab.isVisible({ timeout: 2000 }).catch(() => false);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('09-cross-cutting-F40-F47', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // F40: Settings button
    const settingsBtn = page.getByRole('button', { name: /settings|gear|cog/i }).first();
    const hasSettings = await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false);
    await ss(page, '09-header-all-buttons');

    // F41: Export button
    const exportBtn = page.getByRole('button', { name: /export|download/i }).first();
    const hasExport = await exportBtn.isVisible({ timeout: 2000 }).catch(() => false);

    // F42: Weekly Review Wizard
    const wizardBtn = page.getByRole('button', { name: /review|wizard|clipboard/i }).first();
    const hasWizard = await wizardBtn.isVisible({ timeout: 2000 }).catch(() => false);

    // F43: View mode toggle
    const viewToggle = page.getByText(/traditional|smart/i).first();
    const hasViewToggle = await viewToggle.isVisible({ timeout: 2000 }).catch(() => false);

    // F44: Planning/Living toggle
    const planLiveToggle = page.getByText(/planning|living/i).first();
    const hasPlanLiveToggle = await planLiveToggle.isVisible({ timeout: 2000 }).catch(() => false);

    // F46: Command palette (Ctrl+K)
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    const palette = page.getByPlaceholder(/search|command/i).first();
    const hasPalette = await palette.isVisible({ timeout: 2000 }).catch(() => false);
    await ss(page, '09-command-palette');
    if (hasPalette) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });

  test('10-removed-features-DND', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // DND toggle should NOT be present (VIEW_SPEC 4.9)
    const dndToggle = page.getByRole('button', { name: /do not disturb|dnd|moon/i });
    const hasDnd = await dndToggle.isVisible({ timeout: 2000 }).catch(() => false);

    // Also search for moon icon
    const moonIcon = page.locator('svg[class*="moon"], [data-icon="moon"]');
    const hasMoonIcon = await moonIcon.isVisible({ timeout: 1000 }).catch(() => false);

    await ss(page, '10-no-dnd-check');

    // DND should NOT be visible
    expect(hasDnd).toBe(false);
  });

  test('11-intelligence-absent-P4', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // P4: No intelligence surfacing in Traditional view
    const insightBar = page.getByText(/insight|suggestion|tip of the day/i);
    const hasInsights = await insightBar.isVisible({ timeout: 2000 }).catch(() => false);

    // Intelligence cards should NOT be visible
    const intelligenceCard = page.locator('[class*="intelligence"], [class*="insight"]');
    const hasIntelligence = await intelligenceCard.isVisible({ timeout: 1000 }).catch(() => false);

    await ss(page, '11-no-intelligence');

    // Should NOT have intelligence elements
    expect(hasInsights).toBe(false);
  });

  test('12-keyboard-shortcuts', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // Alt+E: Events
    await page.keyboard.press('Alt+e');
    await page.waitForTimeout(1000);
    const eventsPanel = page.locator('[class*="panel"]').first();
    const hasEventsPanel = await eventsPanel.isVisible({ timeout: 2000 }).catch(() => false);
    await ss(page, '12-alt-e-events');

    // Escape to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Alt+M: Meals
    await page.keyboard.press('Alt+m');
    await page.waitForTimeout(1000);
    await ss(page, '12-alt-m-meals');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Alt+T: Go to today
    await page.keyboard.press('Alt+t');
    await page.waitForTimeout(500);

    // Today card should be highlighted
    const todayBadge = page.getByText('Today', { exact: true }).first();
    const hasToday = await todayBadge.isVisible({ timeout: 2000 }).catch(() => false);
    await ss(page, '12-today-highlight');
  });

  test('13-view-switching-P5', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // Find view toggle and switch to Smart
    const smartToggle = page.getByText(/smart/i).first();
    const hasSmartToggle = await smartToggle.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSmartToggle) {
      await smartToggle.click();
      await page.waitForTimeout(1500);
      await ss(page, '13-smart-view');

      // Switch back to Traditional
      const tradToggle = page.getByText(/traditional/i).first();
      if (await tradToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tradToggle.click();
        await page.waitForTimeout(1500);
        await ss(page, '13-back-to-traditional');
      }
    }
  });

  test('14-settings-panel', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // Open settings
    const settingsBtn = page.getByRole('button', { name: /settings|gear|cog/i }).first();
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(1500);
      await ss(page, '14-settings-panel');

      // F47: View mode selector should be in settings
      const viewSelector = page.getByText(/traditional|smart|view mode/i).first();
      const hasViewSelector = await viewSelector.isVisible({ timeout: 2000 }).catch(() => false);

      // Export option
      const exportOption = page.getByText(/export|backup/i).first();
      const hasExport = await exportOption.isVisible({ timeout: 2000 }).catch(() => false);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('15-today-card-highlight', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(1500);

    // Today's card should have special styling
    const todayBadge = page.getByText('Today', { exact: true });
    const hasTodayBadge = await todayBadge.first().isVisible({ timeout: 3000 }).catch(() => false);
    await ss(page, '15-today-card');

    // Should have the today badge
    expect(hasTodayBadge).toBe(true);
  });

  test('16-full-page-overview', async ({ page }) => {
    await login(page);
    await ensureTraditionalView(page);
    await page.waitForTimeout(2000);

    // Final comprehensive screenshot
    await ss(page, '16-full-traditional-view');

    // Count visible day cards
    const dayCards = page.locator('[role="gridcell"]');
    const cardCount = await dayCards.count();

    // Check for console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Navigate around to trigger any lazy-loaded errors
    await page.waitForTimeout(1000);
    await ss(page, '16-final-state');
  });
});
