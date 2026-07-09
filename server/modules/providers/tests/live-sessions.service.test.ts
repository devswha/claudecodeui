import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeLiveSessions,
  parseLsofPidSessions,
  parseTmuxPanes,
  tmuxHasPanes,
} from '@/modules/providers/services/live-sessions.service.js';

test('tmuxHasPanes detects a running tmux server (>=1 pane line)', () => {
  assert.equal(tmuxHasPanes('omg\t/home/u/workspace/oh-my-gjc\n'), true);
  assert.equal(tmuxHasPanes('   \n\n'), false);
  assert.equal(tmuxHasPanes(''), false);
});

test('parseTmuxPanes splits session_name<TAB>cwd (cwd may contain spaces)', () => {
  const out = parseTmuxPanes('omg\t/home/u/workspace/oh-my-gjc\nstock\t/home/u/workspace/magi stock\n\nbad-line\n');
  assert.deepEqual(out, [
    { name: 'omg', cwd: '/home/u/workspace/oh-my-gjc' },
    { name: 'stock', cwd: '/home/u/workspace/magi stock' },
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

test('computeLiveSessions maps each live session to its tmux name by cwd', () => {
  const result = computeLiveSessions({
    tmuxPresent: true,
    panes: [
      { name: 'patina', cwd: '/home/devswha/workspace/patina' },
      { name: 'flask', cwd: '/home/devswha/workspace/flask' },
    ],
    sessions: [
      { id: 'p1', cwd: '/home/devswha/workspace/patina' },
      { id: 'f1', cwd: '/home/devswha/workspace/flask' },
      { id: 'x1', cwd: '/home/devswha/Downloads' }, // no matching pane → null (title fallback)
      { id: 'n1', cwd: null }, // unresolved cwd → null
    ],
  });
  assert.deepEqual(result.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: 'f1', tmuxName: 'flask' },
    { id: 'n1', tmuxName: null },
    { id: 'p1', tmuxName: 'patina' },
    { id: 'x1', tmuxName: null },
  ]);
});

test('computeLiveSessions returns empty when no tmux (graceful degradation)', () => {
  assert.deepEqual(
    computeLiveSessions({ tmuxPresent: false, panes: [], sessions: [{ id: 'a', cwd: '/x' }] }),
    [],
  );
});
