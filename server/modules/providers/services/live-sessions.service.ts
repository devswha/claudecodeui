import { spawn } from 'node:child_process';
import { open, readFile, realpath, stat } from 'node:fs/promises';

import { parsePsTree } from './external-cli-sessions.service.js';

/**
 * Live gjc session detection + tmux-session naming.
 *
 * A gjc session is "live" when a running gjc process has its transcript file open.
 * For the "작동 중" fleet view we also map each live session id → the tmux session
 * NAME it runs in (omg / stock / flask / …), by PROCESS LINEAGE:
 *   - lsof (-c gjc -F pn) → {session-id uuid, holder pid} for open session files
 *   - /proc/<pid>/stat    → the holder's ancestor pid chain
 *   - tmux list-panes     → {session_name, pane_pid, pane cwd (realpath)}
 *   - a pane_pid found in the holder's ancestor chain → that pane's tmux name (0 ambiguity)
 *   - cwd equality is a FALLBACK only (many-to-many when panes share a cwd)
 *
 * Matching is PATH-AGNOSTIC (uuid + realpath'd cwds), so production cloudcli's
 * decoy HOME (whose `.gjc` is a symlink) does not break it. tmux/lsof/proc access
 * is ISOLATED here and fails closed to [] (or tmuxName:null on a miss — the UI
 * falls back to the conversation title).
 *
 * gjc creates the transcript only at the FIRST user message, so a freshly booted
 * (or long-idle-restarted) gjc TUI is invisible to the lsof pipeline until the
 * user talks once (하코 관찰: 재시작 직후 tmux 세션이 전부 안 보임). Those panes
 * are detected separately by PROCESS SUBTREE (same evidence grade as a lineage
 * claim) and surfaced as synthetic `idle-gjc:<tmux name>` rows.
 */

const SESSIONS_SEGMENT = '.gjc/agent/sessions';
const SESSION_FILE_RE = /\.gjc\/agent\/sessions\/[^/]+\/[^/]*_([0-9a-fA-F][0-9a-fA-F-]{7,})\.jsonl\b/;
const TMUX_FIELD_SEP = '\t';

export type LiveGjcSession = {
  id: string;
  tmuxName: string | null;
  /**
   * tmux server-unique session id (`$N`) of the pane backing this row — a
   * GENERATION token: tmux never reuses `$N` within one server lifetime, so a
   * kill/send request carrying it cannot hit a same-named replacement session
   * created after the client's snapshot (이름 재사용 race 차단).
   */
  tmuxId: string | null;
  /**
   * How the tmux name was resolved: 'lineage' = the gjc process runs INSIDE
   * that tmux session (safe to kill/relay); 'cwd' = label-only directory match
   * (the pane belongs to something else — tmux actions are forbidden).
   */
  claim: 'lineage' | 'cwd' | null;
  model: string | null;
};

/** Synthetic id prefix for gjc panes that opened no transcript yet (first message pending). */
export const IDLE_GJC_ID_PREFIX = 'idle-gjc:';

// Matches live-send/tower tmux-name discipline; unsafe names get no synthetic row
// (they could not be killed/relayed anyway).
const IDLE_TMUX_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Pure detection: tmux sessions whose pane process subtree contains a gjc
 * process but that NO transcript-holding live session claimed. Subtree
 * membership (pane pid → descendants via the ps snapshot) is the same evidence
 * a lineage claim rests on, so tmux actions (kill/relay) remain safe for these
 * rows. Exclusion is LINEAGE names only: a 'cwd' label is weaker evidence than
 * the subtree proof, so it must not hide a real idle gjc pane (리뷰 반영 —
 * 같은 이름의 cwd 라벨 행과 idle 행이 공존할 수 있고 그게 더 정직하다).
 * Sorted by name for stable rendering; dedupe keeps the first pane's sid.
 */
