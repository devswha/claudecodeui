import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeLiveSessions,
  extractSessionPathsFromLsof,
  findIdleGjcTmuxSessions,
  IDLE_GJC_ID_PREFIX,
  parseLastModelChange,
  parseLsofPidSessions,
  parseTmuxPanes,
  tmuxHasPanes,
} from '@/modules/providers/services/live-sessions.service.js';

test('tmuxHasPanes detects a running tmux server (>=1 pane line)', () => {
  assert.equal(tmuxHasPanes('omg\t111\t/home/u/workspace/oh-my-gjc\n'), true);
  assert.equal(tmuxHasPanes('   \n\n'), false);
  assert.equal(tmuxHasPanes(''), false);
});

test('parseTmuxPanes splits session_name<TAB>pane_pid<TAB>cwd (cwd may contain spaces)', () => {
  const out = parseTmuxPanes('omg\t111\t/home/u/workspace/oh-my-gjc\nstock\t222\t/home/u/workspace/magi stock\n\nbad-line\n');
  assert.deepEqual(out, [
    { name: 'omg', pid: 111, cwd: '/home/u/workspace/oh-my-gjc' },
    { name: 'stock', pid: 222, cwd: '/home/u/workspace/magi stock' },
  ]);
});

test('parseLsofPidSessions pairs uuid with holder pid, path-agnostic (decoy-HOME symlink)', () => {
  const lsof = [
    'p3304033',
    'n/home/devswha/.gjc/agent/sessions/-workspace-patina/2026-07-09T11-22-59-921Z_019f469d-e1d1-7000-a9aa-a942784b0e2b.jsonl',
    'n/home/devswha/.gjc/agent/logs/app.log',
    'p3436470',
    // decoy-HOME symlink path form still parses:
    'n/home/devswha/.cloudcli-home/.gjc/agent/sessions/-workspace-flask/2026-07-09T11-39-51-634Z_019f46ad-51d2-7000-a5ea-facfd7f23f52.jsonl',
  ].join('\n');
  assert.deepEqual(parseLsofPidSessions(lsof), [
    { id: '019f469d-e1d1-7000-a9aa-a942784b0e2b', pid: 3304033 },
    { id: '019f46ad-51d2-7000-a5ea-facfd7f23f52', pid: 3436470 },
  ]);
});

test('computeLiveSessions maps each live session to its tmux name by pid lineage', () => {
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [
      { name: 'patina', pid: 1000, cwd: '/home/devswha/workspace/patina' },
      { name: 'flask', pid: 2000, cwd: '/home/devswha/workspace/flask' },
    ],
    sessions: [
      // gjc holder is a descendant of the pane's shell pid (shell 1000 → … → gjc 1500)
      { id: 'p1', pidChain: [1500, 1200, 1000], cwd: '/home/devswha/workspace/patina' },
      { id: 'f1', pidChain: [2500, 2000], cwd: '/home/devswha/workspace/flask' },
      { id: 'x1', pidChain: [9999], cwd: '/home/devswha/Downloads' }, // no pane pid, no cwd → null
      { id: 'n1', pidChain: [], cwd: null },
    ],
  });
  assert.deepEqual(result.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: 'f1', tmuxName: 'flask', claim: 'lineage' },
    { id: 'n1', tmuxName: null, claim: null },
    { id: 'p1', tmuxName: 'patina', claim: 'lineage' },
    { id: 'x1', tmuxName: null, claim: null },
  ]);
});

test('computeLiveSessions disambiguates two panes in the same cwd via pid lineage', () => {
  // Two tmux sessions in the SAME cwd: cwd equality is many-to-many, which produced
  // the prod bug. Process lineage resolves each gjc session to exactly its own pane,
  // even when a gjc cwd has drifted away from the pane's current path.
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [
      { name: 'patina', pid: 1000, cwd: '/home/devswha/workspace/patina' },
      { name: 'omg', pid: 3000, cwd: '/home/devswha/workspace/patina' },
    ],
    sessions: [
      { id: '019f469d', pidChain: [1800, 1000], cwd: '/home/devswha/workspace/patina/subdir' },
      { id: '019f212c', pidChain: [3800, 3000], cwd: '/home/devswha/workspace/patina' },
    ],
  });
  assert.deepEqual(result.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: '019f212c', tmuxName: 'omg', claim: 'lineage' },
    { id: '019f469d', tmuxName: 'patina', claim: 'lineage' },
  ]);
});

