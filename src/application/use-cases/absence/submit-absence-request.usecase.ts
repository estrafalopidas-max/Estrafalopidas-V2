/**
 * Use Case: Submit Absence Request (Maker Role)
 * Enforces PRD Architecture: Teachers cannot write directly to time_blocks.
 * Generates an absence request in 'pending' status for Coordinator review.
 */

import { IAbsenceRequestRepository } from '../../../domain/repositories/iabsence-request.repository';
import { AbsenceRequestEntity } from '../../../domain/entities/absence-request.entity';

export interface SubmitAbsenceRequestDTO {
  teacherId: string;
  teacherName: string;
  date: string;
  reason: string;
  affectedPeriods?: number[];
}

export class SubmitAbsenceRequestUseCase {
  constructor(private absenceRepo: IAbsenceRequestRepository) {}

  async execute(dto: SubmitAbsenceRequestDTO): Promise<AbsenceRequestEntity> {
    if (!dto.teacherId || !dto.reason || !dto.date) {
      throw new Error('Datos de solicitud incompletos. Se requiere docente, fecha y motivo.');
    }

    return this.absenceRepo.create({
      teacher_id: dto.teacherId,
      teacher_name: dto.teacherName,
      date: dto.date,
      status: 'pending',
      reason: dto.reason,
      created_at: new Date().toISOString(),
      reviewed_by: null,
      reviewed_at: null,
      affected_periods: dto.affectedPeriods || [],
      replacement_teacher_id: null,
      replacement_teacher_name: null,
      review_notes: null,
    });
  }
}
