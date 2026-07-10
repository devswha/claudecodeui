import { useState } from 'react';
import { X } from 'lucide-react';

import type { Project, ProjectSession } from '../../../../types/app';
import { cn } from '../../../../lib/utils';
import { api } from '../../../../utils/api';
import { getAllSessions, getSessionTime } from '../../utils/utils';

import type { SidebarProjectListProps } from './SidebarProjectList';

type SidebarLiveSectionProps = {
  projects: Project[];
  liveSessionIds: ReadonlySet<string>;
  liveSessionNames: ReadonlyMap<string, string>;
  selectedSession: ProjectSession | null;
  onSessionSelect: SidebarProjectListProps['onSessionSelect'];
};

/** Per-row kill flow state (2-step confirm before the tower is asked to kill). */
type KillStatus =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'killing' }
  | { kind: 'error'; text: string };

/** Compact relative age for a session's last activity: <1m, Xm, Xhr, Xd, or ''. */
function formatAge(iso: string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time) || time === 0) {
    return '';
  }
  const minutes = Math.floor(Math.max(0, Date.now() - time) / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}hr`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * "작동 중" tab content: the live gjc fleet. Each row is labelled by its TMUX
 * session name (omg/stock/flask/…) as the primary label — this is a fleet roster,
 * not a conversation list — with the project name + recent activity underneath and
 * the conversation title in the tooltip. Falls back to the conversation title when
 * the tmux name is unknown. Renders nothing when nothing is live.
 *
 * Rows with a known tmux name get a close (✕) control: 2-step confirm, then the
 * server proxies the control tower's /kill (the tower is the fleet-lifecycle
 * authority — protected sessions are refused there with 403).
 */
export default function SidebarLiveSection({
  projects,
  liveSessionIds,
  liveSessionNames,
  selectedSession,
  onSessionSelect,
}: SidebarLiveSectionProps) {
  // Session ids killed in this component instance — hidden immediately; the 5s
  // live poll is the source of truth and will drop them for real.
  const [killedIds, setKilledIds] = useState<ReadonlySet<string>>(new Set());
  const [killStatus, setKillStatus] = useState<Map<string, KillStatus>>(new Map());

  if (liveSessionIds.size === 0) {
    return null;
  }

  const rows = projects.flatMap((project) =>
    getAllSessions(project)
      .filter((session) => liveSessionIds.has(session.id) && !killedIds.has(session.id))
      .map((session) => ({ project, session })),
  );

  if (rows.length === 0) {
    return null;
  }

  const statusOf = (id: string): KillStatus => killStatus.get(id) ?? { kind: 'idle' };
  const setStatusOf = (id: string, status: KillStatus) => {
    setKillStatus((prev) => {
      const next = new Map(prev);
      if (status.kind === 'idle') {
        next.delete(id);
      } else {
        next.set(id, status);
      }
      return next;
    });
  };

  const kill = async (sessionId: string, tmuxName: string) => {
    setStatusOf(sessionId, { kind: 'killing' });
    try {
      const response = await api.liveSessionKill(tmuxName);
      const body = await response.json().catch(() => null);
      const data = (body?.data ?? body ?? {}) as {
        ok?: boolean;
        reachable?: boolean;
        protected?: boolean;
        unknown?: boolean;
        detail?: string;
      };
      if (response.ok && data.ok) {
        setStatusOf(sessionId, { kind: 'idle' });
        setKilledIds((prev) => new Set([...prev, sessionId]));
        return;
      }
      const text = data.reachable === false
        ? '관제탑 미가동 — 종료 불가'
        : data.protected
          ? '보호 세션 — 관제탑에서 수동으로만'
          : data.unknown
            ? '세션을 찾지 못함 (이미 종료됐을 수 있음)'
            : (typeof body?.error === 'string' && body.error) || data.detail || '세션 종료 실패';
      setStatusOf(sessionId, { kind: 'error', text });
    } catch {
      setStatusOf(sessionId, { kind: 'error', text: '세션 종료 실패' });
    }
  };

  return (
    <div className="px-2 py-2">
      <div className="space-y-0.5">
        {rows.map(({ project, session }) => {
          const isSelected = selectedSession?.id === session.id;
          const title = session.summary || session.name || 'Session';
          const tmuxName = liveSessionNames.get(session.id);
          const primary = tmuxName ?? title;
          const age = formatAge(getSessionTime(session));
          const status = statusOf(session.id);
          return (
            <div
              key={session.id}
              className={cn(
                'rounded-md transition-colors hover:bg-muted/50',
                isSelected && 'bg-primary/5',
              )}
            >
              <div className="flex items-start">
                <button
                  type="button"
                  title={title}
                  onClick={() => onSessionSelect(session, project.projectId)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" aria-hidden />
                    <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                      LIVE
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">{primary}</span>
                  </span>
                  <span className="truncate pl-[1.375rem] text-[11px] text-muted-foreground">
                    {project.displayName}{age ? ` · ${age}` : ''}
                  </span>
                </button>
                {tmuxName && status.kind === 'idle' && (
                  <button
                    type="button"
                    title={`tmux 세션 ${tmuxName} 닫기`}
                    onClick={() => setStatusOf(session.id, { kind: 'confirming' })}
                    className="mr-1 mt-1.5 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {tmuxName && status.kind !== 'idle' && (
                <div className="px-2 pb-1.5 pl-[1.375rem]">
                  {status.kind === 'error' ? (
                    <p className="flex items-center justify-between gap-2 text-[11px] text-red-500">
                      <span className="truncate">{status.text}</span>
                      <button
                        type="button"
                        onClick={() => setStatusOf(session.id, { kind: 'idle' })}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        닫기
                      </button>
                    </p>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted-foreground">
                        {status.kind === 'killing' ? '종료 중…' : `tmux 세션 '${tmuxName}' 종료?`}
                      </span>
                      {status.kind === 'confirming' && (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void kill(session.id, tmuxName)}
                            className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-red-700"
                          >
                            종료
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatusOf(session.id, { kind: 'idle' })}
                            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            취소
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
