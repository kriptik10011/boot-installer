/**
 * Regression check for 5 previously fixed dashboard bugs.
 * Run with: node e2e/verify-bugs.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(__dirname, 'artifacts');
const BASE_URL = 'http://localhost:5173';
const STORE_KEY = 'weekly-review-settings';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Pre-set Zustand persisted store so we skip:
 *  - "Choose Your Default View" dialog (hasChosenDefaultView: true)
 *  - Onboarding wizard (hasCompletedFirstRun: true)
 *  - Default to week view (activeView: 'week') so Finance button is in WeekHeader
 *  - Finance view mode defaults to 'radial' (ComprehensiveDashboard) — keep that
 */
async function seedStore(page) {
  const key = STORE_KEY;
  await page.evaluate((k) => {
    const existing = JSON.parse(localStorage.getItem(k) || '{}');
    const merged = {
      ...existing,
      state: {
        ...(existing.state || {}),
        hasChosenDefaultView: true,
        hasCompletedFirstRun: true,
        hasSeenSettingsTooltip: true,
        activeView: 'week',
        defaultView: 'week',
        // Keep financeViewMode as 'radial' (ComprehensiveDashboard) — this is the default
        financeViewMode: (existing.state?.financeViewMode) ?? 'radial',
      },
      version: existing.version ?? 60,
    };
    localStorage.setItem(k, JSON.stringify(merged));
  }, key);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.error('[browser error]', msg.text());
  });

  try {
    // ── Step 1: Navigate to app to establish origin for localStorage ──────────
    console.log('[1] Navigating to app...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${ARTIFACTS}/01-home.png` });

    // ── Step 2: Seed localStorage to skip first-run dialogs ───────────────────
    console.log('[2] Seeding localStorage to skip dialogs...');
    await seedStore(page);

    // ── Step 3: Click the admin user tile ─────────────────────────────────────
    console.log('[3] Clicking admin user tile...');
    const adminTile = page.locator('text=admin').first();
    if (await adminTile.isVisible({ timeout: 5000 }).catch(() => false)) {
      await adminTile.click();
      await sleep(800);
      await page.screenshot({ path: `${ARTIFACTS}/02-pin-screen.png` });
      console.log('    Clicked admin. Screenshot: 02-pin-screen.png');
    } else {
      console.log('    WARNING: admin tile not found. Page text:', await page.evaluate(() => document.body.innerText).catch(() => '?'));
    }

    // ── Step 4: Enter PIN via keyboard ────────────────────────────────────────
    console.log('[4] Entering PIN via keyboard (1234)...');
    // PIN component listens to window keydown — type digits one by one
    for (const digit of ['1', '2', '3', '4']) {
      await page.keyboard.press(digit);
      await sleep(150);
    }

    // Wait for auth response and navigation
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(2500);
    await page.screenshot({ path: `${ARTIFACTS}/03-after-pin.png` });
    console.log('    Screenshot: 03-after-pin.png');

    // ── Step 5: Handle "Choose Your Default View" if it appears ──────────────
    const defaultViewTitle = page.locator('text=Choose Your Default View');
    if (await defaultViewTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[5] Default view dialog appeared — clicking Weekly Grid...');
      const weeklyGridBtn = page.locator('button:has-text("Weekly Grid")').first();
      await weeklyGridBtn.click();
      await sleep(1000);
    } else {
      console.log('[5] No default view dialog (seeded localStorage worked)');
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await sleep(2000);
    await page.screenshot({ path: `${ARTIFACTS}/04-main-app.png` });
    console.log('    Screenshot: 04-main-app.png');

    // ── Step 6: Dismiss onboarding wizard ─────────────────────────────────────
    // Re-seed the store now that we're logged in (Zustand rehydrates post-login)
    console.log('[6] Re-seeding localStorage after login...');
    await seedStore(page);

    // Step through or dismiss wizard
    let wizardRound = 0;
    while (wizardRound < 15) {
      wizardRound++;
      // Look for Next button
      const nextBtn = page.locator('button:has-text("Next")').first();
      if (await nextBtn.isVisible({ timeout: 800 }).catch(() => false)) {
        console.log(`    Wizard: clicking Next (round ${wizardRound})`);
        await nextBtn.click();
        await sleep(400);
        continue;
      }
      // Look for "Start Fresh" button (final wizard step)
      const startFreshBtn = page.locator('button:has-text("Start Fresh")').first();
      if (await startFreshBtn.isVisible({ timeout: 800 }).catch(() => false)) {
        console.log('    Wizard: clicking Start Fresh');
        await startFreshBtn.click();
        await sleep(800);
        continue;
      }
      // Look for other completion buttons
      const doneBtn = page.locator('button:has-text("Get Started"), button:has-text("Done"), button:has-text("Finish"), button:has-text("Explore with sample data")').first();
      if (await doneBtn.isVisible({ timeout: 800 }).catch(() => false)) {
        console.log('    Wizard: clicking completion button');
        await doneBtn.click();
        await sleep(800);
        continue;
      }
      // No wizard buttons found — wizard dismissed
      console.log('    Wizard dismissed (no more buttons found)');
      break;
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await sleep(1500);
    await page.screenshot({ path: `${ARTIFACTS}/05-after-wizard.png` });
    console.log('    Screenshot: 05-after-wizard.png');

    // ── Step 7: Click the Finance button ─────────────────────────────────────
    console.log('[7] Looking for Finance button...');
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('    Current page text (first 300):', pageText.slice(0, 300).replace(/\n/g, ' | '));

    const financeBtn = page.locator('[aria-label="Finance"]').first();
    const financeBtnVisible = await financeBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (financeBtnVisible) {
      console.log('    Found Finance button via aria-label="Finance"');
      await financeBtn.click({ timeout: 10000 });
    } else {
      // Try text-based selectors as fallback
      console.log('    aria-label not found, trying text-based selectors...');
      const allButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .map(b => ({ text: b.textContent?.trim(), label: b.getAttribute('aria-label'), title: b.getAttribute('title') }))
          .filter(b => b.text || b.label || b.title)
          .slice(0, 40)
      );
      console.log('    All buttons:', JSON.stringify(allButtons, null, 2));

      const altFinance = page.locator('button[title="Finance"], button:has-text("Finance")').first();
      if (await altFinance.isVisible({ timeout: 2000 }).catch(() => false)) {
        await altFinance.click();
      } else {
        console.log('    WARNING: Finance button not found');
      }
    }

    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(4000); // Give time for ComprehensiveDashboard to load and API calls to finish

    await page.screenshot({ path: `${ARTIFACTS}/06-finance-panel.png`, fullPage: true });
    console.log('    Screenshot: 06-finance-panel.png');

    // ── Step 8: Ensure we're in Dashboard (radial) view mode ─────────────────
    // Check if "Dashboard" button is visible (it's the cycle button in FinancePanel)
    const dashboardCycleBtn = page.locator('button:has-text("Dashboard")').first();
    if (await dashboardCycleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[8] Finance panel is in Dashboard (radial) mode - ComprehensiveDashboard is showing');
    } else {
      // We might be in classic or living mode — cycle to dashboard
      console.log('[8] Checking finance view mode...');
      const classicBtn = page.locator('button:has-text("Classic"), button:has-text("Living")').first();
      if (await classicBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('    Not in dashboard mode — cycling to find dashboard...');
        // Click up to 3 times to cycle back to 'radial' mode
        for (let i = 0; i < 3; i++) {
          const cycleBtn = page.locator('button:has-text("Classic"), button:has-text("Living"), [aria-label="Switch finance view"]').first();
          if (await cycleBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await cycleBtn.click();
            await sleep(500);
            const isDash = await page.locator('button:has-text("Dashboard")').isVisible({ timeout: 1000 }).catch(() => false);
            if (isDash) {
              console.log('    Now in Dashboard mode');
              break;
            }
          }
        }
      }
    }

    await sleep(5000); // Let all API data load
    await page.screenshot({ path: `${ARTIFACTS}/07-dashboard-loaded.png`, fullPage: true });
    console.log('    Screenshot: 07-dashboard-loaded.png');

    // ── Step 9: Extract rendered text ─────────────────────────────────────────
    console.log('[9] Extracting full rendered text...');
    let allText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== FULL PAGE TEXT ===');
    console.log(allText);
    console.log('=== END PAGE TEXT ===\n');

    // Scroll to capture everything
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(1000);
    await page.screenshot({ path: `${ARTIFACTS}/08-scrolled.png` });

    await page.evaluate(() => window.scrollTo(0, 1200));
    await sleep(1000);
    await page.screenshot({ path: `${ARTIFACTS}/09-scrolled2.png` });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1000);
    await page.screenshot({ path: `${ARTIFACTS}/10-bottom.png` });

    // Re-capture full text after scroll (all lazy-rendered content should be visible)
    allText = await page.evaluate(() => document.body.innerText);

    // ── Step 10: Bug checks ───────────────────────────────────────────────────
    console.log('[10] Checking bugs...\n');

    // BUG 1 — Portfolio KPI: should show $38,800
    const portfolioMatch = allText.match(/\$?38[,.]?800/);
    const bug1Pass = !!portfolioMatch;
    const bug1Value = portfolioMatch ? portfolioMatch[0] : 'not found';
    console.log(`BUG 1 (Portfolio KPI): ${bug1Pass ? 'PASS' : 'FAIL'} — saw "${bug1Value}"`);

    // BUG 2 — Budget Status: $383.19 / $3,300
    const spentMatch = allText.match(/\$?383\.?\d*/);
    const totalBudgetMatch = allText.match(/\$?3[,.]?300/);
    const bug2Pass = !!spentMatch && !!totalBudgetMatch;
    const bug2Value = bug2Pass
      ? `${spentMatch[0]} / ${totalBudgetMatch[0]}`
      : `${spentMatch?.[0] ?? 'no spent'} / ${totalBudgetMatch?.[0] ?? 'no budget'}`;
    console.log(`BUG 2 (Budget Status): ${bug2Pass ? 'PASS' : 'FAIL'} — saw "${bug2Value}"`);

    // BUG 3 — Investments: +16.5%
    const investMatch = allText.match(/[+\-]?16\.5\s*%?/);
    const noDataYet = allText.includes('No data yet');
    const bug3Pass = !!investMatch;
    const bug3Value = investMatch ? investMatch[0] : (noDataYet ? 'No data yet' : 'not found');
    console.log(`BUG 3 (Investments): ${bug3Pass ? 'PASS' : 'FAIL'} — saw "${bug3Value}"`);

    // BUG 4 — Subscriptions: 2 active, $145/month
    const sub2Match = allText.match(/2\s*active/i);
    const sub145Match = allText.match(/\$145|\b145\b/);
    const bug4Pass = !!sub2Match && !!sub145Match;
    let bug4Value;
    if (bug4Pass) {
      bug4Value = `${sub2Match[0]}, $${sub145Match[0].replace('$', '')}/month`;
    } else {
      const anyCountMatch = allText.match(/(\d+)\s*active/i);
      const anyAmtMatch = allText.match(/\$(\d{2,4}(?:\.\d+)?)\s*\/\s*mo/i) || allText.match(/\$(\d{2,4})/);
      bug4Value = `${anyCountMatch ? anyCountMatch[0] : 'N/A'} active, $${anyAmtMatch ? anyAmtMatch[1] : '?'}/month`;
    }
    console.log(`BUG 4 (Subscriptions): ${bug4Pass ? 'PASS' : 'FAIL'} — saw "${bug4Value}"`);

    // BUG 5 — Net Worth sign: -$33,700
    const negNWMatch = allText.match(/-\$?\s*33[,.]?700/);
    const posNWMatch = allText.match(/(?<![0-9\-])\$?33[,.]?700/);
    const bug5Pass = !!negNWMatch;
    const bug5Value = negNWMatch
      ? negNWMatch[0]
      : (posNWMatch ? `${posNWMatch[0]} (positive — missing negative sign)` : 'not found');
    console.log(`BUG 5 (Net Worth sign): ${bug5Pass ? 'PASS' : 'FAIL'} — saw "${bug5Value}"`);

    const allPass = bug1Pass && bug2Pass && bug3Pass && bug4Pass && bug5Pass;
    const failing = [
      !bug1Pass && 'BUG 1 (Portfolio KPI)',
      !bug2Pass && 'BUG 2 (Budget Status)',
      !bug3Pass && 'BUG 3 (Investments)',
      !bug4Pass && 'BUG 4 (Subscriptions)',
      !bug5Pass && 'BUG 5 (Net Worth sign)',
    ].filter(Boolean);

    console.log(`\nOverall: ${allPass ? 'PASS (all 5 pass)' : `FAIL — failing: ${failing.join(', ')}`}`);

  } catch (err) {
    console.error('Script error:', err);
    await page.screenshot({ path: `${ARTIFACTS}/error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
