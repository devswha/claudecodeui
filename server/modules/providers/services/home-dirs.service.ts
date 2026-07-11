import os from 'node:os';
import path from 'node:path';
import { readdir } from 'node:fs/promises';

/**
 * Home-relative directory suggestions for the spawn form's cwd input.
 * The tower's /spawn contract takes a HOME-relative path ("workspace/my-proj"),
 * so suggestions are computed under $HOME only — read-only readdir, traversal
 * rejected, hidden dirs excluded unless the fragment itself starts with '.'.
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

/**
 * Lists directory suggestions for a home-relative prefix. [] on any failure
 * (missing dir, permission, traversal attempt).
 */
export async function getHomeDirSuggestions(prefix: string): Promise<string[]> {
  if (prefix.includes('\0') || prefix.startsWith('/') || prefix.length > 512) {
    return [];
  }
  const { dirPart, fragment } = splitPrefix(prefix);
  const home = os.homedir();
  const target = path.resolve(home, dirPart);
  // Traversal guard: the listed directory must stay under HOME.
  if (target !== home && !target.startsWith(`${home}${path.sep}`)) {
    return [];
  }
  try {
    const entries = await readdir(target, { withFileTypes: true });
    return filterDirSuggestions({
      dirPart,
      fragment,
      entryNames: entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name),
    });
  } catch {
    return [];
  }
}
