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
  '1°1': '1.1',
  '1°2': '1.2',
  '2°1': '2.1',
  '2°2': '2.2',
  '3°1': '3.1',
  '3°2': '3.2',
  '3°3': '3.3',
  '4°1': '4.1',
  '4°2': '4.2',
  '5°1': '5.1',
  '5°2': '5.2',
};

/**
 * Resolves the canonical institutional grade name (e.g. '9°2', '6°1', '1.1', 'Transición 1')
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

  const rawName = String(block.gradeName || '').trim();
  if (rawName && CANONICAL_GRADE_MAP[rawName.toLowerCase()]) {
    return CANONICAL_GRADE_MAP[rawName.toLowerCase()];
  }

  return rawName;
}

/**
 * Resolves the canonical shift ('morning' | 'afternoon' | 'transicion-1') from grade identity first,
 * falling back to block.shift only when grade is ambiguous.
 */
export function resolveCanonicalShift(
  block: Partial<TimeBlockEntity> | null | undefined
): 'morning' | 'afternoon' | 'transicion-1' {
  if (!block) return 'morning';

  const canonicalGrade = resolveCanonicalGradeName(block).toLowerCase();
  const gid = String(block.gradeId || '').toLowerCase().trim();

  if (canonicalGrade.includes('transici') || gid.includes('trans')) {
    return 'transicion-1';
  }

  if (
    /^[1-5](\.|\°|\-|\s)/.test(canonicalGrade) ||
    /^g-[1-5]0[1-9]$/.test(gid) ||
    /^grade-[1-5]0[1-9]$/.test(gid)
  ) {
    return 'afternoon';
  }

  if (
    /^(6|7|8|9|10|11)(\.|\°|\-|\s)/.test(canonicalGrade) ||
    /^g-(6|7|8|9|10|11)0[1-9]$/.test(gid) ||
    /^grade-(6|7|8|9|10|11)0[1-9]$/.test(gid)
  ) {
    return 'morning';
  }

  const s = String(block.shift || '').toLowerCase().trim();
  if (s === 'afternoon' || s === 'tarde' || s === 'primaria') {
    return 'afternoon';
  }
  if (s.includes('transici')) {
    return 'transicion-1';
  }
  return 'morning';
}

/**
 * Normalizes an array of time blocks ensuring each block has its verified canonical gradeName and shift.
 */
export function normalizeTimeBlocksGrades(blocks: TimeBlockEntity[]): TimeBlockEntity[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b) => {
    const canonical = resolveCanonicalGradeName(b);
    const canonicalShift = resolveCanonicalShift(b);
    if ((canonical && b.gradeName !== canonical) || b.shift !== canonicalShift) {
      return {
        ...b,
        gradeName: canonical || b.gradeName,
        shift: canonicalShift,
      };
    }
    return b;
  });
}

