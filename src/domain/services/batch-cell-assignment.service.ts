import { TimeBlockEntity, DayOfWeek } from '../entities/time-block.entity';
import { GradeEntity, ShiftType } from '../entities/grade.entity';
import { UserEntity } from '../entities/user.entity';
import { parseSlotDroppableId, createSlotDroppableId } from './dnd-slot.helper';
import { resolveEffectiveClassroomForBlock } from './grade-normalization.service';
import { ALL_OFFICIAL_MATERIAS, findOfficialSubject } from '../constants/subjects';

export interface PeriodTimingDescriptor {
  period: number;
  time: string;
  secondaryTime?: string;
}

export interface BatchCellTarget {
  key: string;
  slotId: string;
  grade: GradeEntity;
  period: number;
  startTime: string;
  endTime: string;
  existingBlock: TimeBlockEntity | null;
}

export interface ResolveBatchTargetsInput {
  selectedIds: Iterable<string>;
  timeBlocks: TimeBlockEntity[];
  grades: GradeEntity[];
  dayOfWeek: DayOfWeek;
  shift: ShiftType;
  periods: PeriodTimingDescriptor[];
  isMeetingDay?: boolean;
}

export interface BatchAssignmentInput {
  targets: BatchCellTarget[];
  timeBlocks: TimeBlockEntity[];
  dayOfWeek: DayOfWeek;
  shift: ShiftType;
  teacher?: UserEntity | null;
  subject?: string | null;
  preserveExistingSubjectWhenTeacherOnly?: boolean;
  nowIso?: string;
}

export interface BatchAssignmentResult {
  nextBlocks: TimeBlockEntity[];
  updatedBlocks: TimeBlockEntity[];
}

