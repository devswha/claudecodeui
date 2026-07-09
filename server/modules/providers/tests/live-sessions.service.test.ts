import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeLiveSessionIds,
  parseLsofSessionIds,
  tmuxHasPanes,
} from '@/modules/providers/services/live-sessions.service.js';

test('tmuxHasPanes detects a running tmux server (>=1 pane line)', () => {
  assert.equal(tmuxHasPanes('/home/u/workspace/a\n/home/u/workspace/b\n'), true);
  assert.equal(tmuxHasPanes('   \n\n'), false);
  assert.equal(tmuxHasPanes(''), false);
});

test('parseLsofSessionIds extracts uuids path-agnostically (real path)', () => {
  const lsof = [
    'p3304033',
    'n/home/devswha/.gjc/agent/sessions/-workspace-patina/2026-07-09T11-22-59-921Z_019f469d-e1d1-7000-a9aa-a942784b0e2b.jsonl',
    'n/home/devswha/.gjc/agent/logs/app.log',
  ].join('\n');
  assert.deepEqual(parseLsofSessionIds(lsof), ['019f469d-e1d1-7000-a9aa-a942784b0e2b']);
});

test('parseLsofSessionIds works when .gjc is reached via a decoy-HOME symlink path', () => {
  // Production cloudcli runs under HOME=/home/devswha/.cloudcli-home whose .gjc is a
  // symlink to /home/devswha/.gjc; lsof may report either path form. Both must parse.
  const symlinkPath = 'n/home/devswha/.cloudcli-home/.gjc/agent/sessions/-workspace-flask/2026-07-09T11-39-51-634Z_019f46ad-51d2-7000-a5ea-facfd7f23f52.jsonl';
  const realPath = 'n/home/devswha/.gjc/agent/sessions/-workspace-flask/2026-07-09T11-39-51-634Z_019f46ad-51d2-7000-a5ea-facfd7f23f52.jsonl';
  assert.deepEqual(parseLsofSessionIds(symlinkPath), ['019f46ad-51d2-7000-a5ea-facfd7f23f52']);
  assert.deepEqual(parseLsofSessionIds(realPath), ['019f46ad-51d2-7000-a5ea-facfd7f23f52']);
  // De-duped when both forms appear.
  assert.deepEqual(parseLsofSessionIds(`${symlinkPath}\n${realPath}`), ['019f46ad-51d2-7000-a5ea-facfd7f23f52']);
});

test('computeLiveSessionIds returns held session ids when tmux is present', () => {
  const live = computeLiveSessionIds({
    tmuxPresent: true,
    lsofSessionIds: ['a', 'b', 'a'],
  }).sort();
  assert.deepEqual(live, ['a', 'b']);
});

test('computeLiveSessionIds returns empty when no tmux (graceful degradation)', () => {
  assert.deepEqual(
    computeLiveSessionIds({ tmuxPresent: false, lsofSessionIds: ['a', 'b'] }),
    [],
  );
});
