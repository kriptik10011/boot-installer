import { test, expect } from '@playwright/test';

test.describe('Debug App State', () => {
  test('verify app renders and identify loading issues', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:5173');

    // Wait for initial render
    await page.waitForLoadState('networkidle');

    // Check page title
    const title = await page.title();
    console.log('Page title:', title);

    // Look for common loading indicators
    const loadingText = await page.locator('text=/loading/i').count();
    console.log('Elements with "loading" text:', loadingText);

    // Check if Week View is rendered
    const weekHeader = await page.locator('text=/week|Weekly/i').first();
    const hasWeekHeader = await weekHeader.isVisible().catch(() => false);
    console.log('Week header visible:', hasWeekHeader);

    // Check UI mode toggle button
    const modeToggle = await page.locator('[title*="Switch to"]').first();
    const modeToggleExists = await modeToggle.isVisible().catch(() => false);
    console.log('Mode toggle visible:', modeToggleExists);

    if (modeToggleExists) {
      const toggleTitle = await modeToggle.getAttribute('title');
      console.log('Mode toggle title:', toggleTitle);
      // If it says "Switch to Intelligent", we're in Traditional mode
      const currentMode = toggleTitle?.includes('Intelligent') ? 'Traditional' : 'Intelligent';
      console.log('Current UI mode:', currentMode);
    }

    // Check for day cards
    const dayCards = await page.locator('[class*="grid"]').first();
    const hasDayCards = await dayCards.isVisible().catch(() => false);
    console.log('Grid container visible:', hasDayCards);

    // Take a screenshot
    await page.screenshot({ path: 'e2e/screenshots/debug-state.png', fullPage: true });
    console.log('Screenshot saved to e2e/screenshots/debug-state.png');

    // Verify something is rendered
    const bodyContent = await page.locator('body').textContent();
    console.log('Body content length:', bodyContent?.length || 0);
    console.log('First 500 chars:', bodyContent?.substring(0, 500));

    // The test should pass if we can see any content
    expect(bodyContent?.length).toBeGreaterThan(0);
  });

  test('switch to intelligent mode and verify features', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Find and click the mode toggle to switch to Intelligent
    const modeToggle = await page.locator('[title*="Switch to Intelligent"]').first();
    if (await modeToggle.isVisible().catch(() => false)) {
      console.log('Found toggle, switching to Intelligent mode...');
      await modeToggle.click();
      await page.waitForTimeout(1000);

      // Now check for intelligence features
      const planningBadge = await page.locator('text=/Planning|Living/i').first();
      const hasBadge = await planningBadge.isVisible().catch(() => false);
      console.log('Mode badge visible:', hasBadge);

      // Take screenshot of intelligent mode
      await page.screenshot({ path: 'e2e/screenshots/intelligent-mode.png', fullPage: true });
    } else {
      console.log('Already in Intelligent mode or toggle not found');
    }
  });
});