export function resolveTeacherDefaultSubject(teacher: UserEntity): string {
  const candidates: string[] = [
    ...(teacher.subjects || []),
    ...(teacher.specialty || []),
    teacher.assignedSubject || '',
    teacher.subject || '',
  ]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));

  for (const candidate of candidates) {
    const official = findOfficialSubject(candidate);
    if (official) {
      return official.officialName;
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  return ALL_OFFICIAL_MATERIAS[0]?.officialName || 'Matemáticas';
}

export function isRealAssignedSubject(subject: string | null | undefined): boolean {
  if (!subject) return false;
  const clean = subject.trim();
  if (!clean) return false;
  const upper = clean.toUpperCase();
  if (
    upper === 'CLASE' ||
    upper.includes('SIN ASIGNACI') ||
    upper.includes('NO DISPONIBLE') ||
    upper.includes('SALIDA')
  ) {
    return false;
  }
  return true;
}

export function resolveSelectedCellTargets(input: ResolveBatchTargetsInput): BatchCellTarget[] {
  const {
    selectedIds,
    timeBlocks,
    grades,
    dayOfWeek,
    shift,
    periods,
    isMeetingDay = false,
  } = input;

  const targetsMap = new Map<string, BatchCellTarget>();
  const gradeMap = new Map<string, GradeEntity>(grades.map((g) => [g.id, g]));
  const periodMap = new Map<number, PeriodTimingDescriptor>(periods.map((p) => [p.period, p]));

  const addTarget = (grade: GradeEntity, period: number, directBlock?: TimeBlockEntity | null) => {
    if (isMeetingDay && shift === 'morning' && period === 1) {
      return;
    }
    if ((shift === 'afternoon' || shift === 'transicion-1') && period > 5) {
      return;
    }

    const isSeniorHigh =
      grade.fullName.startsWith('10') ||
      grade.fullName.startsWith('11') ||
      grade.gradeLevel === '10°' ||
      grade.gradeLevel === '11°';
    const existing =
      directBlock ||
      timeBlocks.find(
        (b) =>
          b.dayOfWeek === dayOfWeek &&
          b.gradeId === grade.id &&
          b.period === period &&
          b.status !== 'cancelled'
      ) ||
      null;

    const hasExistingSubject = Boolean(
      existing &&
        existing.block_type !== 'exit' &&
        isRealAssignedSubject(existing.subject)
    );

    if (shift === 'morning' && period >= 7 && period <= 11 && !isSeniorHigh && !hasExistingSubject) {
      return;
    }

    const key = `${grade.id}__${period}`;
    if (targetsMap.has(key)) return;

    const periodInfo = periodMap.get(period);
    const isT2 = grade.id === 'g-trans-2' || grade.fullName === 'Transición 2';
    const rawTimeRange =
      (isT2 && periodInfo?.secondaryTime ? periodInfo.secondaryTime : periodInfo?.time) ||
      (shift === 'morning' ? '06:10 - 07:05' : isT2 ? '12:30 - 13:20' : '12:30 - 13:25');
    const [startTime, endTime] = rawTimeRange.split(' - ');

    targetsMap.set(key, {
      key,
      slotId: createSlotDroppableId(grade, period),
      grade,
      period,
      startTime: (startTime || '06:10').trim(),
      endTime: (endTime || '07:05').trim(),
      existingBlock: existing,
    });
  };

  for (const rawId of selectedIds) {
    if (!rawId) continue;

    const directBlock = timeBlocks.find((b) => b.id === rawId);
    if (directBlock) {
      if (directBlock.dayOfWeek === dayOfWeek) {
        const grade = gradeMap.get(directBlock.gradeId);
        if (grade) {
          addTarget(grade, directBlock.period, directBlock);
        }
      }
      continue;
    }

    const parsed = parseSlotDroppableId(rawId);
    if (parsed) {
      const grade = gradeMap.get(parsed.gradeId);
      if (grade) {
        addTarget(grade, parsed.period);
      }
    }
  }

  return Array.from(targetsMap.values());
}

export function applyBatchCellAssignment(input: BatchAssignmentInput): BatchAssignmentResult {
  const {
    targets,
    timeBlocks,
    dayOfWeek,
    shift,
    teacher = null,
    subject = null,
    preserveExistingSubjectWhenTeacherOnly = true,
    nowIso = new Date().toISOString(),
  } = input;

  const cleanSubject = subject?.trim() || '';
  if (!teacher && !cleanSubject || targets.length === 0) {
    return { nextBlocks: timeBlocks, updatedBlocks: [] };
  }

  const updatedBlocks: TimeBlockEntity[] = [];
  const replacedSlotKeys = new Set<string>();
  const replacedBlockIds = new Set<string>();

  for (const target of targets) {
    const existing = target.existingBlock;
    const isExistingActiveClass = Boolean(
      existing &&
        existing.block_type !== 'exit' &&
        existing.block_type !== 'break' &&
        existing.block_type !== 'novelty'
    );

    let finalSubject = cleanSubject;
    if (!finalSubject) {
      if (
        teacher &&
        preserveExistingSubjectWhenTeacherOnly &&
        isExistingActiveClass &&
        isRealAssignedSubject(existing?.subject)
      ) {
        finalSubject = existing!.subject;
      } else if (teacher) {
        finalSubject = resolveTeacherDefaultSubject(teacher);
      } else if (isExistingActiveClass && isRealAssignedSubject(existing?.subject)) {
        finalSubject = existing!.subject;
      } else {
        finalSubject = ALL_OFFICIAL_MATERIAS[0]?.officialName || 'Matemáticas';
      }
    }

    let finalTeacherId = 'unassigned';
    let finalTeacherName = 'Sin Asignar';

    if (teacher) {
      finalTeacherId = teacher.id;
      finalTeacherName = teacher.displayName || (teacher as any).fullName || teacher.id;
    } else if (
      isExistingActiveClass &&
      existing?.teacherId &&
      existing.teacherId !== 'unassigned' &&
      existing.teacherId !== 'evento-institucional' &&
      existing.teacherName &&
      existing.teacherName !== 'Sin Asignar'
    ) {
      finalTeacherId = existing.teacherId;
      finalTeacherName = existing.teacherName;
    }

    const blockId = existing?.id || `tb-${target.grade.id}-${dayOfWeek}-p${target.period}`;
    const resolvedClassroom = resolveEffectiveClassroomForBlock({
      gradeId: target.grade.id,
      gradeName: target.grade.fullName,
      period: target.period,
      subject: finalSubject,
      classroomName: target.grade.defaultClassroomId || existing?.classroomName || 'Aula Base',
    });

    const newBlock: TimeBlockEntity = {
      id: blockId,
      block_type: 'class',
      dayOfWeek,
      period: target.period,
      startTime: target.startTime,
      endTime: target.endTime,
      shift: target.grade.shift || shift,
      gradeId: target.grade.id,
      gradeName: target.grade.fullName,
      subject: finalSubject,
      teacherId: finalTeacherId,
      teacherName: finalTeacherName,
      classroomId: resolvedClassroom,
      classroomName: resolvedClassroom,
      status: 'regular',
      motivo_novedad: null,
      notes: null,
      updatedAt: nowIso,
    };

    updatedBlocks.push(newBlock);
    replacedBlockIds.add(blockId);
    replacedSlotKeys.add(`${dayOfWeek}__${target.grade.id}__${target.period}`);
  }

  const remainingBlocks = timeBlocks.filter((b) => {
    if (replacedBlockIds.has(b.id)) return false;
    const slotKey = `${b.dayOfWeek}__${b.gradeId}__${b.period}`;
    if (replacedSlotKeys.has(slotKey)) return false;
    return true;
  });

  return {
    nextBlocks: [...remainingBlocks, ...updatedBlocks],
    updatedBlocks,
  };
}
