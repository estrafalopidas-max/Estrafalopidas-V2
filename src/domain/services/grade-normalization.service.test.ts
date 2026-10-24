import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCanonicalGradeName, normalizeTimeBlocksGrades } from './grade-normalization.service.ts';
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
