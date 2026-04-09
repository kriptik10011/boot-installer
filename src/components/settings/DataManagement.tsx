import { useState, useRef } from 'react';
import { Download, Upload, Database, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import { useDatabaseInfo, useExportBackup, useRestoreBackup, useDeleteAllData } from '@/hooks';
import { useAppStore } from '@/stores/appStore';
import { ConfirmationModal } from '../shared/ConfirmationModal';

// Format bytes to human readable size
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format ISO date to readable format
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DataManagement() {
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: dbInfo, isLoading: infoLoading } = useDatabaseInfo();
  const exportBackup = useExportBackup();
  const restoreBackup = useRestoreBackup();
  const deleteAllData = useDeleteAllData();
  const resetFirstRun = useAppStore((state) => state.resetFirstRun);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleExport = () => {
    exportBackup.mutate(undefined, {
      onSuccess: () => {
        showNotification('success', 'Backup exported successfully');
      },
      onError: (error) => {
        showNotification('error', `Export failed: ${error.message}`);
      },
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setRestoreDialogOpen(true);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRestoreConfirm = () => {
    if (!selectedFile) return;

    restoreBackup.mutate(selectedFile, {
      onSuccess: () => {
        showNotification('success', 'Database restored successfully');
        setRestoreDialogOpen(false);
        setSelectedFile(null);
      },
      onError: (error) => {
        showNotification('error', `Restore failed: ${error.message}`);
        setRestoreDialogOpen(false);
        setSelectedFile(null);
      },
    });
  };

  const handleRestoreCancel = () => {
    setRestoreDialogOpen(false);
    setSelectedFile(null);
  };

  const handleDeleteConfirm = () => {
    deleteAllData.mutate(undefined, {
      onSuccess: (data) => {
        showNotification('success', `All data deleted. ${data.tables_cleared} tables cleared.`);
        setDeleteDialogOpen(false);
        // Reset first-run state so user sees onboarding again
        resetFirstRun();
      },
      onError: (error) => {
        showNotification('error', `Delete failed: ${error.message}`);
        setDeleteDialogOpen(false);
      },
    });
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <Database className="w-5 h-5 text-cyan-400" />
        Data Management
      </h2>

      {/* Notification */}
      {notification && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
            notification.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="text-sm">{notification.message}</span>
        </div>
      )}

      {/* Database Info */}
      <div className="mb-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Database Size</span>
          <span className="text-slate-200">
            {infoLoading ? 'Loading...' : dbInfo ? formatBytes(dbInfo.size_bytes) : 'Unknown'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Last Modified</span>
          <span className="text-slate-200">
            {infoLoading ? 'Loading...' : dbInfo ? formatDate(dbInfo.modified_at) : 'Unknown'}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={handleExport}
          disabled={exportBackup.isPending}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                     bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30
                     text-cyan-400 font-medium text-sm transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          {exportBackup.isPending ? 'Exporting...' : 'Export Backup'}
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={restoreBackup.isPending}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                     bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30
                     text-amber-400 font-medium text-sm transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          {restoreBackup.isPending ? 'Restoring...' : 'Restore from Backup'}
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".db"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Danger Zone */}
      <div className="pt-4 border-t border-slate-700">
        <h3 className="text-sm font-medium text-amber-400 mb-3">Danger Zone</h3>
        <button
          onClick={() => setDeleteDialogOpen(true)}
          disabled={deleteAllData.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                     bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30
                     text-amber-400 font-medium text-sm transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          {deleteAllData.isPending ? 'Deleting...' : 'Delete All Data'}
        </button>
        <p className="text-xs text-slate-500 mt-2">
          Permanently delete all data and start fresh. This cannot be undone.
        </p>
      </div>

      {/* Restore Confirmation Dialog */}
      <ConfirmationModal
        isOpen={restoreDialogOpen}
        title="Restore Database?"
        message="This will replace all current data with the backup file. This action cannot be undone."
        confirmLabel="Restore"
        confirmVariant="danger"
        onConfirm={handleRestoreConfirm}
        onCancel={handleRestoreCancel}
        isLoading={restoreBackup.isPending}
        details={
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">File</span>
              <span className="text-slate-200 font-mono text-xs">{selectedFile?.name ?? ''}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Size</span>
              <span className="text-slate-200">{formatBytes(selectedFile?.size ?? 0)}</span>
            </div>
          </div>
        }
        warningNote="A backup of your current database will be created automatically before restoring."
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationModal
        isOpen={deleteDialogOpen}
        title="Delete All Data?"
        message="This will permanently delete all events, meals, recipes, bills, and other data. The database schema will be recreated empty."
        confirmLabel="Delete All Data"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isLoading={deleteAllData.isPending}
        requiresTypedConfirmation="DELETE"
        warningNote="This action cannot be undone. Consider exporting a backup first."
      />
    </div>
  );
}
