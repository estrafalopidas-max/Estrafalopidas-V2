import { useMemo, useCallback } from 'react';
import { UserEntity } from '../../domain/entities/user.entity';
import { TimeBlockEntity } from '../../domain/entities/time-block.entity';
import { getShortTeacherName } from '../../domain/services/teacher-visual-identity.service';

export interface TeacherLoadInfo {
  currentAssignedHours: number;
  maxWeeklyHours: number;
  remainingHours: number;
  isOverloaded: boolean;
}

export function calculateTeacherAssignedHours(
  teacherId: string,
  teacherName: string | undefined,
  timeBlocks: TimeBlockEntity[],
  shortName?: string
): number {
  if (!timeBlocks || !Array.isArray(timeBlocks)) return 0;
  const cleanName = (teacherName || '').trim().toLowerCase();
  const cleanShort = (shortName || getShortTeacherName(teacherId, teacherName) || '').trim().toLowerCase();

  const matchedBlocks = timeBlocks.filter((b) => {
    if (!b || b.status === 'cancelled' || b.block_type === 'break') return false;
    const blockTeacher = b.teacherName?.trim().toLowerCase() || '';
    const isRegularOwner =
      b.teacherId === teacherId ||
      (cleanName && blockTeacher === cleanName) ||
      (cleanShort && blockTeacher === cleanShort);

    const repTeacher = b.replacementTeacherName?.trim().toLowerCase() || '';
    const isReplacement =
      b.status === 'covered' &&
      (b.replacementTeacherId === teacherId ||
        (cleanName && repTeacher === cleanName) ||
        (cleanShort && repTeacher === cleanShort));

    if (b.status === 'absent') return false;
    if (b.status === 'covered') return isReplacement;
    return isRegularOwner;
  });

  // Count distinct (dayOfWeek, period) slots for regular periods (1..6) and Media Técnica periods (>6)
  // Media Técnica blocks in 10° and 11° run simultaneously across parallel groups and represent 12h weekly load in the official PDF
  const regularSlotKeys = new Set<string>();
  const mtSlotKeys = new Set<string>();
  for (const b of matchedBlocks) {
    const slotKey = `${b.dayOfWeek}-${b.period}-${b.gradeId}`;
    if (b.period > 6) {
      mtSlotKeys.add(`${b.dayOfWeek}-${b.period}`);
    } else {
      regularSlotKeys.add(slotKey);
    }
  }

  const regularHours = regularSlotKeys.size;
  const mtHours = mtSlotKeys.size > 0 ? Math.min(12, mtSlotKeys.size) : 0;
  return regularHours + mtHours;
}

export function useTeacherLoad(teachers: UserEntity[], timeBlocks: TimeBlockEntity[]) {
  const loadMap = useMemo(() => {
    const map = new Map<string, TeacherLoadInfo>();
    for (const t of teachers) {
      const assigned = calculateTeacherAssignedHours(t.id, t.displayName, timeBlocks, t.shortName);
      const rawMax = Number(t.maxWeeklyHours);
      const max = !rawMax || rawMax === 22 ? 24 : rawMax;
      map.set(t.id, {
        currentAssignedHours: assigned,
        maxWeeklyHours: max,
        remainingHours: Math.max(0, max - assigned),
        isOverloaded: assigned > max,
      });
    }
    return map;
  }, [teachers, timeBlocks]);

  const getTeacherLoad = useCallback(
    (teacherId: string, teacherName?: string): TeacherLoadInfo => {
      const found = loadMap.get(teacherId);
      if (found) return found;
      const assigned = calculateTeacherAssignedHours(teacherId, teacherName, timeBlocks);
      const max = 24;
      return {
        currentAssignedHours: assigned,
        maxWeeklyHours: max,
        remainingHours: Math.max(0, max - assigned),
        isOverloaded: assigned > max,
      };
    },
    [loadMap, timeBlocks]
  );

  return { getTeacherLoad, loadMap };
}
