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

test('parseTmuxPanes splits name<TAB>sid<TAB>pid<TAB>pane_current_command<TAB>cwd (cwd may contain spaces; empty cmd tolerated)', () => {
  const out = parseTmuxPanes(
    'omg\t$1\t111\tgjc\t/home/u/workspace/oh-my-gjc\n' +
    'stock\t$2\t222\tbash\t/home/u/workspace/magi stock\n' +
    'noc\t$3\t444\t\t/tmp/x\n' +
    '\nbad-line\nnosid\tX9\t333\tgjc\t/tmp\n',
  );
  assert.deepEqual(out, [
    { name: 'omg', sid: '$1', pid: 111, cmd: 'gjc', cwd: '/home/u/workspace/oh-my-gjc' },
    { name: 'stock', sid: '$2', pid: 222, cmd: 'bash', cwd: '/home/u/workspace/magi stock' },
    // Empty pane_current_command still parses (cmd '') — kind falls back to null.
    { name: 'noc', sid: '$3', pid: 444, cmd: '', cwd: '/tmp/x' },
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

test('computeLiveSessions maps each live session to its tmux name+id by pid lineage', () => {
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [
      { name: 'patina', sid: '$1', pid: 1000, cwd: '/home/devswha/workspace/patina' },
      { name: 'flask', sid: '$2', pid: 2000, cwd: '/home/devswha/workspace/flask' },
    ],
    sessions: [
      // gjc holder is a descendant of the pane's shell pid (shell 1000 → … → gjc 1500)
      { id: 'p1', pidChain: [1500, 1200, 1000], cwd: '/home/devswha/workspace/patina' },
      { id: 'f1', pidChain: [2500, 2000], cwd: '/home/devswha/workspace/flask' },
      { id: 'x1', pidChain: [9999], cwd: '/home/devswha/Downloads' }, // no pane pid, no cwd → null
      { id: 'n1', pidChain: [], cwd: null },
    ],
  });
  // No pane_current_command supplied → kind falls back to null (existing behaviour preserved).
  assert.deepEqual(result.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: 'f1', tmuxName: 'flask', tmuxId: '$2', claim: 'lineage', kind: null },
    { id: 'n1', tmuxName: null, tmuxId: null, claim: null, kind: null },
    { id: 'p1', tmuxName: 'patina', tmuxId: '$1', claim: 'lineage', kind: null },
    { id: 'x1', tmuxName: null, tmuxId: null, claim: null, kind: null },
  ]);
});

test('computeLiveSessions classifies lineage rows by the claimed pane foreground command (interactive vs batch)', () => {
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [
      // foreground command IS gjc → an interactive gjc TUI
      { name: 'omg', sid: '$1', pid: 1000, cwd: '/w/omg', cmd: 'gjc' },
      // gjc is a background/batch child under a shell → the pane foreground is bash
      { name: 'stock', sid: '$2', pid: 2000, cwd: '/w/stock', cmd: 'bash' },
    ],
    sessions: [
      { id: 'i1', pidChain: [1500, 1000], cwd: '/w/omg' },
      { id: 'b1', pidChain: [2500, 2000], cwd: '/w/stock' },
    ],
  });
  assert.deepEqual(result.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: 'b1', tmuxName: 'stock', tmuxId: '$2', claim: 'lineage', kind: 'batch' },
    { id: 'i1', tmuxName: 'omg', tmuxId: '$1', claim: 'lineage', kind: 'interactive' },
  ]);
});

test('computeLiveSessions: cwd-label rows and unknown-command lineage rows fall back to kind=null', () => {
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [
      { name: 'omg', sid: '$1', pid: 1000, cwd: '/w/omg' },              // lineage, no cmd → null fallback
      { name: 'lbl', sid: '$9', pid: 9000, cwd: '/w/lbl', cmd: 'bash' }, // cwd-label pane (gjc not inside)
    ],
    sessions: [
      { id: 'a', pidChain: [1500, 1000], cwd: '/w/omg' }, // lineage but pane has no cmd
      { id: 'c', pidChain: [7777], cwd: '/w/lbl' },       // no lineage → unique cwd fallback
    ],
  });
  assert.deepEqual(result.sort((x, y) => x.id.localeCompare(y.id)), [
    { id: 'a', tmuxName: 'omg', tmuxId: '$1', claim: 'lineage', kind: null },
    { id: 'c', tmuxName: 'lbl', tmuxId: '$9', claim: 'cwd', kind: null },
  ]);
});

