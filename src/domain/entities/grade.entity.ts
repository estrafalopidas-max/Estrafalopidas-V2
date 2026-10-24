/**
 * Domain Entity: Grade
 * Firestore Collection: 'grades'
 * Represents student cohorts / groups at I.E. Villa Flora (e.g. 6°1, 7°2, 10°1)
 */

export type ShiftType = 'morning' | 'afternoon' | 'transicion-1';

export interface GradeEntity {
  id: string; // Document ID (e.g. 'grade-601', 'grade-1002')
  gradeLevel: string; // '6°', '7°', '8°', '9°', '10°', '11°', 'Transición'
  groupNumber: string; // '1', '2', '3'
  fullName: string; // '6°1', '10°2', 'Transición 1'
  shift: ShiftType; // 'morning' | 'afternoon' | 'transicion-1'
  studentCount: number;
  academicYear: number; // e.g. 2026
  directorTeacherId?: string; // Group director
  directorTeacherName?: string;
  defaultClassroomId?: string; // Assigned home classroom (e.g. 'aula-101')
  isActive: boolean;
}
