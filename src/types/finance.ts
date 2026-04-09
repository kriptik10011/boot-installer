/**
 * Financial Item Types (Bills, Income)
 */

export interface FinancialCategory {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export type FinancialItemType = 'bill' | 'income';

export interface FinancialItem {
  id: number;
  name: string;
  amount: number;
  due_date: string;
  type: FinancialItemType;
  category_id: number | null;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  recurrence_rule_id: number | null;
  created_at: string;
  updated_at: string;
  is_occurrence?: boolean;
  master_id?: number | null;
  occurrence_date?: string | null;
}

export interface FinancialItemCreate {
  name: string;
  amount: number;
  due_date: string;
  type: FinancialItemType;
  category_id?: number | null;
  notes?: string | null;
  recurrence_rule_id?: number | null;
}

export interface FinancialItemUpdate extends Partial<FinancialItemCreate> {
  is_paid?: boolean;
}