test('computeLiveSessions disambiguates two panes in the same cwd via pid lineage', () => {
  // Two tmux sessions in the SAME cwd: cwd equality is many-to-many, which produced
  // the prod bug. Process lineage resolves each gjc session to exactly its own pane,
  // even when a gjc cwd has drifted away from the pane's current path.
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [
      { name: 'patina', sid: '$1', pid: 1000, cwd: '/home/devswha/workspace/patina' },
      { name: 'omg', sid: '$3', pid: 3000, cwd: '/home/devswha/workspace/patina' },
    ],
    sessions: [
      { id: '019f469d', pidChain: [1800, 1000], cwd: '/home/devswha/workspace/patina/subdir' },
      { id: '019f212c', pidChain: [3800, 3000], cwd: '/home/devswha/workspace/patina' },
    ],
  });
  assert.deepEqual(result.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: '019f212c', tmuxName: 'omg', tmuxId: '$3', claim: 'lineage', kind: null },
    { id: '019f469d', tmuxName: 'patina', tmuxId: '$1', claim: 'lineage', kind: null },
  ]);
});

test('computeLiveSessions never double-labels a pane: cwd fallback skips a lineage-claimed pane (prod anomaly patina-dup)', () => {
  // 019f469d is lineage-matched to the patina pane. 019f212c runs in the patina cwd
  // but its shell is NOT the pane's process (nested/other shell) → no lineage hit.
  // The old cwd fallback re-used the patina pane → "patina" on two rows. Now the
  // claimed pane is off-limits, so the extra session goes null (title fallback).
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [{ name: 'patina', sid: '$1', pid: 113501, cwd: '/home/devswha/workspace/patina' }],
    sessions: [
      { id: '019f469d', pidChain: [3304033, 113501], cwd: '/home/devswha/workspace/patina' },
      { id: '019f212c', pidChain: [3901429, 3202543], cwd: '/home/devswha/workspace/patina' },
    ],
  });
  assert.deepEqual(result.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: '019f212c', tmuxName: null, tmuxId: null, claim: null, kind: null },
    { id: '019f469d', tmuxName: 'patina', tmuxId: '$1', claim: 'lineage', kind: null },
  ]);
});

test('computeLiveSessions falls back to cwd when the lineage misses and the pane is free+unique', () => {
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [{ name: 'omg', sid: '$4', pid: 5000, cwd: '/home/devswha/workspace/oh-my-gjc' }],
    // holder lineage carries no pane pid (e.g. reparented), but the cwd still matches
    // a single unclaimed pane.
    sessions: [{ id: 'o1', pidChain: [7777, 1], cwd: '/home/devswha/workspace/oh-my-gjc' }],
  });
  // cwd fallback names the row but is LABEL-ONLY: claim 'cwd' (no kill/relay), kind null.
  assert.deepEqual(result, [{ id: 'o1', tmuxName: 'omg', tmuxId: '$4', claim: 'cwd', kind: null }]);
});

test('computeLiveSessions cwd fallback yields null when multiple unclaimed panes share the cwd', () => {
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [
      { name: 'company', sid: '$5', pid: 100, cwd: '/home/devswha/workspace' },
      { name: 'test', sid: '$6', pid: 200, cwd: '/home/devswha/workspace' },
    ],
    // no lineage hit and the cwd matches two panes → ambiguous → null
    sessions: [{ id: 'a1', pidChain: [999], cwd: '/home/devswha/workspace' }],
  });
  assert.deepEqual(result, [{ id: 'a1', tmuxName: null, tmuxId: null, claim: null, kind: null }]);
});

test('computeLiveSessions merges holder rows by id (worker + main): either reaching the pane names it', () => {
  // One session, two open-file holders (main reaches the pane, worker does not).
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [{ name: 'stock', sid: '$7', pid: 61685, cwd: '/home/devswha/workspace/magi-stock' }],
    sessions: [
      { id: 's1', pidChain: [3435648, 61685], cwd: '/home/devswha/workspace/magi-stock' },
      { id: 's1', pidChain: [3435700], cwd: null },
    ],
  });
  assert.deepEqual(result, [{ id: 's1', tmuxName: 'stock', tmuxId: '$7', claim: 'lineage', kind: null }]);
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

// ─── findIdleGjcTmuxSessions (첫 대화 전 gjc pane 감지 + interactive/batch 분류) ───

