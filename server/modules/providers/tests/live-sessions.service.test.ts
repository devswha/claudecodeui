import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeLiveSessionIds,
  parseLsofSessionFiles,
  parseTmuxCwds,
  sessionSlugFromCwd,
} from '@/modules/providers/services/live-sessions.service.js';

const HOME = '/home/devswha';

test('sessionSlugFromCwd mirrors gjc slug convention (strip home, / -> -)', () => {
  assert.equal(sessionSlugFromCwd('/home/devswha/workspace/patina', HOME), '-workspace-patina');
  assert.equal(sessionSlugFromCwd('/home/devswha/Downloads', HOME), '-Downloads');
  assert.equal(sessionSlugFromCwd('/home/devswha/workspace/oh-my-gjc/', HOME), '-workspace-oh-my-gjc');
  assert.equal(sessionSlugFromCwd('/opt/elsewhere', HOME), '-opt-elsewhere');
});

test('parseTmuxCwds returns unique trimmed non-empty cwds', () => {
  const out = ['/home/devswha/workspace/flask', '', '  /home/devswha/workspace/patina  ', '/home/devswha/workspace/flask'].join('\n');
  assert.deepEqual(parseTmuxCwds(out).sort(), ['/home/devswha/workspace/flask', '/home/devswha/workspace/patina']);
});

test('parseLsofSessionFiles extracts sessionId + slug from lsof -F n output', () => {
  const lsof = [
    'p3304033',
    'n/home/devswha/.gjc/agent/sessions/-workspace-patina/2026-07-09T11-22-59-921Z_019f469d-e1d1-7000-a9aa-a942784b0e2b.jsonl',
    'n/home/devswha/.gjc/agent/logs/app.log',
    'p1506085',
    'n/home/devswha/.gjc/agent/sessions/-Downloads/2026-07-04T04-42-55-461Z_019f2b6f-ce65-7000-8b07-cf0be8b85be0.jsonl',
  ].join('\n');
  const files = parseLsofSessionFiles(lsof);
  assert.deepEqual(files, [
    { sessionId: '019f469d-e1d1-7000-a9aa-a942784b0e2b', slug: '-workspace-patina' },
    { sessionId: '019f2b6f-ce65-7000-8b07-cf0be8b85be0', slug: '-Downloads' },
  ]);
});

test('computeLiveSessionIds intersects tmux panes with lsof-held files', () => {
  const tmuxCwds = ['/home/devswha/workspace/patina', '/home/devswha/workspace/flask'];
  const lsofFiles = [
    { sessionId: 'sess-patina', slug: '-workspace-patina' },
    { sessionId: 'sess-flask', slug: '-workspace-flask' },
    // Held open but NOT in a tmux pane (e.g. Downloads) -> excluded.
    { sessionId: 'sess-downloads', slug: '-Downloads' },
  ];
  const live = computeLiveSessionIds({ tmuxCwds, lsofFiles, home: HOME }).sort();
  assert.deepEqual(live, ['sess-flask', 'sess-patina']);
});

test('computeLiveSessionIds returns empty when no tmux panes (graceful degradation)', () => {
  const live = computeLiveSessionIds({
    tmuxCwds: [],
    lsofFiles: [{ sessionId: 'x', slug: '-workspace-patina' }],
    home: HOME,
  });
  assert.deepEqual(live, []);
});
