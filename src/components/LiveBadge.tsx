// LiveBadge — small pulsing dot + "LIVE" label indicating auto-refresh is on.
import type { CSSProperties } from 'react';

export function LiveBadge({ label = 'Live', className = '', style }: { label?: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider ${className}`}
      style={style}
      data-testid="live-badge"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}
