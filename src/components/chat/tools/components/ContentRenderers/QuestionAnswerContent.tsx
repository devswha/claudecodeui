import React, { useState } from 'react';

import type { Question } from '../../../types/types';
import { useLiveAnswer } from '../../liveAnswerContext';

interface QuestionAnswerContentProps {
  questions: Question[];
  answers: Record<string, string>;
  className?: string;
}

// Exception to the stateless ContentRenderer pattern: multi-question navigation requires local state.
export const QuestionAnswerContent: React.FC<QuestionAnswerContentProps> = ({
  questions,
  answers,
  className = '',
}) => {
  // Single-question asks (the common gjc case) start expanded so options —
  // and the live answer buttons — are visible without an extra click.
  const [expandedIdx, setExpandedIdx] = useState<number | null>(
    Array.isArray(questions) && questions.length === 1 ? 0 : null,
  );
  // Live ask-menu answering (present only when viewing a live tmux session).
  const liveAnswer = useLiveAnswer();
  const [pick, setPick] = useState<{ label: string; status: 'sending' | 'ok' | 'stale' | 'error'; detail: string } | null>(null);
  const submitPick = async (label: string) => {
    if (!liveAnswer || pick?.status === 'sending') {
      return;
    }
    setPick({ label, status: 'sending', detail: '' });
    const result = await liveAnswer(label);
    setPick({ label, status: result.ok ? 'ok' : result.stale ? 'stale' : 'error', detail: result.detail });
  };

  // Tool inputs are runtime data loaded from session transcripts and may be
  // malformed (e.g. `questions` arriving as a non-array). Guard with
  // Array.isArray so a single bad payload can't crash the whole chat view
  // with "e.map is not a function".
  if (!Array.isArray(questions) || questions.length === 0) {
    return null;
  }

  const hasAnyAnswer = Object.keys(answers || {}).length > 0;
  const total = questions.length;

  return (
    <div className={`space-y-2 ${className}`}>
      {questions.map((rawQuestion, idx) => {
        // Entries come from session transcripts and may be malformed; skip
        // anything that isn't a proper question object with a string prompt.
        if (!rawQuestion || typeof rawQuestion !== 'object' || typeof rawQuestion.question !== 'string') {
          return null;
        }
        const q = rawQuestion;
        const answer = answers?.[q.question];
        // `answer` may be a non-string (or absent) in malformed payloads.
        const answerLabels = typeof answer === 'string' ? answer.split(', ') : [];
        const skipped = !answer;
        const isExpanded = expandedIdx === idx;
        // `options` is typed as an array but comes from untrusted runtime data;
        // keep only valid entries so `.some`/`.map` below never throw.
        const options = Array.isArray(q.options)
          ? q.options.filter((opt) => opt && typeof opt === 'object' && typeof opt.label === 'string')
          : [];

        return (
          <div
            key={idx}
            className="border-gray-150 overflow-hidden rounded-lg border bg-gray-50/50 dark:border-gray-700/50 dark:bg-gray-800/30"
          >
            <button
              type="button"
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${
                answerLabels.length > 0
                  ? 'bg-blue-100 dark:bg-blue-900/40'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}>
                {answerLabels.length > 0 ? (
                  <svg className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {q.header && (
                    <span className="inline-flex items-center rounded border border-blue-100/80 bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-600 dark:border-blue-800/40 dark:bg-blue-900/30 dark:text-blue-400">
                      {q.header}
                    </span>
                  )}
                  {total > 1 && (
                    <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                      {idx + 1}/{total}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs leading-snug text-gray-600 dark:text-gray-400">
                  {q.question}
                </div>

                {!isExpanded && answerLabels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {answerLabels.map((lbl) => {
                      const isCustom = !options.some(o => o.label === lbl);
                      return (
                        <span
                          key={lbl}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        >
                          {lbl}
                          {isCustom && (
                            <span className="text-[9px] font-normal text-blue-400 dark:text-blue-500">(custom)</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {!isExpanded && skipped && hasAnyAnswer && (
                  <span className="mt-1 inline-block text-[10px] italic text-gray-400 dark:text-gray-500">
                    Skipped
                  </span>
                )}
              </div>

              <svg
                className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform duration-200 dark:text-gray-500 ${
                  isExpanded ? 'rotate-180' : ''
                }`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 px-3 pb-2.5 pt-0.5 dark:border-gray-700/40">
                <div className="ml-6.5 space-y-1">
                {/* Live answering: a pending gjc ask menu is on screen. Clicking
                    a label drives the tower to navigate+commit that option. The
                    read-only list below still shows the full set. */}
                {liveAnswer && answerLabels.length === 0 && options.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {options.map((opt) => {
                      const isPicked = pick?.label === opt.label;
                      const done = isPicked && pick?.status === 'ok';
                      return (
                        <button
                          key={`live-${opt.label}`}
                          type="button"
                          onClick={() => void submitPick(opt.label)}
                          disabled={pick?.status === 'sending'}
                          className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-colors disabled:cursor-not-allowed ${
                            done
                              ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700/50 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'border-border bg-card hover:border-blue-400/60 hover:bg-blue-50/40 dark:hover:bg-blue-900/10'
                          }`}
                        >
                          <span className="flex-1 truncate font-medium">{opt.label}</span>
                          {isPicked && pick?.status === 'sending' && (
                            <span className="text-[11px] text-muted-foreground">전송 중…</span>
                          )}
                          {done && <span className="text-[11px]">✓ 선택됨</span>}
                          {isPicked && pick?.status === 'stale' && (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400">이미 지난 질문</span>
                          )}
                          {isPicked && pick?.status === 'error' && (
                            <span className="text-[11px] text-red-500">전송 실패</span>
                          )}
                        </button>
                      );
                    })}
                    <p className="px-1 text-[10px] text-muted-foreground">웹에서 선택 → 세션 메뉴에 자동 반영 (터미널에서 직접 골라도 됩니다)</p>
                  </div>
                )}
                  {options.map((opt) => {
                    const wasSelected = answerLabels.includes(opt.label);
                    return (
                      <div
                        key={opt.label}
                        className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ${
                          wasSelected
                            ? 'border border-blue-200/60 bg-blue-50/80 dark:border-blue-800/40 dark:bg-blue-900/20'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        <div className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${q.multiSelect ? 'rounded-[3px]' : 'rounded-full'} flex items-center justify-center border-[1.5px] ${
                          wasSelected
                            ? 'border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {wasSelected && (
                            <svg className="h-2 w-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={wasSelected ? 'font-medium text-gray-900 dark:text-gray-100' : ''}>
                            {opt.label}
                          </span>
                          {opt.description && (
                            <span className={`mt-0.5 block text-[11px] ${
                              wasSelected ? 'text-blue-600/70 dark:text-blue-300/70' : 'text-gray-400 dark:text-gray-600'
                            }`}>
                              {opt.description}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {answerLabels.filter(lbl => !options.some(o => o.label === lbl)).map(lbl => (
                    <div
                      key={lbl}
                      className="flex items-start gap-2 rounded-lg border border-blue-200/60 bg-blue-50/80 px-2.5 py-1.5 text-[12px] dark:border-blue-800/40 dark:bg-blue-900/20"
                    >
                      <div className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${q.multiSelect ? 'rounded-[3px]' : 'rounded-full'} flex items-center justify-center border-[1.5px] border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-500`}>
                        <svg className="h-2 w-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{lbl}</span>
                        <span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400">(custom)</span>
                      </div>
                    </div>
                  ))}

                  {skipped && hasAnyAnswer && (
                    <div className="px-2.5 py-1 text-[11px] italic text-gray-400 dark:text-gray-500">
                      No answer provided
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!hasAnyAnswer && total === 1 && (
        <div className="text-[11px] italic text-gray-400 dark:text-gray-500">
          Skipped
        </div>
      )}
    </div>
  );
};
