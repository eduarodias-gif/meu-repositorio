import test from 'node:test';
import assert from 'node:assert/strict';
import { toDashboardMetrics } from '../src/queue/summary.mjs';

test('maps persisted queue summary without synthetic records', () => {
  assert.deepEqual(toDashboardMetrics({
    queue: 7,
    completed: 3,
    review: 4,
    errors: 1,
    restricted: 2,
    total: 14,
  }), {
    queue: 7,
    completed: 3,
    review: 4,
    total: 14,
    progress: 21,
  });
});

test('returns zero progress for an empty persisted queue', () => {
  assert.deepEqual(toDashboardMetrics({
    queue: 0,
    completed: 0,
    review: 0,
    errors: 0,
    restricted: 0,
    total: 0,
  }), {
    queue: 0,
    completed: 0,
    review: 0,
    total: 0,
    progress: 0,
  });
});
