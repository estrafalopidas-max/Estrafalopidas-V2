import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAutomaticScheduleDistribution } from './auto-schedule-distributor.service.ts';
import { SEED_TEACHERS, SEED_GRADES } from '../../infrastructure/seed/initial-seed.ts';
import { isTeacherPresentAtSlot } from './teacher-normalization.service.ts';

test('generateAutomaticScheduleDistribution generates a weekly schedule without teacher collisions or slot collisions', () => {
  const blocks = generateAutomaticScheduleDistribution(SEED_TEACHERS, SEED_GRADES);

  assert.ok(blocks.length > 400, `Expected > 400 generated blocks across shifts, got ${blocks.length}`);

  // 1. Check no duplicate slot (shift + day + gradeId + period)
  const slotSet = new Set<string>();
  // 2. Check no teacher collision (shift + day + period + teacherId)
  const teacherSlotSet = new Set<string>();

  for (const b of blocks) {
    const slotKey = `${b.shift}__${b.dayOfWeek}__${b.gradeId}__${b.period}`;
    assert.equal(slotSet.has(slotKey), false, `Duplicate slot detected: ${slotKey}`);
    slotSet.add(slotKey);

    const teacherKey = `${b.shift}__${b.dayOfWeek}__${b.period}__${b.teacherId}`;
    assert.equal(
      teacherSlotSet.has(teacherKey),
      false,
      `Teacher collision detected for ${b.teacherName} (${b.teacherId}) at ${teacherKey}`
    );
    teacherSlotSet.add(teacherKey);

    // 3. Verify teacher entry schedule compliance (Omar Mosquera & Alexander Uribe)
    assert.equal(
      isTeacherPresentAtSlot(b.teacherId, b.teacherName, b.dayOfWeek, b.period, b.shift).isPresent,
      true,
      `Teacher ${b.teacherName} scheduled outside entry hours on ${b.dayOfWeek} at period ${b.period}`
    );
  }

  // 4. Verify all 3 shifts have blocks generated
  const morningBlocks = blocks.filter((b) => b.shift === 'morning');
  const afternoonBlocks = blocks.filter((b) => b.shift === 'afternoon');
  const transicionBlocks = blocks.filter((b) => b.shift === 'transicion-1');

  assert.ok(morningBlocks.length > 200, 'Must generate Bachillerato (morning) blocks');
  assert.equal(afternoonBlocks.length, 11 * 5 * 5, 'Must generate full 275 Primaria (afternoon) blocks');
  assert.equal(transicionBlocks.length, 2 * 5 * 5, 'Must generate full 50 Transición blocks');
});

test('generateAutomaticScheduleDistribution resolves canonical grades even when legacy teacher records lack assignedGradeIds', () => {
  const legacyTeachers = SEED_TEACHERS.map((t) => ({
    ...t,
    assignedGradeIds: undefined,
    subjects: undefined,
  }));

  const blocks = generateAutomaticScheduleDistribution(legacyTeachers, SEED_GRADES);
  assert.ok(blocks.length >= 600, `Expected >= 600 generated blocks even with legacy teacher records, got ${blocks.length}`);

  const morningBlocks = blocks.filter((b) => b.shift === 'morning');
  const afternoonBlocks = blocks.filter((b) => b.shift === 'afternoon');
  const transicionBlocks = blocks.filter((b) => b.shift === 'transicion-1');

  assert.ok(morningBlocks.length >= 280, `Expected >= 280 Bachillerato blocks, got ${morningBlocks.length}`);
  assert.equal(afternoonBlocks.length, 275, 'Must generate all 275 Primaria blocks');
  assert.equal(transicionBlocks.length, 50, 'Must generate all 50 Transición blocks');
});

