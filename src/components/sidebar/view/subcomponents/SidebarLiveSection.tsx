import type { Project, ProjectSession } from '../../../../types/app';
import { cn } from '../../../../lib/utils';
import { getAllSessions } from '../../utils/utils';

import type { SidebarProjectListProps } from './SidebarProjectList';

type SidebarLiveSectionProps = {
  projects: Project[];
  liveSessionIds: ReadonlySet<string>;
  selectedSession: ProjectSession | null;
  onSessionSelect: SidebarProjectListProps['onSessionSelect'];
};

/**
 * Pinned "currently live" section at the very top of the sidebar. Lists every
 * session that is live in a tmux gjc pane (from the tmux+lsof endpoint) so the
 * operator can tell live runs apart from the archive. The full archive list below
 * is left untouched (no filtering) — the archive is the app's main body.
 */
export default function SidebarLiveSection({
  projects,
  liveSessionIds,
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
    <div className="border-b border-border/60 px-2 py-2">
      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        지금 작동 중 ({rows.length})
      </div>
      <div className="space-y-0.5">
        {rows.map(({ project, session }) => {
          const isSelected = selectedSession?.id === session.id;
          const name = session.summary || session.name || 'Session';
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSessionSelect(session, project.projectId)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50',
                isSelected && 'bg-primary/5',
              )}
            >
              <span className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
              <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                LIVE
              </span>
              <span className="truncate">{name}</span>
              <span className="ml-auto shrink-0 truncate text-[11px] text-muted-foreground">
                {project.displayName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
