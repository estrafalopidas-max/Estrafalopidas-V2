import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCanonicalGradeName,
  normalizeTimeBlocksGrades,
  resolveEffectiveClassroomForBlock,
} from './grade-normalization.service.ts';
import { TimeBlockEntity } from '../entities/time-block.entity.ts';

test('resolveCanonicalGradeName resolves correctly by gradeId', () => {
  assert.equal(resolveCanonicalGradeName({ gradeId: 'g-902', gradeName: '9°1' }), '9°2');
  assert.equal(resolveCanonicalGradeName({ gradeId: 'g-601', gradeName: '' }), '6°1');
  assert.equal(resolveCanonicalGradeName({ gradeId: 'g-trans-1', gradeName: 'Transicion 1' }), 'Transición 1');
});

test('resolveCanonicalGradeName resolves from embedded block ID when gradeId is missing', () => {
  assert.equal(resolveCanonicalGradeName({ id: 'tb-g-902-jueves-p1', gradeName: '9°1' }), '9°2');
  assert.equal(resolveCanonicalGradeName({ id: 'tb-g-1102-lunes-p3' }), '11°2');
});

test('normalizeTimeBlocksGrades corrects misassigned grade names', () => {
  const blocks: Partial<TimeBlockEntity>[] = [
    { id: 'tb-g-901-jueves-p1', gradeId: 'g-901', gradeName: '9°1', subject: 'Tecnología' },
    { id: 'tb-g-902-jueves-p1', gradeId: 'g-902', gradeName: '9°1', subject: 'Estadística' }, // typo in gradeName
  ];

  const normalized = normalizeTimeBlocksGrades(blocks as TimeBlockEntity[]);
  assert.equal(normalized[0].gradeName, '9°1');
  assert.equal(normalized[1].gradeName, '9°2');
});

test('resolveEffectiveClassroomForBlock matches top header row in Planes de apoyo periods (101-104)', () => {
  assert.equal(
    resolveEffectiveClassroomForBlock({ gradeId: 'g-602', gradeName: '6°2', period: 101, classroomName: 'Aula 402' }),
    'Aula 303'
  );
  assert.equal(
    resolveEffectiveClassroomForBlock({ gradeId: 'g-702', gradeName: '7°2', period: 102, classroomName: 'Aula 304' }),
    'Aula 201'
  );
  assert.equal(
    resolveEffectiveClassroomForBlock({ gradeId: 'g-801', gradeName: '8°1', period: 103, classroomName: 'Aula 401' }),
    'Aula 103'
  );
  assert.equal(
    resolveEffectiveClassroomForBlock({ gradeId: 'g-901', gradeName: '9°1', period: 104, classroomName: 'Aula (ROTACIÓN)' }),
    'Aula 301'
  );
  assert.equal(
    resolveEffectiveClassroomForBlock({ gradeId: 'g-1001', gradeName: '10°1', period: 101, classroomName: 'Aula 201' }),
    'Aula 202'
  );
  assert.equal(
    resolveEffectiveClassroomForBlock({ gradeId: 'g-1102', gradeName: '11°2', period: 104, classroomName: 'Aula 305' }),
    'Aula 102'
  );
  // Regular periods (1-11) preserve the regular classroom from the Horario A intermediate header
  assert.equal(
    resolveEffectiveClassroomForBlock({ gradeId: 'g-602', gradeName: '6°2', period: 1, classroomName: 'Aula 402' }),
    'Aula 402'
  );
});
