/**
 * Domain Entity: Classroom
 * Firestore Collection: 'classrooms'
 * Physical spaces in I.E. Villa Flora (aulas regulares, laboratorios, aulas de informática, etc.)
 */

export type ClassroomType = 'standard' | 'laboratory' | 'computer_lab' | 'sports_field' | 'auditorium' | 'library';

export interface ClassroomEntity {
  id: string; // Document ID (e.g. 'aula-101', 'lab-quimica')
  code: string; // E.g. '101', '204', 'LAB-1'
  name: string; // E.g. 'Aula 101 - Bloque A'
  capacity: number; // Student capacity (e.g. 40)
  building: string; // Bloque A, Bloque B, etc.
  floor: number; // 1, 2, 3
  type: ClassroomType;
  isActive: boolean;
  notes?: string;
}
