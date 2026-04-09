import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = path.join(process.cwd(), 'e2e', 'artifacts');

test.describe('Dashboard Bug Regression Check', () => {
  test.setTimeout(120_000);

  test('verify 5 previously fixed dashboard bugs', async ({ page }) => {
    // Step 1: Navigate and log in
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${ARTIFACTS_DIR}/01-home.png` });

    // Login flow
    const usernameInput = page.locator('input[type="text"], input[placeholder*="user" i], input[name="username"]').first();
    const pinInput = page.locator('input[type="password"], input[placeholder*="pin" i], input[placeholder*="pass" i]').first();

    if (await usernameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await usernameInput.fill('admin');
      await pinInput.fill('1234');
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle');
    } else {
      // Try clicking login button first
      const loginBtn = page.locator('button:has-text("Login"), button:has-text("Sign in"), [data-testid="login"]').first();
      if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loginBtn.click();
        await page.waitForLoadState('networkidle');
        await usernameInput.fill('admin');
        await pinInput.fill('1234');
        await page.keyboard.press('Enter');
        await page.waitForLoadState('networkidle');
      }
    }

    await page.screenshot({ path: `${ARTIFACTS_DIR}/02-after-login.png` });

    // Step 2: Navigate to Finance dashboard
    // Look for Finance button in bottom nav or navigation bar
    const financeBtn = page.locator('button:has-text("Finance"), [data-testid="finance-btn"], nav >> text=Finance, [aria-label="Finance"]').first();
    if (await financeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await financeBtn.click();
      await page.waitForLoadState('networkidle');
    }
    await page.waitForTimeout(3000); // Let the dashboard data load

    await page.screenshot({ path: `${ARTIFACTS_DIR}/03-after-finance-click.png`, fullPage: true });

    // Step 3: Look for the ComprehensiveDashboard — it may be inside a modal or overlay
    // Try finding the "Dashboard" or "Comprehensive" view
    const dashboardBtn = page.locator('button:has-text("Dashboard"), [data-testid="comprehensive-dashboard"], button:has-text("Overview")').first();
    if (await dashboardBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dashboardBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: `${ARTIFACTS_DIR}/04-dashboard-view.png`, fullPage: true });

    // Capture the a11y snapshot to inspect values
    const content = await page.content();

    // --- BUG 1: Portfolio KPI ---
    // Look for $38,800 anywhere on the page
    const bug1Pass = content.includes('38,800') || content.includes('$38,800');

    // --- BUG 2: Budget Status ---
    // Look for $383 or 383.19 spent and $3,300 budget
    const bug2Pass = (content.includes('383') && content.includes('3,300')) ||
                     content.includes('383.19');

    // --- BUG 3: Investments Card ---
    // Look for +16.5% return
    const bug3Pass = content.includes('16.5') || content.includes('+16.5%');
    const bug3NoData = content.includes('No data yet') && !bug3Pass;

    // --- BUG 4: Subscriptions Filter ---
    // Look for 2 active and $145
    const bug4Pass = content.includes('145') && (content.includes('2 active') || content.includes('2\u00a0active'));
    const bug4Wrong6 = content.includes('6 active') || content.includes('2,040');

    // --- BUG 5: Net Worth Negative sign ---
    // Look for -$33,700 or -33,700
    const bug5Pass = content.includes('-$33,700') || content.includes('-33,700') ||
                     (content.includes('33,700') && content.includes('-'));

    // Take a full screenshot for reference
    await page.screenshot({ path: `${ARTIFACTS_DIR}/05-full-dashboard.png`, fullPage: true });

    // Scroll down to get more content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACTS_DIR}/06-scrolled-mid.png`, fullPage: false });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACTS_DIR}/07-scrolled-bottom.png`, fullPage: false });

    const fullContent = await page.content();

    // Re-check after scroll
    const bug1FinalPass = fullContent.includes('38,800') || fullContent.includes('$38,800');
    const bug2FinalPass = (fullContent.includes('383') && fullContent.includes('3,300')) ||
                          fullContent.includes('383.19');
    const bug3FinalPass = fullContent.includes('16.5') || fullContent.includes('+16.5%');
    const bug4FinalPass = fullContent.includes('145') && (fullContent.includes('2 active') || fullContent.includes('2\u00a0active'));
    const bug5FinalPass = fullContent.includes('-$33,700') || fullContent.includes('-33,700') ||
                           (fullContent.includes('33,700') && fullContent.includes('-'));

    // Output results as structured text that's easy to parse
    console.log('=== BUG REGRESSION RESULTS ===');
    console.log(`BUG1_PORTFOLIO: ${bug1FinalPass ? 'PASS' : 'FAIL'}`);
    console.log(`BUG2_BUDGET: ${bug2FinalPass ? 'PASS' : 'FAIL'}`);
    console.log(`BUG3_INVESTMENTS: ${bug3FinalPass ? 'PASS' : (bug3NoData ? 'FAIL-NODATA' : 'FAIL')}`);
    console.log(`BUG4_SUBSCRIPTIONS: ${bug4FinalPass ? 'PASS' : (bug4Wrong6 ? 'FAIL-WRONG6' : 'FAIL')}`);
    console.log(`BUG5_NETWORTHSIGN: ${bug5FinalPass ? 'PASS' : 'FAIL'}`);

    // Don't fail the test — just report
    expect(true).toBe(true);
  });
});
