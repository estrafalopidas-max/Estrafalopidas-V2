/**
 * Domain Entity: User
 * Firestore Collection: 'users'
 * Represents authenticated coordinators, teachers, administrators, and staff.
 */

export type UserRole = 'admin' | 'coordinator' | 'teacher' | 'public';
export type AcademicLevel = 'primaria' | 'bachillerato';
export type AcademicAssignmentStatus = 'pending_assignment' | 'assigned';

export interface UserEntity {
  id: string; // Identificador único (UUID)
  email: string;
  displayName: string; // Nombre completo oficial (Nombres y Apellidos)
  shortName?: string; // Solo Nombre y Primer Apellido para las casillas de la parrilla
  groupDirection?: string; // Dirección de grupo (ej. 'TS-01', '01-01', ..., '11-01', 'Sin asignación')
  entrySchedule?: {
    defaultEntryTime: string;
    exceptions?: Partial<Record<'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes', string>>;
    label: string;
  };
  role: UserRole;
  documentId: string; // Cédula de Ciudadanía
  phone?: string;
  subjects: string[]; // Relación 1:N: Asignaturas oficiales autorizadas para el docente
  allowedSubjects: string[]; // Identificadores (shortName) de las materias del catálogo oficial del MEN
  specialty?: string[]; // E.g. ['Tecnología e Informática']
  academicLevel?: AcademicLevel; // 'bachillerato' | 'primaria'
  assignedSubject?: string; // Backwards-compatible
  subject?: string; // Backwards-compatible
  academicAssignmentStatus?: AcademicAssignmentStatus; // 'pending_assignment' | 'assigned'
  assignedGradeIds?: string[]; // E.g. ['g-901', 'g-902', 'g-1001']
  isActive: boolean;
  color?: string; // HSL Golden Ratio persistent hex/hsl color
  color_hex?: string; // Inmutable static Hex ('#RRGGBB') hard-locked al registrarse
  avatarColor?: string;
  maxWeeklyHours: number; // Límite legal semanal obligatorio de horas lectivas (Decreto 1850 / MEN, default 22)
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
