import assert from 'node:assert/strict';
import { test } from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { QuestionAnswerContent } from '../components/ContentRenderers/QuestionAnswerContent';

import { getToolConfig } from './toolConfigs';

// gjc's interactive tool is lowercase `ask` (Claude's is AskUserQuestion).
// Regression: without a registered config it fell through to Default — a
// closed "Parameters" JSON block — so the question/options were invisible in
// the transcript view while the tmux TUI waited on the menu.

const GJC_ASK_INPUT = {
  questions: [
    {
      id: 'pick',
      question: 'A안과 B안 중 어느 쪽으로 진행할까요?\n\n상세 설명 줄은 제목에서 잘린다.',
      options: [{ label: 'A안' }, { label: 'B안' }],
      recommended: 0,
    },
  ],
};

test('ask is registered with the question-answer renderer (not Default)', () => {
  const config = getToolConfig('ask');
  assert.equal(config.input.contentType, 'question-answer');
  assert.equal(config.input.defaultOpen, true);
});

test('ask title: single question shows its first line, multi shows a count, malformed degrades', () => {
  const title = getToolConfig('ask').input.title;
  assert.equal(typeof title, 'function');
  const titleFn = title as (input: unknown) => string;
  assert.equal(titleFn(GJC_ASK_INPUT), 'A안과 B안 중 어느 쪽으로 진행할까요?');
  assert.equal(titleFn({ questions: [{ question: 'q1' }, { question: 'q2' }] }), '2 questions');
  // Cold-spill / malformed arguments must not crash the row.
  assert.equal(titleFn({ __gjcColdSpillArguments: true }), 'Question');
});

test('ask content props render the gjc question and options end to end', () => {
  const props = getToolConfig('ask').input.getContentProps?.(GJC_ASK_INPUT) as {
    questions: never[];
    answers: Record<string, string>;
  };
  const html = renderToStaticMarkup(React.createElement(QuestionAnswerContent, props));
  assert.ok(html.includes('A안과 B안 중 어느 쪽으로 진행할까요?'));
  assert.ok(html.includes('A안'));
  assert.ok(html.includes('B안'));
});
