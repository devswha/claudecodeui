import { createContext, useContext } from 'react';

export type LiveAnswerFn = (label: string) => Promise<{ ok: boolean; stale: boolean; detail: string }>;

/**
 * When a live (read-only) tmux gjc session is being viewed, this carries a
 * channel to answer its on-screen ask-TUI menu by option label. Null in every
 * other context (historical Claude/codex transcripts) — the ask card then
 * renders read-only as before. The tower verifies the menu still shows the
 * label before committing, so clicking a stale option fails closed (stale=true)
 * rather than mis-selecting.
 */
export const LiveAnswerContext = createContext<LiveAnswerFn | null>(null);

export function useLiveAnswer(): LiveAnswerFn | null {
  return useContext(LiveAnswerContext);
}
