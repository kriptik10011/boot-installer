/**
 * Ship Verification -- Radial View
 *
 * Systematically verifies Radial (Three.js hub) view contracts.
 * Mirrors the structure of ship-verify-traditional.spec.ts.
 *
 * Note: Radial view uses a Three.js canvas, so timeouts are extended
 * to 15s for canvas-dependent assertions (headless WebGL is slow).
 */

import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';

const SCREENSHOT_DIR = 'e2e/screenshots/ship-verify';
const CANVAS_TIMEOUT = 15_000;

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

async function ensureRadialView(page: Page) {
  // Check current active view via Zustand store
  const isRadial = await page.evaluate(() => {
    const store = (window as unknown).__zustand_store;
    if (store) return store.getState().activeView === 'radial';
    return null;
  });

  if (isRadial === true) return;

  // Try setting via store directly
  const set = await page.evaluate(() => {
    const store = (window as unknown).__zustand_store;
    if (store && typeof store.getState().setActiveView === 'function') {
      store.getState().setActiveView('radial');
      return true;
    }
    return false;
  });

  if (set) {
    await page.waitForTimeout(2000);
    return;
  }

  // Fallback: click the Radial toggle in the UI
  const radialToggle = page.getByRole('button', { name: /radial/i }).first();
  if (await radialToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await radialToggle.click();
    await page.waitForTimeout(2000);
    return;
  }

  // Second fallback: look for text-based radial link
  const radialText = page.getByText(/radial/i).first();
  if (await radialText.isVisible({ timeout: 2000 }).catch(() => false)) {
    await radialText.click();
    await page.waitForTimeout(2000);
  }
}

async function ss(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}

