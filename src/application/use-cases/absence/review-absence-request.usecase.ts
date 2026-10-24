/**
 * Use Case: Review Absence Request (Checker Role - Coordinator / Admin)
 * PRD §2: "Upon approval, system/admin workflows update the corresponding time_blocks record."
 */

import { IAbsenceRequestRepository } from '../../../domain/repositories/iabsence-request.repository';
import { ITimeBlockRepository } from '../../../domain/repositories/itime-block.repository';
import { AbsenceStatus } from '../../../domain/entities/absence-request.entity';

export interface ReviewAbsenceRequestDTO {
  requestId: string;
  decision: AbsenceStatus; // 'approved' | 'rejected'
  reviewerName: string;
  replacementTeacherId?: string | null;
  replacementTeacherName?: string | null;
  reviewNotes?: string;
}

export class ReviewAbsenceRequestUseCase {
  constructor(
    private absenceRepo: IAbsenceRequestRepository,
    private timeBlockRepo: ITimeBlockRepository
  ) {}

  async execute(dto: ReviewAbsenceRequestDTO): Promise<void> {
    const request = await this.absenceRepo.getById(dto.requestId);
    if (!request) {
      throw new Error(`Solicitud de ausencia ${dto.requestId} no encontrada.`);
    }

    if (request.status !== 'pending') {
      throw new Error(`La solicitud ya ha sido procesada previamente con estado: ${request.status}`);
    }

    // 1. Update Absence Request status
    await this.absenceRepo.updateStatus(
      dto.requestId,
      dto.decision,
      dto.reviewerName,
      dto.replacementTeacherId,
      dto.replacementTeacherName,
      dto.reviewNotes
    );

    // 2. Maker-Checker Side Effect on Schedule Matrix
    // When approved, update all corresponding time_blocks
    if (dto.decision === 'approved') {
      const allBlocks = await this.timeBlockRepo.getAll();
      const affected = allBlocks.filter((b) => {
        const matchesTeacher = b.teacherId === request.teacher_id;
        const matchesPeriods =
          !request.affected_periods ||
          request.affected_periods.length === 0 ||
          request.affected_periods.includes(b.period);
        return matchesTeacher && matchesPeriods;
      });

      const updates = affected.map((b) => ({
        id: b.id,
        data: {
          status: (dto.replacementTeacherId ? 'covered' : 'absent') as 'covered' | 'absent',
          block_type: (dto.replacementTeacherId ? 'class' : 'novelty') as 'class' | 'novelty',
          motivo_novedad: dto.replacementTeacherId ? null : (request.reason || 'Ausencia Docente'),
          absenceRequestId: request.id,
          replacementTeacherId: dto.replacementTeacherId || null,
          replacementTeacherName: dto.replacementTeacherName || null,
          notes: dto.replacementTeacherName
            ? `Cubierto por reemplazo: ${dto.replacementTeacherName}`
            : `Ausencia aprobada: ${request.reason}`,
        },
      }));

      if (updates.length > 0) {
        await this.timeBlockRepo.updateBatch(updates);
      }
    }
  }
}
