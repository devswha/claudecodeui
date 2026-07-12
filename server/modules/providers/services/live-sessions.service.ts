import { spawn } from 'node:child_process';
import { open, realpath, stat } from 'node:fs/promises';

/**
 * Live gjc session detection + tmux-session naming.
 *
 * A gjc session is "live" when a running gjc process has its transcript file open.
 * For the "작동 중" fleet view we also map each live session id → the tmux session
 * NAME it runs in (omg / stock / flask / …), by PROCESS LINEAGE:
 *   - lsof (-c gjc/bun/node -F pn) → {session-id uuid, holder pid} for open session
 *     files (macOS: gjc runs under its runtime wrapper, so comm is `bun`/`node` —
 *     `-c gjc` alone finds nothing there; the session-file path is the real filter)
 *   - ps -eo pid=,ppid=   → one snapshot for the holder's ancestor pid chain
 *     (portable: macOS has no /proc)
 *   - tmux list-panes     → {session_name, pane_pid, pane cwd (realpath)}
 *   - a pane_pid found in the holder's ancestor chain → that pane's tmux name (0 ambiguity)
 *   - cwd equality is a FALLBACK only (many-to-many when panes share a cwd)
 *
 * Matching is PATH-AGNOSTIC (uuid + realpath'd cwds), so production cloudcli's
 * decoy HOME (whose `.gjc` is a symlink) does not break it. tmux/lsof/ps access
 * is ISOLATED here and fails closed to [] (or tmuxName:null on a miss — the UI
 * falls back to the conversation title).
 */

const SESSIONS_SEGMENT = '.gjc/agent/sessions';
const SESSION_FILE_RE = /\.gjc\/agent\/sessions\/[^/]+\/[^/]*_([0-9a-fA-F][0-9a-fA-F-]{7,})\.jsonl\b/;
const TMUX_FIELD_SEP = '\t';

export type LiveGjcSession = {
  id: string;
  tmuxName: string | null;
  /**
   * How the tmux name was resolved: 'lineage' = the gjc process runs INSIDE
   * that tmux session (safe to kill/relay); 'cwd' = label-only directory match
   * (the pane belongs to something else — tmux actions are forbidden).
   */
  claim: 'lineage' | 'cwd' | null;
  model: string | null;
};

/** True when `tmux list-panes` reported at least one pane (a tmux server is up). */
export function tmuxHasPanes(output: string): boolean {
  return output.split(/\r?\n/).some((line) => line.trim().length > 0);
}

