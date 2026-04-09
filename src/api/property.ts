/**
 * Property Management API — properties, units, tenants, leases,
 * rent payments, expenses, maintenance, deposits, mortgages, analytics.
 */

import { request } from './core';

// =============================================================================
// TYPES
// =============================================================================

export interface PropertyResponse {
  id: number;
  name: string;
  address: string | null;
  property_type: string;
  purchase_price: number | null;
  purchase_date: string | null;
  current_value: number | null;
  notes: string | null;
  is_active: boolean;
  total_monthly_rent: number;
  unit_count: number;
  occupied_unit_count: number;
  vacancy_rate: number;
  created_at: string;
  updated_at: string;
}

export interface PropertyCreate {
  name: string;
  address?: string;
  property_type?: string;
  purchase_price?: number;
  purchase_date?: string;
  current_value?: number;
  notes?: string;
}

export interface PropertyUpdate {
  name?: string;
  address?: string;
  property_type?: string;
  purchase_price?: number;
  purchase_date?: string;
  current_value?: number;
  notes?: string;
  is_active?: boolean;
}

export interface UnitResponse {
  id: number;
  property_id: number;
  unit_number: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  monthly_rent: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnitCreate {
  unit_number: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  monthly_rent?: number;
}

export interface UnitUpdate {
  unit_number?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  monthly_rent?: number;
  is_active?: boolean;
}

export interface TenantResponse {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  move_in_date: string | null;
  move_out_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantCreate {
  name: string;
  email?: string;
  phone?: string;
  move_in_date?: string;
  move_out_date?: string;
  notes?: string;
}

export interface TenantUpdate {
  name?: string;
  email?: string;
  phone?: string;
  move_in_date?: string;
  move_out_date?: string;
  notes?: string;
  is_active?: boolean;
}

export interface LeaseResponse {
  id: number;
  unit_id: number;
  tenant_id: number;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  terms_notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LeaseCreate {
  unit_id: number;
  tenant_id: number;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit?: number;
  terms_notes?: string;
  status?: string;
}

export interface LeaseUpdate {
  start_date?: string;
  end_date?: string;
  monthly_rent?: number;
  security_deposit?: number;
  terms_notes?: string;
  status?: string;
}

export interface RentPaymentResponse {
  id: number;
  lease_id: number;
  period_month: string;
  amount_due: number;
  amount_paid: number;
  paid_date: string | null;
  status: string;
  late_fee: number;
  notes: string | null;
  balance_due: number;
  created_at: string;
}

export interface RentPaymentCreate {
  lease_id: number;
  period_month: string;
  amount_due: number;
  amount_paid?: number;
  paid_date?: string;
  status?: string;
  late_fee?: number;
  notes?: string;
}

export interface RentPaymentUpdate {
  amount_paid?: number;
  paid_date?: string;
  status?: string;
  late_fee?: number;
  notes?: string;
}

export interface PropertyExpenseResponse {
  id: number;
  property_id: number;
  unit_id: number | null;
  category: string;
  amount: number;
  date: string;
  vendor: string | null;
  description: string | null;
  is_capex: boolean;
  created_at: string;
}

export interface PropertyExpenseCreate {
  property_id: number;
  unit_id?: number;
  category?: string;
  amount: number;
  date: string;
  vendor?: string;
  description?: string;
  is_capex?: boolean;
}

export interface PropertyExpenseUpdate {
  category?: string;
  amount?: number;
  date?: string;
  vendor?: string;
  description?: string;
  is_capex?: boolean;
}

export interface MaintenanceRequestResponse {
  id: number;
  property_id: number;
  unit_id: number;
  tenant_id: number | null;
  description: string;
  priority: string;
  status: string;
  created_date: string;
  completed_date: string | null;
  vendor_name: string | null;
  cost: number | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceRequestCreate {
  property_id: number;
  unit_id: number;
  tenant_id?: number;
  description: string;
  priority?: string;
  status?: string;
  created_date: string;
  completed_date?: string;
  vendor_name?: string;
  cost?: number;
}

export interface MaintenanceRequestUpdate {
  description?: string;
  priority?: string;
  status?: string;
  completed_date?: string;
  vendor_name?: string;
  cost?: number;
}

export interface SecurityDepositResponse {
  id: number;
  lease_id: number;
  amount: number;
  date_received: string;
  interest_rate: number;
  deductions_json: string | null;
  refund_amount: number | null;
  refund_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityDepositCreate {
  lease_id: number;
  amount: number;
  date_received: string;
  interest_rate?: number;
  deductions_json?: string;
  refund_amount?: number;
  refund_date?: string;
}

export interface SecurityDepositUpdate {
  amount?: number;
  interest_rate?: number;
  deductions_json?: string;
  refund_amount?: number;
  refund_date?: string;
}

export interface MortgageResponse {
  id: number;
  property_id: number;
  lender: string | null;
  original_amount: number;
  current_balance: number;
  interest_rate: number;
  monthly_payment: number;
  start_date: string | null;
  term_years: number | null;
  is_active: boolean;
  ltv_ratio: number;
  created_at: string;
  updated_at: string;
}

export interface MortgageCreate {
  property_id: number;
  lender?: string;
  original_amount: number;
  current_balance: number;
  interest_rate: number;
  monthly_payment: number;
  start_date?: string;
  term_years?: number;
}

export interface MortgageUpdate {
  lender?: string;
  current_balance?: number;
  interest_rate?: number;
  monthly_payment?: number;
  is_active?: boolean;
}

// Analytics types
export interface RentRollEntry {
  unit_id: number;
  unit_number: string;
  tenant_name: string | null;
  lease_id: number | null;
  monthly_rent: number;
  status: string;
  lease_end: string | null;
}

export interface RentRollResponse {
  property_id: number;
  property_name: string;
  total_potential_rent: number;
  total_collected: number;
  entries: RentRollEntry[];
}

export interface ExpenseBreakdownEntry {
  category: string;
  amount: number;
}

export interface PropertyPNLResponse {
  property_id: number;
  period_start: string;
  period_end: string;
  total_income: number;
  total_expenses: number;
  net_operating_income: number;
  expense_breakdown: ExpenseBreakdownEntry[];
}

export interface PropertyMetricsResponse {
  property_id: number;
  noi: number;
  cash_flow: number;
  cap_rate: number | null;
  cash_on_cash: number | null;
  ltv: number | null;
  dscr: number | null;
}

export interface VacancyEntry {
  property_id: number;
  property_name: string;
  unit_id: number;
  unit_number: string;
  monthly_rent: number;
  days_vacant: number;
  lost_income: number;
}

export interface VacancyResponse {
  total_vacant_units: number;
  total_lost_income: number;
  entries: VacancyEntry[];
}

// Intelligence types
export interface VacancyTrendResponse {
  property_id: number;
  avg_vacancy_days: number;
  ewma_vacancy_days: number;
  trend: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';
  sample_count: number;
  confidence: number;
  current_vacancy_rate: number;
}

export interface MaintenanceForecastResponse {
  property_id: number;
  monthly_avg: number;
  ewma_monthly: number;
  current_month_spend: number;
  projected_month_spend: number;
  trend: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';
  sample_count: number;
  confidence: number;
}

export interface CollectionHealthResponse {
  property_id: number;
  on_time_rate: number;
  late_rate: number;
  total_payments: number;
  on_time_count: number;
  late_count: number;
  partial_count: number;
  confidence: number;
}

export interface PropertyInsightItem {
  type: string;
  level: 'info' | 'warning' | 'alert';
  message: string;
  reasoning: string;
}

export interface PropertyIntelligenceResponse {
  property_id: number;
  vacancy: VacancyTrendResponse;
  maintenance: MaintenanceForecastResponse;
  collection: CollectionHealthResponse;
  insights: PropertyInsightItem[];
}

export interface PortfolioScoreComponent {
  vacancy: number;
  collection: number;
  maintenance: number;
  noi: number;
}

export interface PortfolioScoreResponse {
  score: number;
  components: PortfolioScoreComponent;
  property_count: number;
  avg_vacancy_rate: number;
  avg_collection_rate: number;
  confidence: number;
}

// =============================================================================
// API NAMESPACE
// =============================================================================

export const propertyApi = {
  // Properties
  listProperties: (activeOnly = true) =>
    request<PropertyResponse[]>(`/property/properties?active_only=${activeOnly}`),
  createProperty: (data: PropertyCreate) =>
    request<PropertyResponse>('/property/properties', { method: 'POST', body: data }),
  getProperty: (id: number) =>
    request<PropertyResponse>(`/property/properties/${id}`),
  updateProperty: (id: number, data: PropertyUpdate) =>
    request<PropertyResponse>(`/property/properties/${id}`, { method: 'PUT', body: data }),
  deleteProperty: (id: number) =>
    request<void>(`/property/properties/${id}`, { method: 'DELETE' }),

  // Units
  listUnits: (propertyId: number) =>
    request<UnitResponse[]>(`/property/properties/${propertyId}/units`),
  createUnit: (propertyId: number, data: UnitCreate) =>
    request<UnitResponse>(`/property/properties/${propertyId}/units`, { method: 'POST', body: data }),
  updateUnit: (unitId: number, data: UnitUpdate) =>
    request<UnitResponse>(`/property/units/${unitId}`, { method: 'PUT', body: data }),
  deleteUnit: (unitId: number) =>
    request<void>(`/property/units/${unitId}`, { method: 'DELETE' }),

  // Tenants
  listTenants: (activeOnly = true) =>
    request<TenantResponse[]>(`/property/tenants?active_only=${activeOnly}`),
  createTenant: (data: TenantCreate) =>
    request<TenantResponse>('/property/tenants', { method: 'POST', body: data }),
  getTenant: (id: number) =>
    request<TenantResponse>(`/property/tenants/${id}`),
  updateTenant: (id: number, data: TenantUpdate) =>
    request<TenantResponse>(`/property/tenants/${id}`, { method: 'PUT', body: data }),
  deleteTenant: (id: number) =>
    request<void>(`/property/tenants/${id}`, { method: 'DELETE' }),

  // Leases
  listLeases: (status?: string) => {
    const params = status ? `?status=${status}` : '';
    return request<LeaseResponse[]>(`/property/leases${params}`);
  },
  createLease: (data: LeaseCreate) =>
    request<LeaseResponse>('/property/leases', { method: 'POST', body: data }),
  getLease: (id: number) =>
    request<LeaseResponse>(`/property/leases/${id}`),
  updateLease: (id: number, data: LeaseUpdate) =>
    request<LeaseResponse>(`/property/leases/${id}`, { method: 'PUT', body: data }),
  getExpiringLeases: (days = 90) =>
    request<LeaseResponse[]>(`/property/leases/expiring?days=${days}`),
  renewLease: (leaseId: number, data: LeaseCreate) =>
    request<LeaseResponse>(`/property/leases/${leaseId}/renew`, { method: 'POST', body: data }),

  // Rent payments
  listRentPayments: (leaseId?: number, status?: string) => {
    const params = new URLSearchParams();
    if (leaseId) params.append('lease_id', String(leaseId));
    if (status) params.append('status', status);
    const qs = params.toString();
    return request<RentPaymentResponse[]>(`/property/rent-payments${qs ? `?${qs}` : ''}`);
  },
  createRentPayment: (data: RentPaymentCreate) =>
    request<RentPaymentResponse>('/property/rent-payments', { method: 'POST', body: data }),
  updateRentPayment: (id: number, data: RentPaymentUpdate) =>
    request<RentPaymentResponse>(`/property/rent-payments/${id}`, { method: 'PUT', body: data }),
  getOverduePayments: () =>
    request<RentPaymentResponse[]>('/property/rent-payments/overdue'),

  // Expenses
  createExpense: (data: PropertyExpenseCreate) =>
    request<PropertyExpenseResponse>('/property/expenses', { method: 'POST', body: data }),
  listExpenses: (propertyId: number, category?: string) => {
    const params = category ? `?category=${category}` : '';
    return request<PropertyExpenseResponse[]>(`/property/properties/${propertyId}/expenses${params}`);
  },
  updateExpense: (id: number, data: PropertyExpenseUpdate) =>
    request<PropertyExpenseResponse>(`/property/expenses/${id}`, { method: 'PUT', body: data }),
  deleteExpense: (id: number) =>
    request<void>(`/property/expenses/${id}`, { method: 'DELETE' }),

  // Maintenance
  listMaintenance: (propertyId?: number, status?: string) => {
    const params = new URLSearchParams();
    if (propertyId) params.append('property_id', String(propertyId));
    if (status) params.append('status', status);
    const qs = params.toString();
    return request<MaintenanceRequestResponse[]>(`/property/maintenance${qs ? `?${qs}` : ''}`);
  },
  createMaintenance: (data: MaintenanceRequestCreate) =>
    request<MaintenanceRequestResponse>('/property/maintenance', { method: 'POST', body: data }),
  getMaintenance: (id: number) =>
    request<MaintenanceRequestResponse>(`/property/maintenance/${id}`),
  updateMaintenance: (id: number, data: MaintenanceRequestUpdate) =>
    request<MaintenanceRequestResponse>(`/property/maintenance/${id}`, { method: 'PUT', body: data }),
  getOpenMaintenance: () =>
    request<MaintenanceRequestResponse[]>('/property/maintenance/open'),

  // Security deposits
  listSecurityDeposits: (leaseId?: number) => {
    const params = leaseId ? `?lease_id=${leaseId}` : '';
    return request<SecurityDepositResponse[]>(`/property/security-deposits${params}`);
  },
  createSecurityDeposit: (data: SecurityDepositCreate) =>
    request<SecurityDepositResponse>('/property/security-deposits', { method: 'POST', body: data }),
  updateSecurityDeposit: (id: number, data: SecurityDepositUpdate) =>
    request<SecurityDepositResponse>(`/property/security-deposits/${id}`, { method: 'PUT', body: data }),

  // Mortgages
  listMortgages: (propertyId: number) =>
    request<MortgageResponse[]>(`/property/properties/${propertyId}/mortgages`),
  createMortgage: (data: MortgageCreate) =>
    request<MortgageResponse>('/property/mortgages', { method: 'POST', body: data }),
  updateMortgage: (id: number, data: MortgageUpdate) =>
    request<MortgageResponse>(`/property/mortgages/${id}`, { method: 'PUT', body: data }),

  // Analytics
  getRentRoll: (propertyId: number) =>
    request<RentRollResponse>(`/property/properties/${propertyId}/rent-roll`),
  getPNL: (propertyId: number, start: string, end: string) =>
    request<PropertyPNLResponse>(`/property/properties/${propertyId}/pnl?start=${start}&end=${end}`),
  getMetrics: (propertyId: number) =>
    request<PropertyMetricsResponse>(`/property/properties/${propertyId}/metrics`),
  getVacancies: () =>
    request<VacancyResponse>('/property/vacancies'),

  // Intelligence
  getPropertyIntelligence: (propertyId: number) =>
    request<PropertyIntelligenceResponse>(`/property/properties/${propertyId}/intelligence`),
  getVacancyTrend: (propertyId: number) =>
    request<VacancyTrendResponse>(`/property/properties/${propertyId}/vacancy-trend`),
  getMaintenanceForecast: (propertyId: number) =>
    request<MaintenanceForecastResponse>(`/property/properties/${propertyId}/maintenance-forecast`),
  getPortfolioScore: () =>
    request<PortfolioScoreResponse>('/property/portfolio-score'),
};
