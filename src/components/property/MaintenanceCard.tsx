/**
 * MaintenanceCard — Open maintenance requests.
 * +Add request, −Mark complete per request.
 */

import { useState, useCallback } from 'react';
import { RadialGlassCard } from '../finance/radial/dashboard/RadialGlassCard';
import {
  useOpenMaintenance,
  useCreateMaintenance,
  useUpdateMaintenance,
  useUnits,
} from '@/hooks';

interface MaintenanceCardProps {
  cardId: string;
  propertyId?: number | null;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  emergency: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Done',
  cancelled: 'Cancelled',
};

export function MaintenanceCard({
  cardId,
  propertyId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: MaintenanceCardProps) {
  const { data: requests } = useOpenMaintenance();
  const { data: units } = useUnits(propertyId ?? 0);
  const createMutation = useCreateMaintenance();
  const updateMutation = useUpdateMaintenance();
  const items = requests ?? [];

  const [showAdd, setShowAdd] = useState(false);
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState('medium');
  const [unitId, setUnitId] = useState('');

  const handleAdd = useCallback(() => {
    if (!desc.trim() || !propertyId || !unitId) return;
    createMutation.mutate(
      {
        property_id: propertyId,
        unit_id: parseInt(unitId),
        description: desc.trim(),
        priority,
        created_date: new Date().toISOString().slice(0, 10),
      },
      {
        onSuccess: () => {
          setDesc('');
          setPriority('medium');
          setUnitId('');
          setShowAdd(false);
        },
      },
    );
  }, [propertyId, unitId, desc, priority, createMutation]);

  const handleComplete = useCallback(
    (id: number) => {
      updateMutation.mutate({
        id,
        data: {
          status: 'completed',
          completed_date: new Date().toISOString().slice(0, 10),
        },
      });
    },
    [updateMutation],
  );

  const handleCancel = useCallback(
    (id: number) => {
      updateMutation.mutate({ id, data: { status: 'cancelled' } });
    },
    [updateMutation],
  );

  const unitOptions = units ?? [];

  return (
    <RadialGlassCard
      accentColor="#d97706"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-xs font-medium text-amber-400/70 uppercase tracking-wider">
          Maintenance
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{items.length} open</span>
          {propertyId && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="text-[10px] text-slate-600 hover:text-amber-400 transition-colors"
            >
              {showAdd ? 'Cancel' : '+ Request'}
            </button>
          )}
        </div>
      </div>

      {/* Add request form */}
      {showAdd && propertyId && (
        <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What needs fixing?"
            className="w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
          />
          <div className="flex gap-2">
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"
            >
              <option value="">Unit...</option>
              {unitOptions.map((u) => (
                <option key={u.id} value={u.id}>Unit {u.unit_number}</option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-24 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!desc.trim() || !unitId || createMutation.isPending}
            className="w-full px-2 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No open requests</p>
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {items.map((req) => (
            <div
              key={req.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded bg-slate-800/40 text-xs group"
            >
              <div
                className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                style={{ backgroundColor: PRIORITY_COLORS[req.priority] ?? '#6b7280' }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-slate-300 truncate">{req.description}</div>
                <div className="flex gap-2 mt-0.5 text-[10px] text-slate-500">
                  <span>{req.priority}</span>
                  <span>{STATUS_LABELS[req.status] ?? req.status}</span>
                  {req.vendor_name && <span>{req.vendor_name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleComplete(req.id)}
                  className="p-0.5 rounded text-emerald-500/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  title="Mark complete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleCancel(req.id)}
                  className="p-0.5 rounded text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  title="Cancel request"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {req.cost != null && (
                <span className="text-[10px] text-amber-400 tabular-nums shrink-0">
                  ${req.cost.toLocaleString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </RadialGlassCard>
  );
}
