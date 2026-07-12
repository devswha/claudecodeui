import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

import { api, authenticatedFetch } from '../../../../utils/api';
import { requestLivePollBoost } from '../../../../utils/livePollBoost';

type RelayStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'ok'; text: string }
  | { kind: 'queued'; text: string }
  | { kind: 'error'; text: string };

// Mirrors the assets endpoint's `upload.array('images', 5)` limit.
const MAX_ATTACHED_IMAGES = 5;

/**
 * Composer for a live (read-only) session. It does NOT inject into the
 * conversation — it relays the message to the control tower's /send (via the
 * server proxy), which owns outbox/queueing + injection + verification. Shows
 * delivered / queued / error feedback based on the tower's response.
 *
 * Image attachments ride the text-only relay as FILE PATHS: uploads go to the
 * global assets store (POST /api/assets/images — same as the native chat
 * composer), and the relayed message references the stored absolute paths.
 * The gjc in the pane opens them with its multimodal read tool; the tower
 * cannot carry binary data into a terminal, so this is the whole mechanism.
 *
 * The status line leads with the session's CURRENT MODEL (from the gjc
 * transcript's last model_change, threaded through the live poll) — the tmux
 * name stays as a muted suffix so the send target remains identifiable.
 */
export default function LiveRelayComposer({ tmuxName, tmuxId = null, model = null }: { tmuxName: string; tmuxId?: string | null; model?: string | null }) {
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState<File[]>([]);
  const [status, setStatus] = useState<RelayStatus>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (files: Iterable<File>) => {
    const images = [...files].filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) {
      return;
    }
    setAttached((prev) => [...prev, ...images].slice(0, MAX_ATTACHED_IMAGES));
  };

  const uploadAttachments = async (): Promise<string[] | null> => {
    const formData = new FormData();
    attached.forEach((file) => formData.append('images', file));
    const response = await authenticatedFetch('/api/assets/images', { method: 'POST', headers: {}, body: formData });
    if (!response.ok) {
      return null;
    }
    const result = await response.json().catch(() => null) as { images?: Array<{ path?: string }> } | null;
    const paths = (result?.images ?? []).map((image) => image?.path).filter((p): p is string => typeof p === 'string');
    return paths.length === attached.length ? paths : null;
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && attached.length === 0) || status.kind === 'sending') {
      return;
    }
    // Server contract: the $N generation token is required (fail-closed). No
    // token means we cannot prove which same-named session receives the text.
    if (!tmuxId) {
      setStatus({ kind: 'error', text: '세션 세대 정보 미확인 — 목록 갱신 후 다시 시도' });
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      let message = text;
      if (attached.length > 0) {
        const paths = await uploadAttachments();
        if (!paths) {
          setStatus({ kind: 'error', text: '이미지 업로드 실패 — 전송 취소됨' });
          return;
        }
        const block = `[첨부 이미지 ${paths.length}장 — read 도구로 열어 확인:\n${paths.map((p) => `- ${p}`).join('\n')}]`;
        message = text ? `${text}\n\n${block}` : block;
      }
      const response = await api.liveSessionSend(tmuxName, message, tmuxId);
      const body = await response.json().catch(() => null);
      const data = (body?.data ?? body ?? {}) as { ok?: boolean; reachable?: boolean; queued?: boolean; detail?: string };
      // ok === false covers "tower reachable but refused/failed" (server wraps a
      // tower non-2xx in HTTP 200) — without it a failed relay showed 전달됨 and
      // silently discarded the draft.
      if (!response.ok || data.reachable === false || data.ok === false) {
        setStatus({
          kind: 'error',
          text: data.reachable === false ? '관제탑 미가동 — 전송 불가' : data.detail || '전송 실패',
        });
        return;
      }
      setInput('');
      setAttached([]);
      setStatus(data.queued ? { kind: 'queued', text: '대기열 적재됨' } : { kind: 'ok', text: '전달됨' });
      // The user is now watching for the pane's reaction (idle→live transition,
      // new transcript activity) — poll fast for a short window.
      requestLivePollBoost();
    } catch {
      setStatus({ kind: 'error', text: '전송 실패' });
    }
  };

  return (
    <div className="chat-composer-shell relative flex-shrink-0 px-2 pb-3 pt-2 sm:px-4">
      <div className="mx-auto max-w-[54.25rem] space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-blue-600 dark:text-blue-400">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" aria-hidden />
          {model ? (
            <span>
              <span className="font-semibold">{model.split('/').pop()}</span>
              <span className="text-muted-foreground"> · {tmuxName}</span>
            </span>
          ) : (
            <span><span className="font-semibold">{tmuxName}</span> 세션</span>
          )}
          {status.kind !== 'idle' && status.kind !== 'sending' && (
            <span className={status.kind === 'error' ? 'text-red-500' : 'text-muted-foreground'}>· {status.text}</span>
          )}
        </div>
        {attached.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attached.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                <span className="max-w-40 truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label="첨부 제거"
                  onClick={() => setAttached((prev) => prev.filter((_, i) => i !== index))}
                  className="text-muted-foreground transition-colors hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files);
              }
              event.target.value = '';
            }}
          />
          <button
            type="button"
            aria-label="이미지 첨부"
            title="이미지 첨부 (붙여넣기도 가능) — 파일로 저장돼 세션이 읽습니다"
            onClick={() => fileInputRef.current?.click()}
            disabled={status.kind === 'sending' || attached.length >= MAX_ATTACHED_IMAGES}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPaste={(event) => {
              const files = [...event.clipboardData.files];
              if (files.some((file) => file.type.startsWith('image/'))) {
                event.preventDefault();
                addFiles(files);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={`${tmuxName}에 지시… (Enter 전송, Shift+Enter 줄바꿈)`}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={(!input.trim() && attached.length === 0) || status.kind === 'sending'}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status.kind === 'sending' ? '전송 중…' : '전송'}
          </button>
        </div>
      </div>
    </div>
  );
}
