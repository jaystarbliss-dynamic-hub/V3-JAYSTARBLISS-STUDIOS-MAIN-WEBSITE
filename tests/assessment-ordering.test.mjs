import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toTimestampMs,
  getAssessmentRecencyTimestampMs,
  sortAssessments,
  groupAssessmentsByRecency,
  formatAssessmentRecencyLabel,
  sortDropdownLabels,
  sortNamedEntities,
} from '../src/lib/assessmentOrdering.ts';

const NOW = Date.parse('2026-11-26T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

test('toTimestampMs parses Firestore Timestamp, seconds object, Date, ISO string, and numbers', () => {
  assert.equal(toTimestampMs(new Date(NOW)), NOW);
  assert.equal(toTimestampMs('2026-11-26T12:00:00.000Z'), NOW);
  assert.equal(toTimestampMs({ seconds: Math.floor(NOW / 1000), nanoseconds: 0 }), Math.floor(NOW / 1000) * 1000);
  assert.equal(toTimestampMs({ toDate: () => new Date(NOW) }), NOW);
  assert.equal(toTimestampMs(null), 0);
  assert.equal(toTimestampMs('invalid-date'), 0);
});

test('sortAssessments orders newest to oldest, oldest to newest, and alphabetically', () => {
  const items = [
    { id: 'old', title: 'Alpha Quiz', createdAt: new Date(NOW - 40 * DAY).toISOString() },
    { id: 'new', title: 'Zulu Test', createdAt: new Date(NOW - 1 * DAY).toISOString() },
    { id: 'mid', title: 'Midterm Exam', createdAt: new Date(NOW - 12 * DAY).toISOString() },
  ];

  assert.deepEqual(
    sortAssessments(items, 'newest', { nowMs: NOW }).map((x) => x.id),
    ['new', 'mid', 'old']
  );
  assert.deepEqual(
    sortAssessments(items, 'oldest', { nowMs: NOW }).map((x) => x.id),
    ['old', 'mid', 'new']
  );
  assert.deepEqual(
    sortAssessments(items, 'alpha', { nowMs: NOW }).map((x) => x.id),
    ['old', 'mid', 'new']
  );
});

test('concluded mode prioritizes manuallyClosedAt and past closing dates so just-concluded assessments sit at top', () => {
  const justClosed = {
    id: 'just-closed',
    title: 'Robotics Practical',
    status: 'completed',
    createdAt: new Date(NOW - 20 * DAY).toISOString(),
    manuallyClosedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
  };
  const olderCreated = {
    id: 'older',
    title: 'Coding Basics',
    status: 'completed',
    createdAt: new Date(NOW - 5 * DAY).toISOString(),
    availableUntil: new Date(NOW - 4 * DAY).toISOString(),
  };

  assert.ok(
    getAssessmentRecencyTimestampMs(justClosed, { mode: 'concluded', nowMs: NOW }) >
      getAssessmentRecencyTimestampMs(olderCreated, { mode: 'concluded', nowMs: NOW })
  );
  assert.deepEqual(
    sortAssessments([olderCreated, justClosed], 'newest', { mode: 'concluded', nowMs: NOW }).map((x) => x.id),
    ['just-closed', 'older']
  );
});

test('general mode does not let an old active exam with a far-future closing date jump ahead of a newly created exam', () => {
  const oldWithFutureClose = {
    id: 'old-active',
    title: 'Term Long Assessment',
    status: 'active',
    createdAt: new Date(NOW - 35 * DAY).toISOString(),
    availableUntil: new Date(NOW + 60 * DAY).toISOString(),
  };
  const brandNew = {
    id: 'new-active',
    title: 'Today Quiz',
    status: 'active',
    createdAt: new Date(NOW - 1 * 60 * 60 * 1000).toISOString(),
    availableUntil: new Date(NOW + 2 * DAY).toISOString(),
  };

  assert.deepEqual(
    sortAssessments([oldWithFutureClose, brandNew], 'newest', { mode: 'general', nowMs: NOW }).map((x) => x.id),
    ['new-active', 'old-active']
  );
});

test('groupAssessmentsByRecency creates Gmail-style buckets and omits empty buckets', () => {
  const items = [
    { id: 'a', title: 'Older', createdAt: new Date(NOW - 45 * DAY).toISOString() },
    { id: 'b', title: 'Recent 1', createdAt: new Date(NOW - 1 * DAY).toISOString() },
    { id: 'c', title: 'This Month', createdAt: new Date(NOW - 14 * DAY).toISOString() },
    { id: 'd', title: 'Recent 2', createdAt: new Date(NOW - 3 * DAY).toISOString() },
  ];

  const groups = groupAssessmentsByRecency(items, { mode: 'concluded', nowMs: NOW });
  assert.deepEqual(
    groups.map((g) => ({ key: g.key, ids: g.items.map((x) => x.id) })),
    [
      { key: 'most_recent', ids: ['b', 'd'] },
      { key: 'this_month', ids: ['c'] },
      { key: 'older', ids: ['a'] },
    ]
  );
  assert.equal(groups[0].label, 'Most Recent & Just Concluded');
});

test('formatAssessmentRecencyLabel formats Yesterday, days ago, and older dates cleanly', () => {
  const yesterday = { createdAt: new Date(NOW - 1 * DAY).toISOString() };
  const threeDays = { createdAt: new Date(NOW - 3 * DAY).toISOString() };
  const undated = {};

  assert.equal(formatAssessmentRecencyLabel(yesterday, { nowMs: NOW }), 'Yesterday');
  assert.equal(formatAssessmentRecencyLabel(threeDays, { nowMs: NOW }), '3 days ago');
  assert.equal(formatAssessmentRecencyLabel(undated, { nowMs: NOW }), 'Undated');
});

test('dropdown sorters order classes numerically and named entities alphabetically', () => {
  assert.deepEqual(
    sortDropdownLabels(['Grade 10', 'Grade 2', 'Grade 1', 'JSS 2', 'JSS 1']),
    ['Grade 1', 'Grade 2', 'Grade 10', 'JSS 1', 'JSS 2']
  );
  assert.deepEqual(
    sortNamedEntities([{ name: 'Zebra High' }, { name: 'Alpha Academy' }, { name: 'Beacon School' }]).map((s) => s.name),
    ['Alpha Academy', 'Beacon School', 'Zebra High']
  );
});
