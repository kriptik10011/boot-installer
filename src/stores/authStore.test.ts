/**
 * authStore.test.ts — Verify auth API endpoint paths produce correct final URLs.
 *
 * config.api.baseUrl = "http://host:port/api" (already includes /api prefix).
 * Backend routes: prefix="/api/auth" in main.py.
 * So authStore endpoints should be "/auth/..." which combines to "/api/auth/...".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally before importing the module
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock config with /api in baseUrl — matches production config.ts
vi.mock('@/config', () => ({
  config: { api: { baseUrl: 'http://localhost:8000/api' } },
}));

// Mock initAuthToken to prevent side effects
vi.mock('@/api/core', async () => {
  const actual = await vi.importActual('@/api/core');
  return {
    ...actual,
    initAuthToken: vi.fn(),
  };
});

describe('authStore API endpoint paths', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ([]),
      status: 200,
      statusText: 'OK',
    });
  });

  it('fetchUsers calls /api/auth/users', async () => {
    const { fetchUsers } = await import('./authStore');
    await fetchUsers();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('http://localhost:8000/api/auth/users');
  });

  it('attemptLogin calls /api/auth/login', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-token', user_id: '123', username: 'test' }),
      status: 200,
      statusText: 'OK',
    });

    const { attemptLogin } = await import('./authStore');
    await attemptLogin('user-123', '123456');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('http://localhost:8000/api/auth/login');
  });

  it('createUser calls /api/auth/users with POST', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-123', username: 'newuser' }),
      status: 200,
      statusText: 'OK',
    });

    const { createUser } = await import('./authStore');
    await createUser('newuser', '12345678');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('http://localhost:8000/api/auth/users');
    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    expect(opts.method).toBe('POST');
  });

  it('logoutApi calls /api/auth/logout', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
      status: 200,
      statusText: 'OK',
    });

    const { logoutApi } = await import('./authStore');
    await logoutApi('test-token');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('http://localhost:8000/api/auth/logout');
  });

  it('endpoints do NOT double the /api prefix', async () => {
    const { fetchUsers } = await import('./authStore');
    await fetchUsers();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain('/api/api/');
  });
});
