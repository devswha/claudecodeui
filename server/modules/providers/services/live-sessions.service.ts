import { spawn } from 'node:child_process';
import os from 'node:os';

/**
 * Live gjc session detection.
 *
 * A gjc session is "live" when a running gjc TUI process (in a tmux pane) has its
 * transcript file open. We derive that from two signals and intersect them:
 *   - tmux `list-panes` current paths  → which cwds have live gjc panes
 *   - lsof on gjc processes            → which `~/.gjc/agent/sessions/<slug>/<ts>_<uuid>.jsonl`
 *                                         files are currently held open (uuid = session id)
 *
 * The tmux/lsof shell dependency is ISOLATED to this module: any failure (tmux not
 * installed, no server, lsof missing) degrades gracefully to an empty list, so the
 * rest of the app never depends on tmux being present.
 */

const SESSIONS_SEGMENT = '.gjc/agent/sessions';

// Matches `…/.gjc/agent/sessions/<slug>/<ts>_<uuid>.jsonl` → [_, slug, sessionId].
const SESSION_FILE_RE = /\.gjc\/agent\/sessions\/([^/]+)\/[^/]*_([0-9a-fA-F][0-9a-fA-F-]{7,})\.jsonl\b/;

/**
 * gjc slugs a cwd by stripping the home-dir prefix and replacing path separators
 * with '-' (e.g. `/home/u/workspace/patina` → `-workspace-patina`,
 * `/home/u/Downloads` → `-Downloads`). Pure so it is unit-testable.
 */
export function sessionSlugFromCwd(cwd: string, home: string): string {
  const trimmed = cwd.replace(/\/+$/, '');
  const rel = home && trimmed.startsWith(home) ? trimmed.slice(home.length) : trimmed;
  return rel.replace(/\//g, '-');
}

/** Parses `tmux list-panes` output (one current path per line) into unique cwds. */
export function parseTmuxCwds(output: string): string[] {
  const cwds = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (line) {
      cwds.add(line);
    }
  }
  return [...cwds];
}

/** Extracts `{ sessionId, slug }` from every gjc session file path in lsof output. */
export function parseLsofSessionFiles(output: string): Array<{ sessionId: string; slug: string }> {
  const out: Array<{ sessionId: string; slug: string }> = [];
  const seen = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    if (!raw.includes(SESSIONS_SEGMENT)) {
      continue;
    }
    const match = SESSION_FILE_RE.exec(raw);
    if (!match) {
      continue;
    }
    const slug = match[1];
    const sessionId = match[2];
    const key = `${slug}\u0000${sessionId}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ sessionId, slug });
    }
  }
  return out;
}

/**
 * Intersects tmux cwds with lsof-held session files: a session is live when its
 * file is open by a gjc process AND its slug belongs to a live tmux pane cwd.
 * Pure so it is unit-testable without spawning anything.
 */
export function computeLiveSessionIds(args: {
  tmuxCwds: string[];
  lsofFiles: Array<{ sessionId: string; slug: string }>;
  home: string;
}): string[] {
  const { tmuxCwds, lsofFiles, home } = args;
  if (tmuxCwds.length === 0) {
    return [];
  }
  const tmuxSlugs = new Set(tmuxCwds.map((cwd) => sessionSlugFromCwd(cwd, home)));
  const live = new Set<string>();
  for (const { sessionId, slug } of lsofFiles) {
    if (tmuxSlugs.has(slug)) {
      live.add(sessionId);
    }
  }
  return [...live];
}

/** Runs a command, resolving trimmed stdout. Rejects on spawn error / non-zero exit. */
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

/**
 * Returns the set of gjc session ids currently live in tmux. Empty on any failure
 * (no tmux, no lsof, spawn error) — tmux/lsof dependence is confined here.
 */
export async function getLiveGjcSessionIds(): Promise<string[]> {
  let tmuxOutput: string;
  try {
    tmuxOutput = await runCommand('tmux', ['list-panes', '-a', '-F', '#{pane_current_path}']);
  } catch {
    return []; // tmux absent / no server → graceful degradation
  }
  const tmuxCwds = parseTmuxCwds(tmuxOutput);
  if (tmuxCwds.length === 0) {
    return [];
  }

  let lsofOutput: string;
  try {
    // -c gjc: files opened by processes whose command is `gjc`; -F n: names only.
    lsofOutput = await runCommand('lsof', ['-c', 'gjc', '-F', 'n']);
  } catch {
    return [];
  }
  const lsofFiles = parseLsofSessionFiles(lsofOutput);

  return computeLiveSessionIds({ tmuxCwds, lsofFiles, home: os.homedir() });
}
