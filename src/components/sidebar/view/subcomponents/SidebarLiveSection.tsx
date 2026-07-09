import type { Project, ProjectSession } from '../../../../types/app';
import { cn } from '../../../../lib/utils';
import { getAllSessions, getSessionTime } from '../../utils/utils';

import type { SidebarProjectListProps } from './SidebarProjectList';

type SidebarLiveSectionProps = {
  projects: Project[];
  liveSessionIds: ReadonlySet<string>;
  liveSessionNames: ReadonlyMap<string, string>;
  selectedSession: ProjectSession | null;
  onSessionSelect: SidebarProjectListProps['onSessionSelect'];
};

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
 */
export default function SidebarLiveSection({
  projects,
  liveSessionIds,
  liveSessionNames,
  selectedSession,
  onSessionSelect,
}: SidebarLiveSectionProps) {
  if (liveSessionIds.size === 0) {
    return null;
  }

  const rows = projects.flatMap((project) =>
    getAllSessions(project)
      .filter((session) => liveSessionIds.has(session.id))
      .map((session) => ({ project, session })),
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="px-2 py-2">
      <div className="space-y-0.5">
        {rows.map(({ project, session }) => {
          const isSelected = selectedSession?.id === session.id;
          const title = session.summary || session.name || 'Session';
          const primary = liveSessionNames.get(session.id) ?? title;
          const age = formatAge(getSessionTime(session));
          return (
            <button
              key={session.id}
              type="button"
              title={title}
              onClick={() => onSessionSelect(session, project.projectId)}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50',
                isSelected && 'bg-primary/5',
              )}
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
          );
        })}
      </div>
    </div>
  );
}
