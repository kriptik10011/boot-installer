/**
 * Financial hooks using TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financesApi } from '@/api/client';
import { recordAction } from '@/services/observation';
import { invalidateIntelligence } from '@/utils/invalidateIntelligence';
import { useBackendReady } from './useBackendReady';
import type { FinancialItem, FinancialItemCreate, FinancialItemUpdate } from '@/types';
import { getTodayLocal } from '@/utils/dateUtils';
import { financeV2Keys } from './useFinanceV2';

// Query keys for finances
export const financeKeys = {
  all: ['finances'] as const,
  lists: () => [...financeKeys.all, 'list'] as const,
  list: (type?: string, isPaid?: boolean, categoryId?: number) =>
    [...financeKeys.lists(), { type, isPaid, categoryId }] as const,
  overdue: () => [...financeKeys.all, 'overdue'] as const,
  upcoming: (days: number) => [...financeKeys.all, 'upcoming', days] as const,
  details: () => [...financeKeys.all, 'detail'] as const,
  detail: (id: number) => [...financeKeys.details(), id] as const,
};

/**
 * Hook to fetch financial items with optional filtering
 */
export function useFinancialItems(type?: string, isPaid?: boolean, categoryId?: number) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: financeKeys.list(type, isPaid, categoryId),
    queryFn: () => financesApi.list(type, isPaid, categoryId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch overdue items
 */
export function useOverdueItems() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: financeKeys.overdue(),
    queryFn: () => financesApi.getOverdue(),
    staleTime: 60 * 1000, // 1 minute (overdue is time-sensitive)
    enabled: backendReady,
  });
}

/**
 * Hook to fetch upcoming items within N days
 */
export function useUpcomingFinances(days: number = 30) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: financeKeys.upcoming(days),
    queryFn: () => financesApi.getUpcoming(days),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch a single financial item by ID
 */
export function useFinancialItem(id: number) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: financeKeys.detail(id),
    queryFn: () => financesApi.get(id),
    enabled: backendReady && id > 0,
  });
}

/**
 * Hook to create a new financial item
 */
export function useCreateFinancialItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: FinancialItemCreate) => financesApi.create(data),
    onSuccess: (createdItem, variables) => {
      // Record observation for intelligence layer
      recordAction('financial_created', 'financial', createdItem.id, {
        type: variables.type,
        amount: variables.amount,
        is_recurring: !!variables.recurrence_rule_id,
        has_category: !!variables.category_id,
      });

      // Invalidate all financial lists to refetch
      queryClient.invalidateQueries({ queryKey: financeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: financeKeys.overdue() });
      // New item may appear in upcoming view if due within 30 days
      queryClient.invalidateQueries({ queryKey: financeKeys.upcoming(30) });
      invalidateIntelligence(queryClient, 'finance');
    },
  });
}

/**
 * Hook to update an existing financial item
 */
export function useUpdateFinancialItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FinancialItemUpdate }) =>
      financesApi.update(id, data),
    onSuccess: (_, variables) => {
      // Record observation for intelligence layer
      const changedFields = Object.keys(variables.data).filter(
        (key) => variables.data[key as keyof FinancialItemUpdate] !== undefined
      );
      recordAction('financial_updated', 'financial', variables.id, {
        changed_fields: changedFields,
        due_date_changed: changedFields.includes('due_date'),
        amount_changed: changedFields.includes('amount'),
      });

      // Invalidate the specific item and all lists
      queryClient.invalidateQueries({ queryKey: financeKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: financeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: financeKeys.overdue() });
      // Due date or amount change may affect upcoming view
      queryClient.invalidateQueries({ queryKey: financeKeys.upcoming(30) });
      invalidateIntelligence(queryClient, 'finance');
    },
  });
}

/**
 * Hook to delete a financial item
 */
export function useDeleteFinancialItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => financesApi.delete(id),
    onSuccess: (_data, id) => {
      // Record observation for intelligence layer
      recordAction('financial_deleted', 'financial', id);

      // Invalidate all financial queries
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
      invalidateIntelligence(queryClient, 'finance');
    },
  });
}

/**
 * Hook to mark a financial item as paid
 */
export function useMarkPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => financesApi.markPaid(id),
    onSuccess: (paidItem, id) => {
      // Record observation for intelligence layer
      // This is critical for payment pattern learning
      const today = getTodayLocal();
      const dueDate = paidItem.due_date.split('T')[0];
      const daysDiff = Math.floor(
        (new Date(dueDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
      );

      recordAction('bill_paid', 'financial', id, {
        days_before_due: daysDiff,
        was_late: daysDiff < 0,
        amount: paidItem.amount,
        type: paidItem.type,
        day_of_week: new Date().getDay(),
      });

      // Invalidate the specific item and all lists
      queryClient.invalidateQueries({ queryKey: financeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: financeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: financeKeys.overdue() });
      // Paid item should be removed from upcoming view
      queryClient.invalidateQueries({ queryKey: financeKeys.upcoming(30) });
      // Mark-paid creates a Transaction row — refresh V2 transaction list + reports
      queryClient.invalidateQueries({ queryKey: financeV2Keys.transactions });
      queryClient.invalidateQueries({ queryKey: financeV2Keys.budget });
      queryClient.invalidateQueries({ queryKey: financeV2Keys.reports });
      invalidateIntelligence(queryClient, 'finance');
    },
  });
}