test('findIdleGjcTmuxSessions: a foreground-gjc pane with no live claim surfaces as interactive', () => {
  // The pane command IS gjc but it has no open transcript → the lsof pipeline
  // misses it entirely; the idle lane must still list the tmux session.
  const result = findIdleGjcTmuxSessions({
    panes: [{ name: 'flask', sid: '$10', pid: 100, cmd: 'gjc' }],
    procs: [{ pid: 100, ppid: 1, comm: 'gjc' }],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, [{ name: 'flask', sid: '$10', kind: 'interactive' }]);
});

test('findIdleGjcTmuxSessions: gjc as a pane DESCENDANT (shell foreground) surfaces as batch', () => {
  const result = findIdleGjcTmuxSessions({
    panes: [{ name: 'omg3', sid: '$11', pid: 200, cmd: 'zsh' }],
    procs: [
      { pid: 200, ppid: 1, comm: 'zsh' },
      { pid: 201, ppid: 200, comm: 'gjc' },
    ],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, [{ name: 'omg3', sid: '$11', kind: 'batch' }]);
});

test('findIdleGjcTmuxSessions: a surfaced pane with no cmd falls back to kind=null', () => {
  const result = findIdleGjcTmuxSessions({
    panes: [{ name: 'flask', sid: '$10', pid: 100 }],
    procs: [{ pid: 100, ppid: 1, comm: 'gjc' }],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, [{ name: 'flask', sid: '$10', kind: null }]);
});

test('findIdleGjcTmuxSessions: names claimed by a LINEAGE row are excluded (one actionable row per tmux)', () => {
  // Exclusion set is lineage-only by contract: a cwd label must not hide a
  // subtree-proven idle pane (리뷰 반영) — callers pass lineage names here.
  const result = findIdleGjcTmuxSessions({
    panes: [
      { name: 'horcrux', sid: '$12', pid: 300, cmd: 'gjc' },
      { name: 'flask', sid: '$13', pid: 400, cmd: 'gjc' },
    ],
    procs: [
      { pid: 300, ppid: 1, comm: 'gjc' },
      { pid: 400, ppid: 1, comm: 'gjc' },
    ],
    excludedNames: new Set(['horcrux']),
  });
  assert.deepEqual(result, [{ name: 'flask', sid: '$13', kind: 'interactive' }]);
});

test('findIdleGjcTmuxSessions: non-gjc panes (claude/codex/ssh) never surface here', () => {
  const result = findIdleGjcTmuxSessions({
    panes: [
      { name: 'patina', sid: '$14', pid: 500, cmd: 'claude' },
      { name: 'test', sid: '$15', pid: 600, cmd: 'node' },
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
      { name: 'ok.name-1', sid: '$16', pid: 700, cmd: 'gjc' },
      { name: 'bad name;$(x)', sid: '$17', pid: 800, cmd: 'gjc' },
      { name: '-leading-dash', sid: '$18', pid: 900, cmd: 'gjc' },
    ],
    procs: [
      { pid: 700, ppid: 1, comm: 'gjc' },
      { pid: 800, ppid: 1, comm: 'gjc' },
      { pid: 900, ppid: 1, comm: 'gjc' },
    ],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, [{ name: 'ok.name-1', sid: '$16', kind: 'interactive' }]);
});

test('findIdleGjcTmuxSessions: sorted and deduped across multiple panes of one session', () => {
  const result = findIdleGjcTmuxSessions({
    panes: [
      { name: 'zeta', sid: '$20', pid: 1000, cmd: 'gjc' },
      { name: 'alpha', sid: '$21', pid: 1100, cmd: 'gjc' },
      { name: 'zeta', sid: '$20', pid: 1200, cmd: 'gjc' },
    ],
    procs: [
      { pid: 1000, ppid: 1, comm: 'gjc' },
      { pid: 1100, ppid: 1, comm: 'gjc' },
      { pid: 1200, ppid: 1, comm: 'gjc' },
    ],
    excludedNames: new Set(),
  });
  assert.deepEqual(result, [
    { name: 'alpha', sid: '$21', kind: 'interactive' },
    { name: 'zeta', sid: '$20', kind: 'interactive' },
  ]);
});

test('IDLE_GJC_ID_PREFIX cannot collide with transcript uuids (client contract)', () => {
  // The client distinguishes idle rows by this prefix; a real session id is a
  // uuid-ish token and can never start with it.
  assert.equal(IDLE_GJC_ID_PREFIX, 'idle-gjc:');
  assert.ok(!/^[0-9a-fA-F-]+$/.test(IDLE_GJC_ID_PREFIX));
});
