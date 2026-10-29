import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSnapshotTimestamp,
  selectMostRecentSnapshot,
  CachedScheduleCandidate,
} from '../schedule-cache-strategy.service';

describe('schedule-cache-strategy.service (Cache-First resolution)', () => {
  it('extracts the highest timestamp across top-level, metadata, and dayConfigs', () => {
    const candidate: Partial<CachedScheduleCandidate> = {
      updatedAtMs: 1700000001000,
      metadata: {
        lastUpdated: '2026-10-27T12:00:00.000Z',
        totalBlocks: 10,
        institution: 'I.E. Villa Flora',
        updatedAtMs: 1700000005000,
      },
      dayConfigs: {
        meetingDays: {},
        eventDays: {},
        customHolidays: [],
        updatedAtMs: 1700000003000,
      },
    };

    assert.equal(extractSnapshotTimestamp(candidate), 1700000005000);
  });

  it('selects the most recent snapshot and discards stale previous-day data', () => {
    const yesterdaySnapshot: CachedScheduleCandidate = {
      updatedAtMs: 1729987200000,
      timeBlocks: [{ id: 'old-1', day: 'Lunes', period: 1, time: '06:30', subject: 'Ayer', teacher: 'Docente A', grade: '6°A' }],
      metadata: {
        lastUpdated: '2026-10-27T08:00:00.000Z',
        totalBlocks: 1,
        institution: 'I.E. Villa Flora',
        updatedAtMs: 1729987200000,
      },
    };

    const todaySnapshot: CachedScheduleCandidate = {
      updatedAtMs: 1730073600000,
      timeBlocks: [{ id: 'new-1', day: 'Lunes', period: 1, time: '06:30', subject: 'Hoy', teacher: 'Docente B', grade: '6°A' }],
      metadata: {
        lastUpdated: '2026-10-28T08:00:00.000Z',
        totalBlocks: 1,
        institution: 'I.E. Villa Flora',
        updatedAtMs: 1730073600000,
      },
    };

    const winner = selectMostRecentSnapshot([yesterdaySnapshot, todaySnapshot, null]);
    assert.ok(winner);
    assert.equal(winner.timeBlocks[0]?.id, 'new-1');
    assert.equal(extractSnapshotTimestamp(winner), 1730073600000);
  });
});
