import { spawn } from 'node:child_process';

/**
 * External CLI (claude / codex) tmux-session detection — the Termius-style lane.
 *
 * The gjc fleet has its own richer pipeline (live-sessions.service.ts: lsof +
 * transcript files). External CLIs get a deliberately simpler, screen-level view:
 * we only need "which tmux SESSION runs claude or codex" so the UI can offer a
 * terminal attach. Detection is by PROCESS SUBTREE per pane:
 *   - tmux list-panes -a → {session_name, pane_pid, pane_current_command}
 *   - ps -eo pid,ppid,comm → children map → BFS from pane_pid → descendant comms
 *   - any 'gjc' in the subtree → the session belongs to the gjc live lane → SKIP
 *   - else 'claude' (pane cmd or descendant comm) → kind 'claude'
 *   - else 'codex' descendant comm → kind 'codex' (codex panes surface as 'node')
 *
 * Grouped per tmux session name (a session with several panes is one row).
 * tmux/ps access is ISOLATED here and fails closed to [].
 */

const TMUX_FIELD_SEP = '\t';

export type ExternalCliKind = 'claude' | 'codex' | 'ssh';
export type ExternalCliSession = { tmuxName: string; kind: ExternalCliKind };

/** Matches the tower/live-send tmux-name discipline; also safe to embed in a shell command. */
export const EXTERNAL_TMUX_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * macOS `ps -eo comm` prints the executable's FULL PATH (e.g.
 * /Applications/ChatGPT.app/Contents/Resources/codex) while Linux prints the
 * bare name — classification compares bare names, so normalize to basename.
 */
function commBasename(comm: string): string {
  const slash = comm.lastIndexOf('/');
  return slash < 0 ? comm : comm.slice(slash + 1);
}

/** Parses `#{session_name}\t#{pane_pid}\t#{pane_current_command}` lines. */
export function parseExternalPanes(output: string): Array<{ name: string; pid: number; command: string }> {
  const panes: Array<{ name: string; pid: number; command: string }> = [];
  for (const raw of output.split(/\r?\n/)) {
    if (!raw.trim()) {
      continue;
    }
    const first = raw.indexOf(TMUX_FIELD_SEP);
    const second = raw.indexOf(TMUX_FIELD_SEP, first + 1);
    if (first < 0 || second < 0) {
      continue;
    }
    const name = raw.slice(0, first).trim();
    const pid = Number.parseInt(raw.slice(first + 1, second).trim(), 10);
    const command = commBasename(raw.slice(second + 1).trim());
    if (name && Number.isFinite(pid)) {
      panes.push({ name, pid, command });
    }
  }
  return panes;
}

/** Parses `ps -eo pid,ppid,comm` into {pid, ppid, comm} rows (header tolerated, comm → basename). */
export function parsePsTree(output: string): Array<{ pid: number; ppid: number; comm: string }> {
  const rows: Array<{ pid: number; ppid: number; comm: string }> = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const match = /^(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!match) {
      continue; // header or malformed line
    }
    rows.push({ pid: Number.parseInt(match[1], 10), ppid: Number.parseInt(match[2], 10), comm: commBasename(match[3].trim()) });
  }
  return rows;
}

/**
 * Pids whose COMMAND LINE identifies gjc, from `ps -eo pid=,args=` output.
 * comm alone cannot see script installs — macOS 실측: gjc runs as
 * `bun /…/.bun/bin/gjc`, so comm is `bun`. A pid counts only when argv[0]'s
 * basename is `gjc`, or argv[0] is bun/node and its first argument's basename
 * is `gjc`/`gjc.js`. Later command-line tokens are never evidence.
 */
function hasGjcArgvEvidence(commandLine: string): boolean {
  const firstSpace = commandLine.search(/\s/);
  const argv0 = firstSpace < 0 ? commandLine : commandLine.slice(0, firstSpace);
  const basename = (value: string) => value.slice(value.lastIndexOf('/') + 1);

  if (basename(argv0) === 'gjc' || /^\/.*\/gjc(?=\s|$)/.test(commandLine)) {
    return true;
  }

  let runtime = basename(argv0);
  let firstArgument = firstSpace < 0 ? '' : commandLine.slice(firstSpace).trimStart();
  if (runtime !== 'bun' && runtime !== 'node') {
    // `ps args` flattens paths with spaces. Keep the runtime at argv[0] by
    // accepting only a command line that starts with its absolute path.
    const spacedRuntime = /^(\/.*\/(bun|node))\s+(.+)$/.exec(commandLine);
    if (!spacedRuntime) {
      return false;
    }
    runtime = spacedRuntime[2];
    firstArgument = spacedRuntime[3];
  }

  if ((runtime !== 'bun' && runtime !== 'node') || firstArgument.startsWith('-')) {
    return false;
  }

  const firstToken = firstArgument.split(/\s+/, 1)[0];
  if (basename(firstToken) === 'gjc' || basename(firstToken) === 'gjc.js') {
    return true;
  }

  // macOS `ps args` removes argv boundaries from space-containing path names.
  // This remains anchored immediately after the bun/node executable.
  return firstArgument.startsWith('/') && /^\/.*\/gjc(?:\.js)?(?=\s|$)/.test(firstArgument);
}

/** Pids with gjc argv evidence from `ps -eo pid=,args=` (TWO-column) output. */
export function parseGjcPidsFromPsArgs(output: string): Set<number> {
  const pids = new Set<number>();
  for (const raw of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(raw);
    if (match && hasGjcArgvEvidence(match[2].trim())) {
      pids.add(Number.parseInt(match[1], 10));
    }
  }
  return pids;
}

