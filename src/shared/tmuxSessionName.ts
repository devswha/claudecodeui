/**
 * tmux session-name rules, single client-side source of truth.
 *
 * Two deliberately different grades:
 * - SPAWN_NAME_RE mirrors the tower's NAME_RE for CREATING sessions (must
 *   start alphanumeric — matches the server/tower validation exactly).
 * - SAFE_DISPLAY_NAME_RE is the looser guard for RENDERING/attaching names of
 *   sessions we did not create (external tmux sessions may legally start with
 *   `.`/`_`/`-`); it only excludes shell-hostile characters.
 */
export const SPAWN_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const SAFE_DISPLAY_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function isSafeDisplayTmuxName(name: string): boolean {
  return SAFE_DISPLAY_NAME_RE.test(name);
}
