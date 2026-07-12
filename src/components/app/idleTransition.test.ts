import assert from 'node:assert/strict';
import test from 'node:test';

import type { IdleGjcTarget } from '../../types/app';

import {
  buildIdleTarget,
  composerKey,
  computeIdleStep,
  isGenerationReplaced,
  newEligibleSessionIds,
  nextResolvingOnStep,
} from './idleTransition';

const idleId = 'idle-gjc:flask';
const tmuxName = 'flask';
const tmuxId = '$1';

function target(excludedSessionIds: readonly string[] = []): IdleGjcTarget {
  return { kind: 'idle-gjc', tmuxName, tmuxId, excludedSessionIds };
}

test('buildIdleTarget rejects non-idle ids', () => {
  const names = new Map([['session-1', tmuxName]]);
  const lineage = new Set(['session-1']);
  const tmuxIds = new Map([['session-1', tmuxId]]);

  assert.equal(buildIdleTarget('session-1', names, lineage, tmuxIds), null);
});

test('buildIdleTarget rejects an idle id without a tmux name', () => {
  const names = new Map<string, string>();
  const lineage = new Set([idleId]);
  const tmuxIds = new Map([[idleId, tmuxId]]);

  assert.equal(buildIdleTarget(idleId, names, lineage, tmuxIds), null);
});

test('buildIdleTarget rejects an idle id without a tmux generation', () => {
  const names = new Map([[idleId, tmuxName]]);
  const lineage = new Set([idleId]);
  const tmuxIds = new Map<string, string>();

  assert.equal(buildIdleTarget(idleId, names, lineage, tmuxIds), null);
});

test('buildIdleTarget rejects an idle id outside the live-session lineage', () => {
  const names = new Map([[idleId, tmuxName]]);
  const lineage = new Set<string>();
  const tmuxIds = new Map([[idleId, tmuxId]]);

  assert.equal(buildIdleTarget(idleId, names, lineage, tmuxIds), null);
});

test('buildIdleTarget captures eligible sessions when the waiting view opens', () => {
  const names = new Map([
    [idleId, tmuxName],
    ['existing', tmuxName],
    ['wrong-generation', tmuxName],
    ['outside-lineage', tmuxName],
  ]);
  const lineage = new Set([idleId, 'existing', 'wrong-generation']);
  const tmuxIds = new Map([
    [idleId, tmuxId],
    ['existing', tmuxId],
    ['wrong-generation', '$2'],
    ['outside-lineage', tmuxId],
  ]);

  assert.deepEqual(buildIdleTarget(idleId, names, lineage, tmuxIds), {
    kind: 'idle-gjc',
    tmuxName,
    tmuxId,
    excludedSessionIds: ['existing'],
  });
});

test('newEligibleSessionIds excludes candidates present when the waiting view opened', () => {
  const names = new Map([
    ['existing', tmuxName],
    ['new-session', tmuxName],
    ['wrong-generation', tmuxName],
  ]);
  const lineage = new Set(['existing', 'new-session', 'wrong-generation']);
  const tmuxIds = new Map([
    ['existing', tmuxId],
    ['new-session', tmuxId],
    ['wrong-generation', '$2'],
  ]);

  assert.deepEqual(newEligibleSessionIds(target(['existing']), names, lineage, tmuxIds), ['new-session']);
});

test('isGenerationReplaced treats source removal as a normal transition', () => {
  assert.equal(isGenerationReplaced(target(), new Map()), false);
});

test('isGenerationReplaced accepts the current source generation', () => {
  assert.equal(isGenerationReplaced(target(), new Map([[idleId, tmuxId]])), false);
});

test('isGenerationReplaced detects an observed source generation replacement', () => {
  assert.equal(isGenerationReplaced(target(), new Map([[idleId, '$2']])), true);
});

test('computeIdleStep stays idle when stale debounce candidates were captured at open time', () => {
  const names = new Map([[idleId, tmuxName], ['stale-session', tmuxName]]);
  const lineage = new Set([idleId, 'stale-session']);
  const tmuxIds = new Map([[idleId, tmuxId], ['stale-session', tmuxId]]);
  const opened = buildIdleTarget(idleId, names, lineage, tmuxIds);

  assert.ok(opened);
  assert.deepEqual(computeIdleStep(opened, names, lineage, tmuxIds, () => true), { type: 'idle' });
});

