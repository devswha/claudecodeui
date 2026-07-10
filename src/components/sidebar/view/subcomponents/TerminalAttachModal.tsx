import { Plus, Terminal } from 'lucide-react';

import type { Project } from '../../../../types/app';
import Shell from '../../../shell/view/Shell';

type TerminalAttachModalProps = {
  isOpen: boolean;
  tmuxName: string | null;
  kind: string | null;
  project: Project | null;
  onClose: () => void;
};

/** Names the server already validated; re-checked here before shell-embedding. */
const SAFE_TMUX_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Termius-style terminal view onto an external CLI (claude/codex) tmux session.
 *
 * Reuses the existing Shell (xterm.js ↔ node-pty websocket) in plain-shell mode
 * with `tmux attach-session -t =<name>` (`=` forces exact-name match). Detaching
 * (prefix+d) or the session ending exits the attach process and closes the modal.
 * The gjc live lane is untouched — gjc sessions never reach this modal.
 */
export default function TerminalAttachModal({ isOpen, tmuxName, kind, project, onClose }: TerminalAttachModalProps) {
  if (!isOpen || !tmuxName || !project || !SAFE_TMUX_NAME_RE.test(tmuxName)) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 backdrop-blur-sm">
      <div className="flex h-[600px] w-full max-w-4xl flex-col rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <Terminal className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">tmux: {tmuxName}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {kind ?? 'cli'} 세션 실시간 터미널 · 분리(detach)는 Ctrl+B → D
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            title="Close"
          >
            <Plus className="h-5 w-5 rotate-45" />
          </button>
        </div>

        <div className="flex-1 p-4">
          <div className="h-full overflow-hidden rounded-lg bg-black">
            <Shell
              selectedProject={project}
              selectedSession={null}
              initialCommand={`tmux attach-session -t '=${tmuxName}'`}
              isPlainShell
              isActive
              onProcessComplete={() => onClose()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
