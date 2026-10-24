/**
 * Domain Service: Constraint Solver (Algoritmo de Prevención de Colisiones)
 * Reglas de Negocio Críticas:
 * 1. Un aula NO puede tener más de una clase en el mismo día, periodo y jornada.
 * 2. Un docente NO puede estar asignado a más de un aula en el mismo día, periodo y jornada.
 * Si alguna condición se viola, el Constraint Solver bloquea la transacción y detalla la colisión.
 */

import { TimeBlockEntity, DayOfWeek } from '../entities/time-block.entity';
import { ShiftType } from '../entities/grade.entity';
import { isTeacherPresentAtSlot } from './teacher-normalization.service';

export interface CollisionValidationResult {
  isValid: boolean;
  conflictType?: 'classroom' | 'teacher';
  message?: string;
  conflictingBlock?: TimeBlockEntity;
}

export class ConstraintSolverService {
  /**
   * Valida colisiones antes de guardar o modificar un bloque de horario.
   * @param existingBlocks Lista completa de bloques existentes en la institución
   * @param candidate Bloque que se pretende crear o actualizar
   * @param excludeBlockId ID del bloque actual (para permitir actualizaciones sobre sí mismo)
   */
  public static validateSlot(
    existingBlocks: TimeBlockEntity[],
    candidate: {
      id?: string;
      dayOfWeek: DayOfWeek;
      period: number;
      shift: ShiftType;
      classroomId?: string;
      classroomName?: string;
      teacherId?: string;
      teacherName?: string;
      gradeId?: string;
      gradeName?: string;
    },
    excludeBlockId?: string
  ): CollisionValidationResult {
    // Filtrar bloques del mismo día, periodo y jornada (excluyendo el bloque en edición)
    const concurrentBlocks = existingBlocks.filter(
      (b) =>
        b.id !== excludeBlockId &&
        b.id !== candidate.id &&
        b.dayOfWeek === candidate.dayOfWeek &&
        b.period === candidate.period &&
        b.shift === candidate.shift &&
        b.status !== 'cancelled'
    );

    // 1. REGLA CRÍTICA 1: Colisión de Aula
    if (candidate.classroomId) {
      const classroomCollision = concurrentBlocks.find(
        (b) => b.classroomId === candidate.classroomId
      );

      if (classroomCollision) {
        return {
          isValid: false,
          conflictType: 'classroom',
          conflictingBlock: classroomCollision,
          message: `¡Colisión de Aula detectada! El aula "${candidate.classroomName || candidate.classroomId}" ya está asignada al grupo "${classroomCollision.gradeName}" para la materia "${classroomCollision.subject}" en el Periodo ${candidate.period} (${candidate.dayOfWeek}).`,
        };
      }
    }

    // 2. REGLA CRÍTICA 2: Colisión de Docente (Double-booking y Horario de Entrada)
    if (candidate.teacherId) {
      const presence = isTeacherPresentAtSlot(
        candidate.teacherId,
        candidate.teacherName,
        candidate.dayOfWeek,
        candidate.period,
        candidate.shift
      );
      if (!presence.isPresent) {
        return {
          isValid: false,
          conflictType: 'teacher',
          message: `¡Restricción de Horario de Entrada! El docente "${candidate.teacherName || candidate.teacherId}" ingresa al colegio a las ${presence.entryTime} a.m. el día ${candidate.dayOfWeek} (${presence.label}).`,
        };
      }

      const teacherCollision = concurrentBlocks.find(
        (b) =>
          (b.teacherId === candidate.teacherId && b.status !== 'absent') ||
          (b.status === 'covered' && b.replacementTeacherId === candidate.teacherId)
      );

      if (teacherCollision) {
        return {
          isValid: false,
          conflictType: 'teacher',
          conflictingBlock: teacherCollision,
          message: `¡Colisión de Docente detectada! El docente "${candidate.teacherName || candidate.teacherId}" ya tiene clase asignada con el grupo "${teacherCollision.gradeName}" en el aula "${teacherCollision.classroomName}" en el Periodo ${candidate.period} (${candidate.dayOfWeek}).`,
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Obtiene la lista de docentes disponibles (sin colisión y presentes en el colegio) para un periodo específico
   */
  public static getAvailableTeachers<T extends { id: string; name: string }>(
    allTeachers: T[],
    existingBlocks: TimeBlockEntity[],
    slot: { dayOfWeek: DayOfWeek; period: number; shift: ShiftType; currentBlockId?: string }
  ): T[] {
    const busyTeacherIds = new Set(
      existingBlocks
        .filter(
          (b) =>
            b.id !== slot.currentBlockId &&
            b.dayOfWeek === slot.dayOfWeek &&
            b.period === slot.period &&
            b.shift === slot.shift &&
            b.status !== 'cancelled'
        )
        .flatMap((b) => {
          const ids: string[] = [];
          if (b.status !== 'absent' && b.teacherId) ids.push(b.teacherId);
          if (b.status === 'covered' && b.replacementTeacherId) ids.push(b.replacementTeacherId);
          return ids;
        })
    );

    return allTeachers.filter(
      (t) =>
        !busyTeacherIds.has(t.id) &&
        isTeacherPresentAtSlot(t.id, t.name, slot.dayOfWeek, slot.period, slot.shift).isPresent
    );
  }

  /**
   * Obtiene la lista de aulas disponibles (sin colisión) para un periodo específico
   */
  public static getAvailableClassrooms<C extends { id: string; name: string }>(
    allClassrooms: C[],
    existingBlocks: TimeBlockEntity[],
    slot: { dayOfWeek: DayOfWeek; period: number; shift: ShiftType; currentBlockId?: string }
  ): C[] {
    const busyClassroomIds = new Set(
      existingBlocks
        .filter(
          (b) =>
            b.id !== slot.currentBlockId &&
            b.dayOfWeek === slot.dayOfWeek &&
            b.period === slot.period &&
            b.shift === slot.shift &&
            b.status !== 'cancelled' &&
            b.classroomId
        )
        .map((b) => b.classroomId)
    );

    return allClassrooms.filter((c) => !busyClassroomIds.has(c.id));
  }
}
