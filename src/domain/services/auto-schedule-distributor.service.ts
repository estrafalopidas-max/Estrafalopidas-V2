import { TimeBlockEntity, DayOfWeek } from '../entities/time-block.entity';
import { GradeEntity, ShiftType } from '../entities/grade.entity';
import { UserEntity } from '../entities/user.entity';
import { getShortTeacherName, isTeacherPresentAtSlot } from './teacher-normalization.service';
import { resolveCanonicalShift, resolveCanonicalGradeName } from './grade-normalization.service';

const DAYS_OF_WEEK: DayOfWeek[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

interface PeriodTiming {
  period: number;
  startTime: string;
  endTime: string;
  secondaryStartTime?: string;
  secondaryEndTime?: string;
}

const BACHILLERATO_TIMINGS: PeriodTiming[] = [
  { period: 1, startTime: '06:10', endTime: '07:05' },
  { period: 2, startTime: '07:05', endTime: '08:00' },
  { period: 3, startTime: '08:00', endTime: '08:55' },
  { period: 4, startTime: '09:25', endTime: '10:20' },
  { period: 5, startTime: '10:20', endTime: '11:15' },
  { period: 6, startTime: '11:15', endTime: '12:10' },
];

const PRIMARIA_TIMINGS: PeriodTiming[] = [
  { period: 1, startTime: '12:30', endTime: '13:25' },
  { period: 2, startTime: '13:25', endTime: '14:20' },
  { period: 3, startTime: '14:20', endTime: '15:15' },
  { period: 4, startTime: '15:45', endTime: '16:40' },
  { period: 5, startTime: '16:40', endTime: '17:35' },
];

const TRANSICION_TIMINGS: PeriodTiming[] = [
  { period: 1, startTime: '07:00', endTime: '07:50', secondaryStartTime: '12:30', secondaryEndTime: '13:20' },
  { period: 2, startTime: '07:50', endTime: '08:40', secondaryStartTime: '13:20', secondaryEndTime: '14:10' },
  { period: 3, startTime: '08:40', endTime: '09:30', secondaryStartTime: '14:10', secondaryEndTime: '15:00' },
  { period: 4, startTime: '10:20', endTime: '11:10', secondaryStartTime: '15:50', secondaryEndTime: '16:40' },
  { period: 5, startTime: '11:10', endTime: '12:00', secondaryStartTime: '16:40', secondaryEndTime: '17:30' },
];

function mapGroupDirectionToGradeId(groupDirection?: string): string | null {
  if (!groupDirection) return null;
  const clean = groupDirection.trim().toUpperCase();
  if (clean === 'TS-01') return 'g-trans-1';
  if (clean === 'TS-02') return 'g-trans-2';
  const match = clean.match(/^0?(\d{1,2})-0?(\d)$/);
  if (match) {
    return `g-${match[1]}0${match[2]}`;
  }
  return null;
}

interface CanonicalTeacherFallback {
  groupDirection?: string;
  academicLevel: 'primaria' | 'bachillerato';
  assignedGradeIds: string[];
  subjects: string[];
}

const PRIMARIA_FULL_SUBJECTS_FALLBACK = [
  'Ciencias Naturales',
  'Ciencias Sociales',
  'Educación Artística',
  'Ética y Valores',
  'Educación Física',
  'Educación Religiosa',
  'Lengua Castellana',
  'Inglés',
  'Matemáticas',
  'Estadística',
  'Geometría',
  'Tecnología e Informática',
];

const CANONICAL_TEACHER_FALLBACK_BY_ID: Record<string, CanonicalTeacherFallback> = {
  // Official 34 Teachers Roster (RAW_SEED_TEACHERS)
  't-docente-trans1': { groupDirection: 'TS-01', academicLevel: 'primaria', assignedGradeIds: ['g-trans-1'], subjects: ['Propósitos 1, 2, 3 y 4', 'Proyectos Lúdico Pedagógicos'] },
  't-docente-trans2': { groupDirection: 'TS-02', academicLevel: 'primaria', assignedGradeIds: ['g-trans-2'], subjects: ['Propósitos 1, 2, 3 y 4', 'Proyectos Lúdico Pedagógicos'] },
  't-docente-101': { groupDirection: '01-01', academicLevel: 'primaria', assignedGradeIds: ['g-101'], subjects: PRIMARIA_FULL_SUBJECTS_FALLBACK },
  't-docente-102': { groupDirection: '01-02', academicLevel: 'primaria', assignedGradeIds: ['g-102'], subjects: PRIMARIA_FULL_SUBJECTS_FALLBACK },
  't-docente-201': { groupDirection: '02-01', academicLevel: 'primaria', assignedGradeIds: ['g-201'], subjects: PRIMARIA_FULL_SUBJECTS_FALLBACK },
  't-docente-202': { groupDirection: '02-02', academicLevel: 'primaria', assignedGradeIds: ['g-202'], subjects: PRIMARIA_FULL_SUBJECTS_FALLBACK },
  't-docente-301': { groupDirection: '03-01', academicLevel: 'primaria', assignedGradeIds: ['g-301'], subjects: PRIMARIA_FULL_SUBJECTS_FALLBACK },
  't-docente-302': { groupDirection: '03-02', academicLevel: 'primaria', assignedGradeIds: ['g-302'], subjects: PRIMARIA_FULL_SUBJECTS_FALLBACK },
  't-docente-303': { groupDirection: '03-03', academicLevel: 'primaria', assignedGradeIds: ['g-303'], subjects: PRIMARIA_FULL_SUBJECTS_FALLBACK },
  't-docente-401': { groupDirection: '04-01', academicLevel: 'primaria', assignedGradeIds: ['g-401', 'g-402', 'g-501', 'g-502'], subjects: ['Ciencias Naturales', 'Educación Artística', 'Ética y Valores', 'Estadística'] },
  't-docente-402': { groupDirection: '04-02', academicLevel: 'primaria', assignedGradeIds: ['g-401', 'g-402', 'g-501', 'g-502'], subjects: ['Ciencias Sociales', 'Ética y Valores', 'Matemáticas'] },
  't-docente-501': { groupDirection: '05-01', academicLevel: 'primaria', assignedGradeIds: ['g-401', 'g-402', 'g-501', 'g-502'], subjects: ['Ética y Valores', 'Lengua Castellana', 'Tecnología e Informática'] },
  't-docente-502': { groupDirection: '05-02', academicLevel: 'primaria', assignedGradeIds: ['g-401', 'g-402', 'g-501', 'g-502'], subjects: ['Ética y Valores', 'Educación Física', 'Educación Religiosa', 'Lengua Castellana', 'Inglés', 'Geometría'] },
  't-m-isabel': { groupDirection: '06-01', academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Lengua Castellana', 'Literatura'] },
  't-claudia': { groupDirection: '06-02', academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802', 'g-901', 'g-902'], subjects: ['Matemáticas', 'Estadística'] },
  't-diana': { groupDirection: '07-01', academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802', 'g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Geometría'] },
  't-eliana': { groupDirection: '07-02', academicLevel: 'bachillerato', assignedGradeIds: ['g-701', 'g-702', 'g-801', 'g-802', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Filosofía', 'Ciencias Sociales'] },
  't-linda': { groupDirection: '08-01', academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802', 'g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Educación Artística'] },
  't-diego': { groupDirection: '08-02', academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802'], subjects: ['Tecnología e Informática', 'Cátedra de la Paz'] },
  't-katia': { groupDirection: '09-01', academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Ciencias Sociales', 'Economía y Política'] },
  't-betty': { groupDirection: '09-02', academicLevel: 'bachillerato', assignedGradeIds: ['g-701', 'g-702', 'g-801', 'g-802', 'g-901', 'g-902'], subjects: ['Lengua Castellana', 'Literatura'] },
  't-alejandra': { groupDirection: '10-01', academicLevel: 'bachillerato', assignedGradeIds: ['g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Ciencias Naturales', 'Biología', 'Química'] },
  't-lorena-l': { groupDirection: '10-02', academicLevel: 'bachillerato', assignedGradeIds: ['g-701', 'g-702', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Matemáticas', 'Estadística'] },
  't-natalia': { groupDirection: '11-01', academicLevel: 'bachillerato', assignedGradeIds: ['g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Inglés', 'Laboratorio de Inglés'] },
  't-laura': { academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802', 'g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Ética y Valores', 'Educación Religiosa'] },
  't-omar': { academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-901', 'g-902', 'g-1001', 'g-1101'], subjects: ['Tecnología e Informática', 'MT-Bases de Datos', 'Cátedra de la Paz'] },
  't-jairo-andres': { academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802'], subjects: ['Ciencias Naturales', 'Cátedra de la Paz'] },
  't-liscy': { academicLevel: 'bachillerato', assignedGradeIds: ['g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Física', 'Matemáticas'] },
  't-alejandro': { academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802'], subjects: ['Inglés', 'Laboratorio de Inglés'] },
  't-camilo': { academicLevel: 'bachillerato', assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802', 'g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'], subjects: ['Educación Física'] },
  't-alexander': { academicLevel: 'bachillerato', assignedGradeIds: ['g-901', 'g-902', 'g-1002', 'g-1102'], subjects: ['Tecnología e Informática', 'MT-Audiovisuales'] },
  't-sara': { academicLevel: 'bachillerato', assignedGradeIds: ['g-1002', 'g-1102'], subjects: ['MT-Audiovisuales'] },
  't-paola': { academicLevel: 'bachillerato', assignedGradeIds: ['g-1001', 'g-1101'], subjects: ['MT-Bases de Datos'] },
};

function getTeacherSubjectsForGrade(teacher: UserEntity, grade: GradeEntity): string[] {
  const canonical = CANONICAL_TEACHER_FALLBACK_BY_ID[teacher.id];
  const rawSubjects = Array.isArray(teacher.subjects) && teacher.subjects.length > 0
    ? teacher.subjects
    : canonical && canonical.subjects.length > 0
    ? canonical.subjects
    : teacher.assignedSubject
    ? [teacher.assignedSubject]
    : teacher.subject
    ? [teacher.subject]
    : ['Clase'];

  const isUpperSecondary =
    grade.id === 'g-1001' ||
    grade.id === 'g-1002' ||
    grade.id === 'g-1101' ||
    grade.id === 'g-1102' ||
    grade.fullName.startsWith('10') ||
    grade.fullName.startsWith('11');

  const filtered = rawSubjects.filter((subj) => {
    if (subj === 'MT-Bases de Datos' && grade.id !== 'g-1001' && grade.id !== 'g-1101') {
      return false;
    }
    if (subj === 'MT-Audiovisuales' && grade.id !== 'g-1002' && grade.id !== 'g-1102') {
      return false;
    }
    if ((subj === 'Filosofía' || subj === 'Economía y Política' || subj === 'Química') && !isUpperSecondary) {
      return false;
    }
    return true;
  });

  return filtered.length > 0 ? filtered : rawSubjects;
}

/**
 * Genera automáticamente una propuesta de horario semanal a partir de la asignación académica
 * (qué dicta cada docente y en qué grados), garantizando 0 cruces o choques de docentes.
 */
export function generateAutomaticScheduleDistribution(
  teachers: UserEntity[],
  grades: GradeEntity[]
): TimeBlockEntity[] {
  const activeTeachers = teachers.filter((t) => t.isActive !== false && (!t.role || t.role === 'teacher'));
  const activeGrades = grades.filter((g) => g.isActive !== false);

  const generatedBlocks: TimeBlockEntity[] = [];
  const nowIso = new Date().toISOString();

  // Map teacher -> assigned grade IDs
  const teacherGradesMap = new Map<string, string[]>();
  const teacherMaxHoursMap = new Map<string, number>();
  const teacherTotalAssignedMap = new Map<string, number>();
  const teacherGradeAssignedCount = new Map<string, number>(); // key: `${teacherId}__${gradeId}`
  const teacherGradeDayCount = new Map<string, number>(); // key: `${teacherId}__${gradeId}__${day}`
  const teacherSubjectCursor = new Map<string, number>(); // key: `${teacherId}__${gradeId}`

  for (const t of activeTeachers) {
    const canonical = CANONICAL_TEACHER_FALLBACK_BY_ID[t.id];
    const explicitGrades =
      Array.isArray(t.assignedGradeIds) && t.assignedGradeIds.length > 0
        ? [...t.assignedGradeIds]
        : canonical
        ? [...canonical.assignedGradeIds]
        : [];
    const dirGrade = mapGroupDirectionToGradeId(t.groupDirection || canonical?.groupDirection);
    if (dirGrade && !explicitGrades.includes(dirGrade)) {
      explicitGrades.unshift(dirGrade);
    }
    teacherGradesMap.set(t.id, explicitGrades);

    const isPrimariaOrTrans =
      t.academicLevel === 'primaria' ||
      canonical?.academicLevel === 'primaria' ||
      explicitGrades.some((gid) => gid.startsWith('g-trans') || /^g-[1-5]0[1-3]$/.test(gid));
    const defaultMax = isPrimariaOrTrans ? 25 : 24;
    const rawMax = Number(t.maxWeeklyHours);
    const maxHours = rawMax && rawMax > 0 ? rawMax : defaultMax;
    teacherMaxHoursMap.set(t.id, maxHours);
    teacherTotalAssignedMap.set(t.id, 0);
  }

  // Busy tracking: key `${shift}__${day}__${period}__${teacherId}`
  const busyTeacherSlot = new Set<string>();

  const shifts: ShiftType[] = ['transicion-1', 'afternoon', 'morning'];

  for (const shift of shifts) {
    const shiftGrades = activeGrades.filter((g) => {
      const canonicalShift = resolveCanonicalShift({
        shift: g.shift,
        gradeId: g.id,
        gradeName: g.fullName,
      });
      return canonicalShift === shift;
    });

    if (shiftGrades.length === 0) continue;

    const timings =
      shift === 'morning'
        ? BACHILLERATO_TIMINGS
        : shift === 'afternoon'
        ? PRIMARIA_TIMINGS
        : TRANSICION_TIMINGS;

    for (let dayIdx = 0; dayIdx < DAYS_OF_WEEK.length; dayIdx++) {
      const day = DAYS_OF_WEEK[dayIdx];

      for (let periodIdx = 0; periodIdx < timings.length; periodIdx++) {
        const timing = timings[periodIdx];
        const period = timing.period;

        // Rotate grade order per day & period so all grades receive balanced priority
        const orderedGrades = [...shiftGrades].sort((a, b) => {
          const idxA = (shiftGrades.indexOf(a) + dayIdx * 2 + periodIdx) % shiftGrades.length;
          const idxB = (shiftGrades.indexOf(b) + dayIdx * 2 + periodIdx) % shiftGrades.length;
          return idxA - idxB;
        });

        for (const grade of orderedGrades) {
          const isT2 = grade.id === 'g-trans-2' || grade.fullName === 'Transición 2';
          const startTime = isT2 && timing.secondaryStartTime ? timing.secondaryStartTime : timing.startTime;
          const endTime = isT2 && timing.secondaryEndTime ? timing.secondaryEndTime : timing.endTime;

          const findCandidates = (enforceDayLimit: boolean, enforceWeeklyMax: boolean) =>
            activeTeachers.filter((t) => {
              const assignedGrades = teacherGradesMap.get(t.id) || [];
              if (!assignedGrades.includes(grade.id)) return false;

              if (enforceWeeklyMax) {
                const currentTotal = teacherTotalAssignedMap.get(t.id) || 0;
                const maxHours = teacherMaxHoursMap.get(t.id) || 24;
                if (currentTotal >= maxHours) return false;
              }

              const busyKey = `${shift}__${day}__${period}__${t.id}`;
              if (busyTeacherSlot.has(busyKey)) return false;

              // Check institutional entry time restriction (e.g. Omar Mosquera & Alexander Uribe)
              if (!isTeacherPresentAtSlot(t.id, t.displayName, day, period, shift).isPresent) {
                return false;
              }

              // In Bachillerato & Rotated Primaria, avoid > 2 hours of same teacher in same grade on same day
              if (enforceDayLimit && assignedGrades.length > 1) {
                const dayCount = teacherGradeDayCount.get(`${t.id}__${grade.id}__${day}`) || 0;
                if (dayCount >= 2) return false;
              }

              return true;
            });

          // Find eligible teachers for this grade & slot (with progressive fallback if needed)
          let candidates = findCandidates(true, true);
          if (candidates.length === 0) {
            candidates = findCandidates(false, true);
          }
          if (candidates.length === 0) {
            candidates = findCandidates(false, false);
          }

          if (candidates.length === 0) continue;

          // Rank candidates to ensure conflict-free completion and balanced grade coverage
          candidates.sort((a, b) => {
            const gradesA = teacherGradesMap.get(a.id) || [];
            const gradesB = teacherGradesMap.get(b.id) || [];

            const maxA = teacherMaxHoursMap.get(a.id) || 24;
            const maxB = teacherMaxHoursMap.get(b.id) || 24;

            const targetPerGradeA = Math.ceil(maxA / Math.max(1, gradesA.length));
            const targetPerGradeB = Math.ceil(maxB / Math.max(1, gradesB.length));

            const countInGradeA = teacherGradeAssignedCount.get(`${a.id}__${grade.id}`) || 0;
            const countInGradeB = teacherGradeAssignedCount.get(`${b.id}__${grade.id}`) || 0;

            const underTargetA = countInGradeA < targetPerGradeA ? 1 : 0;
            const underTargetB = countInGradeB < targetPerGradeB ? 1 : 0;
            if (underTargetA !== underTargetB) {
              return underTargetB - underTargetA;
            }

            // Prefer teacher with fewer hours on this specific grade today
            const dayCountA = teacherGradeDayCount.get(`${a.id}__${grade.id}__${day}`) || 0;
            const dayCountB = teacherGradeDayCount.get(`${b.id}__${grade.id}__${day}`) || 0;
            if (dayCountA !== dayCountB) {
              return dayCountA - dayCountB;
            }

            // Prefer teacher with more remaining total hours relative to their assigned grades
            const remA = maxA - (teacherTotalAssignedMap.get(a.id) || 0);
            const remB = maxB - (teacherTotalAssignedMap.get(b.id) || 0);
            if (remA !== remB) {
              return remB - remA;
            }

            // Group director bonus on period 1
            const dirGradeA = mapGroupDirectionToGradeId(a.groupDirection);
            const dirGradeB = mapGroupDirectionToGradeId(b.groupDirection);
            if (period === 1) {
              if (dirGradeA === grade.id && dirGradeB !== grade.id) return -1;
              if (dirGradeB === grade.id && dirGradeA !== grade.id) return 1;
            }

            return a.id.localeCompare(b.id);
          });

          const chosenTeacher = candidates[0];
          const subjectsForGrade = getTeacherSubjectsForGrade(chosenTeacher, grade);
          const cursorKey = `${chosenTeacher.id}__${grade.id}`;
          const subjCursor = teacherSubjectCursor.get(cursorKey) || 0;
          const chosenSubject = subjectsForGrade[subjCursor % subjectsForGrade.length];
          teacherSubjectCursor.set(cursorKey, subjCursor + 1);

          // Record assignment
          busyTeacherSlot.add(`${shift}__${day}__${period}__${chosenTeacher.id}`);
          teacherTotalAssignedMap.set(
            chosenTeacher.id,
            (teacherTotalAssignedMap.get(chosenTeacher.id) || 0) + 1
          );
          teacherGradeAssignedCount.set(
            cursorKey,
            (teacherGradeAssignedCount.get(cursorKey) || 0) + 1
          );
          const dayKey = `${chosenTeacher.id}__${grade.id}__${day}`;
          teacherGradeDayCount.set(dayKey, (teacherGradeDayCount.get(dayKey) || 0) + 1);

          const canonicalGradeName = resolveCanonicalGradeName({ gradeId: grade.id, gradeName: grade.fullName });
          const shortTeacherName = getShortTeacherName(chosenTeacher.id, chosenTeacher.displayName);

          generatedBlocks.push({
            id: `tb-${grade.id}-${day}-p${period}`,
            block_type: 'class',
            dayOfWeek: day,
            period,
            startTime,
            endTime,
            shift,
            gradeId: grade.id,
            gradeName: canonicalGradeName,
            subject: chosenSubject,
            teacherId: chosenTeacher.id,
            teacherName: shortTeacherName,
            classroomId: grade.defaultClassroomId || 'aula-base',
            classroomName: grade.defaultClassroomId || 'Aula Base',
            status: 'regular',
            motivo_novedad: null,
            notes: 'Generado por distribución automática de inicio de año escolar',
            updatedAt: nowIso,
          });
        }
      }
    }
  }

  return generatedBlocks;
}
