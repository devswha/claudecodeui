import { useEffect, useState } from 'react';

import { api } from '../../../utils/api';

export type ExternalCliSession = { tmuxName: string; kind: 'claude' | 'codex' };

const POLL_INTERVAL_MS = 10000;

/**
 * Polls /sessions/external (10s, best-effort) for claude/codex tmux sessions.
 * Self-contained so the gjc live lane (useProjectsState's live poll) stays
 * untouched; gjc sessions are excluded server-side. [] on any failure.
 */
export function useExternalCliSessions(): ExternalCliSession[] {
  const [sessions, setSessions] = useState<ExternalCliSession[]>([]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await api.externalSessions();
        if (!response.ok) return;
        const body = await response.json();
        const list: ExternalCliSession[] = body?.data?.externalSessions ?? body?.externalSessions ?? [];
        if (!cancelled) {
          setSessions(list.filter((session) => session?.tmuxName && (session.kind === 'claude' || session.kind === 'codex')));
        }
      } catch {
        // best-effort — no tmux / endpoint error just empties the tab
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return sessions;
}
