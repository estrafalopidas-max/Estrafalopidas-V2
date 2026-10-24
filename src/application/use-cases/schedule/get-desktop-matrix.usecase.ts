/**
 * Use Case: Get Desktop Matrix
 * Assembles the Coordinator's Desktop Schedule Matrix
 * Aggregates Grades, TimeBlocks, and live absence states into a 2D desktop grid.
 */

import { ITimeBlockRepository } from '../../../domain/repositories/itime-block.repository';
import { IGradeRepository } from '../../../domain/repositories/igrade.repository';
import { IAbsenceRequestRepository } from '../../../domain/repositories/iabsence-request.repository';
import { TimeBlockEntity, DayOfWeek } from '../../../domain/entities/time-block.entity';
import { GradeEntity, ShiftType } from '../../../domain/entities/grade.entity';
import { AbsenceRequestEntity } from '../../../domain/entities/absence-request.entity';

export interface MatrixSlotCell {
  period: number;
  timeBlock: TimeBlockEntity | null;
  pendingAbsence: AbsenceRequestEntity | null;
}

export interface MatrixRow {
  grade: GradeEntity;
  slots: Record<number, MatrixSlotCell>; // Key is period number (1..6)
}

export interface DesktopMatrixResult {
  dayOfWeek: DayOfWeek;
  shift: ShiftType;
  rows: MatrixRow[];
  totalSlots: number;
  uncoveredAbsences: number;
  coveredReplacements: number;
  pendingRequestsCount: number;
}

export class GetDesktopMatrixUseCase {
  constructor(
    private timeBlockRepo: ITimeBlockRepository,
    private gradeRepo: IGradeRepository,
    private absenceRepo: IAbsenceRequestRepository
  ) {}

  async execute(params: {
    dayOfWeek: DayOfWeek;
    shift: ShiftType;
    gradeFilter?: string; // 'all' or specific level like '6°'
    searchQuery?: string;
  }): Promise<DesktopMatrixResult> {
    const [allBlocks, grades, pendingRequests] = await Promise.all([
      this.timeBlockRepo.getByDayAndShift(params.dayOfWeek, params.shift),
      this.gradeRepo.getByShift(params.shift),
      this.absenceRepo.getPending(),
    ]);

    // Filter grades
    let filteredGrades = grades;
    if (params.gradeFilter && params.gradeFilter !== 'all') {
      filteredGrades = grades.filter((g) => g.gradeLevel === params.gradeFilter);
    }

    // Filter blocks by search query if provided
    let blocks = allBlocks;
    if (params.searchQuery && params.searchQuery.trim() !== '') {
      const q = params.searchQuery.toLowerCase();
      blocks = blocks.filter(
        (b) =>
          b.teacherName.toLowerCase().includes(q) ||
          b.subject.toLowerCase().includes(q) ||
          b.classroomName.toLowerCase().includes(q) ||
          b.gradeName.toLowerCase().includes(q)
      );
    }

    // Assemble rows
    const rows: MatrixRow[] = filteredGrades.map((grade) => {
      const slots: Record<number, MatrixSlotCell> = {};

      for (let p = 1; p <= 6; p++) {
        const matchingBlock = blocks.find(
          (b) => b.gradeId === grade.id && b.period === p
        ) || null;

        const pending = matchingBlock
          ? pendingRequests.find((req) => req.teacher_id === matchingBlock.teacherId) || null
          : null;

        slots[p] = {
          period: p,
          timeBlock: matchingBlock,
          pendingAbsence: pending,
        };
      }

      return { grade, slots };
    });

    const uncoveredAbsences = blocks.filter((b) => b.status === 'absent').length;
    const coveredReplacements = blocks.filter((b) => b.status === 'covered').length;

    return {
      dayOfWeek: params.dayOfWeek,
      shift: params.shift,
      rows,
      totalSlots: blocks.length,
      uncoveredAbsences,
      coveredReplacements,
      pendingRequestsCount: pendingRequests.length,
    };
  }
}