test('computeLiveSessions never double-labels a pane: cwd fallback skips a lineage-claimed pane (prod anomaly patina-dup)', () => {
  // 019f469d is lineage-matched to the patina pane. 019f212c runs in the patina cwd
  // but its shell is NOT the pane's process (nested/other shell) → no lineage hit.
  // The old cwd fallback re-used the patina pane → "patina" on two rows. Now the
  // claimed pane is off-limits, so the extra session goes null (title fallback).
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [{ name: 'patina', pid: 113501, cwd: '/home/devswha/workspace/patina' }],
    sessions: [
      { id: '019f469d', pidChain: [3304033, 113501], cwd: '/home/devswha/workspace/patina' },
      { id: '019f212c', pidChain: [3901429, 3202543], cwd: '/home/devswha/workspace/patina' },
    ],
  });
  assert.deepEqual(result.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: '019f212c', tmuxName: null, claim: null },
    { id: '019f469d', tmuxName: 'patina', claim: 'lineage' },
  ]);
});

test('computeLiveSessions falls back to cwd when the lineage misses and the pane is free+unique', () => {
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [{ name: 'omg', pid: 5000, cwd: '/home/devswha/workspace/oh-my-gjc' }],
    // holder lineage carries no pane pid (e.g. reparented), but the cwd still matches
    // a single unclaimed pane.
    sessions: [{ id: 'o1', pidChain: [7777, 1], cwd: '/home/devswha/workspace/oh-my-gjc' }],
  });
  // cwd fallback names the row but is LABEL-ONLY: claim 'cwd' (no kill/relay).
  assert.deepEqual(result, [{ id: 'o1', tmuxName: 'omg', claim: 'cwd' }]);
});

test('computeLiveSessions cwd fallback yields null when multiple unclaimed panes share the cwd', () => {
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [
      { name: 'company', pid: 100, cwd: '/home/devswha/workspace' },
      { name: 'test', pid: 200, cwd: '/home/devswha/workspace' },
    ],
    // no lineage hit and the cwd matches two panes → ambiguous → null
    sessions: [{ id: 'a1', pidChain: [999], cwd: '/home/devswha/workspace' }],
  });
  assert.deepEqual(result, [{ id: 'a1', tmuxName: null, claim: null }]);
});

test('computeLiveSessions merges holder rows by id (worker + main): either reaching the pane names it', () => {
  // One session, two open-file holders (main reaches the pane, worker does not).
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [{ name: 'stock', pid: 61685, cwd: '/home/devswha/workspace/magi-stock' }],
    sessions: [
      { id: 's1', pidChain: [3435648, 61685], cwd: '/home/devswha/workspace/magi-stock' },
      { id: 's1', pidChain: [3435700], cwd: null },
    ],
  });
  assert.deepEqual(result, [{ id: 's1', tmuxName: 'stock', claim: 'lineage' }]);
});

test('computeLiveSessions returns empty when no tmux (graceful degradation)', () => {
  assert.deepEqual(
    computeLiveSessions({ tmuxPresent: false, panes: [], sessions: [{ id: 'a', pidChain: [1], cwd: '/x' }] }),
    [],
  );
});

test('extractSessionPathsFromLsof maps session id → transcript path (first path wins)', () => {
  const lsof = [
    'p3304033',
    'n/home/devswha/.gjc/agent/sessions/-workspace-patina/2026-07-09T11-22-59-921Z_019f469d-e1d1-7000-a9aa-a942784b0e2b.jsonl',
    'n/home/devswha/.gjc/agent/logs/app.log',
    'p999',
    // Same session held by a second process (worker): first path is kept.
    'n/home/devswha/.cloudcli-home/.gjc/agent/sessions/-workspace-patina/2026-07-09T11-22-59-921Z_019f469d-e1d1-7000-a9aa-a942784b0e2b.jsonl',
  ].join('\n');
  const paths = extractSessionPathsFromLsof(lsof);
  assert.equal(paths.size, 1);
  assert.equal(
    paths.get('019f469d-e1d1-7000-a9aa-a942784b0e2b'),
    '/home/devswha/.gjc/agent/sessions/-workspace-patina/2026-07-09T11-22-59-921Z_019f469d-e1d1-7000-a9aa-a942784b0e2b.jsonl',
  );
});

test('parseLastModelChange returns the LAST model_change in the tail', () => {
  const tail = [
    '{"type":"model_change","id":"a","model":"anthropic/claude-opus-4-8"}',
    '{"type":"message","message":{"role":"user"}}',
    '{"type":"model_change","id":"b","model":"anthropic/claude-fable-5"}',
    '{"type":"message","message":{"role":"assistant"}}',
  ].join('\n');
  assert.equal(parseLastModelChange(tail), 'anthropic/claude-fable-5');
});

