/**
 * Live-poll boost window.
 *
 * The sidebar's live-session poll runs every LIVE_POLL_BASE_MS. Right after a
 * relay send into a tmux gjc pane (first message from the waiting view, or a
 * follow-up from the live view) the user is watching for the idle→live
 * transition, which only happens on the next poll tick. Requesting a boost
 * shrinks the poll delay to LIVE_POLL_BOOST_MS for a short window so the
 * transition lands in ~1-2s instead of up to 5s+ — without raising the
 * steady-state polling load.
 *
 * Module-level on purpose: the poll loop (useProjectsState) and the composers
 * (LiveRelayComposer) live in unrelated trees; threading a callback through
 * every layer for a UX hint would be ceremony. Worst case on a stale boost is
 * a few extra polls for 30s.
 */

export const LIVE_POLL_BASE_MS = 5000;
export const LIVE_POLL_BOOST_MS = 1000;
export const LIVE_POLL_BOOST_WINDOW_MS = 30_000;

let boostUntil = 0;

/** Extends (never shortens) the boost window from `now`. */
export function requestLivePollBoost(
  now: number = Date.now(),
  windowMs: number = LIVE_POLL_BOOST_WINDOW_MS,
): void {
  boostUntil = Math.max(boostUntil, now + windowMs);
}

/** Delay until the next live poll tick, honoring an active boost window. */
export function nextLivePollDelay(now: number = Date.now()): number {
  return now < boostUntil ? LIVE_POLL_BOOST_MS : LIVE_POLL_BASE_MS;
}

/** Test helper — clears any active boost window. */
export function resetLivePollBoost(): void {
  boostUntil = 0;
}
