// PresenceIndicator — avatar cluster showing who is online right now.
// Compact for header; expandable popover on click.
import { useState, useRef, useEffect } from 'react';
import { Users } from 'lucide-react';
import type { PresenceUser } from '../hooks/usePresence';

const initialsOf = (u: PresenceUser) => (u.name || u.email || '?').trim().charAt(0).toUpperCase();

const colorForRole = (role?: string | null) => {
  switch (role) {
    case 'superadmin': return 'bg-violet-500';
    case 'admin':      return 'bg-indigo-500';
    case 'agent':      return 'bg-emerald-500';
    default:           return 'bg-slate-500';
  }
};

export function PresenceIndicator({ users, count }: { users: PresenceUser[]; count: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const preview = users.slice(0, 3);
  const extra = Math.max(0, count - preview.length);

  return (
    <div className="relative" ref={ref} data-testid="presence-indicator">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 md:gap-2 px-2 md:px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200 bg-white"
        title={`${count} utilisateur${count > 1 ? 's' : ''} en ligne`}
        data-testid="presence-btn"
      >
        <span className="relative flex items-center">
          <span className="absolute -left-0.5 top-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
          <Users size={14} className="text-slate-500 ml-3" />
        </span>
        {/* Avatars stack */}
        <div className="flex -space-x-1.5">
          {preview.map(u => (
            <span
              key={u.user_uid}
              title={u.name || u.email || ''}
              className={`w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white ${colorForRole(u.role)}`}
            >
              {initialsOf(u)}
            </span>
          ))}
          {extra > 0 && (
            <span className="w-6 h-6 rounded-full bg-slate-300 text-slate-700 text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
              +{extra}
            </span>
          )}
          {count === 0 && (
            <span className="text-[11px] text-slate-400 font-medium">Personne</span>
          )}
        </div>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
          data-testid="presence-popover"
        >
          <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200">
            <p className="text-xs uppercase tracking-wider font-bold text-slate-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              En ligne — {count}
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {users.length === 0 ? (
              <p className="p-4 text-sm text-slate-400 text-center italic">Aucun autre utilisateur connecté</p>
            ) : users.map(u => (
              <div
                key={u.user_uid}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
              >
                <span className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ${colorForRole(u.role)}`}>
                  {initialsOf(u)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{u.name || u.email}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {u.role} {u.zone ? `· ${u.zone}` : ''} {u.current_page ? `· ${u.current_page}` : ''}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{u.seconds_ago < 10 ? 'à l\u2019instant' : `il y a ${u.seconds_ago}s`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
