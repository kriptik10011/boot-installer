/**
 * TanStack Query hooks for property management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  propertyApi,
  type PropertyCreate,
  type PropertyUpdate,
  type UnitCreate,
  type UnitUpdate,
  type TenantCreate,
  type TenantUpdate,
  type LeaseCreate,
  type LeaseUpdate,
  type RentPaymentCreate,
  type RentPaymentUpdate,
  type PropertyExpenseCreate,
  type PropertyExpenseUpdate,
  type MaintenanceRequestCreate,
  type MaintenanceRequestUpdate,
  type SecurityDepositCreate,
  type SecurityDepositUpdate,
  type MortgageCreate,
  type MortgageUpdate,
} from '@/api/property';

const PROPERTY_STALE_TIME = 5 * 60 * 1000;

export const propertyKeys = {
  all: ['property'] as const,
  properties: () => [...propertyKeys.all, 'properties'] as const,
  property: (id: number) => [...propertyKeys.all, 'property', id] as const,
  units: (propertyId: number) => [...propertyKeys.all, 'units', propertyId] as const,
  tenants: () => [...propertyKeys.all, 'tenants'] as const,
  tenant: (id: number) => [...propertyKeys.all, 'tenant', id] as const,
  leases: (status?: string) => [...propertyKeys.all, 'leases', status] as const,
  lease: (id: number) => [...propertyKeys.all, 'lease', id] as const,
  expiringLeases: (days: number) => [...propertyKeys.all, 'leases', 'expiring', days] as const,
  rentPayments: (leaseId?: number) => [...propertyKeys.all, 'rent-payments', leaseId] as const,
  overduePayments: () => [...propertyKeys.all, 'rent-payments', 'overdue'] as const,
  expenses: (propertyId: number) => [...propertyKeys.all, 'expenses', propertyId] as const,
  maintenance: (propertyId?: number) => [...propertyKeys.all, 'maintenance', propertyId] as const,
  openMaintenance: () => [...propertyKeys.all, 'maintenance', 'open'] as const,
  securityDeposits: (leaseId?: number) => [...propertyKeys.all, 'deposits', leaseId] as const,
  mortgages: (propertyId: number) => [...propertyKeys.all, 'mortgages', propertyId] as const,
  rentRoll: (propertyId: number) => [...propertyKeys.all, 'rent-roll', propertyId] as const,
  pnl: (propertyId: number, start: string, end: string) =>
    [...propertyKeys.all, 'pnl', propertyId, start, end] as const,
  metrics: (propertyId: number) => [...propertyKeys.all, 'metrics', propertyId] as const,
  vacancies: () => [...propertyKeys.all, 'vacancies'] as const,
};

// --- Properties ---

export function useProperties(activeOnly = true) {
  return useQuery({
    queryKey: propertyKeys.properties(),
    queryFn: () => propertyApi.listProperties(activeOnly),
    staleTime: PROPERTY_STALE_TIME,
  });
}

export function useProperty(id: number) {
  return useQuery({
    queryKey: propertyKeys.property(id),
    queryFn: () => propertyApi.getProperty(id),
    staleTime: PROPERTY_STALE_TIME,
    enabled: id > 0,
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PropertyCreate) => propertyApi.createProperty(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.properties() }),
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PropertyUpdate }) =>
      propertyApi.updateProperty(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: propertyKeys.properties() });
      qc.invalidateQueries({ queryKey: propertyKeys.property(id) });
    },
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => propertyApi.deleteProperty(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.properties() }),
  });
}

// --- Units ---

export function useUnits(propertyId: number) {
  return useQuery({
    queryKey: propertyKeys.units(propertyId),
    queryFn: () => propertyApi.listUnits(propertyId),
    staleTime: PROPERTY_STALE_TIME,
    enabled: propertyId > 0,
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, data }: { propertyId: number; data: UnitCreate }) =>
      propertyApi.createUnit(propertyId, data),
    onSuccess: (_, { propertyId }) => {
      qc.invalidateQueries({ queryKey: propertyKeys.units(propertyId) });
      qc.invalidateQueries({ queryKey: propertyKeys.property(propertyId) });
    },
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, data }: { unitId: number; data: UnitUpdate }) =>
      propertyApi.updateUnit(unitId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

// --- Tenants ---

export function useTenants(activeOnly = true) {
  return useQuery({
    queryKey: propertyKeys.tenants(),
    queryFn: () => propertyApi.listTenants(activeOnly),
    staleTime: PROPERTY_STALE_TIME,
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TenantCreate) => propertyApi.createTenant(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.tenants() }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TenantUpdate }) =>
      propertyApi.updateTenant(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.tenants() }),
  });
}

// --- Leases ---

export function useLeases(status?: string) {
  return useQuery({
    queryKey: propertyKeys.leases(status),
    queryFn: () => propertyApi.listLeases(status),
    staleTime: PROPERTY_STALE_TIME,
  });
}

export function useCreateLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LeaseCreate) => propertyApi.createLease(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useUpdateLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: LeaseUpdate }) =>
      propertyApi.updateLease(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useExpiringLeases(days = 90) {
  return useQuery({
    queryKey: propertyKeys.expiringLeases(days),
    queryFn: () => propertyApi.getExpiringLeases(days),
    staleTime: PROPERTY_STALE_TIME,
  });
}

export function useRenewLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leaseId, data }: { leaseId: number; data: LeaseCreate }) =>
      propertyApi.renewLease(leaseId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

// --- Rent Payments ---

export function useRentPayments(leaseId?: number, status?: string) {
  return useQuery({
    queryKey: propertyKeys.rentPayments(leaseId),
    queryFn: () => propertyApi.listRentPayments(leaseId, status),
    staleTime: PROPERTY_STALE_TIME,
  });
}

export function useCreateRentPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RentPaymentCreate) => propertyApi.createRentPayment(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: propertyKeys.all });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useUpdateRentPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RentPaymentUpdate }) =>
      propertyApi.updateRentPayment(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useOverduePayments() {
  return useQuery({
    queryKey: propertyKeys.overduePayments(),
    queryFn: () => propertyApi.getOverduePayments(),
    staleTime: PROPERTY_STALE_TIME,
  });
}

// --- Expenses ---

export function usePropertyExpenses(propertyId: number, category?: string) {
  return useQuery({
    queryKey: propertyKeys.expenses(propertyId),
    queryFn: () => propertyApi.listExpenses(propertyId, category),
    staleTime: PROPERTY_STALE_TIME,
    enabled: propertyId > 0,
  });
}

export function useCreatePropertyExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PropertyExpenseCreate) => propertyApi.createExpense(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: propertyKeys.all });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useUpdatePropertyExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PropertyExpenseUpdate }) =>
      propertyApi.updateExpense(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

// --- Maintenance ---

export function useMaintenance(propertyId?: number, status?: string) {
  return useQuery({
    queryKey: propertyKeys.maintenance(propertyId),
    queryFn: () => propertyApi.listMaintenance(propertyId, status),
    staleTime: PROPERTY_STALE_TIME,
  });
}

export function useOpenMaintenance() {
  return useQuery({
    queryKey: propertyKeys.openMaintenance(),
    queryFn: () => propertyApi.getOpenMaintenance(),
    staleTime: PROPERTY_STALE_TIME,
  });
}

export function useCreateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MaintenanceRequestCreate) => propertyApi.createMaintenance(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useUpdateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MaintenanceRequestUpdate }) =>
      propertyApi.updateMaintenance(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

// --- Security Deposits ---

export function useSecurityDeposits(leaseId?: number) {
  return useQuery({
    queryKey: propertyKeys.securityDeposits(leaseId),
    queryFn: () => propertyApi.listSecurityDeposits(leaseId),
    staleTime: PROPERTY_STALE_TIME,
  });
}

export function useCreateSecurityDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SecurityDepositCreate) => propertyApi.createSecurityDeposit(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useUpdateSecurityDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SecurityDepositUpdate }) =>
      propertyApi.updateSecurityDeposit(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

// --- Mortgages ---

export function useMortgages(propertyId: number) {
  return useQuery({
    queryKey: propertyKeys.mortgages(propertyId),
    queryFn: () => propertyApi.listMortgages(propertyId),
    staleTime: PROPERTY_STALE_TIME,
    enabled: propertyId > 0,
  });
}

export function useCreateMortgage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MortgageCreate) => propertyApi.createMortgage(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: propertyKeys.all });
      qc.invalidateQueries({ queryKey: ['debt'] });
    },
  });
}

export function useUpdateMortgage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MortgageUpdate }) =>
      propertyApi.updateMortgage(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: propertyKeys.all });
      qc.invalidateQueries({ queryKey: ['debt'] });
    },
  });
}

// --- Analytics ---

export function useRentRoll(propertyId: number) {
  return useQuery({
    queryKey: propertyKeys.rentRoll(propertyId),
    queryFn: () => propertyApi.getRentRoll(propertyId),
    staleTime: PROPERTY_STALE_TIME,
    enabled: propertyId > 0,
  });
}

export function usePropertyPNL(propertyId: number, start: string, end: string) {
  return useQuery({
    queryKey: propertyKeys.pnl(propertyId, start, end),
    queryFn: () => propertyApi.getPNL(propertyId, start, end),
    staleTime: PROPERTY_STALE_TIME,
    enabled: propertyId > 0 && !!start && !!end,
  });
}

export function usePropertyMetrics(propertyId: number) {
  return useQuery({
    queryKey: propertyKeys.metrics(propertyId),
    queryFn: () => propertyApi.getMetrics(propertyId),
    staleTime: PROPERTY_STALE_TIME,
    enabled: propertyId > 0,
  });
}

export function useVacancies() {
  return useQuery({
    queryKey: propertyKeys.vacancies(),
    queryFn: () => propertyApi.getVacancies(),
    staleTime: PROPERTY_STALE_TIME,
  });
}
