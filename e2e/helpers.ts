/**
 * E2E Test Helpers — Shared utilities for Playwright specs.
 */

import { type Page, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:8000';

/** Wait until backend /api/health returns 200. */
export async function waitForBackend(page: Page, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await page.request.get(`${BACKEND_URL}/api/health`);
      if (res.ok()) return;
    } catch {
      // backend not up yet
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Backend not ready after ${timeoutMs}ms`);
}

/** Seed minimal test data via backend API. */
export async function seedData(page: Page): Promise<void> {
  const res = await page.request.post(`${BACKEND_URL}/api/test/seed`);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Seed failed (${res.status()}): ${body}`);
  }
}

/** Clear test data via backend API. */
export async function clearData(page: Page): Promise<void> {
  const res = await page.request.post(`${BACKEND_URL}/api/test/clear`);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Clear failed (${res.status()}): ${body}`);
  }
}

/** Navigate to app root and wait for it to be ready. */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Wait for at least one visible heading or day name
  await expect(
    page.getByText(/mon|tue|wed|thu|fri|sat|sun|weekly/i).first()
  ).toBeVisible({ timeout: 10_000 });
}

/** Dismiss the onboarding wizard if it appears. */
export async function dismissOnboarding(page: Page): Promise<void> {
  // Check if onboarding wizard is visible
  const wizard = page.getByText('Welcome to Weekly Review');
  const isVisible = await wizard.isVisible().catch(() => false);
  if (isVisible) {
    // Click through all steps: Next -> Next -> Start Fresh
    const nextBtn = page.getByRole('button', { name: /next/i });
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }
    const startBtn = page.getByRole('button', { name: /start fresh/i });
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

/** Take a named screenshot for debugging. */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `e2e/screenshots/${name}.png`,
    fullPage: true,
  });
}

/** Navigate to app and ensure it's ready for interaction. */
export async function navigateToApp(page: Page): Promise<void> {
  await waitForBackend(page);
  await waitForAppReady(page);
  await dismissOnboarding(page);
}
