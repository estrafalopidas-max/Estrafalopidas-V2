/**
 * Domain Entity: TimeBlock
 * Firestore Collection: 'time_blocks'
 * Represents an individual schedule slot within the school timetable matrix.
 * Maintained by the Coordinator and modified upon approved absence requests (Maker-Checker).
 */

import { ShiftType } from './grade.entity';

export type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';

export type TimeBlockStatus = 'regular' | 'absent' | 'covered' | 'cancelled';

export type TimeBlockType = 'class' | 'break' | 'technical_media' | 'exit' | 'novelty';

export interface TimeBlockEntity {
  id: string; // Document ID (e.g. 'tb-601-lunes-p1')
  block_type: TimeBlockType; // 'class' | 'break' | 'technical_media' | 'exit' | 'novelty'
  dayOfWeek: DayOfWeek;
  period: number; // 1 to 11
  startTime: string; // "06:30"
  endTime: string; // "07:25"
  shift: ShiftType; // 'morning' | 'afternoon'
  level?: 'bachillerato' | 'primaria'; // 'bachillerato' (Hoja 1) | 'primaria' (Hoja 2)
  
  // Grade / Cohort info
  gradeId: string; // References 'grades' collection
  gradeName: string; // E.g. '6°1'
  
  // Subject & Assigned Teacher
  subject: string; // E.g. 'Matemáticas', 'Física'
  teacherId: string; // References 'users' collection (Maker / Primary Teacher)
  teacherName: string;
  
  // Location
  classroomId: string; // References 'classrooms' collection
  classroomName: string; // E.g. 'Aula 101'
  
  // Operational Status & Maker-Checker Side Effects
  status: TimeBlockStatus; // 'regular' | 'absent' | 'covered' | 'cancelled'
  absenceRequestId?: string | null; // Set when an absence is approved by Checker
  replacementTeacherId?: string | null; // Assigned by Checker (Coordinator)
  replacementTeacherName?: string | null;
  motivo_novedad?: string | null; // Novedad Institucional / Docente / Sindical / Cívico / Personalizada
  notes?: string | null;
  
  updatedAt: string; // ISO 8601
}

/**
 * Strict Excel Exception Detection & Block Classification
 * - 'DESCANSO PEDAGÓGICO' | 'RECESO' -> 'break'
 * - 'SALIDA 12:10' -> 'exit'
 * - 'MEDIA TÉCNICA' | 'MT' -> 'technical_media'
 * - Standard subject -> 'class'
 */
export function classifyBlockType(cellContent: string | null | undefined): TimeBlockType {
  if (!cellContent) return 'class';
  const upper = cellContent.toUpperCase().trim();

  // 1. Break / Receso
  if (
    upper.includes('DESCANSO PEDAGÓGICO') ||
    upper.includes('DESCANSO PEDAGOGICO') ||
    upper.includes('RECESO') ||
    upper === 'DESCANSO'
  ) {
    return 'break';
  }

  // 2. Exit / Salida / Sin asignación académica
  if (
    upper.includes('SALIDA 12:10') ||
    upper.includes('SALIDA 12:30') ||
    upper === 'SALIDA' ||
    upper.startsWith('SALIDA') ||
    upper.includes('SIN ASIGNACIÓN') ||
    upper.includes('SIN ASIGNACION')
  ) {
    return 'exit';
  }

  // 3. Media Técnica / MT
  if (
    upper.includes('MEDIA TÉCNICA') ||
    upper.includes('MEDIA TECNICA') ||
    upper === 'MT' ||
    upper.startsWith('MT ') ||
    upper.includes(' MT ') ||
    upper.endsWith(' MT')
  ) {
    return 'technical_media';
  }

  // 4. Novedad Institucional
  if (upper.startsWith('NOVEDAD') || upper.includes('NOVEDAD:')) {
    return 'novelty';
  }

  return 'class';
}
