// usePresence — send heartbeat every 20s and list active users.
// Automatic pause when tab hidden. Uses window.location.pathname as currentPage.
import { useEffect, useState, useRef, useCallback } from 'react';

export type PresenceUser = {
  user_uid: string;
  name: string | null;
  email: string | null;
  role: string | null;
  zone: string | null;
  current_page: string | null;
  last_seen: string;
  seconds_ago: number;
};

const HEARTBEAT_MS = 20000; // 20s

export function usePresence(enabled: boolean = true) {
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [count, setCount] = useState(0);
  const beatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const beat = useCallback(async () => {
    try {
      await fetch('/api/presence/heartbeat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPage: window.location.pathname }),
      });
    } catch { /* ignore transient errors */ }
  }, []);

  const fetchOnline = useCallback(async () => {
    try {
      const r = await fetch('/api/presence/online', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      setOnline(data.users || []);
      setCount(data.count || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const start = () => {
      if (beatTimerRef.current) return;
      beat(); fetchOnline();
      beatTimerRef.current = setInterval(beat, HEARTBEAT_MS);
      pollTimerRef.current = setInterval(fetchOnline, HEARTBEAT_MS);
    };
    const pause = () => {
      if (beatTimerRef.current) { clearInterval(beatTimerRef.current); beatTimerRef.current = null; }
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
      else start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      pause();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, beat, fetchOnline]);

  return { online, count };
}