test('parseLastModelChange skips a truncated first line and malformed entries', () => {
  const tail = [
    'del","id":"x","model":"anthropic/broken"}', // cut by the tail window
    '{"type":"model_change","model":"openai-codex/gpt-5.5"}',
    'not-json "model_change" garbage',
  ].join('\n');
  assert.equal(parseLastModelChange(tail), 'openai-codex/gpt-5.5');
});

test('parseLastModelChange returns null when no model_change is present', () => {
  assert.equal(parseLastModelChange('{"type":"message"}\n{"type":"turn_end"}'), null);
  assert.equal(parseLastModelChange(''), null);
});

// ─── findIdleGjcTmuxSessions (첫 대화 전 gjc pane 감지) ──────────────────────

test('findIdleGjcTmuxSessions: gjc pane with no live claim surfaces (실측: 재시작 직후 flask)', () => {
  // The pane command IS gjc but it has no open transcript → the lsof pipeline
  // misses it entirely; the idle lane must still list the tmux session.
  const result = findIdleGjcTmuxSessions({
    panes: [{ name: 'flask', pid: 100 }],
    procs: [{ pid: 100, ppid: 1, comm: 'gjc' }],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, ['flask']);
});

test('findIdleGjcTmuxSessions: gjc as a pane DESCENDANT counts (shell → gjc)', () => {
  const result = findIdleGjcTmuxSessions({
    panes: [{ name: 'omg3', pid: 200 }],
    procs: [
      { pid: 200, ppid: 1, comm: 'zsh' },
      { pid: 201, ppid: 200, comm: 'gjc' },
    ],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, ['omg3']);
});

test('findIdleGjcTmuxSessions: names claimed by a live row are excluded (one row per tmux)', () => {
  const result = findIdleGjcTmuxSessions({
    panes: [
      { name: 'horcrux', pid: 300 },
      { name: 'flask', pid: 400 },
    ],
    procs: [
      { pid: 300, ppid: 1, comm: 'gjc' },
      { pid: 400, ppid: 1, comm: 'gjc' },
    ],
    excludedNames: new Set(['horcrux']),
  });
  assert.deepEqual(result, ['flask']);
});

test('findIdleGjcTmuxSessions: non-gjc panes (claude/codex/ssh) never surface here', () => {
  const result = findIdleGjcTmuxSessions({
    panes: [
      { name: 'patina', pid: 500 },
      { name: 'test', pid: 600 },
    ],
    procs: [
      { pid: 500, ppid: 1, comm: 'claude' },
      { pid: 600, ppid: 1, comm: 'node' },
      { pid: 601, ppid: 600, comm: 'codex' },
    ],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, []);
});

test('findIdleGjcTmuxSessions: unsafe tmux names are dropped (kill/relay discipline)', () => {
  const result = findIdleGjcTmuxSessions({
    panes: [
      { name: 'ok.name-1', pid: 700 },
      { name: 'bad name;$(x)', pid: 800 },
      { name: '-leading-dash', pid: 900 },
    ],
    procs: [
      { pid: 700, ppid: 1, comm: 'gjc' },
      { pid: 800, ppid: 1, comm: 'gjc' },
      { pid: 900, ppid: 1, comm: 'gjc' },
    ],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, ['ok.name-1']);
});

test('findIdleGjcTmuxSessions: sorted and deduped across multiple panes of one session', () => {
  const result = findIdleGjcTmuxSessions({
    panes: [
      { name: 'zeta', pid: 1000 },
      { name: 'alpha', pid: 1100 },
      { name: 'zeta', pid: 1200 },
    ],
    procs: [
      { pid: 1000, ppid: 1, comm: 'gjc' },
      { pid: 1100, ppid: 1, comm: 'gjc' },
      { pid: 1200, ppid: 1, comm: 'gjc' },
    ],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, ['alpha', 'zeta']);
});

test('IDLE_GJC_ID_PREFIX cannot collide with transcript uuids (client contract)', () => {
  // The client distinguishes idle rows by this prefix; a real session id is a
  // uuid-ish token and can never start with it.
  assert.equal(IDLE_GJC_ID_PREFIX, 'idle-gjc:');
  assert.ok(!/^[0-9a-fA-F-]+$/.test(IDLE_GJC_ID_PREFIX));
});
