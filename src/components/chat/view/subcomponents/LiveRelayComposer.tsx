import { useState } from 'react';

import { api } from '../../../../utils/api';

type RelayStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'ok'; text: string }
  | { kind: 'queued'; text: string }
  | { kind: 'error'; text: string };

/**
 * Composer for a live (read-only) session. It does NOT inject into the
 * conversation — it relays the message to the control tower's /send (via the
 * server proxy), which owns outbox/queueing + injection + verification. Shows
 * delivered / queued / error feedback based on the tower's response.
 */
export default function LiveRelayComposer({ tmuxName }: { tmuxName: string }) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<RelayStatus>({ kind: 'idle' });

  const send = async () => {
    const message = input.trim();
    if (!message || status.kind === 'sending') {
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      const response = await api.liveSessionSend(tmuxName, message);
      const body = await response.json().catch(() => null);
      const data = (body?.data ?? body ?? {}) as { reachable?: boolean; queued?: boolean; detail?: string };
      if (!response.ok || data.reachable === false) {
        setStatus({
          kind: 'error',
          text: data.reachable === false ? '관제탑 미가동 — 전송 불가' : data.detail || '전송 실패',
        });
        return;
      }
      setInput('');
      setStatus(data.queued ? { kind: 'queued', text: '대기열 적재됨' } : { kind: 'ok', text: '전달됨' });
    } catch {
      setStatus({ kind: 'error', text: '전송 실패' });
    }
  };

  return (
    <div className="chat-composer-shell relative flex-shrink-0 px-2 pb-3 pt-2 sm:px-4">
      <div className="mx-auto max-w-[54.25rem] space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-blue-600 dark:text-blue-400">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" aria-hidden />
          <span>tmux 세션 <span className="font-semibold">{tmuxName}</span>로 전송 (관제탑 경유)</span>
          {status.kind !== 'idle' && status.kind !== 'sending' && (
            <span className={status.kind === 'error' ? 'text-red-500' : 'text-muted-foreground'}>· {status.text}</span>
          )}
        </div>
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={`${tmuxName}에 지시… (⌘/Ctrl+Enter 전송)`}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!input.trim() || status.kind === 'sending'}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status.kind === 'sending' ? '전송 중…' : '전송'}
          </button>
        </div>
      </div>
    </div>
  );
}
