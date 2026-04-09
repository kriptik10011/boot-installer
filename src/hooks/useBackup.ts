/**
 * Backup/Restore hooks using TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupApi, type RestoreResponse, type DeleteAllDataResponse } from '@/api/client';
import { useBackendReady } from './useBackendReady';

// Query keys for backup operations
export const backupKeys = {
  all: ['backup'] as const,
  info: () => [...backupKeys.all, 'info'] as const,
};

/**
 * Hook to fetch database info (size, last modified)
 */
export function useDatabaseInfo() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: backupKeys.info(),
    queryFn: () => backupApi.getInfo(),
    staleTime: 30 * 1000, // 30 seconds - info changes when data changes
    enabled: backendReady,
  });
}

/**
 * Hook to export/download the database backup
 */
export function useExportBackup() {
  return useMutation({
    mutationFn: async () => {
      const blob = await backupApi.export();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `weekly_review_backup_${timestamp}.db`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true };
    },
  });
}

/**
 * Hook to restore database from a backup file
 */
export function useRestoreBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<RestoreResponse> => {
      return backupApi.restore(file);
    },
    onSuccess: () => {
      // Invalidate ALL queries to force refetch with new data
      queryClient.invalidateQueries();
    },
  });
}

/**
 * Hook to delete all data from the database
 *
 * WARNING: This is a destructive operation that cannot be undone.
 *
 * Intelligence Integration:
 * - Tracks reset for "bankruptcy" pattern detection
 * - Switches to Cold Start mode after deletion
 */
export function useDeleteAllData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<DeleteAllDataResponse> => {
      return backupApi.deleteAllData();
    },
    onSuccess: () => {
      // Invalidate ALL queries to force refetch (now empty)
      queryClient.invalidateQueries();
    },
  });
}
