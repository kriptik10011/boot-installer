import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDatabaseInfo, useExportBackup, useRestoreBackup } from '../hooks/useBackup';
import type { ReactNode } from 'react';

// Mock the API client
vi.mock('../api/client', () => ({
  backupApi: {
    getInfo: vi.fn(),
    export: vi.fn(),
    restore: vi.fn(),
  },
}));

import { backupApi } from '../api/client';

// Wrapper component for testing hooks
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('Backup Hooks', () => {
  // Store original DOM methods
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL methods
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    // Restore original methods
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  describe('useDatabaseInfo', () => {
    it('fetches and returns database info', async () => {
      const mockInfo = {
        path: '/path/to/weekly_review.db',
        size_bytes: 2457600,
        modified_at: '2026-01-23T10:30:00',
      };

      vi.mocked(backupApi.getInfo).mockResolvedValue(mockInfo);

      const { result } = renderHook(() => useDatabaseInfo(), {
        wrapper: createWrapper(),
      });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for data
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockInfo);
      expect(backupApi.getInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('useExportBackup', () => {
    it('calls export API when mutate is triggered', async () => {
      // Mock blob response
      const mockBlob = new Blob(['SQLite format 3'], { type: 'application/octet-stream' });
      vi.mocked(backupApi.export).mockResolvedValue(mockBlob);

      const { result } = renderHook(() => useExportBackup(), {
        wrapper: createWrapper(),
      });

      // Trigger export
      result.current.mutate();

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify API was called
      expect(backupApi.export).toHaveBeenCalledTimes(1);
      // Verify blob URL was created for download
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    });
  });

  describe('useRestoreBackup', () => {
    it('uploads file and calls restore API', async () => {
      const mockResponse = {
        status: 'success',
        message: 'Database restored successfully',
        restored_from: '/tmp/backup.db',
      };

      vi.mocked(backupApi.restore).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useRestoreBackup(), {
        wrapper: createWrapper(),
      });

      // Create mock file
      const mockFile = new File(['SQLite format 3'], 'backup.db', {
        type: 'application/octet-stream',
      });

      // Trigger restore
      result.current.mutate(mockFile);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(backupApi.restore).toHaveBeenCalledWith(mockFile);
      expect(result.current.data).toEqual(mockResponse);
    });
  });
});
