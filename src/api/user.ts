/**
 * User API — backup/restore, day notes, weekly review, visualization.
 */

import { request, getAuthHeaders, API_BASE_URL, ApiError } from './core';
import type { WeekReviewSummary } from '@/types/user';

// =============================================================================
// BACKUP TYPES
// =============================================================================

export interface DatabaseInfo {
  path: string;
  size_bytes: number;
  modified_at: string;
}

export interface RestoreResponse {
  status: string;
  message: string;
  restored_from: string;
}

export interface DeleteAllDataResponse {
  status: string;
  message: string;
  tables_cleared: number;
}

// =============================================================================
// BACKUP API
// =============================================================================

export const backupApi = {
  getInfo: () => request<DatabaseInfo>('/backup/info'),

  export: async (): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}/backup/export`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new ApiError('Failed to export backup', response.status);
    }
    return response.blob();
  },

  restore: async (file: File): Promise<RestoreResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const uploadResponse = await fetch(`${API_BASE_URL}/backup/upload`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => {
        return {};
      });
      throw new ApiError('Failed to upload backup file', uploadResponse.status, errorData.detail);
    }

    const { path } = await uploadResponse.json();

    return request<RestoreResponse>('/backup/restore', {
      method: 'POST',
      body: { backup_path: path },
    });
  },

  deleteAllData: () =>
    request<DeleteAllDataResponse>('/backup/database', {
      method: 'DELETE',
    }),
};

// =============================================================================
// WEEKLY REVIEW API
// =============================================================================

export const weeklyReviewApi = {
  getSummary: (weekStart: string) =>
    request<WeekReviewSummary>(`/summary/review/${weekStart}`),
};

