import os from 'node:os';
import path from 'node:path';
import { readdir, realpath } from 'node:fs/promises';

/**
 * Home-relative directory suggestions for the spawn form's cwd input.
 * The tower's /spawn contract takes a HOME-relative path ("workspace/my-proj"),
 * so suggestions are computed under $HOME only — read-only readdir, hidden dirs
 * excluded unless the fragment itself starts with '.'.
 *
 * Containment is REAL-PATH based, not lexical: the listed directory's realpath
 * must sit under one of the allowed roots. Allowed roots are realpath($HOME)
 * plus the realpaths of $HOME's DIRECT children (the self-host decoy-HOME
 * pattern symlinks each top-level entry to the real home, and those must keep
 * working) — but a symlink planted deeper (e.g. ~/workspace/evil → /etc) fails
 * containment and returns [].
 */

export const MAX_DIR_SUGGESTIONS = 20;

/** Absolute HOME path — clients join it with home-relative picks. */
export function getHomeDir(): string {
  return os.homedir();
}

/** Splits a partial input into its listed directory and the fragment being typed. */
export function splitPrefix(prefix: string): { dirPart: string; fragment: string } {
  const slash = prefix.lastIndexOf('/');
  if (slash < 0) {
    return { dirPart: '', fragment: prefix };
  }
  return { dirPart: prefix.slice(0, slash), fragment: prefix.slice(slash + 1) };
}

/** Pure filter: directory entry names → sorted home-relative suggestions. */
export function filterDirSuggestions(args: {
  dirPart: string;
  fragment: string;
  entryNames: string[];
}): string[] {
  const showHidden = args.fragment.startsWith('.');
  return args.entryNames
    .filter((name) => (showHidden || !name.startsWith('.')) && name.startsWith(args.fragment))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_DIR_SUGGESTIONS)
    .map((name) => (args.dirPart ? `${args.dirPart}/${name}` : name));
}

async function safeRealpath(target: string): Promise<string | null> {
  try {
    return await realpath(target);
  } catch {
    return null;
  }
}

/** realpath($HOME) ∪ realpaths of $HOME's direct child dirs (decoy-HOME symlinks). */
async function resolveAllowedRoots(home: string): Promise<string[]> {
  const roots: string[] = [];
  const homeReal = await safeRealpath(home);
  if (homeReal) {
    roots.push(homeReal);
  }
  try {
    const entries = await readdir(home, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isSymbolicLink() && !entry.isDirectory()) {
        continue;
      }
      const childReal = await safeRealpath(path.join(home, entry.name));
      if (childReal) {
        roots.push(childReal);
      }
    }
  } catch {
    // home unreadable → roots stay minimal; containment below fails closed
  }
  return roots;
}

function isUnderAnyRoot(target: string, roots: string[]): boolean {
  return roots.some((root) => target === root || target.startsWith(`${root}${path.sep}`));
}

/** Shared core: suggestions for `prefix` resolved under `base`, contained in `allowedRoots`. */
async function suggestUnderBase(prefix: string, base: string, allowedRoots: string[]): Promise<string[]> {
  const { dirPart, fragment } = splitPrefix(prefix);
  const target = path.resolve(base, dirPart);
  // Lexical guard first (cheap reject of ../ traversal)…
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    return [];
  }
  // …then real-path containment so symlinks cannot escape the allowed roots.
  const targetReal = await safeRealpath(target);
  if (!targetReal || allowedRoots.length === 0 || !isUnderAnyRoot(targetReal, allowedRoots)) {
    return [];
  }
  try {
    const entries = await readdir(targetReal, { withFileTypes: true });
    return filterDirSuggestions({
      dirPart,
      fragment,
      entryNames: entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name),
    });
  } catch {
    return [];
  }
}

/**
 * Lists directory suggestions for a home-relative prefix. [] on any failure
 * (missing dir, permission, traversal or symlink escape).
 * `homeDir` is parameterized for tests; production uses $HOME.
 */
export async function getHomeDirSuggestions(prefix: string, homeDir: string = os.homedir()): Promise<string[]> {
  if (prefix.includes('\0') || prefix.startsWith('/') || prefix.length > 512) {
    return [];
  }
  return suggestUnderBase(prefix, homeDir, await resolveAllowedRoots(homeDir));
}

/** TOWER_ALLOWED_ROOTS csv (same contract as the tower) → absolute roots. */
export function parseExtraSpawnRoots(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => path.isAbsolute(entry));
}

/**
 * Spawn-scope suggestions: extra spawn roots (the tower's TOWER_ALLOWED_ROOTS,
 * e.g. the /Volumes workspace) come FIRST, then $HOME.
 *
 * Extra-root entries are UNIFORMLY "<root basename>/rest" ("Dev Workspace/
 * argus"): one consistent, short, root-identifying shape (실사용 피드백:
 * full absolute paths drowned the dropdown; mixing bare and prefixed forms
 * was confusing; bare names alone spawned in $HOME on a name collision —
 * 리뷰 반영). The tower resolves the alias against the root's PARENT, same
 * containment contract. Home entries stay home-relative. Alias and absolute
 * prefixes are both accepted for continued typing, contained to the roots.
 */
export async function getSpawnDirSuggestions(
  prefix: string,
  homeDir: string = os.homedir(),
  extraRoots: string[] = parseExtraSpawnRoots(process.env.TOWER_ALLOWED_ROOTS),
): Promise<string[]> {
  if (prefix.includes('\0') || prefix.length > 512) {
    return [];
  }
  const lanes: string[][] = [];
  if (prefix.startsWith('/')) {
    // Absolute prefix: only extra roots may serve it, and only from inside.
    for (const root of extraRoots) {
      const rootReal = await safeRealpath(root);
      if (!rootReal || (prefix !== rootReal && !prefix.startsWith(`${rootReal}${path.sep}`))) {
        continue;
      }
      const rel = prefix === rootReal ? '' : prefix.slice(rootReal.length + 1);
      const entries = await suggestUnderBase(rel, rootReal, [rootReal]);
      lanes.push(entries.map((entry) => `${rootReal}${path.sep}${entry}`));
    }
  } else {
    for (const root of extraRoots) {
      const rootReal = await safeRealpath(root);
      if (!rootReal) {
        lanes.push([]);
        continue;
      }
      const alias = path.basename(rootReal);
      if (prefix === alias || prefix.startsWith(`${alias}/`)) {
        const rel = prefix === alias ? '' : prefix.slice(alias.length + 1);
        const entries = await suggestUnderBase(rel, rootReal, [rootReal]);
        lanes.push(entries.map((entry) => `${alias}/${entry}`));
        continue;
      }
      const lane: string[] = [];
      // Typing the alias itself completes to the root ("Dev W…" → pick →
      // "Dev Workspace/" lists its children).
      if (prefix.length > 0 && alias.startsWith(prefix)) {
        lane.push(alias);
      }
      const entries = await suggestUnderBase(prefix, rootReal, [rootReal]);
      lane.push(...entries.map((entry) => `${alias}/${entry}`));
      lanes.push(lane);
    }
    lanes.push(await suggestUnderBase(prefix, homeDir, await resolveAllowedRoots(homeDir)));
  }
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const lane of lanes) {
    for (const suggestion of lane) {
      if (!seen.has(suggestion)) {
        seen.add(suggestion);
        merged.push(suggestion);
      }
    }
  }
  return merged.slice(0, MAX_DIR_SUGGESTIONS);
}
