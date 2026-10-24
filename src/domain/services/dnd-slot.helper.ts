import { GradeEntity } from '../entities/grade.entity';

/**
 * Creates a unique Droppable ID combining Classroom/Grade and Hour
 * Example: 'drop-aula303-g_grade-601-hora1'
 */
export function createSlotDroppableId(grade: GradeEntity, period: number): string {
  const cleanAula = (grade.defaultClassroomId || `aula-${grade.fullName}`)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `drop-${cleanAula}-g_${grade.id}-hora${period}`;
}

/**
 * Parses the unique droppable ID to extract gradeId and period
 */
export function parseSlotDroppableId(droppableId: string): { gradeId: string; period: number } | null {
  if (!droppableId || !droppableId.startsWith('drop-')) return null;
  const match = droppableId.match(/g_(.+)-hora(\d+)$/);
  if (match) {
    return {
      gradeId: match[1],
      period: parseInt(match[2], 10),
    };
  }
  return null;
}
