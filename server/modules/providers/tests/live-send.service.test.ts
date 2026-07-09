import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyTowerResponse,
  isValidTmuxName,
  isValidSpawnName,
  classifySpawnResponse,
} from '@/modules/providers/services/live-send.service.js';

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

test('isValidSpawnName accepts safe names but rejects the reserved "company"', () => {
  for (const ok of ['patina', 'magi-stock', 'feat_x', 'a.b_c-1']) {
    assert.equal(isValidSpawnName(ok), true, ok);
  }
  for (const bad of ['company', 'Company', 'COMPANY', '', ' x', 'a b', 'a/b', 42, null]) {
    assert.equal(isValidSpawnName(bad as unknown), false, String(bad));
  }
});

test('classifySpawnResponse: 2xx ok, 409 conflict, 4xx failure (all reachable)', () => {
  assert.deepEqual(classifySpawnResponse(200, 'spawned patina'), {
    ok: true, reachable: true, conflict: false, detail: 'spawned patina',
  });
  const dup = classifySpawnResponse(409, 'name already exists');
  assert.equal(dup.ok, false);
  assert.equal(dup.conflict, true);
  assert.equal(dup.reachable, true);
  const failed = classifySpawnResponse(400, 'cwd must be under $HOME');
  assert.equal(failed.ok, false);
  assert.equal(failed.conflict, false);
});
