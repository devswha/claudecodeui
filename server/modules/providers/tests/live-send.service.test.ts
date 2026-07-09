import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyTowerResponse, isValidTmuxName } from '@/modules/providers/services/live-send.service.js';

test('isValidTmuxName accepts simple session tokens, rejects unsafe ones', () => {
  for (const ok of ['omg', 'magi-stock', 'flask', 'company-gjc', 'a.b_c-1']) {
    assert.equal(isValidTmuxName(ok), true, ok);
  }
  for (const bad of ['', ' omg', 'a b', 'a;b', 'a/b', '$(x)', '-lead', 42, null, undefined]) {
    assert.equal(isValidTmuxName(bad as unknown), false, String(bad));
  }
});

test('classifyTowerResponse marks 2xx as delivered and detects queueing', () => {
  const delivered = classifyTowerResponse(200, 'sent to omg');
  assert.deepEqual(delivered, { ok: true, reachable: true, queued: false, detail: 'sent to omg' });

  const queued = classifyTowerResponse(200, 'queued id=57 (busy)');
  assert.equal(queued.ok, true);
  assert.equal(queued.queued, true);
});

test('classifyTowerResponse marks non-2xx as failure (still reachable)', () => {
  const failed = classifyTowerResponse(500, 'send-keys failed');
  assert.equal(failed.ok, false);
  assert.equal(failed.reachable, true);
  assert.equal(failed.detail, 'send-keys failed');
});
