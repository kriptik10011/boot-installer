import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri bindings globally — these pull in native Node bindings
// that eat memory and fail outside the Tauri runtime
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: { sidecar: vi.fn() },
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(false),
  requestPermission: vi.fn().mockResolvedValue('denied'),
  sendNotification: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}));

// Mock backend readiness — always "connected" in tests so queries execute
vi.mock('@/hooks/useBackendReady', () => ({
  useBackendReady: vi.fn(() => true),
  useHasEverConnected: vi.fn(() => true),
  setBackendReady: vi.fn(),
  setBackendDisconnected: vi.fn(),
  getBackendReady: vi.fn(() => true),
  getHasEverConnected: vi.fn(() => true),
}));

// Mock observation service — prevents side-effect API calls during tests
vi.mock('@/services/observation', () => ({
  recordAction: vi.fn(),
  recordView: vi.fn(),
}));