test('computeIdleStep reports ambiguous for two or more new eligible candidates', () => {
  const names = new Map([['first', tmuxName], ['second', tmuxName]]);
  const lineage = new Set(['first', 'second']);
  const tmuxIds = new Map([['first', tmuxId], ['second', tmuxId]]);

  assert.deepEqual(computeIdleStep(target(), names, lineage, tmuxIds, () => false), { type: 'ambiguous' });
});

test('computeIdleStep resolves a new candidate after the idle source disappears', () => {
  const names = new Map([['new-session', tmuxName]]);
  const lineage = new Set(['new-session']);
  const tmuxIds = new Map([['new-session', tmuxId]]);

  assert.deepEqual(computeIdleStep(target(), names, lineage, tmuxIds, () => false), {
    type: 'resolving',
    targetId: 'new-session',
  });
});

test('computeIdleStep navigates once the new candidate owner is loaded', () => {
  const names = new Map([['new-session', tmuxName]]);
  const lineage = new Set(['new-session']);
  const tmuxIds = new Map([['new-session', tmuxId]]);

  assert.deepEqual(computeIdleStep(target(), names, lineage, tmuxIds, (id) => id === 'new-session'), {
    type: 'navigate',
    targetId: 'new-session',
  });
});

test('computeIdleStep remains idle when no candidate exists after the source disappears', () => {
  assert.deepEqual(
    computeIdleStep(target(), new Map(), new Set(), new Map(), () => false),
    { type: 'idle' },
  );
});

test('computeIdleStep invalidates before evaluating candidates after a generation replacement', () => {
  const names = new Map([[idleId, tmuxName], ['new-session', tmuxName]]);
  const lineage = new Set([idleId, 'new-session']);
  const tmuxIds = new Map([[idleId, '$2'], ['new-session', tmuxId]]);

  assert.deepEqual(computeIdleStep(target(), names, lineage, tmuxIds, () => true), { type: 'invalidate' });
});

test('computeIdleStep supports poll-first candidate then owner loading', () => {
  const names = new Map([['new-session', tmuxName]]);
  const lineage = new Set(['new-session']);
  const tmuxIds = new Map([['new-session', tmuxId]]);

  assert.deepEqual(computeIdleStep(target(), names, lineage, tmuxIds, () => false), {
    type: 'resolving',
    targetId: 'new-session',
  });
  assert.deepEqual(computeIdleStep(target(), names, lineage, tmuxIds, () => true), {
    type: 'navigate',
    targetId: 'new-session',
  });
});

test('computeIdleStep supports upsert-first owner then candidate arrival', () => {
  const noCandidates = new Map<string, string>();
  const candidateNames = new Map([['new-session', tmuxName]]);
  const lineage = new Set(['new-session']);
  const tmuxIds = new Map([['new-session', tmuxId]]);

  assert.deepEqual(computeIdleStep(target(), noCandidates, lineage, tmuxIds, () => true), { type: 'idle' });
  assert.deepEqual(computeIdleStep(target(), candidateNames, lineage, tmuxIds, () => true), {
    type: 'navigate',
    targetId: 'new-session',
  });
});

test('composerKey changes when either pane identity component changes', () => {
  assert.notEqual(composerKey('flask', '$1'), composerKey('flask', '$2'));
  assert.notEqual(composerKey('flask', '$1'), composerKey('beaker', '$1'));
});

test('nextResolvingOnStep replaces a changed target and preserves an unchanged timed-out target', () => {
  const timedOut = { targetId: 'first', startedAt: 10, timedOut: true };

  assert.deepEqual(nextResolvingOnStep(timedOut, { type: 'resolving', targetId: 'second' }, 20), {
    targetId: 'second',
    startedAt: 20,
    timedOut: false,
  });
  assert.strictEqual(
    nextResolvingOnStep(timedOut, { type: 'resolving', targetId: 'first' }, 20),
    timedOut,
  );
});

test('nextResolvingOnStep clears for idle, ambiguous, and invalidated states', () => {
  const resolving = { targetId: 'session', startedAt: 10, timedOut: false };

  assert.equal(nextResolvingOnStep(resolving, { type: 'idle' }, 20), null);
  assert.equal(nextResolvingOnStep(resolving, { type: 'ambiguous' }, 20), null);
  assert.equal(nextResolvingOnStep(resolving, { type: 'invalidate' }, 20), null);
});

test('nextResolvingOnStep clears before navigation', () => {
  const resolving = { targetId: 'session', startedAt: 10, timedOut: false };

  assert.equal(nextResolvingOnStep(resolving, { type: 'navigate', targetId: 'session' }, 20), null);
});
