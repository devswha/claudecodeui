import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  LIVE_POLL_BASE_MS,
  LIVE_POLL_BOOST_MS,
  LIVE_POLL_BOOST_WINDOW_MS,
  nextLivePollDelay,
  requestLivePollBoost,
  resetLivePollBoost,
} from './livePollBoost';

describe('livePollBoost', () => {
  beforeEach(() => {
    resetLivePollBoost();
  });

  it('returns the base delay when no boost was requested', () => {
    assert.equal(nextLivePollDelay(1_000), LIVE_POLL_BASE_MS);
  });

  it('returns the boost delay inside the boost window', () => {
    requestLivePollBoost(10_000);
    assert.equal(nextLivePollDelay(10_000), LIVE_POLL_BOOST_MS);
    assert.equal(nextLivePollDelay(10_000 + LIVE_POLL_BOOST_WINDOW_MS - 1), LIVE_POLL_BOOST_MS);
  });

  it('falls back to the base delay once the window expires', () => {
    requestLivePollBoost(10_000);
    assert.equal(nextLivePollDelay(10_000 + LIVE_POLL_BOOST_WINDOW_MS), LIVE_POLL_BASE_MS);
  });

  it('a later request extends the window; an earlier one never shortens it', () => {
    requestLivePollBoost(10_000);
    requestLivePollBoost(20_000);
    assert.equal(nextLivePollDelay(20_000 + LIVE_POLL_BOOST_WINDOW_MS - 1), LIVE_POLL_BOOST_MS);
    // Out-of-order (older timestamp) request must not shrink the active window.
    requestLivePollBoost(5_000);
    assert.equal(nextLivePollDelay(20_000 + LIVE_POLL_BOOST_WINDOW_MS - 1), LIVE_POLL_BOOST_MS);
  });

  it('custom window sizes are honored', () => {
    requestLivePollBoost(0, 2_000);
    assert.equal(nextLivePollDelay(1_999), LIVE_POLL_BOOST_MS);
    assert.equal(nextLivePollDelay(2_000), LIVE_POLL_BASE_MS);
  });
});
