/**
 * ImportExportCard — CSV/Excel import dropzone + export in one card.
 *
 * Import: drag-and-drop or click to upload CSV/Excel files.
 * Uses financesApi.importUpload for parsing, then inline preview + confirm.
 * Export: direct fetch to /reports/export?format=csv for blob download.
 */

import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RadialGlassCard } from '../RadialGlassCard';
import {
  financesApi,
  type FinancialImportResult,
  type FinancialImportItem,
} from '@/api/finance';
import { API_BASE_URL, getAuthHeaders } from '@/api/core';
import { financeV2Keys } from '@/hooks/useFinanceV2';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface ImportExportCardProps {
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

type Step = 'idle' | 'preview' | 'done';

export function ImportExportCard({
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: ImportExportCardProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('idle');
  const [importResult, setImportResult] = useState<FinancialImportResult | null>(null);
  const [editedItems, setEditedItems] = useState<FinancialImportItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => financesApi.importUpload(file),
    onSuccess: (result) => {
      setImportResult(result);
      setEditedItems(result.items);
      setStep('preview');
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to parse file');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (items: FinancialImportItem[]) => financesApi.importConfirm(items),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: financeV2Keys.transactions });
      queryClient.invalidateQueries({ queryKey: financeV2Keys.recurring });
      queryClient.invalidateQueries({ queryKey: financeV2Keys.budget });
      queryClient.invalidateQueries({ queryKey: financeV2Keys.reports });
      setImportedCount(result.imported_count);
      setStep('done');
    },
    onError: (err: Error) => {
      setError(err.message || 'Import failed');
    },
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      setError(null);
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const handleConfirm = useCallback(() => {
    const validItems = editedItems.filter(
      (item) => item.name && item.amount && item.amount > 0 && item.due_date,
    );
    if (validItems.length > 0) {
      confirmMutation.mutate(validItems);
    }
  }, [editedItems, confirmMutation]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const now = new Date();
      const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const res = await fetch(
        `${API_BASE_URL}/reports/export?period_start=${periodStart}&format=csv`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${periodStart}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setStep('idle');
    setImportResult(null);
    setEditedItems([]);
    setError(null);
    setImportedCount(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const validCount = editedItems.filter(
    (item) => item.name && item.amount && item.amount > 0 && item.due_date,
  ).length;

  return (
    <RadialGlassCard
      accentColor="#64748b"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-xs font-medium text-slate-400/70 uppercase tracking-wider">
          Import / Export
        </h2>
        {step !== 'idle' && (
          <button
            onClick={handleReset}
            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-[10px] text-amber-400 bg-amber-400/10 rounded px-2 py-1 mb-2">
          {error}
        </div>
      )}

      {step === 'idle' && (
        <div className="space-y-3">
          {/* Import dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-slate-700 rounded-lg p-4 text-center hover:border-slate-500 transition-colors cursor-pointer"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploadMutation.isPending ? (
              <p className="text-xs text-slate-400">Processing...</p>
            ) : (
              <>
                <svg className="w-5 h-5 mx-auto mb-1.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-xs text-slate-400">Drop CSV or Excel file</p>
                <p className="text-[10px] text-slate-600 mt-0.5">.csv, .xlsx, .xls</p>
              </>
            )}
          </div>

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3" />
            </svg>
            {exporting ? 'Exporting...' : 'Export Transactions (CSV)'}
          </button>
        </div>
      )}

      {step === 'preview' && importResult && (
        <div className="space-y-2">
          {/* Stats */}
          <div className="flex gap-3 text-[10px]">
            <span className="text-slate-500">
              Found: <span className="text-slate-300">{editedItems.length}</span>
            </span>
            <span className="text-emerald-400/70">
              Valid: {validCount}
            </span>
          </div>

          {/* Preview rows */}
          <div className="max-h-40 overflow-y-auto space-y-1.5">
            {editedItems.slice(0, 8).map((item, i) => {
              const isValid = item.name && item.amount && item.amount > 0 && item.due_date;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                    isValid ? 'bg-slate-800/50' : 'bg-amber-900/15 border border-amber-800/20'
                  }`}
                >
                  <span className="text-slate-300 truncate flex-1">{item.name || '(empty)'}</span>
                  <span className="text-slate-400 tabular-nums ml-2">
                    {item.amount ? fmtDashboard(item.amount) : '—'}
                  </span>
                </div>
              );
            })}
            {editedItems.length > 8 && (
              <p className="text-[10px] text-slate-600 text-center">
                +{editedItems.length - 8} more
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleReset}
              className="flex-1 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300 rounded border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={validCount === 0 || confirmMutation.isPending}
              className="flex-1 px-2 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded transition-colors disabled:opacity-50"
            >
              {confirmMutation.isPending ? 'Importing...' : `Import ${validCount}`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-4">
          <p className="text-sm text-emerald-400 font-medium">
            {importedCount} items imported
          </p>
          <button
            onClick={handleReset}
            className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Import another file
          </button>
        </div>
      )}
    </RadialGlassCard>
  );
}
