import { useEffect, useState } from 'react';
import { SquareTerminal } from 'lucide-react';

import type { Project } from '../../../../types/app';
import { api } from '../../../../utils/api';

import TerminalAttachModal from './TerminalAttachModal';

type ExternalCliSession = { tmuxName: string; kind: 'claude' | 'codex' };

type SidebarExternalSectionProps = {
  projects: Project[];
};

const POLL_INTERVAL_MS = 10000;

const KIND_LABEL: Record<ExternalCliSession['kind'], string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
};

const KIND_DOT: Record<ExternalCliSession['kind'], string> = {
  claude: 'bg-orange-500',
  codex: 'bg-emerald-500',
};

/**
 * "외부 CLI" subsection of the 작동 중 tab: claude/codex tmux sessions, each
 * openable as a live terminal (Termius-style attach via TerminalAttachModal).
 *
 * Fully self-contained (own 10s poll of /sessions/external) so the gjc live
 * lane — SidebarLiveSection, useProjectsState's live poll — is untouched.
 * gjc sessions are excluded server-side. Renders nothing when nothing matches.
 */
export default function SidebarExternalSection({ projects }: SidebarExternalSectionProps) {
  const [sessions, setSessions] = useState<ExternalCliSession[]>([]);
  const [attached, setAttached] = useState<ExternalCliSession | null>(null);

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
        // best-effort — no tmux / endpoint error just hides the section
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Shell needs a real project only for the PTY cwd; attach ignores the cwd.
  const shellProject = projects[0] ?? null;

  if (sessions.length === 0 || !shellProject) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 px-3 pb-1 text-xs font-semibold text-foreground">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        외부 CLI ({sessions.length})
      </div>
      <div className="space-y-0.5 px-1.5">
        {sessions.map((session) => (
          <button
            key={session.tmuxName}
            type="button"
            onClick={() => setAttached(session)}
            title={`tmux 세션 '${session.tmuxName}' 터미널로 보기`}
            className="flex w-full items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[session.kind]}`} aria-hidden />
                <span className="truncate text-sm font-medium text-foreground">{session.tmuxName}</span>
              </span>
              <span className="truncate pl-[1.375rem] text-[11px] text-muted-foreground">{KIND_LABEL[session.kind]}</span>
            </span>
            <SquareTerminal className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
          </button>
        ))}
      </div>
      <TerminalAttachModal
        isOpen={attached !== null}
        tmuxName={attached?.tmuxName ?? null}
        kind={attached ? KIND_LABEL[attached.kind] : null}
        project={shellProject}
        onClose={() => setAttached(null)}
      />
    </div>
  );
}
