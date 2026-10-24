/**
 * Use Case: Register Teacher (Onboarding Docente)
 * Control estricto de inputs:
 * - Nivel académico obligatorio (Primaria / Bachillerato)
 * - Asignatura obligatoria seleccionada de la lista maestra cerrada (sin texto libre)
 * - Estado inicial obligatorio: 'pending_assignment'
 */

import { IUserRepository } from '../../../domain/repositories/iuser.repository';
import { UserEntity, AcademicLevel } from '../../../domain/entities/user.entity';
import { getSubjectsByLevel, getSubjectShortName } from '../../../domain/constants/subjects';
import { getNextAvailableTeacherColor } from '../../../domain/services/teacher-color.service';

export interface RegisterTeacherDTO {
  displayName: string;
  email: string;
  documentId: string;
  phone: string;
  academicLevel: AcademicLevel;
  subjects?: string[];
  allowedSubjects?: string[];
  assignedSubject?: string;
  customColorHex?: string;
  maxWeeklyHours?: number;
}

export class RegisterTeacherUseCase {
  constructor(private userRepo: IUserRepository) {}

  async execute(dto: RegisterTeacherDTO): Promise<UserEntity> {
    if (!dto.displayName || !dto.email || !dto.documentId) {
      throw new Error('Nombre, correo y documento de identidad son obligatorios.');
    }

    if (!dto.academicLevel || (dto.academicLevel !== 'primaria' && dto.academicLevel !== 'bachillerato')) {
      throw new Error('Debes seleccionar un nivel académico válido (Primaria o Bachillerato).');
    }

    // Support both subjects array and legacy assignedSubject
    const selectedSubjects = dto.subjects && dto.subjects.length > 0
      ? dto.subjects
      : (dto.assignedSubject ? [dto.assignedSubject] : []);

    if (selectedSubjects.length === 0) {
      throw new Error('Debes seleccionar al menos una asignatura oficial del catálogo.');
    }

    // Validación de lista cerrada: Cada asignatura DEBE existir en el catálogo maestro autorizado MEN
    const validSubjects = getSubjectsByLevel(dto.academicLevel);
    for (const subj of selectedSubjects) {
      const isValid = validSubjects.some(
        (s) =>
          s.name.toLowerCase() === subj.toLowerCase() ||
          s.officialName.toLowerCase() === subj.toLowerCase() ||
          s.shortName.toLowerCase() === subj.toLowerCase() ||
          s.id.toLowerCase() === subj.toLowerCase()
      );
      if (!isValid) {
        throw new Error(
          `La asignatura "${subj}" no pertenece al catálogo maestro autorizado por el MEN.`
        );
      }
    }

    const primarySubject = selectedSubjects[0];
    const allowedSubjects = (dto.allowedSubjects && dto.allowedSubjects.length > 0)
      ? dto.allowedSubjects
      : selectedSubjects.map((s) => getSubjectShortName(s));

    // Motor Anti-Colisión (Selección sin reemplazo de VILLA_FLORA_PALETTE):
    // Lee los colores ya asignados en la base de datos y asigna el primer tono disponible
    const allUsers = await this.userRepo.getAll();
    const usedColors = allUsers
      .map((u) => u.color_hex || u.color)
      .filter((c): c is string => Boolean(c));
    const persistentColor = dto.customColorHex?.trim() || getNextAvailableTeacherColor(usedColors);

    const newTeacher: UserEntity = {
      id: `t-${dto.documentId.trim()}`,
      email: dto.email.trim().toLowerCase(),
      displayName: dto.displayName.trim(),
      role: 'teacher',
      documentId: dto.documentId.trim(),
      phone: dto.phone.trim(),
      academicLevel: dto.academicLevel,
      subjects: selectedSubjects,
      allowedSubjects,
      assignedSubject: primarySubject,
      subject: primarySubject,
      specialty: selectedSubjects,
      academicAssignmentStatus: 'pending_assignment',
      assignedGradeIds: [],
      isActive: false, // Inactivo hasta que la coordinadora asigne carga
      color: persistentColor,
      color_hex: persistentColor, // Inmutable static Hex hard-lock ('#RRGGBB')
      avatarColor: persistentColor,
      maxWeeklyHours: dto.maxWeeklyHours ?? 24,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.userRepo.create(newTeacher);
  }
}
