// useLivePoll — auto-refresh data at interval, pause when tab hidden.
// Usage:
//   const { data, error, loading, refetch } = useLivePoll<{ leads: any[] }>('/api/leads', 3000);
import { useEffect, useRef, useState, useCallback } from 'react';

type Options = {
  intervalMs?: number;       // default 3000
  enabled?: boolean;         // default true
  pauseWhenHidden?: boolean; // default true
  onNewData?: (fresh: any, previous: any) => void; // called only on change
};

function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    // Compare by JSON stringification (cheap for small lists; CRM lists are ≤500 rows)
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export function useLivePoll<T = any>(url: string | null, opts: number | Options = 3000) {
  const options: Options = typeof opts === 'number' ? { intervalMs: opts } : opts;
  const { intervalMs = 3000, enabled = true, pauseWhenHidden = true, onNewData } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const prevRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!url || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const fresh = await r.json();
      if (!shallowEqual(fresh, prevRef.current)) {
        if (onNewData && prevRef.current !== null) onNewData(fresh, prevRef.current);
        prevRef.current = fresh;
        setData(fresh);
        setLastUpdated(Date.now());
      }
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [url, onNewData]);

  useEffect(() => {
    if (!enabled || !url) return;

    let stop = false;
    const start = () => {
      if (timerRef.current) return;
      fetchOnce();
      timerRef.current = setInterval(() => { if (!stop) fetchOnce(); }, intervalMs);
    };
    const pause = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };

    const handleVisibility = () => {
      if (!pauseWhenHidden) return;
      if (document.visibilityState === 'hidden') pause();
      else start();
    };

    start();
    if (pauseWhenHidden) document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop = true;
      pause();
      if (pauseWhenHidden) document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [url, enabled, intervalMs, pauseWhenHidden, fetchOnce]);

  return { data, error, loading, lastUpdated, refetch: fetchOnce };
}
