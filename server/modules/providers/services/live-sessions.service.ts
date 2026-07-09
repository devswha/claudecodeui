import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';

/**
 * Live gjc session detection + tmux-session naming.
 *
 * A gjc session is "live" when a running gjc process has its transcript file open.
 * For the "작동 중" fleet view we also map each live session id → the tmux session
 * NAME it runs in (omg / stock / flask / …), via cwd:
 *   - lsof (-c gjc -F pn) → {session-id uuid, holder pid} for open session files
 *   - /proc/<pid>/cwd     → the gjc process's working dir (realpath)
 *   - tmux list-panes     → {session_name, pane cwd (realpath)}
 *   - match holder cwd to a pane cwd → the tmux session name
 *
 * Matching is PATH-AGNOSTIC (uuid + realpath'd cwds), so production cloudcli's
 * decoy HOME (whose `.gjc` is a symlink) does not break it. tmux/lsof/proc access
 * is ISOLATED here and fails closed to [] (or tmuxName:null on a miss — the UI
 * falls back to the conversation title).
 */

const SESSIONS_SEGMENT = '.gjc/agent/sessions';
const SESSION_FILE_RE = /\.gjc\/agent\/sessions\/[^/]+\/[^/]*_([0-9a-fA-F][0-9a-fA-F-]{7,})\.jsonl\b/;
const TMUX_FIELD_SEP = '\t';

export type LiveGjcSession = { id: string; tmuxName: string | null };

/** True when `tmux list-panes` reported at least one pane (a tmux server is up). */
export function tmuxHasPanes(output: string): boolean {
  return output.split(/\r?\n/).some((line) => line.trim().length > 0);
}

/** Parses `#{session_name}\t#{pane_current_path}` lines into {name, cwd}. */
export function parseTmuxPanes(output: string): Array<{ name: string; cwd: string }> {
  const panes: Array<{ name: string; cwd: string }> = [];
  for (const raw of output.split(/\r?\n/)) {
    if (!raw.trim()) {
      continue;
    }
    const sep = raw.indexOf(TMUX_FIELD_SEP);
    if (sep < 0) {
      continue;
    }
    const name = raw.slice(0, sep).trim();
    const cwd = raw.slice(sep + 1).trim();
    if (name && cwd) {
      panes.push({ name, cwd });
    }
  }
  return panes;
}

/** Parses `lsof -F pn` output into {session-id, holder pid} pairs (path-agnostic). */
export function parseLsofPidSessions(output: string): Array<{ id: string; pid: number }> {
  const out: Array<{ id: string; pid: number }> = [];
  const seen = new Set<string>();
  let pid: number | null = null;
  for (const raw of output.split(/\r?\n/)) {
    if (raw.startsWith('p')) {
      const parsed = Number.parseInt(raw.slice(1), 10);
      pid = Number.isFinite(parsed) ? parsed : null;
      continue;
    }
    if (raw.startsWith('n') && raw.includes(SESSIONS_SEGMENT) && pid != null) {
      const match = SESSION_FILE_RE.exec(raw);
      if (match) {
        const key = `${pid}:${match[1]}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ id: match[1], pid });
        }
      }
    }
  }
  return out;
}

/**
 * Pure match: live sessions (with resolved cwd) → tmux session name. Deduped by
 * session id, preferring a named match. tmuxName is null when no pane cwd matches
 * (or tmux is absent → empty list). Unit-testable without spawning.
 */
export function computeLiveSessions(args: {
  tmuxPresent: boolean;
  panes: Array<{ name: string; cwd: string }>;
  sessions: Array<{ id: string; cwd: string | null }>;
}): LiveGjcSession[] {
  if (!args.tmuxPresent) {
    return [];
  }
  const nameByCwd = new Map<string, string>();
  for (const pane of args.panes) {
    if (!nameByCwd.has(pane.cwd)) {
      nameByCwd.set(pane.cwd, pane.name);
    }
  }
  const byId = new Map<string, string | null>();
  for (const session of args.sessions) {
    const name = session.cwd ? nameByCwd.get(session.cwd) ?? null : null;
    const existing = byId.get(session.id);
    if (existing === undefined || (existing === null && name !== null)) {
      byId.set(session.id, name);
    }
  }
  return [...byId].map(([id, tmuxName]) => ({ id, tmuxName }));
}

function runCommand(command: string, cmdArgs: string[], timeoutMs = 4000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, cmdArgs, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let stdout = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`${command} timed out`));
      }
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.on('error', (error) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(error); }
    });
    child.on('close', () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(stdout); }
    });
  });
}

async function safeRealpath(target: string): Promise<string | null> {
  try {
    return await realpath(target);
  } catch {
    return null;
  }
}

/**
 * Returns live gjc sessions with their tmux session name. Empty on any failure
 * (no tmux/lsof, spawn error) — tmux/lsof/proc dependence is confined here.
 */
export async function getLiveGjcSessions(): Promise<LiveGjcSession[]> {
  let tmuxOutput: string;
  try {
    tmuxOutput = await runCommand('tmux', ['list-panes', '-a', '-F', `#{session_name}${TMUX_FIELD_SEP}#{pane_current_path}`]);
  } catch {
    return [];
  }
  if (!tmuxHasPanes(tmuxOutput)) {
    return [];
  }
  const panes: Array<{ name: string; cwd: string }> = [];
  for (const pane of parseTmuxPanes(tmuxOutput)) {
    panes.push({ name: pane.name, cwd: (await safeRealpath(pane.cwd)) ?? pane.cwd });
  }

  let lsofOutput: string;
  try {
    lsofOutput = await runCommand('lsof', ['-c', 'gjc', '-F', 'pn']);
  } catch {
    return [];
  }
  const sessions: Array<{ id: string; cwd: string | null }> = [];
  for (const { id, pid } of parseLsofPidSessions(lsofOutput)) {
    sessions.push({ id, cwd: await safeRealpath(`/proc/${pid}/cwd`) });
  }

  return computeLiveSessions({ tmuxPresent: true, panes, sessions });
}

/** Backward-compatible id-only view. */
export async function getLiveGjcSessionIds(): Promise<string[]> {
  return (await getLiveGjcSessions()).map((session) => session.id);
}
