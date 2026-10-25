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

export const SUPPORT_PLAN_GRADE_CLASSROOMS: Record<string, string> = {
  '6°': 'Aula 303',
  '7°': 'Aula 201',
  '8°': 'Aula 103',
  '9°': 'Aula 301',
  '10°': 'Aula 202',
  '11°': 'Aula 102',
};

export const REGULAR_GRADE_CLASSROOMS: Record<string, string> = {
  '6°1': 'Aula 303',
  '6°2': 'Aula 402',
  '7°1': 'Aula 202',
  '7°2': 'Aula 304',
  '8°1': 'Aula 401',
  '8°2': 'Aula 302',
  '9°1': 'Aula (ROTACIÓN)',
  '9°2': 'Aula 301',
  '10°1': 'Aula 201',
  '10°2': 'Aula 102',
  '11°1': 'Aula 103',
  '11°2': 'Aula 305',
  '1.1': 'Aula 102',
  '1.2': 'Aula 103',
  '2.1': 'Aula 402',
  '2.2': 'Aula 401',
  '3.1': 'Aula 301',
  '3.2': 'Aula 302',
  '3.3': 'Aula 303',
  '4.1': 'Aula 305',
  '4.2': 'Aula 304',
  '5.1': 'Aula 201',
  '5.2': 'Aula 202',
  'Transición 1': 'Aula P-102',
  'Transición 2': 'Aula P-101',
};

/**
 * Resolves the classroom label for a given grade and period.
 * During Support Plan periods (101-104), returns the support plan classroom from the top header row
 * (e.g. 6°1 and 6°2 -> Aula 303, 7°1 and 7°2 -> Aula 201, etc.).
 * During regular periods (1-11), returns the regular classroom for that grade.
 */
export function resolveEffectiveClassroomForBlock(
  block: Partial<TimeBlockEntity> | null | undefined,
  scheduleType?: 'A' | 'B' | 'C' | 'D'
): string {
  if (!block) return 'Aula Base';

  const canonicalGrade = resolveCanonicalGradeName(block);
  const rawSubject = (block.subject || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (rawSubject.includes('bases de datos')) {
    return 'Medellín Digital/Auditorio';
  }
  if (rawSubject.includes('audiovisuales')) {
    return 'Nube/Auditorio';
  }
  if (rawSubject === 'media tecnica' || rawSubject.startsWith('mt-')) {
    if (canonicalGrade === '10°1' || canonicalGrade === '11°1') {
      return 'Medellín Digital/Auditorio';
    }
    if (canonicalGrade === '10°2' || canonicalGrade === '11°2') {
      return 'Nube/Auditorio';
    }
  }

  const period = Number(block.period || 0);
  const isSupportPlanPeriod = period >= 101 && period <= 104;

  if (isSupportPlanPeriod || (scheduleType === 'D' && isSupportPlanPeriod)) {
    const match = canonicalGrade.match(/^(\d+°?)/);
    if (match) {
      const level = `${match[1].replace('°', '')}°`;
      if (SUPPORT_PLAN_GRADE_CLASSROOMS[level]) {
        return SUPPORT_PLAN_GRADE_CLASSROOMS[level];
      }
    }
  }

  if (period >= 1 && period <= 11 && canonicalGrade && REGULAR_GRADE_CLASSROOMS[canonicalGrade]) {
    if (!block.classroomName) {
      return REGULAR_GRADE_CLASSROOMS[canonicalGrade];
    }
  }

  const rawClassroom = (block.classroomName || '').trim();
  if (!rawClassroom) {
    return (canonicalGrade && REGULAR_GRADE_CLASSROOMS[canonicalGrade]) || 'Aula Base';
  }
  if (rawClassroom.toUpperCase() === 'AULA ROTA' || rawClassroom.toUpperCase() === 'ROTA') {
    return 'Aula (ROTACIÓN)';
  }
  return rawClassroom;
}

/**
 * Normalizes an array of time blocks ensuring each block has its verified canonical gradeName and shift.
 */
export function normalizeTimeBlocksGrades(blocks: TimeBlockEntity[]): TimeBlockEntity[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b) => {
    const canonical = resolveCanonicalGradeName(b);
    const canonicalShift = resolveCanonicalShift(b);
    const effectiveClassroom = resolveEffectiveClassroomForBlock(b);
    const isMediaTecnicaRoom =
      effectiveClassroom === 'Medellín Digital/Auditorio' || effectiveClassroom === 'Nube/Auditorio';
    const shouldSyncClassroom =
      ((b.period >= 101 && b.period <= 104) || isMediaTecnicaRoom) &&
      b.classroomName !== effectiveClassroom;
    if (
      (canonical && b.gradeName !== canonical) ||
      b.shift !== canonicalShift ||
      shouldSyncClassroom
    ) {
      return {
        ...b,
        gradeName: canonical || b.gradeName,
        shift: canonicalShift,
        classroomId: shouldSyncClassroom ? effectiveClassroom : b.classroomId,
        classroomName: shouldSyncClassroom ? effectiveClassroom : b.classroomName,
      };
    }
    return b;
  });
}

