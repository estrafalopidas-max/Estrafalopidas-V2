/**
 * Teacher Visual Identity Service
 * Integrates Excel color mapping with 20% opacity, Title Case normalization,
 * Short Name (Nombre + Apellido) for grid cells, Full Name for the rest of the app,
 * and 2-letter initials extraction for the Desktop Matrix.
 */

import {
  getTeacherExcelIdentity,
  TeacherExcelIdentity,
  TeacherEntrySchedule,
  toTitleCase,
  getTeacherInitials,
  getShortTeacherName,
  getFullTeacherName,
  resolveOfficialTeacherEntry,
  getTeacherEntrySchedule,
  isTeacherPresentAtSlot,
  isLowPriorityListingTeacher,
  sortTeachersWithLowPriorityLast,
  hexToRgba,
  EXCEL_TEACHERS_DICTIONARY,
  OFFICIAL_TEACHERS_ROSTER,
  updateTeacherDictionaryColor,
} from './teacher-normalization.service';

export type TeacherVisualIdentity = TeacherExcelIdentity & {
  name: string;
};

export type { TeacherEntrySchedule };

export {
  toTitleCase,
  getTeacherInitials,
  getShortTeacherName,
  getFullTeacherName,
  resolveOfficialTeacherEntry,
  getTeacherEntrySchedule,
  isTeacherPresentAtSlot,
  isLowPriorityListingTeacher,
  sortTeachersWithLowPriorityLast,
  hexToRgba,
  EXCEL_TEACHERS_DICTIONARY,
  OFFICIAL_TEACHERS_ROSTER,
  updateTeacherDictionaryColor,
};

/**
 * Returns deterministic visual identity with Excel original color, 20% opacity background,
 * normalized Title Case name, shortName (Nombre + Apellido), and 2-letter initials.
 */
export function getTeacherVisualIdentity(
  teacherId?: string | null,
  teacherName?: string | null
): TeacherVisualIdentity {
  const excelIdentity = getTeacherExcelIdentity(teacherId, teacherName);
  return {
    ...excelIdentity,
    name: excelIdentity.normalizedName,
  };
}
