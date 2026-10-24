/**
 * Use Case: Assign Academic Load (Bandeja de Asignación de Coordinación)
 * Requerimiento: La coordinadora selecciona grados disponibles (ej. 9-1, 9-2, 10-1)
 * con checkboxes para vincularlos al docente y ejecutar el enlace en time_blocks.
 */

import { IUserRepository } from '../../../domain/repositories/iuser.repository';
import { ITimeBlockRepository } from '../../../domain/repositories/itime-block.repository';
import { IGradeRepository } from '../../../domain/repositories/igrade.repository';

export interface AssignAcademicLoadDTO {
  teacherId: string;
  selectedGradeIds: string[]; // ['g-901', 'g-902', 'g-1001']
}

export class AssignAcademicLoadUseCase {
  constructor(
    private userRepo: IUserRepository,
    private timeBlockRepo: ITimeBlockRepository,
    private gradeRepo: IGradeRepository
  ) {}

  async execute(dto: AssignAcademicLoadDTO): Promise<{ updatedBlocksCount: number }> {
    const teacher = await this.userRepo.getById(dto.teacherId);
    if (!teacher) {
      throw new Error(`Docente con ID ${dto.teacherId} no encontrado.`);
    }

    const teacherSubjects: string[] = (teacher.subjects && teacher.subjects.length > 0)
      ? teacher.subjects
      : [teacher.assignedSubject || (teacher.specialty && teacher.specialty[0])].filter((s): s is string => Boolean(s));

    if (teacherSubjects.length === 0) {
      throw new Error(`El docente ${teacher.displayName} no tiene una asignatura maestra definida.`);
    }

    if (dto.selectedGradeIds.length === 0) {
      throw new Error('Debes seleccionar al menos un grado/grupo para asignar la carga académica.');
    }

    // 1. Obtener todos los time_blocks
    const allBlocks = await this.timeBlockRepo.getAll();

    // 2. Filtrar bloques pertenecientes a los grados seleccionados que correspondan a cualquiera de las asignaturas
    const affectedBlocks = allBlocks.filter((b) => {
      const matchesGrade = dto.selectedGradeIds.includes(b.gradeId);
      const matchesSubject = teacherSubjects.some(
        (subj) =>
          b.subject.toLowerCase().includes(subj.toLowerCase()) ||
          subj.toLowerCase().includes(b.subject.toLowerCase())
      );
      return matchesGrade && matchesSubject;
    });

    const updates = affectedBlocks.map((b) => ({
      id: b.id,
      data: {
        teacherId: teacher.id,
        teacherName: teacher.displayName,
        notes: `Carga horaria asignada oficialmente por Coordinación a ${teacher.displayName}`,
      },
    }));

    // 3. Ejecutar actualización en lote en la colección time_blocks
    if (updates.length > 0) {
      await this.timeBlockRepo.updateBatch(updates);
    }

    // 4. Actualizar estado del docente en la colección users
    await this.userRepo.update(teacher.id, {
      academicAssignmentStatus: 'assigned',
      assignedGradeIds: dto.selectedGradeIds,
      isActive: true,
    });

    return { updatedBlocksCount: updates.length };
  }
}
