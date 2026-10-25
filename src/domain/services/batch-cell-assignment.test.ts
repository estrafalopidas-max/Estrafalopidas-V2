import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSelectedCellTargets,
  applyBatchCellAssignment,
  resolveTeacherDefaultSubject,
} from './batch-cell-assignment.service';
import { createSlotDroppableId } from './dnd-slot.helper';
import { GradeEntity } from '../entities/grade.entity';
import { TimeBlockEntity } from '../entities/time-block.entity';
import { UserEntity } from '../entities/user.entity';

const SAMPLE_GRADES: GradeEntity[] = [
  {
    id: 'g-601',
    gradeLevel: '6°',
    groupName: '1',
    fullName: '6°1',
    shift: 'morning',
    defaultClassroomId: 'Aula 303',
    studentCount: 35,
  },
  {
    id: 'g-602',
    gradeLevel: '6°',
    groupName: '2',
    fullName: '6°2',
    shift: 'morning',
    defaultClassroomId: 'Aula 402',
    studentCount: 35,
  },
  {
    id: 'g-1001',
    gradeLevel: '10°',
    groupName: '1',
    fullName: '10°1',
    shift: 'morning',
    defaultClassroomId: 'Aula 201',
    studentCount: 35,
  },
];

const SAMPLE_PERIODS = [
  { period: 1, time: '06:10 - 07:05' },
  { period: 2, time: '07:05 - 08:00' },
  { period: 7, time: '12:40 - 13:35' },
];

const SAMPLE_TEACHER: UserEntity = {
  id: 't-carlos',
  email: 'carlos@villaflora.edu.co',
  displayName: 'Carlos Andrés Pérez',
  role: 'teacher',
  documentId: '123456',
  subjects: ['Matemáticas'],
  allowedSubjects: ['Matemáticas'],
  isActive: true,
  maxWeeklyHours: 24,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

test('resolveSelectedCellTargets deduplicates droppableId and block.id for the same cell', () => {
  const existingBlock: TimeBlockEntity = {
    id: 'tb-g-601-monday-p1',
    block_type: 'class',
    dayOfWeek: 'monday',
    period: 1,
    startTime: '06:10',
    endTime: '07:05',
    shift: 'morning',
    gradeId: 'g-601',
    gradeName: '6°1',
    subject: 'Ciencias Naturales',
    teacherId: 't-other',
    teacherName: 'Otro Docente',
    classroomId: 'Aula 303',
    classroomName: 'Aula 303',
    status: 'regular',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const slot1 = createSlotDroppableId(SAMPLE_GRADES[0], 1);
  const slot2 = createSlotDroppableId(SAMPLE_GRADES[1], 2);

  const targets = resolveSelectedCellTargets({
    selectedIds: [slot1, existingBlock.id, slot2],
    timeBlocks: [existingBlock],
    grades: SAMPLE_GRADES,
    dayOfWeek: 'monday',
    shift: 'morning',
    periods: SAMPLE_PERIODS,
  });

  assert.equal(targets.length, 2);
  assert.equal(targets[0].grade.id, 'g-601');
  assert.equal(targets[0].period, 1);
  assert.equal(targets[0].existingBlock?.id, 'tb-g-601-monday-p1');
  assert.equal(targets[1].grade.id, 'g-602');
  assert.equal(targets[1].period, 2);
  assert.equal(targets[1].existingBlock, null);
});

test('applyBatchCellAssignment assigns the same subject to multiple cells while preserving existing teachers', () => {
  const existingBlock: TimeBlockEntity = {
    id: 'tb-g-601-monday-p1',
    block_type: 'class',
    dayOfWeek: 'monday',
    period: 1,
    startTime: '06:10',
    endTime: '07:05',
    shift: 'morning',
    gradeId: 'g-601',
    gradeName: '6°1',
    subject: 'Ciencias Naturales',
    teacherId: 't-other',
    teacherName: 'Docente Existente',
    classroomId: 'Aula 303',
    classroomName: 'Aula 303',
    status: 'regular',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const targets = resolveSelectedCellTargets({
    selectedIds: [
      existingBlock.id,
      createSlotDroppableId(SAMPLE_GRADES[1], 2),
    ],
    timeBlocks: [existingBlock],
    grades: SAMPLE_GRADES,
    dayOfWeek: 'monday',
    shift: 'morning',
    periods: SAMPLE_PERIODS,
  });

  const { nextBlocks, updatedBlocks } = applyBatchCellAssignment({
    targets,
    timeBlocks: [existingBlock],
    dayOfWeek: 'monday',
    shift: 'morning',
    subject: 'Humanidades, Lengua Castellana e Idiomas Extranjeros (Inglés)',
    nowIso: '2026-10-25T12:00:00.000Z',
  });

  assert.equal(updatedBlocks.length, 2);
  assert.equal(nextBlocks.length, 2);

  const b1 = nextBlocks.find((b) => b.gradeId === 'g-601' && b.period === 1)!;
  assert.equal(b1.subject, 'Humanidades, Lengua Castellana e Idiomas Extranjeros (Inglés)');
  assert.equal(b1.teacherId, 't-other');
  assert.equal(b1.teacherName, 'Docente Existente');

  const b2 = nextBlocks.find((b) => b.gradeId === 'g-602' && b.period === 2)!;
  assert.equal(b2.subject, 'Humanidades, Lengua Castellana e Idiomas Extranjeros (Inglés)');
  assert.equal(b2.teacherId, 'unassigned');
  assert.equal(b2.teacherName, 'Sin Asignar');
  assert.equal(b2.classroomName, 'Aula 402');
});

test('applyBatchCellAssignment assigns the same teacher across multiple cells and resolves default or preserved subjects', () => {
  const existingBlock: TimeBlockEntity = {
    id: 'tb-g-601-monday-p1',
    block_type: 'class',
    dayOfWeek: 'monday',
    period: 1,
    startTime: '06:10',
    endTime: '07:05',
    shift: 'morning',
    gradeId: 'g-601',
    gradeName: '6°1',
    subject: 'Geometría',
    teacherId: 't-old',
    teacherName: 'Docente Anterior',
    classroomId: 'Aula 303',
    classroomName: 'Aula 303',
    status: 'regular',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const targets = resolveSelectedCellTargets({
    selectedIds: [
      existingBlock.id,
      createSlotDroppableId(SAMPLE_GRADES[1], 2),
    ],
    timeBlocks: [existingBlock],
    grades: SAMPLE_GRADES,
    dayOfWeek: 'monday',
    shift: 'morning',
    periods: SAMPLE_PERIODS,
  });

  const { updatedBlocks } = applyBatchCellAssignment({
    targets,
    timeBlocks: [existingBlock],
    dayOfWeek: 'monday',
    shift: 'morning',
    teacher: SAMPLE_TEACHER,
    preserveExistingSubjectWhenTeacherOnly: true,
  });

  assert.equal(updatedBlocks.length, 2);
  // First cell keeps its existing valid subject when preserveExistingSubjectWhenTeacherOnly=true
  assert.equal(updatedBlocks[0].teacherId, 't-carlos');
  assert.equal(updatedBlocks[0].subject, 'Geometría');

  // Second (empty) cell gets teacher's default official subject
  assert.equal(updatedBlocks[1].teacherId, 't-carlos');
  assert.equal(updatedBlocks[1].subject, resolveTeacherDefaultSubject(SAMPLE_TEACHER));
});
