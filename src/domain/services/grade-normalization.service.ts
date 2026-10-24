import { TimeBlockEntity } from '../entities/time-block.entity';

export const CANONICAL_GRADE_MAP: Record<string, string> = {
  'g-601': '6°1',
  'grade-601': '6°1',
  'g-602': '6°2',
  'grade-602': '6°2',
  'g-701': '7°1',
  'grade-701': '7°1',
  'g-702': '7°2',
  'grade-702': '7°2',
  'g-801': '8°1',
  'grade-801': '8°1',
  'g-802': '8°2',
  'grade-802': '8°2',
  'g-901': '9°1',
  'grade-901': '9°1',
  'g-902': '9°2',
  'grade-902': '9°2',
  'g-1001': '10°1',
  'grade-1001': '10°1',
  'g-1002': '10°2',
  'grade-1002': '10°2',
  'g-1101': '11°1',
  'grade-1101': '11°1',
  'g-1102': '11°2',
  'grade-1102': '11°2',
  'g-trans-1': 'Transición 1',
  'grade-trans-1': 'Transición 1',
  'g-trans-2': 'Transición 2',
  'grade-trans-2': 'Transición 2',
  'g-101': '1.1',
  'grade-101': '1.1',
  'g-102': '1.2',
  'grade-102': '1.2',
  'g-201': '2.1',
  'grade-201': '2.1',
  'g-202': '2.2',
  'grade-202': '2.2',
  'g-301': '3.1',
  'grade-301': '3.1',
  'g-302': '3.2',
  'grade-302': '3.2',
  'g-303': '3.3',
  'grade-303': '3.3',
  'g-401': '4.1',
  'grade-401': '4.1',
  'g-402': '4.2',
  'grade-402': '4.2',
  'g-501': '5.1',
  'grade-501': '5.1',
  'g-502': '5.2',
  'grade-502': '5.2',
};

/**
 * Resolves the canonical institutional grade name (e.g. '9°2', '6°1', 'Transición 1')
 * using gradeId, embedded block id, or fallback to existing gradeName.
 * Prevents slot duplication caused by inconsistent grade names.
 */
export function resolveCanonicalGradeName(block: Partial<TimeBlockEntity> | null | undefined): string {
  if (!block) return '';

  const gradeId = String(block.gradeId || '').toLowerCase().trim();
  if (gradeId && CANONICAL_GRADE_MAP[gradeId]) {
    return CANONICAL_GRADE_MAP[gradeId];
  }

  const id = String(block.id || '').toLowerCase().trim();
  const match = id.match(/^tb-(g-[a-z0-9]+(?:-[0-9]+)?)-/);
  if (match && CANONICAL_GRADE_MAP[match[1]]) {
    return CANONICAL_GRADE_MAP[match[1]];
  }

  return String(block.gradeName || '').trim();
}

/**
 * Normalizes an array of time blocks ensuring each block has its verified canonical gradeName.
 */
export function normalizeTimeBlocksGrades(blocks: TimeBlockEntity[]): TimeBlockEntity[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b) => {
    const canonical = resolveCanonicalGradeName(b);
    if (canonical && b.gradeName !== canonical) {
      return { ...b, gradeName: canonical };
    }
    return b;
  });
}
