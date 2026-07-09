import { spawn } from 'node:child_process';

/**
 * Live gjc session detection.
 *
 * A gjc session is "live" when a running gjc process has its transcript file
 * (`…/.gjc/agent/sessions/<slug>/<ts>_<uuid>.jsonl`) open. We detect that with:
 *   - lsof on gjc processes → the session ids (uuid from the filename) held open
 *   - tmux `list-panes`     → a presence gate; with no tmux server we return []
 *
 * Matching is PATH-AGNOSTIC (by session-id uuid), deliberately NOT by home-derived
 * path prefixes: production cloudcli runs under a decoy HOME whose `.gjc` is a
 * SYMLINK to the real `~/.gjc`, and lsof reports the resolved real path. Comparing
 * home-derived slugs (using this process's HOME) therefore never matched. The uuid
 * is stable regardless of which path (symlink or real) lsof reports.
 *
 * All tmux/lsof shell dependence is ISOLATED here and fails closed to [].
 */

const SESSIONS_SEGMENT = '.gjc/agent/sessions';

// Matches `…/.gjc/agent/sessions/<slug>/<ts>_<uuid>.jsonl` → captures the uuid.
// Works for both the real path and a symlinked (decoy-HOME) path.
const SESSION_FILE_RE = /\.gjc\/agent\/sessions\/[^/]+\/[^/]*_([0-9a-fA-F][0-9a-fA-F-]{7,})\.jsonl\b/;

/** True when `tmux list-panes` reported at least one pane (a tmux server is up). */
export function tmuxHasPanes(output: string): boolean {
  return output.split(/\r?\n/).some((line) => line.trim().length > 0);
}

/** Extracts unique gjc session ids (uuids) from lsof output, path-agnostic. */
export function parseLsofSessionIds(output: string): string[] {
  const ids = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    if (!raw.includes(SESSIONS_SEGMENT)) {
      continue;
    }
    const match = SESSION_FILE_RE.exec(raw);
    if (match) {
      ids.add(match[1]);
    }
  }
  return [...ids];
}

/**
 * Live ids = gjc-held session ids, gated on tmux being present. Pure, so it is
 * unit-testable (including the symlinked-path / decoy-HOME regression) without
 * spawning anything.
 */
export function computeLiveSessionIds(args: { tmuxPresent: boolean; lsofSessionIds: string[] }): string[] {
  if (!args.tmuxPresent) {
    return [];
  }
  return [...new Set(args.lsofSessionIds)];
}

/** Runs a command, resolving trimmed stdout. Rejects on spawn error / timeout. */
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
 * Returns the gjc session ids currently live. Empty on any failure (no tmux, no
 * lsof, spawn error) — tmux/lsof dependence is confined to this function.
 */
export async function getLiveGjcSessionIds(): Promise<string[]> {
  let tmuxOutput: string;
  try {
    tmuxOutput = await runCommand('tmux', ['list-panes', '-a', '-F', '#{pane_current_path}']);
  } catch {
    return []; // tmux absent / no server → graceful degradation
  }
  if (!tmuxHasPanes(tmuxOutput)) {
    return [];
  }

  let lsofOutput: string;
  try {
    // -c gjc: files opened by processes whose command is `gjc`; -F n: names only.
    lsofOutput = await runCommand('lsof', ['-c', 'gjc', '-F', 'n']);
  } catch {
    return [];
  }

  return computeLiveSessionIds({ tmuxPresent: true, lsofSessionIds: parseLsofSessionIds(lsofOutput) });
}