/**
 * Same evidence over already-parsed process records (pid + full command line).
 * Use this with the shared `ps -eo pid=,ppid=,args=` snapshot — feeding that
 * THREE-column raw output into `parseGjcPidsFromPsArgs` silently treats the
 * ppid as argv[0] and finds nothing (실사고: 감지 전멸 회귀).
 */
export function gjcPidsFromProcessRecords(
  records: ReadonlyArray<{ pid: number; args: string }>,
): Set<number> {
  const pids = new Set<number>();
  for (const record of records) {
    if (hasGjcArgvEvidence(record.args.trim())) {
      pids.add(record.pid);
    }
  }
  return pids;
}

/**
 * Pure classification: tmux panes + a ps snapshot → external CLI sessions.
 *
 * Per pane, the comm set is {pane_current_command} ∪ {comm of every /proc
 * descendant of pane_pid} (depth/cycle guarded). Per tmux session (union of its
 * panes): 'gjc' anywhere → excluded (that session is the gjc live lane's —
 * never touched here); else the kind is the first match of claude → codex →
 * ssh ('ssh' = a remote tunnel whose far-side CLI is locally unprovable —
 * attach-only). Sessions with none of the three are dropped (plain shells).
 * Names failing EXTERNAL_TMUX_NAME_RE are dropped (they could not be attached
 * safely). Output is sorted by name for stability.
 */
export function classifyExternalSessions(args: {
  panes: Array<{ name: string; pid: number; command: string }>;
  procs: Array<{ pid: number; ppid: number; comm: string }>;
  /** Pids proven gjc by argv (script installs whose comm is the runtime). */
  gjcPids?: ReadonlySet<number>;
}): ExternalCliSession[] {
  const children = new Map<number, number[]>();
  for (const proc of args.procs) {
    const siblings = children.get(proc.ppid);
    if (siblings) {
      siblings.push(proc.pid);
    } else {
      children.set(proc.ppid, [proc.pid]);
    }
  }

  /**
   * gjc evidence beyond comm: script installs run under their runtime (macOS
   * 실측: comm은 `bun`), so pids proven gjc by ARGV (parseGjcPidsFromPsArgs)
   * inject a synthetic 'gjc' comm — the exclusion contract stays comm-based.
   */
  const gjcPids = args.gjcPids ?? new Set<number>();
  const commByPid = new Map<number, string>();
  for (const proc of args.procs) {
    commByPid.set(proc.pid, proc.comm);
  }

  const subtreeComms = (rootPid: number): Set<string> => {
    const comms = new Set<string>();
    const seen = new Set<number>();
    const queue: number[] = [rootPid];
    while (queue.length > 0 && seen.size < 4096) {
      const pid = queue.shift()!;
      if (seen.has(pid)) {
        continue;
      }
      seen.add(pid);
      const comm = commByPid.get(pid);
      if (comm) {
        comms.add(comm);
      }
      if (gjcPids.has(pid)) {
        comms.add('gjc');
      }
      for (const child of children.get(pid) ?? []) {
        queue.push(child);
      }
    }
    return comms;
  };

  // Union comm sets per tmux session name.
  const commsBySession = new Map<string, Set<string>>();
  for (const pane of args.panes) {
    let comms = commsBySession.get(pane.name);
    if (!comms) {
      comms = new Set<string>();
      commsBySession.set(pane.name, comms);
    }
    if (pane.command) {
      comms.add(pane.command);
    }
    for (const comm of subtreeComms(pane.pid)) {
      comms.add(comm);
    }
  }

  const result: ExternalCliSession[] = [];
  for (const [name, comms] of commsBySession) {
    if (!EXTERNAL_TMUX_NAME_RE.test(name)) {
      continue;
    }
    if (comms.has('gjc')) {
      continue; // gjc live lane — out of scope by contract
    }
    if (comms.has('claude')) {
      result.push({ tmuxName: name, kind: 'claude' });
    } else if (comms.has('codex')) {
      result.push({ tmuxName: name, kind: 'codex' });
    } else if (comms.has('ssh')) {
      // Remote lane: the pane tunnels into another machine, so the CLI running
      // there is invisible to local ps by definition (실측: company → ssh →
      // 원격 claude). Attach-only is still safe and useful — surface it as
      // 'ssh' instead of silently hiding the session (하코 요청).
      result.push({ tmuxName: name, kind: 'ssh' });
    }
  }
  return result.sort((a, b) => a.tmuxName.localeCompare(b.tmuxName));
}

function runCommand(command: string, cmdArgs: string[], timeoutMs = 4000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, cmdArgs, {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      // Service managers ship no locale; non-UTF-8 tmux output sanitizes \t
      // separators to `_` (see live-sessions.service.ts). Force UTF-8.
      env: { ...process.env, LANG: process.env.LANG || 'en_US.UTF-8' },
    });
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

/**
 * Returns external CLI (claude/codex) tmux sessions. Empty on any failure
 * (no tmux, ps error) — tmux/ps dependence is confined here.
 */
export async function getExternalCliSessions(): Promise<ExternalCliSession[]> {
  let tmuxOutput: string;
  let psOutput: string;
  let psArgsOutput: string;
  try {
    tmuxOutput = await runCommand('tmux', ['list-panes', '-a', '-F', `#{session_name}${TMUX_FIELD_SEP}#{pane_pid}${TMUX_FIELD_SEP}#{pane_current_command}`]);
    psOutput = await runCommand('ps', ['-eo', 'pid,ppid,comm']);
    psArgsOutput = await runCommand('ps', ['-eo', 'pid=,args=']);
  } catch {
    return [];
  }
  return classifyExternalSessions({
    panes: parseExternalPanes(tmuxOutput),
    procs: parsePsTree(psOutput),
    gjcPids: parseGjcPidsFromPsArgs(psArgsOutput),
  });
}