export function findIdleGjcTmuxSessions(args: {
  panes: Array<{ name: string; sid: string; pid: number }>;
  procs: Array<{ pid: number; ppid: number; comm: string }>;
  excludedNames: ReadonlySet<string>;
}): Array<{ name: string; sid: string }> {
  const children = new Map<number, number[]>();
  const commByPid = new Map<number, string>();
  for (const proc of args.procs) {
    const siblings = children.get(proc.ppid);
    if (siblings) {
      siblings.push(proc.pid);
    } else {
      children.set(proc.ppid, [proc.pid]);
    }
    commByPid.set(proc.pid, proc.comm);
  }

  const subtreeHasGjc = (rootPid: number): boolean => {
    const seen = new Set<number>();
    const queue: number[] = [rootPid];
    while (queue.length > 0 && seen.size < 4096) {
      const pid = queue.shift()!;
      if (seen.has(pid)) {
        continue;
      }
      seen.add(pid);
      if (commByPid.get(pid) === 'gjc') {
        return true;
      }
      for (const child of children.get(pid) ?? []) {
        queue.push(child);
      }
    }
    return false;
  };

  const idle = new Map<string, string>();
  for (const pane of args.panes) {
    if (idle.has(pane.name) || args.excludedNames.has(pane.name) || !IDLE_TMUX_NAME_RE.test(pane.name)) {
      continue;
    }
    if (subtreeHasGjc(pane.pid)) {
      idle.set(pane.name, pane.sid);
    }
  }
  return [...idle]
    .map(([name, sid]) => ({ name, sid }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** True when `tmux list-panes` reported at least one pane (a tmux server is up). */
export function tmuxHasPanes(output: string): boolean {
  return output.split(/\r?\n/).some((line) => line.trim().length > 0);
}

/** Parses `#{session_name}\t#{session_id}\t#{pane_pid}\t#{pane_current_path}` into {name, sid, pid, cwd}. */
export function parseTmuxPanes(output: string): Array<{ name: string; sid: string; pid: number; cwd: string }> {
  const panes: Array<{ name: string; sid: string; pid: number; cwd: string }> = [];
  for (const raw of output.split(/\r?\n/)) {
    if (!raw.trim()) {
      continue;
    }
    const first = raw.indexOf(TMUX_FIELD_SEP);
    const second = raw.indexOf(TMUX_FIELD_SEP, first + 1);
    const third = raw.indexOf(TMUX_FIELD_SEP, second + 1);
    if (first < 0 || second < 0 || third < 0) {
      continue;
    }
    const name = raw.slice(0, first).trim();
    const sid = raw.slice(first + 1, second).trim();
    const pid = Number.parseInt(raw.slice(second + 1, third).trim(), 10);
    const cwd = raw.slice(third + 1).trim();
    // tmux session ids are `$<number>` — anything else means a format drift we
    // must not feed into the generation-token contract.
    if (name && /^\$\d+$/.test(sid) && Number.isFinite(pid) && cwd) {
      panes.push({ name, sid, pid, cwd });
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
 *
 * NOTE (리뷰 판단 기록): 여러 transcript가 같은 pane lineage로 잡히는 경우
 * (main+worker, 서브에이전트 세션)는 실재하는 정상 구성이라 모두 lineage를
 * 부여한다 — 그 pane을 죽이면 실제로 전부 죽는 것이 사실이므로.
 */
export function computeLiveSessions(args: {
  tmuxPresent: boolean;
  panes: Array<{ name: string; sid: string; pid: number; cwd: string }>;
  sessions: Array<{ id: string; pidChain: number[]; cwd: string | null }>;
}): Array<Pick<LiveGjcSession, 'id' | 'tmuxName' | 'tmuxId' | 'claim'>> {
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
  const result = new Map<string, { tmuxName: string | null; tmuxId: string | null; claim: 'lineage' | 'cwd' | null }>();

  // Pass 1: lineage matches claim their pane (authoritative, run for ALL sessions
  // before any cwd fallback so claims are complete).
  for (const [id, session] of merged) {
    let name: string | null = null;
    let sid: string | null = null;
    for (const pid of session.pidChain) {
      const index = panePidToIndex.get(pid);
      if (index !== undefined) {
        name = args.panes[index].name;
        sid = args.panes[index].sid;
        claimed.add(index);
        break;
      }
    }
    result.set(id, { tmuxName: name, tmuxId: sid, claim: name !== null ? 'lineage' : null });
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
      result.set(id, { tmuxName: candidates[0].pane.name, tmuxId: candidates[0].pane.sid, claim: 'cwd' });
      claimed.add(candidates[0].index);
    }
  }

  return [...result].map(([id, entry]) => ({ id, tmuxName: entry.tmuxName, tmuxId: entry.tmuxId, claim: entry.claim }));
}

// Detection subprocess output is small (pane lists / lsof field lines); a multi-
// megabyte stream means something is pathologically wrong — kill instead of
// buffering without bound (리뷰 반영: timeout 뒤에도 listener/버퍼가 남던 문제).
const RUN_COMMAND_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function runCommand(command: string, cmdArgs: string[], timeoutMs = 4000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, cmdArgs, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let stdout = '';
    let size = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        child.stdout.removeAllListeners('data');
        child.stdout.resume(); // keep draining so the child can exit
        child.kill('SIGKILL');
        reject(error);
      }
    };
    const timer = setTimeout(() => fail(new Error(`${command} timed out`)), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > RUN_COMMAND_MAX_OUTPUT_BYTES) {
        fail(new Error(`${command} output exceeded ${RUN_COMMAND_MAX_OUTPUT_BYTES} bytes`));
        return;
      }
      stdout += chunk.toString();
    });
    child.on('error', (error) => fail(error));
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

/** Reads the parent pid from /proc/<pid>/stat (comm may contain spaces/parens). */
async function readParentPid(pid: number): Promise<number | null> {
  try {
    const content = await readFile(`/proc/${pid}/stat`, 'utf8');
    const rparen = content.lastIndexOf(')');
    if (rparen < 0) {
      return null;
    }
    // After "pid (comm)" the fields are: state ppid pgrp … → index 1 is ppid.
    const fields = content.slice(rparen + 2).trim().split(/\s+/);
    const ppid = Number.parseInt(fields[1] ?? '', 10);
    return Number.isFinite(ppid) ? ppid : null;
  } catch {
    return null;
  }
}

/** Walks the ancestor pid chain [pid, ppid, …] toward init (depth/cycle guarded). */
async function buildPidChain(pid: number): Promise<number[]> {
  const chain: number[] = [];
  const seen = new Set<number>();
  let cur = pid;
  for (let i = 0; i < 64 && cur > 1 && !seen.has(cur); i += 1) {
    chain.push(cur);
    seen.add(cur);
    const parent = await readParentPid(cur);
    if (parent == null) {
      break;
    }
    cur = parent;
  }
  return chain;
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
 * Returns live gjc sessions with their tmux session name + generation id.
 * Empty when tmux is absent. lsof failure no longer empties the list — the
 * ps-subtree idle lane is independent evidence and keeps running (리뷰 반영);
 * transcript-backed rows are simply absent for that poll.
 *
 * Concurrent callers share one in-flight scan (single-flight): several browser
 * clients poll every 5s, and overlapping tmux/lsof/ps storms were themselves
 * causing the transient misses this lane exists to avoid.
 */
let liveScanInFlight: Promise<LiveGjcSession[]> | null = null;

export async function getLiveGjcSessions(): Promise<LiveGjcSession[]> {
  if (liveScanInFlight) {
    return liveScanInFlight;
  }
  liveScanInFlight = scanLiveGjcSessions().finally(() => {
    liveScanInFlight = null;
  });
  return liveScanInFlight;
}

async function scanLiveGjcSessions(): Promise<LiveGjcSession[]> {
  let tmuxOutput: string;
  try {
    tmuxOutput = await runCommand('tmux', ['list-panes', '-a', '-F', `#{session_name}${TMUX_FIELD_SEP}#{session_id}${TMUX_FIELD_SEP}#{pane_pid}${TMUX_FIELD_SEP}#{pane_current_path}`]);
  } catch {
    return [];
  }
  if (!tmuxHasPanes(tmuxOutput)) {
    return [];
  }
  const panes: Array<{ name: string; sid: string; pid: number; cwd: string }> = [];
  for (const pane of parseTmuxPanes(tmuxOutput)) {
    panes.push({ name: pane.name, sid: pane.sid, pid: pane.pid, cwd: (await safeRealpath(pane.cwd)) ?? pane.cwd });
  }

  // Transcript lane (lsof). A transient lsof failure must not blank the whole
  // fleet: fall through with zero transcript-backed sessions and let the idle
  // lane still report gjc panes.
  let lsofOutput = '';
  try {
    lsofOutput = await runCommand('lsof', ['-c', 'gjc', '-F', 'pn']);
  } catch {
    lsofOutput = '';
  }
  const sessions: Array<{ id: string; pidChain: number[]; cwd: string | null }> = [];
  for (const { id, pid } of parseLsofPidSessions(lsofOutput)) {
    sessions.push({
      id,
      pidChain: await buildPidChain(pid),
      cwd: await safeRealpath(`/proc/${pid}/cwd`),
    });
  }

  const sessionPaths = extractSessionPathsFromLsof(lsofOutput);
  const named = computeLiveSessions({ tmuxPresent: true, panes, sessions });

  // gjc panes with no open transcript (first message pending). Best-effort:
  // a ps failure only hides idle rows, never the lsof-backed ones. Exclusion
  // is LINEAGE names only — a cwd label must not hide a subtree-proven pane.
  let idlePanes: Array<{ name: string; sid: string }> = [];
  try {
    const psOutput = await runCommand('ps', ['-eo', 'pid,ppid,comm']);
    idlePanes = findIdleGjcTmuxSessions({
      panes,
      procs: parsePsTree(psOutput),
      excludedNames: new Set(
        named.flatMap((session) => (session.claim === 'lineage' && session.tmuxName ? [session.tmuxName] : [])),
      ),
    });
  } catch {
    // ignore — the idle lane is additive
  }

  // Enrich with the current model (last model_change in the transcript tail).
  const enriched = await Promise.all(
    named.map(async (session) => {
      const path = sessionPaths.get(session.id);
      return { ...session, model: path ? await readLastModelFromFile(path) : null };
    }),
  );
  return [
    ...enriched,
    ...idlePanes.map(({ name, sid }) => ({
      id: `${IDLE_GJC_ID_PREFIX}${name}`,
      tmuxName: name,
      tmuxId: sid,
      // Subtree-proven: a gjc process runs INSIDE the pane — same evidence
      // grade as a lineage claim, so kill/relay stay permitted and safe.
      claim: 'lineage' as const,
      model: null,
    })),
  ];
}

/** Backward-compatible id-only view (transcript-backed ids only — no synthetic idle rows). */
export async function getLiveGjcSessionIds(): Promise<string[]> {
  return (await getLiveGjcSessions())
    .filter((session) => !session.id.startsWith(IDLE_GJC_ID_PREFIX))
    .map((session) => session.id);
}
