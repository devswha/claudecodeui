import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LiveAnswerContext } from '../../liveAnswerContext';

import { QuestionAnswerContent } from './QuestionAnswerContent';

// Regression coverage for the chat-interface crash where an AskUserQuestion
// payload loaded from a session transcript arrives with a non-array `questions`
// or a question missing its `options` array. Rendering must degrade gracefully
// instead of throwing "TypeError: e.map is not a function".

test('renders without throwing when questions is a non-array value', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        // Malformed: object instead of an array
        questions: { 0: { question: 'q?', options: [{ label: 'a' }] } } as never,
        answers: {},
      }),
    );
  });
});

test('renders without throwing when a question is missing options[]', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        questions: [{ question: 'Pick one?', header: 'H' } as never],
        answers: { 'Pick one?': 'X' },
      }),
    );
  });
});

test('renders without throwing when options[] contains malformed entries', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        questions: [{ question: 'Pick one?', options: [null, 'oops', { label: 'A' }] } as never],
        answers: { 'Pick one?': 'A, Custom' },
      }),
    );
  });
});

test('renders without throwing when a questions entry is null/non-object', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        questions: [null, 'oops', { question: 'Ok?', options: [{ label: 'A' }] }] as never,
        answers: {},
      }),
    );
  });
});

test('renders without throwing when an answer is a non-string value', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        questions: [{ question: 'Pick one?', options: [{ label: 'A' }] }],
        // Malformed: answer is an object instead of the expected string
        answers: { 'Pick one?': { unexpected: true } } as never,
      }),
    );
  });
});

test('still renders a well-formed question + answer', () => {
  const html = renderToStaticMarkup(
    React.createElement(QuestionAnswerContent, {
      questions: [{ question: 'Pick one?', header: 'H', options: [{ label: 'A' }, { label: 'B' }] }],
      answers: { 'Pick one?': 'A' },
    }),
  );
  assert.ok(html.includes('Pick one?'));
});

test('live answer buttons: absent without a LiveAnswerContext, present (per unanswered option) with one', () => {
  const question = { question: 'Pick one?', options: [{ label: 'A안' }, { label: 'B안' }] };

  // No context (historical transcript) → read-only, no answer hint.
  const readonly = renderToStaticMarkup(
    React.createElement(QuestionAnswerContent, { questions: [question], answers: {} }),
  );
  assert.ok(!readonly.includes('세션 메뉴에 자동 반영'));

  // Live context + unanswered question → clickable option buttons appear.
  const live = renderToStaticMarkup(
    React.createElement(
      LiveAnswerContext.Provider,
      { value: async () => ({ ok: true, stale: false, detail: 'ok' }) },
      React.createElement(QuestionAnswerContent, { questions: [question], answers: {} }),
    ),
  );
  assert.ok(live.includes('세션 메뉴에 자동 반영'));
  assert.ok(live.includes('A안'));
  assert.ok(live.includes('B안'));
});

test('live answer buttons: suppressed once the question already has a recorded answer', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      LiveAnswerContext.Provider,
      { value: async () => ({ ok: true, stale: false, detail: 'ok' }) },
      React.createElement(QuestionAnswerContent, {
        questions: [{ question: 'Pick one?', options: [{ label: 'A안' }, { label: 'B안' }] }],
        answers: { 'Pick one?': 'A안' },
      }),
    ),
  );
  assert.ok(!html.includes('세션 메뉴에 자동 반영'));
});
