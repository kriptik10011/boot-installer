/**
 * SettingsTooltip Component
 *
 * Dismissable tooltip that points to the Settings gear icon.
 * Shows after first-run welcome is dismissed.
 */

interface SettingsTooltipProps {
  onDismiss: () => void;
}

export function SettingsTooltip({ onDismiss }: SettingsTooltipProps) {
  return (
    <div className="fixed top-16 right-4 z-40 animate-fade-in">
      <div className="relative bg-slate-700 border border-slate-600 rounded-xl shadow-xl p-4 max-w-xs">
        {/* Arrow pointing up-right toward the settings gear */}
        <div className="absolute -top-2 right-8 w-4 h-4 bg-slate-700 border-l border-t border-slate-600 transform rotate-45" />

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-white text-sm">Customize your view</h4>
            <p className="text-xs text-slate-400 mt-1">
              Toggle modules, change themes, and adjust settings anytime.
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="mt-3 w-full py-2 px-3 text-sm text-slate-300 hover:text-white bg-slate-600/50 hover:bg-slate-600 rounded-lg transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
