import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildPromptArg } from './gjc-cli.js';

test('buildPromptArg: plain message passes through as a positional', () => {
  const result = buildPromptArg('Reply with exactly one word: PONG');
  assert.equal(result.arg, 'Reply with exactly one word: PONG');
  assert.equal(result.tempFile, null);
});

test('buildPromptArg: interior dash stays positional (only leading dash is unsafe)', () => {
  const result = buildPromptArg('use the --flag option please');
  assert.equal(result.arg, 'use the --flag option please');
  assert.equal(result.tempFile, null);
});

test('buildPromptArg: empty/nullish message is an empty positional', () => {
  assert.deepEqual(buildPromptArg(undefined), { arg: '', tempFile: null });
  assert.deepEqual(buildPromptArg(''), { arg: '', tempFile: null });
});

test('buildPromptArg: dash-leading message is written to a temp file and passed as @file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gjc-args-test-'));
  try {
    const msg = '-v what does this flag do?';
    const result = buildPromptArg(msg, dir);
    assert.ok(result.tempFile, 'tempFile must be set for a dash-leading message');
    assert.equal(result.arg, `@${result.tempFile}`);
    assert.ok(result.tempFile.startsWith(dir), 'temp file lives in the given dir');
    assert.ok(existsSync(result.tempFile), 'temp file is created on disk');
    assert.equal(readFileSync(result.tempFile, 'utf8'), msg, 'file content is the verbatim prompt');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