/** Parses `#{session_name}\t#{pane_pid}\t#{pane_current_path}` into {name, pid, cwd}. */
export function parseTmuxPanes(output: string): Array<{ name: string; pid: number; cwd: string }> {
  const panes: Array<{ name: string; pid: number; cwd: string }> = [];
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
    const cwd = raw.slice(second + 1).trim();
    if (name && Number.isFinite(pid) && cwd) {
      panes.push({ name, pid, cwd });
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
 * Pure match: live gjc sessions → tmux session name by PROCESS LINEAGE, so that
 * every pane maps to at most ONE session (ambiguity 0). A gjc process belongs to
 * exactly one pane's process tree, so a pane_pid in the holder's ancestor chain is
 * authoritative and CLAIMS that pane. cwd equality is a fallback used only for
 * sessions with no lineage hit, and only against panes not already claimed, and
 * only when exactly one such pane matches — otherwise null (the UI shows the
 * conversation title). Holder rows are merged by session id first (main + worker
 * processes), so either process reaching the pane resolves the name. Empty when
 * tmux is absent.
 */
export function computeLiveSessions(args: {
  tmuxPresent: boolean;
  panes: Array<{ name: string; pid: number; cwd: string }>;
  sessions: Array<{ id: string; pidChain: number[]; cwd: string | null }>;
}): Array<Pick<LiveGjcSession, 'id' | 'tmuxName' | 'claim'>> {
  if (!args.tmuxPresent) {
    return [];
  }
  const panePidToIndex = new Map<number, number>();
  args.panes.forEach((pane, index) => {
    if (!panePidToIndex.has(pane.pid)) {
      panePidToIndex.set(pane.pid, index);
    }
  });

  // Merge holder rows into one entry per session id (a session may have several
  // open-file holders); union their pid chains, keep the first resolved cwd.
  const merged = new Map<string, { pidChain: number[]; cwd: string | null }>();
  for (const session of args.sessions) {
    const existing = merged.get(session.id);
    if (!existing) {
      merged.set(session.id, { pidChain: [...session.pidChain], cwd: session.cwd });
    } else {
      existing.pidChain.push(...session.pidChain);
      if (!existing.cwd) {
        existing.cwd = session.cwd;
      }
    }
  }

  const claimed = new Set<number>();
  const result = new Map<string, { tmuxName: string | null; claim: 'lineage' | 'cwd' | null }>();

  // Pass 1: lineage matches claim their pane (authoritative, run for ALL sessions
  // before any cwd fallback so claims are complete).
  for (const [id, session] of merged) {
    let name: string | null = null;
    for (const pid of session.pidChain) {
      const index = panePidToIndex.get(pid);
      if (index !== undefined) {
        name = args.panes[index].name;
        claimed.add(index);
        break;
      }
    }
    result.set(id, { tmuxName: name, claim: name !== null ? 'lineage' : null });
  }

  // Pass 2: cwd fallback to an UNCLAIMED pane, only when the match is unique.
  for (const [id, session] of merged) {
    if (result.get(id)?.tmuxName !== null || !session.cwd) {
      continue;
    }
    const candidates = args.panes
      .map((pane, index) => ({ pane, index }))
      .filter(({ pane, index }) => !claimed.has(index) && pane.cwd === session.cwd);
    if (candidates.length === 1) {
      // A cwd match only LABELS the row: the gjc process is NOT inside the
      // pane, so tmux-session actions (kill/relay) must never key off it —
      // 실사고: patina의 백그라운드 gjc 행을 닫자 무관한 claude tmux가 죽음.
      result.set(id, { tmuxName: candidates[0].pane.name, claim: 'cwd' });
      claimed.add(candidates[0].index);
    }
  }

  return [...result].map(([id, entry]) => ({ id, tmuxName: entry.tmuxName, claim: entry.claim }));
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

/** Parses `ps -eo pid=,ppid=` output into a child pid → parent pid map. */
export function parsePidParents(output: string): Map<number, number> {
  const parents = new Map<number, number>();
  for (const raw of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(raw);
    if (match) {
      parents.set(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
    }
  }
  return parents;
}

/** Walks the ancestor pid chain [pid, ppid, …] toward init (depth/cycle guarded). */
export function buildPidChain(pid: number, parents: ReadonlyMap<number, number>): number[] {
  const chain: number[] = [];
  const seen = new Set<number>();
  let cur = pid;
  for (let i = 0; i < 64 && cur > 1 && !seen.has(cur); i += 1) {
    chain.push(cur);
    seen.add(cur);
    const parent = parents.get(cur);
    if (parent == null) {
      break;
    }
    cur = parent;
  }
  return chain;
}

/** Maps pid → cwd from `lsof -a -p <pids> -d cwd -F pn` output (first path wins). */
export function parseCwdByPidFromLsof(output: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid: number | null = null;
  for (const raw of output.split(/\r?\n/)) {
    if (raw.startsWith('p')) {
      const parsed = Number.parseInt(raw.slice(1), 10);
      pid = Number.isFinite(parsed) ? parsed : null;
    } else if (raw.startsWith('n') && pid != null && !cwds.has(pid)) {
      cwds.set(pid, raw.slice(1));
    }
  }
  return cwds;
}

/** Maps session id → transcript path from lsof `n` lines (first path wins). */
export function extractSessionPathsFromLsof(output: string): Map<string, string> {
  const paths = new Map<string, string>();
  for (const raw of output.split(/\r?\n/)) {
    if (!raw.startsWith('n') || !raw.includes(SESSIONS_SEGMENT)) {
      continue;
    }
    const match = SESSION_FILE_RE.exec(raw);
    if (match && !paths.has(match[1])) {
      paths.set(match[1], raw.slice(1));
    }
  }
  return paths;
}

/** Last `model_change` model in a transcript tail (NDJSON lines, scanned backwards). */
export function parseLastModelChange(tailText: string): string | null {
  const lines = tailText.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes('"model_change"')) {
      continue;
    }
    try {
      const entry = JSON.parse(lines[i]) as { type?: unknown; model?: unknown };
      if (entry.type === 'model_change' && typeof entry.model === 'string' && entry.model) {
        return entry.model;
      }
    } catch {
      // partial first line of the tail window — keep scanning
    }
  }
  return null;
}

const MODEL_SCAN_WINDOW_BYTES = 512 * 1024;
const MODEL_SCAN_OVERLAP_BYTES = 2 * 1024;

/**
 * Per-transcript incremental model cache. A session's model_change usually sits
 * near the START of a (potentially huge, append-only) transcript, so a fixed
 * tail read misses it. First sight does a windowed BACKWARD scan (with a small
 * overlap so a line split across windows is still seen); afterwards only the
 * appended delta is read per poll. A shrunken/rotated file triggers a rescan.
 */
const modelCache = new Map<string, { scannedTo: number; model: string | null }>();

async function readRange(path: string, start: number, end: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(end - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer;
  } finally {
    await handle.close();
  }
}

/** Reads the session's current model from the transcript. null on any failure. */
async function readLastModelFromFile(path: string): Promise<string | null> {
  try {
    const { size } = await stat(path);
    const cached = modelCache.get(path);
    if (cached && size >= cached.scannedTo) {
      if (size === cached.scannedTo) {
        return cached.model;
      }
      // Only the appended delta. Parse up to the last COMPLETE line so a
      // mid-write entry is re-read next poll instead of being lost.
      const delta = await readRange(path, cached.scannedTo, size);
      const lastNewline = delta.lastIndexOf(0x0a);
      if (lastNewline < 0) {
        return cached.model;
      }
      const found = parseLastModelChange(delta.subarray(0, lastNewline + 1).toString('utf8'));
      const next = { scannedTo: cached.scannedTo + lastNewline + 1, model: found ?? cached.model };
      modelCache.set(path, next);
      return next.model;
    }

    // Cold scan: parse only up to the last COMPLETE line, and remember that
    // boundary — otherwise a model_change being written mid-scan would land in
    // the skipped partial tail and never be re-read (리뷰 지적 반영).
    let parseEnd = size;
    if (size > 0) {
      const tail = await readRange(path, Math.max(0, size - MODEL_SCAN_WINDOW_BYTES), size);
      const lastNewline = tail.lastIndexOf(0x0a);
      parseEnd = lastNewline < 0 ? 0 : Math.max(0, size - tail.length) + lastNewline + 1;
    }
    let model: string | null = null;
    let end = parseEnd;
    while (end > 0 && model === null) {
      const start = Math.max(0, end - MODEL_SCAN_WINDOW_BYTES);
      model = parseLastModelChange((await readRange(path, start, end)).toString('utf8'));
      end = start === 0 ? 0 : start + MODEL_SCAN_OVERLAP_BYTES;
    }
    modelCache.set(path, { scannedTo: parseEnd, model });
    return model;
  } catch {
    return null;
  }
}

/**
 * Returns live gjc sessions with their tmux session name. Empty on any failure
 * (no tmux/lsof, spawn error) — tmux/lsof/ps dependence is confined here.
 */
export async function getLiveGjcSessions(): Promise<LiveGjcSession[]> {
  let tmuxOutput: string;
  try {
    tmuxOutput = await runCommand('tmux', ['list-panes', '-a', '-F', `#{session_name}${TMUX_FIELD_SEP}#{pane_pid}${TMUX_FIELD_SEP}#{pane_current_path}`]);
  } catch {
    return [];
  }
  if (!tmuxHasPanes(tmuxOutput)) {
    return [];
  }
  const panes: Array<{ name: string; pid: number; cwd: string }> = [];
  for (const pane of parseTmuxPanes(tmuxOutput)) {
    panes.push({ name: pane.name, pid: pane.pid, cwd: (await safeRealpath(pane.cwd)) ?? pane.cwd });
  }

  let lsofOutput: string;
  try {
    // -c matches the process COMM: a Linux gjc binary is `gjc`, but a script
    // install runs under its runtime (macOS 실측: comm은 `bun`) — cover both.
    // SESSION_FILE_RE below is the authoritative filter; -c only bounds cost.
    lsofOutput = await runCommand('lsof', ['-c', 'gjc', '-c', 'bun', '-c', 'node', '-F', 'pn']);
  } catch {
    return [];
  }
  const holders = parseLsofPidSessions(lsofOutput);

  // One ps snapshot for ancestor chains — /proc/<pid>/stat does not exist on
  // macOS. Best-effort: an empty map only disables lineage, cwd fallback stays.
  let parents: Map<number, number> = new Map();
  try {
    parents = parsePidParents(await runCommand('ps', ['-eo', 'pid=,ppid=']));
  } catch {
    // fall through with an empty map
  }

  // Holder cwds for the label-only fallback — /proc/<pid>/cwd does not exist on
  // macOS; one batched lsof -d cwd works on both platforms. Best-effort too.
  let cwdByPid = new Map<number, string>();
  const holderPids = [...new Set(holders.map((holder) => holder.pid))];
  if (holderPids.length > 0) {
    try {
      cwdByPid = parseCwdByPidFromLsof(
        await runCommand('lsof', ['-a', '-p', holderPids.join(','), '-d', 'cwd', '-F', 'pn']),
      );
    } catch {
      // fall through with an empty map
    }
  }

  const sessions: Array<{ id: string; pidChain: number[]; cwd: string | null }> = [];
  for (const { id, pid } of holders) {
    const rawCwd = cwdByPid.get(pid);
    sessions.push({
      id,
      pidChain: buildPidChain(pid, parents),
      cwd: rawCwd ? await safeRealpath(rawCwd) : null,
    });
  }

  const sessionPaths = extractSessionPathsFromLsof(lsofOutput);
  const named = computeLiveSessions({ tmuxPresent: true, panes, sessions });
  // Enrich with the current model (last model_change in the transcript tail).
  return Promise.all(
    named.map(async (session) => {
      const path = sessionPaths.get(session.id);
      return { ...session, model: path ? await readLastModelFromFile(path) : null };
    }),
  );
}

/** Backward-compatible id-only view. */
export async function getLiveGjcSessionIds(): Promise<string[]> {
  return (await getLiveGjcSessions()).map((session) => session.id);
}