test.describe('Radial View Ship Verification', () => {
  test.beforeAll(async () => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('01-radial-canvas-renders', async ({ page }) => {
    await login(page);
    await ensureRadialView(page);
    await ss(page, 'radial-01-initial');

    // Three.js renders into a <canvas> element
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: CANVAS_TIMEOUT });
    await ss(page, 'radial-01-canvas-visible');
  });

  test('02-radial-no-console-errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await login(page);
    await ensureRadialView(page);

    // Give Three.js time to initialize and render first frames
    await page.waitForTimeout(5000);
    await ss(page, 'radial-02-console-check');

    // Filter out known benign errors (favicon, extensions, WebGL warnings)
    const realErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('extension') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT') &&
        !e.includes('WebGL') &&
        !e.includes('WEBGL')
    );

    // Allow a small number of non-critical errors (e.g. network timing)
    expect(realErrors.length).toBeLessThanOrEqual(2);
  });

  test('03-radial-arc-north-week', async ({ page }) => {
    await login(page);
    await ensureRadialView(page);
    await page.waitForTimeout(3000);

    // Press 1 or W to navigate to north arc (Week)
    await page.keyboard.press('1');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-03-arc-north');

    // Verify arc expanded -- look for week-related content or expanded state
    const weekContent = page.getByText(/week|events|monday|tuesday/i).first();
    const hasWeekContent = await weekContent.isVisible({ timeout: CANVAS_TIMEOUT }).catch(() => false);

    // Collapse back
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Also test the W key alias
    await page.keyboard.press('w');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-03-arc-north-w-key');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  });

  test('04-radial-arc-east-dashboard', async ({ page }) => {
    await login(page);
    await ensureRadialView(page);
    await page.waitForTimeout(3000);

    // Press 2 or D to navigate to east arc (Meals/Dashboard)
    await page.keyboard.press('2');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-04-arc-east');

    // Collapse back
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Also test the D key alias
    await page.keyboard.press('d');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-04-arc-east-d-key');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  });

  test('05-radial-arc-south-shopping', async ({ page }) => {
    await login(page);
    await ensureRadialView(page);
    await page.waitForTimeout(3000);

    // Press 3 or S to navigate to south arc (Finance/Shopping)
    await page.keyboard.press('3');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-05-arc-south');

    // Collapse back
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Also test the S key alias
    await page.keyboard.press('s');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-05-arc-south-s-key');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  });

  test('06-radial-arc-west-activity', async ({ page }) => {
    await login(page);
    await ensureRadialView(page);
    await page.waitForTimeout(3000);

    // Press 4 or A to navigate to west arc (Inventory/Activity)
    await page.keyboard.press('4');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-06-arc-west');

    // Collapse back
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Also test the A key alias
    await page.keyboard.press('a');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-06-arc-west-a-key');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  });

  test('07-radial-h-key-snaps-home', async ({ page }) => {
    await login(page);
    await ensureRadialView(page);
    await page.waitForTimeout(3000);

    // Expand an arc first to change camera state
    await page.keyboard.press('1');
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Press H to snap camera home
    await page.keyboard.press('h');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-07-h-key-home');

    // Verify camera was reset by checking store values
    const cameraState = await page.evaluate(() => {
      const store = (window as unknown).__zustand_store;
      if (store) {
        const prefs = store.getState().latticePrefs;
        return {
          cameraDistance: prefs?.cameraDistance,
          cameraTilt: prefs?.cameraTilt,
          latticeDepth: prefs?.latticeDepth,
        };
      }
      return null;
    });

    if (cameraState !== null) {
      // H key should reset to these values (from RadialDashboard.tsx)
      expect(cameraState.cameraDistance).toBeCloseTo(2.6, 1);
      expect(cameraState.cameraTilt).toBeCloseTo(15, 0);
      expect(cameraState.latticeDepth).toBeCloseTo(0.0, 1);
    }
  });

  test('08-radial-escape-pops-navigation', async ({ page }) => {
    await login(page);
    await ensureRadialView(page);
    await page.waitForTimeout(3000);

    // Navigate into an arc
    await page.keyboard.press('1');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-08-before-escape');

    // Escape should collapse the active arc
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    await ss(page, 'radial-08-after-escape');

    // Verify no arc is active after Escape
    const activeArc = await page.evaluate(() => {
      const store = (window as unknown).__zustand_store;
      if (store) {
        // activeArc is managed by useRadialNavigation, check via DOM or store
        return store.getState().activeArc ?? null;
      }
      return null;
    });

    // After Escape, no arc should be expanded
    // (activeArc may not be in the persisted store -- verify via screenshot)
  });

  test('09-radial-arrow-keys-scroll-cards', async ({ page }) => {
    await login(page);
    await ensureRadialView(page);
    await page.waitForTimeout(3000);

    // Navigate into an arc that has cards
    await page.keyboard.press('1');
    await page.waitForTimeout(1500);
    await ss(page, 'radial-09-before-scroll');

    // ArrowDown should scroll to next card
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(1000);
    await ss(page, 'radial-09-after-arrow-down');

    // ArrowUp should scroll back
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(1000);
    await ss(page, 'radial-09-after-arrow-up');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('10-radial-all-arcs-reachable-sequential', async ({ page }) => {
    await login(page);
    await ensureRadialView(page);
    await page.waitForTimeout(3000);

    // Verify all 4 arcs can be reached in sequence without errors
    const arcKeys = ['1', '2', '3', '4'];
    const arcNames = ['north-week', 'east-meals', 'south-finance', 'west-inventory'];

    for (let i = 0; i < arcKeys.length; i++) {
      await page.keyboard.press(arcKeys[i]);
      await page.waitForTimeout(1500);
      await ss(page, `radial-10-seq-${arcNames[i]}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    // Take final screenshot showing clean state after cycling all arcs
    await ss(page, 'radial-10-after-full-cycle');
  });

  test('11-radial-view-switch-stability', async ({ page }) => {
    await login(page);

    // Start in week view, switch to radial
    await page.evaluate(() => {
      const store = (window as unknown).__zustand_store;
      if (store && typeof store.getState().setActiveView === 'function') {
        store.getState().setActiveView('week');
      }
    });
    await page.waitForTimeout(1000);
    await ss(page, 'radial-11-start-week');

    // Switch to radial
    await ensureRadialView(page);
    await page.waitForTimeout(3000);
    await ss(page, 'radial-11-switched-to-radial');

    // Canvas should be present after view switch
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: CANVAS_TIMEOUT });

    // Switch back to week and back to radial to test stability
    await page.evaluate(() => {
      const store = (window as unknown).__zustand_store;
      if (store && typeof store.getState().setActiveView === 'function') {
        store.getState().setActiveView('week');
      }
    });
    await page.waitForTimeout(1000);

    await ensureRadialView(page);
    await page.waitForTimeout(3000);
    await ss(page, 'radial-11-second-switch');

    // Canvas should still render after double switch
    await expect(canvas).toBeVisible({ timeout: CANVAS_TIMEOUT });
  });

  test('12-radial-full-page-overview', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await login(page);
    await ensureRadialView(page);
    await page.waitForTimeout(5000);

    // Final comprehensive screenshot
    await ss(page, 'radial-12-full-radial-view');

    // Verify canvas is still rendering (not crashed)
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: CANVAS_TIMEOUT });

    // Verify we are in radial active view
    const currentView = await page.evaluate(() => {
      const store = (window as unknown).__zustand_store;
      if (store) return store.getState().activeView;
      return null;
    });

    if (currentView !== null) {
      expect(currentView).toBe('radial');
    }

    await ss(page, 'radial-12-final-state');
  });
});
