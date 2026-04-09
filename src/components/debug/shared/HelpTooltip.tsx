/**
 * HelpTooltip Component
 *
 * A (?) icon that shows explanatory text on hover.
 * Used in debug panel to explain metrics.
 */

interface HelpTooltipProps {
  /** The help text to display on hover */
  text: string;
  /** Position of the tooltip relative to the icon */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function HelpTooltip({ text, position = 'top' }: HelpTooltipProps) {
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span className="group relative inline-flex items-center">
      <span className="w-4 h-4 rounded-full border border-slate-500 text-[10px] flex items-center justify-center cursor-help text-slate-500 hover:text-slate-300 hover:border-slate-300 transition-colors">
        ?
      </span>
      <span
        className={`
          absolute hidden group-hover:block
          w-64 p-2 bg-slate-800 text-xs text-slate-300 rounded-lg
          border border-slate-700 shadow-lg z-50
          ${positionClasses[position]}
        `}
      >
        {text}
      </span>
    </span>
  );
}
