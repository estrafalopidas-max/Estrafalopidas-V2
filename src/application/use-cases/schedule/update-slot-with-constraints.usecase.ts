/**
 * Use Case: Update Slot with Constraint Solver
 * Enforces strict classroom and teacher collision avoidance before any Firestore write.
 */

import { ITimeBlockRepository } from '../../../domain/repositories/itime-block.repository';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { ConstraintSolverService, CollisionValidationResult } from '../../../domain/services/constraint-solver.service';

export class ConstraintCollisionError extends Error {
  public readonly validation: CollisionValidationResult;

  constructor(validation: CollisionValidationResult) {
    super(validation.message || 'Error de colisión en el motor de agendamiento');
    this.name = 'ConstraintCollisionError';
    this.validation = validation;
  }
}

export interface UpdateSlotDTO {
  blockId: string;
  block_type?: TimeBlockEntity['block_type'];
  subject?: string;
  teacherId?: string;
  teacherName?: string;
  classroomId?: string;
  classroomName?: string;
  dayOfWeek?: TimeBlockEntity['dayOfWeek'];
  period?: number;
  shift?: TimeBlockEntity['shift'];
  startTime?: string;
  endTime?: string;
  gradeId?: string;
  gradeName?: string;
  replacementTeacherId?: string | null;
  replacementTeacherName?: string | null;
  status?: TimeBlockEntity['status'];
  motivo_novedad?: string | null;
  notes?: string | null;
}

export class UpdateSlotWithConstraintsUseCase {
  constructor(private timeBlockRepo: ITimeBlockRepository) {}

  async execute(dto: UpdateSlotDTO): Promise<TimeBlockEntity> {
    const allBlocks = await this.timeBlockRepo.getAll();
    const existingBlock =
      (await this.timeBlockRepo.getById(dto.blockId)) ||
      (dto.gradeId && dto.dayOfWeek && dto.period !== undefined
        ? allBlocks.find(
            (b) =>
              b.gradeId === dto.gradeId &&
              b.dayOfWeek === dto.dayOfWeek &&
              b.period === dto.period
          ) || null
        : null);

    if (!existingBlock && (!dto.gradeId || !dto.dayOfWeek || dto.period === undefined)) {
      throw new Error(`Bloque de horario ${dto.blockId} no encontrado.`);
    }

    const currentBlock: TimeBlockEntity = existingBlock || {
      id: dto.blockId,
      block_type: dto.block_type || 'class',
      dayOfWeek: dto.dayOfWeek!,
      period: dto.period!,
      startTime: dto.startTime || '06:10',
      endTime: dto.endTime || '07:05',
      shift: dto.shift || 'morning',
      gradeId: dto.gradeId!,
      gradeName: dto.gradeName || dto.gradeId!,
      subject: dto.subject || 'Clase',
      teacherId: dto.teacherId || 'unassigned',
      teacherName: dto.teacherName || 'Sin Asignar',
      classroomId: dto.classroomId || 'Aula Base',
      classroomName: dto.classroomName || 'Aula Base',
      status: dto.status || 'regular',
      motivo_novedad: null,
      notes: null,
      updatedAt: new Date().toISOString(),
    };

    // Determine target teacher (either replacement or primary teacher being assigned)
    const effectiveTeacherId = dto.replacementTeacherId !== undefined 
      ? (dto.replacementTeacherId || currentBlock.teacherId)
      : (dto.teacherId || currentBlock.teacherId);

    const effectiveTeacherName = dto.replacementTeacherName !== undefined
      ? (dto.replacementTeacherName || currentBlock.teacherName)
      : (dto.teacherName || currentBlock.teacherName);

    const effectiveClassroomId = dto.classroomId || currentBlock.classroomId;
    const effectiveClassroomName = dto.classroomName || currentBlock.classroomName;

    // Execute double-validation via Constraint Solver
    const validation = ConstraintSolverService.validateSlot(
      allBlocks,
      {
        id: currentBlock.id,
        dayOfWeek: currentBlock.dayOfWeek,
        period: currentBlock.period,
        shift: currentBlock.shift,
        classroomId: effectiveClassroomId,
        classroomName: effectiveClassroomName,
        teacherId: effectiveTeacherId,
        teacherName: effectiveTeacherName,
        gradeId: currentBlock.gradeId,
        gradeName: currentBlock.gradeName,
      },
      currentBlock.id
    );

    if (!validation.isValid) {
      throw new ConstraintCollisionError(validation);
    }

    // Persist changes
    const updates: Partial<TimeBlockEntity> = {
      ...(dto.block_type && { block_type: dto.block_type }),
      ...(dto.subject && { subject: dto.subject }),
      ...(dto.teacherId && { teacherId: dto.teacherId }),
      ...(dto.teacherName && { teacherName: dto.teacherName }),
      ...(dto.classroomId && { classroomId: dto.classroomId }),
      ...(dto.classroomName && { classroomName: dto.classroomName }),
      ...(dto.dayOfWeek && { dayOfWeek: dto.dayOfWeek }),
      ...(dto.period !== undefined && { period: dto.period }),
      ...(dto.shift && { shift: dto.shift }),
      ...(dto.startTime && { startTime: dto.startTime }),
      ...(dto.endTime && { endTime: dto.endTime }),
      ...(dto.gradeId && { gradeId: dto.gradeId }),
      ...(dto.gradeName && { gradeName: dto.gradeName }),
      ...(dto.replacementTeacherId !== undefined && { replacementTeacherId: dto.replacementTeacherId }),
      ...(dto.replacementTeacherName !== undefined && { replacementTeacherName: dto.replacementTeacherName }),
      ...(dto.status && { status: dto.status }),
      ...(dto.motivo_novedad !== undefined && { motivo_novedad: dto.motivo_novedad }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      updatedAt: new Date().toISOString(),
    };

    const updatedBlock: TimeBlockEntity = {
      ...currentBlock,
      ...updates,
      id: currentBlock.id,
    };

    await this.timeBlockRepo.update(currentBlock.id, updates);
    return updatedBlock;
  }
}

