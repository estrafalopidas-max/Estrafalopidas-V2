import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Clock,
  Search,
  FileDown,
  Printer,
  User,
  GraduationCap,
  Sparkles,
  Info,
  Sun,
  Moon,
  ChevronDown,
  X,
} from 'lucide-react';
import {
  getPublicScheduleSnapshot,
  DEFAULT_LOGO_BASE64,
  PublicScheduleSnapshot,
  resolveEffectiveDayConfigs,
} from '../../../domain/services/html-schedule-generator.service';
import { downloadScheduleAsPdf } from '../../../domain/services/pdf-schedule-generator.service';
import { subscribeToPublishedSchedule } from '../../../infrastructure/firebase/firebase-client';
import { MatrixSlotCard } from '../../components/matrix/MatrixSlotCard';
import { TimeBlockEntity, DayOfWeek } from '../../../domain/entities/time-block.entity';
import { ShiftType } from '../../../domain/entities/grade.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import { getTodayDayOfWeek } from '../../../domain/services/ChronologyEngine';
import { normalizeTimeBlocksGrades, resolveCanonicalShift } from '../../../domain/services/grade-normalization.service';
import { ensureSeedDataLoaded } from '../../../infrastructure/seed/initial-seed';
import { getTeacherExcelIdentity } from '../../../domain/services/teacher-normalization.service';
import { getFullTeacherName } from '../../../domain/services/teacher-visual-identity.service';

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
];

const SHIFT_LABELS: Record<ShiftType, string> = {
  morning: 'Bachillerato (Mañana)',
  afternoon: 'Primaria (Tarde)',
  'transicion-1': 'Transición',
};

const SHIFT_GRADES: Record<ShiftType, string[]> = {
  morning: ['6°1', '6°2', '7°1', '7°2', '8°1', '8°2', '9°1', '9°2', '10°1', '10°2', '11°1', '11°2'],
  afternoon: ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '3.3', '4.1', '4.2', '5.1', '5.2'],
  'transicion-1': ['Transición 1', 'Transición 2'],
};

interface PublicSlotConfig {
  period: number;
  time: string;
  secondaryTime?: string;
  label: string;
  isBreak?: boolean;
  isTransition?: boolean;
  mediaTecnicaOnly?: boolean;
  isPreJornada?: boolean;
  isMeetingFirstHour?: boolean;
  meetingTitle?: string;
  meetingDesc?: string;
}

function formatMinToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function buildDynamicPublicSlots(
  shift: ShiftType,
  isMeetingDay: boolean,
  isEventDay: boolean,
  scheduleType: 'A' | 'B' | 'C' | 'D' = 'A'
): PublicSlotConfig[] {
  if (shift === 'transicion-1') {
    const list: PublicSlotConfig[] = [];
    if (isMeetingDay) {
      list.push({
        period: -2,
        time: '06:30 - 07:00',
        secondaryTime: '12:00 - 12:30',
        label: 'Pre-Jornada',
        isPreJornada: true,
        meetingTitle: 'ATENCIÓN A PADRES',
        meetingDesc:
          'Franja institucional de excepción • T1 (06:30 a 07:00) / T2 (12:00 a 12:30) • Sin asignación de clases ni sustituciones',
      });
    }
    const transicionSlots: PublicSlotConfig[] = [
      { period: 1, time: '07:00 - 07:50', secondaryTime: '12:30 - 13:20', label: '1ª Hora' },
      { period: 2, time: '07:50 - 08:40', secondaryTime: '13:20 - 14:10', label: '2ª Hora' },
      { period: 3, time: '08:40 - 09:30', secondaryTime: '14:10 - 15:00', label: '3ª Hora' },
      {
        period: 0,
        time: '09:30 - 10:20',
        secondaryTime: '15:00 - 15:50',
        label: 'Descanso Pedagógico y Alimentación Escolar',
        isBreak: true,
      },
      { period: 4, time: '10:20 - 11:10', secondaryTime: '15:50 - 16:40', label: '4ª Hora' },
      { period: 5, time: '11:10 - 12:00', secondaryTime: '16:40 - 17:30', label: '5ª Hora' },
    ];
    list.push(...transicionSlots);
    return list;
  }

  if (shift === 'afternoon') {
    const list: PublicSlotConfig[] = [];
    if (isMeetingDay) {
      list.push({
        period: -2,
        time: '11:30 - 12:10',
        label: 'Pre-Jornada',
        isPreJornada: true,
        meetingTitle: 'ATENCIÓN A PADRES',
        meetingDesc:
          'Franja institucional previa a la jornada lectiva (11:30 a 12:10) • Primaria • Sin asignación de clases ni sustituciones',
      });
    }
    let cur = isEventDay ? 13 * 60 : 12 * 60 + 30;
    for (let p = 1; p <= 3; p++) {
      const end = cur + 55;
      list.push({ period: p, time: `${formatMinToTime(cur)} - ${formatMinToTime(end)}`, label: `${p}ª Hora` });
      cur = end;
    }
    const bEnd = cur + 30;
    list.push({
      period: 0,
      time: `${formatMinToTime(cur)} - ${formatMinToTime(bEnd)}`,
      label: isEventDay
        ? 'Descanso Pedagógico (Horario Especial Evento)'
        : 'Descanso Pedagógico y Alimentación Escolar',
      isBreak: true,
    });
    cur = bEnd;
    for (let p = 4; p <= 5; p++) {
      const end = cur + 55;
      list.push({ period: p, time: `${formatMinToTime(cur)} - ${formatMinToTime(end)}`, label: `${p}ª Hora` });
      cur = end;
    }
    return list;
  }

  // morning (Bachillerato)
  if (scheduleType === 'D' && !isMeetingDay) {
    return [
      { period: 101, time: '06:10 - 06:40', label: 'Plan de apoyo' },
      { period: 102, time: '06:40 - 07:10', label: 'Plan de apoyo' },
      { period: 103, time: '07:10 - 07:40', label: 'Plan de apoyo' },
      { period: 104, time: '07:40 - 08:10', label: 'Plan de apoyo' },
      { period: 1, time: '08:10 - 08:45', label: '1ª Hora' },
      { period: 2, time: '08:45 - 09:20', label: '2ª Hora' },
      { period: 3, time: '09:20 - 09:55', label: '3ª Hora' },
      { period: 0, time: '09:55 - 10:25', label: 'Descanso Pedagógico y Alimentación Escolar', isBreak: true },
      { period: 4, time: '10:25 - 11:00', label: '4ª Hora' },
      { period: 5, time: '11:00 - 11:35', label: '5ª Hora' },
      { period: 6, time: '11:35 - 12:10', label: '6ª Hora' },
      {
        period: -1,
        time: '12:40 - 17:35',
        label: 'Salida General / Jornada Media Técnica',
        isTransition: true,
        mediaTecnicaOnly: true,
      },
      { period: 7, time: '12:40 - 13:35', label: '7ª Hora', mediaTecnicaOnly: true },
      { period: 8, time: '13:35 - 14:30', label: '8ª Hora', mediaTecnicaOnly: true },
      { period: 9, time: '14:30 - 15:25', label: '9ª Hora', mediaTecnicaOnly: true },
      { period: 10, time: '15:45 - 16:40', label: '10ª Hora', mediaTecnicaOnly: true },
      { period: 11, time: '16:40 - 17:35', label: '11ª Hora', mediaTecnicaOnly: true },
    ];
  }
  if (!isMeetingDay) {
    return [
      { period: 1, time: '06:10 - 07:05', label: '1ª Hora' },
      { period: 2, time: '07:05 - 08:00', label: '2ª Hora' },
      { period: 3, time: '08:00 - 08:55', label: '3ª Hora' },
      { period: 0, time: '08:55 - 09:25', label: 'Descanso Pedagógico y Alimentación Escolar', isBreak: true },
      { period: 4, time: '09:25 - 10:20', label: '4ª Hora' },
      { period: 5, time: '10:20 - 11:15', label: '5ª Hora' },
      { period: 6, time: '11:15 - 12:10', label: '6ª Hora' },
      {
        period: -1,
        time: '12:40 - 17:35',
        label: 'Salida General / Jornada Media Técnica',
        isTransition: true,
        mediaTecnicaOnly: true,
      },
      { period: 7, time: '12:40 - 13:35', label: '7ª Hora', mediaTecnicaOnly: true },
      { period: 8, time: '13:35 - 14:30', label: '8ª Hora', mediaTecnicaOnly: true },
      { period: 9, time: '14:30 - 15:25', label: '9ª Hora', mediaTecnicaOnly: true },
      { period: 10, time: '15:45 - 16:40', label: '10ª Hora', mediaTecnicaOnly: true },
      { period: 11, time: '16:40 - 17:35', label: '11ª Hora', mediaTecnicaOnly: true },
    ];
  } else {
    return [
      {
        period: 1,
        time: '06:10 - 07:00',
        label: 'Horario',
        isMeetingFirstHour: true,
        meetingTitle: 'ATENCIÓN A PADRES',
        meetingDesc:
          'Franja institucional reservada para atención personalizada a padres de familia y acudientes (06:10 - 07:00) • Sin asignación de clases.',
      },
      { period: 2, time: '07:00 - 07:55', label: '1ª Hora' },
      { period: 3, time: '07:55 - 08:50', label: '2ª Hora' },
      { period: 4, time: '08:50 - 09:45', label: '3ª Hora' },
      { period: 0, time: '09:45 - 10:15', label: 'Descanso Pedagógico y Alimentación Escolar', isBreak: true },
      { period: 5, time: '10:15 - 11:10', label: '4ª Hora' },
      { period: 6, time: '11:10 - 12:05', label: '5ª Hora' },
      {
        period: -1,
        time: '12:40 - 17:35',
        label: 'Salida General / Jornada Media Técnica',
        isTransition: true,
        mediaTecnicaOnly: true,
      },
      { period: 7, time: '12:40 - 13:35', label: '6ª Hora', mediaTecnicaOnly: true },
      { period: 8, time: '13:35 - 14:30', label: '7ª Hora', mediaTecnicaOnly: true },
      { period: 9, time: '14:30 - 15:25', label: '8ª Hora', mediaTecnicaOnly: true },
      { period: 10, time: '15:45 - 16:40', label: '9ª Hora', mediaTecnicaOnly: true },
      { period: 11, time: '16:40 - 17:35', label: '10ª Hora', mediaTecnicaOnly: true },
    ];
  }
}

function resolveBlockShift(b: TimeBlockEntity): ShiftType {
  return resolveCanonicalShift(b);
}

export const PublicScheduleViewerPage: React.FC = () => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Initial local snapshot or fallback
  const initialSnapshot = useMemo<PublicScheduleSnapshot | null>(() => {
    const isBlankMode = localStorage.getItem('ievf_blank_matrix_mode') === '1';
    const snap = getPublicScheduleSnapshot();

    if (snap) {
      const snapIsBlank =
        isBlankMode ||
        Boolean(snap.metadata?.blankMatrixMode ?? snap.dayConfigs?.blankMatrixMode) ||
        (Array.isArray(snap.timeBlocks) && snap.timeBlocks.length === 0);

      if (snapIsBlank) {
        return {
          ...snap,
          timeBlocks: [],
          metadata: {
            ...snap.metadata,
            totalBlocks: 0,
            blankMatrixMode: true,
          },
        };
      }

      const savedBlocksRaw = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      if (savedBlocksRaw) {
        try {
          const liveBlocks = JSON.parse(savedBlocksRaw);
          if (Array.isArray(liveBlocks)) {
            return {
              ...snap,
              timeBlocks: liveBlocks.length > 0 ? normalizeTimeBlocksGrades(liveBlocks) : [],
            };
          }
        } catch {
          // ignore
        }
      }
      if (Array.isArray(snap.timeBlocks)) {
        return snap;
      }
    }

    ensureSeedDataLoaded();
    try {
      const savedBlocks = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      const savedUsers = localStorage.getItem('ievf_users_v1');
      const blocks: TimeBlockEntity[] = isBlankMode ? [] : (savedBlocks ? JSON.parse(savedBlocks) : []);
      const users: UserEntity[] = savedUsers ? JSON.parse(savedUsers) : [];

      return {
        metadata: {
          institutionName: 'Sistema de Agendamiento Escolar Horarios, actividades y jornadas académicas',
          academicPeriod: '3er Periodo',
          academicWeek: 9,
          lastUpdated: 'Horario Escolar Vigente',
          totalBlocks: blocks.length,
          totalTeachers: users.length,
          blankMatrixMode: blocks.length === 0,
        },
        timeBlocks: blocks,
        teachers: users.map((u) => {
          const identity = getTeacherExcelIdentity(u.id, u.displayName);
          return {
            id: u.id,
            displayName: getFullTeacherName(u.id, u.displayName || 'Docente'),
            color: identity.color_hex || u.color_hex || u.color || '#007DC5',
          };
        }),
        dayConfigs: resolveEffectiveDayConfigs(),
      };
    } catch {
      return null;
    }
  }, []);

  const [snapshot, setSnapshot] = useState<PublicScheduleSnapshot | null>(initialSnapshot);

  useEffect(() => {
    document.title = 'Sistema de Agendamiento Escolar Horarios, actividades y jornadas académicas';

    // Ocultar la ruta interna (/public/schedule o /h) en la barra de direcciones del navegador
    try {
      sessionStorage.setItem('ievf_public_view_active', '1');
      if (window.location.pathname !== '/') {
        window.history.replaceState(null, '', '/');
      }
    } catch {
      // Ignore history security errors in restricted contexts
    }

    // Suscripción en tiempo real a Firestore y eventos locales
    const unsubscribe = subscribeToPublishedSchedule((cloudData) => {
      if (cloudData && Array.isArray(cloudData.timeBlocks)) {
        setSnapshot(cloudData);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const todayDayKey = useMemo(() => getTodayDayOfWeek(), []);
  const [selectedShift, setSelectedShift] = useState<ShiftType>('morning');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => getTodayDayOfWeek());
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [isGradeMenuOpen, setIsGradeMenuOpen] = useState(false);
  const gradeMenuRef = useRef<HTMLDivElement>(null);
  const [isTeacherMenuOpen, setIsTeacherMenuOpen] = useState(false);
  const teacherMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isGradeMenuOpen && !isTeacherMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (gradeMenuRef.current && !gradeMenuRef.current.contains(target)) {
        setIsGradeMenuOpen(false);
      }
      if (teacherMenuRef.current && !teacherMenuRef.current.contains(target)) {
        setIsTeacherMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isGradeMenuOpen, isTeacherMenuOpen]);

  const rawTimeBlocks = snapshot?.timeBlocks || [];
  const isBlankSchedule = useMemo(
    () =>
      Boolean(snapshot?.metadata?.blankMatrixMode ?? snapshot?.dayConfigs?.blankMatrixMode) ||
      rawTimeBlocks.length === 0,
    [snapshot?.metadata?.blankMatrixMode, snapshot?.dayConfigs?.blankMatrixMode, rawTimeBlocks.length]
  );
  const timeBlocks = useMemo(
    () => (isBlankSchedule ? [] : normalizeTimeBlocksGrades(rawTimeBlocks)),
    [rawTimeBlocks, isBlankSchedule]
  );
  const teachers = useMemo(() => {
    const rawList = snapshot?.teachers || [];
    return rawList.map((t) => {
      const identity = getTeacherExcelIdentity(t.id, t.displayName);
      return {
        ...t,
        displayName: getFullTeacherName(t.id, t.displayName || 'Docente'),
        color: identity.color_hex || t.color || '#007DC5',
      };
    });
  }, [snapshot?.teachers]);
  const dayConfigs = useMemo(
    () => resolveEffectiveDayConfigs(snapshot?.dayConfigs),
    [snapshot?.dayConfigs]
  );

  const isHoliday = Boolean(dayConfigs.holidayDays?.[selectedDay]);
  const isMeetingDay = Boolean(
    dayConfigs.meetingDays?.[`${selectedShift}_${selectedDay}`] !== undefined
      ? dayConfigs.meetingDays[`${selectedShift}_${selectedDay}`]
      : dayConfigs.meetingDays?.[selectedDay]
  );
  const isEventDay = Boolean(dayConfigs.eventDays?.[selectedDay]);
  const rawDayScheduleType =
    dayConfigs.scheduleTypes?.[`${selectedShift}_${selectedDay}`] ||
    dayConfigs.scheduleTypes?.[selectedDay] ||
    'A';
  const activeScheduleType: 'A' | 'B' | 'C' | 'D' =
    selectedShift === 'morning' && rawDayScheduleType === 'D' && !isMeetingDay
      ? 'D'
      : isMeetingDay
      ? 'B'
      : 'A';

  const displayAcademicPeriod = useMemo(() => {
    const raw = snapshot?.metadata.academicPeriod;
    const base = !raw || raw === '3° Periodo' ? '3er Periodo' : raw;
    if (base.toLowerCase().includes('académico') || base.toLowerCase().includes('academico')) {
      return base;
    }
    return `${base} académico`;
  }, [snapshot?.metadata.academicPeriod]);

  const displayAcademicWeek = useMemo(() => {
    const raw = snapshot?.metadata.academicWeek;
    if (!raw || raw === 8) return 9;
    return raw;
  }, [snapshot?.metadata.academicWeek]);

  // Extract unique grades for the active shift
  const shiftGrades = useMemo(() => {
    const base = [...(SHIFT_GRADES[selectedShift] || [])];
    timeBlocks.forEach((tb) => {
      if (resolveBlockShift(tb) === selectedShift && tb.gradeName && !base.includes(tb.gradeName)) {
        base.push(tb.gradeName);
      }
    });
    return base;
  }, [timeBlocks, selectedShift]);

  const handleShiftChange = (shift: ShiftType) => {
    setSelectedShift(shift);
    setSelectedGrade('ALL');
  };

  // Helper to check if a block represents an actual assigned class or institutional novelty
  const isAssignedBlock = (b: TimeBlockEntity): boolean => {
    if (!b || b.status === 'cancelled') return false;
    if (
      b.block_type === 'novelty' ||
      Boolean(b.motivo_novedad) ||
      Boolean(b.notes && b.notes.toLowerCase().includes('novedad')) ||
      Boolean(b.subject && b.subject.toUpperCase().startsWith('NOVEDAD'))
    ) {
      return true;
    }
    const subj = (b.subject || '').trim();
    if (!subj || b.block_type === 'exit' || b.block_type === 'break') return false;
    const upper = subj.toUpperCase();
    if (
      upper.includes('SALIDA') ||
      upper.includes('NO DISPONIBLE') ||
      upper.includes('SIN ASIGNACI')
    ) {
      return false;
    }
    return true;
  };

  // Filtered blocks strictly by selectedShift and selectedDay
  const filteredBlocks = useMemo(() => {
    const normalizeStr = (val: string | null | undefined) =>
      (val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const searchTokens = normalizeStr(searchTerm).split(/\s+/).filter(Boolean);
    const normalizedSelectedTeacher = normalizeStr(selectedTeacher);

    return timeBlocks.filter((b) => {
      if (!isAssignedBlock(b)) return false;
      if (resolveBlockShift(b) !== selectedShift) return false;
      if (b.dayOfWeek !== selectedDay) return false;
      if (selectedGrade !== 'ALL' && b.gradeName !== selectedGrade) return false;
      if (selectedTeacher !== 'ALL') {
        const matchesTeacherId = b.teacherId === selectedTeacher;
        const matchesTeacherName = normalizeStr(b.teacherName) === normalizedSelectedTeacher;
        if (!matchesTeacherId && !matchesTeacherName) return false;
      }
      if (searchTokens.length > 0) {
        const rawClassroom =
          !b.classroomName
            ? 'Aula Base'
            : b.classroomName.trim().toUpperCase() === 'AULA ROTA' ||
              b.classroomName.trim().toUpperCase() === 'ROTA'
            ? 'Aula (ROTACIÓN)'
            : b.classroomName;

        const haystack = [
          b.subject || '',
          b.teacherName || '',
          b.replacementTeacherName || '',
          rawClassroom,
          b.classroomName || '',
          b.gradeName || '',
          b.motivo_novedad || '',
          b.notes || '',
        ]
          .map(normalizeStr)
          .join(' ');

        if (!searchTokens.every((token) => haystack.includes(token))) {
          return false;
        }
      }
      return true;
    });
  }, [timeBlocks, selectedShift, selectedDay, selectedGrade, selectedTeacher, searchTerm]);

  // Visible grades in columns for the selected shift
  const activeGrades = useMemo(() => {
    if (selectedGrade !== 'ALL') return [selectedGrade];
    const hasCustomFilter = !isBlankSchedule && (selectedTeacher !== 'ALL' || Boolean(searchTerm.trim()));
    if (hasCustomFilter && !isHoliday) {
      const presentInFiltered = new Set(filteredBlocks.map((b) => b.gradeName));
      return shiftGrades.filter((g) => presentInFiltered.has(g));
    }
    return shiftGrades;
  }, [shiftGrades, filteredBlocks, selectedGrade, selectedTeacher, searchTerm, isHoliday, isBlankSchedule]);

  const SUPPORT_PLAN_GRADE_CLASSROOMS: Record<string, string> = {
    '6°': 'Aula 303',
    '7°': 'Aula 201',
    '8°': 'Aula 103',
    '9°': 'Aula 301',
    '10°': 'Aula 202',
    '11°': 'Aula 102',
  };

  const REGULAR_GRADE_CLASSROOMS: Record<string, string> = {
    '6°1': 'Aula 303',
    '6°2': 'Aula 402',
    '7°1': 'Aula 202',
    '7°2': 'Aula 304',
    '8°1': 'Aula 401',
    '8°2': 'Aula 302',
    '9°1': 'Aula (ROTACIÓN)',
    '9°2': 'Aula 301',
    '10°1': 'Aula 201',
    '10°2': 'Aula 102',
    '11°1': 'Aula 103',
    '11°2': 'Aula 305',
    '1.1': 'Aula 102',
    '1.2': 'Aula 103',
    '2.1': 'Aula 402',
    '2.2': 'Aula 401',
    '3.1': 'Aula 301',
    '3.2': 'Aula 302',
    '3.3': 'Aula 303',
    '4.1': 'Aula 305',
    '4.2': 'Aula 304',
    '5.1': 'Aula 201',
    '5.2': 'Aula 202',
    'Transición 1': 'Aula P-102',
    'Transición 2': 'Aula P-101',
  };

  const getSupportRoomForGrade = (g: string): string => {
    const match = g.match(/^(\d+°?)/);
    const level = match ? `${match[1].replace('°', '')}°` : g;
    return SUPPORT_PLAN_GRADE_CLASSROOMS[level] || REGULAR_GRADE_CLASSROOMS[g] || 'Aula Base';
  };

  const isSupportPlanD = selectedShift === 'morning' && activeScheduleType === 'D' && !isMeetingDay;

  const supportPlanGroups = useMemo(() => {
    if (!isSupportPlanD) return [];
    const groups: Array<{ level: string; room: string; grades: string[] }> = [];
    activeGrades.forEach((g) => {
      const match = g.match(/^(\d+°?)/);
      const level = match ? `${match[1].replace('°', '')}°` : g;
      const rawRoom = SUPPORT_PLAN_GRADE_CLASSROOMS[level] || 'Aula Base';
      const cleanRoom = rawRoom.trim();
      const room = /^aula\b/i.test(cleanRoom) ? cleanRoom : `Aula ${cleanRoom}`;
      const last = groups[groups.length - 1];
      if (last && last.level === level) {
        last.grades.push(g);
      } else {
        groups.push({ level, room, grades: [g] });
      }
    });
    return groups;
  }, [isSupportPlanD, activeGrades]);

  // Visible period slots for the selected shift and day
  const activePeriodSlots = useMemo(() => {
    const rawSlots = buildDynamicPublicSlots(selectedShift, isMeetingDay, isEventDay, activeScheduleType);
    const hasMediaTecnicaInFiltered = filteredBlocks.some((b) => b.period >= 7 && b.period <= 11);
    return rawSlots.filter((slot) => {
      if (!slot.mediaTecnicaOnly) return true;
      if (!hasMediaTecnicaInFiltered) return false;
      if (slot.isTransition) return true;
      return filteredBlocks.some((b) => b.period === slot.period);
    });
  }, [selectedShift, isMeetingDay, isEventDay, activeScheduleType, filteredBlocks]);

  const logoUrl = '/assets/aistudio/logo_html_859fb25c.png';

  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const activeDayObj = DAYS.find((d) => d.key === selectedDay);
      await downloadScheduleAsPdf({
        shiftLabel: SHIFT_LABELS[selectedShift],
        shiftKey: selectedShift,
        dayLabel: activeDayObj?.label || selectedDay,
        scheduleType: activeScheduleType,
        academicPeriod: displayAcademicPeriod,
        academicWeek: displayAcademicWeek,
        isHoliday,
        grades: activeGrades,
        periodSlots: activePeriodSlots,
        blocks: filteredBlocks,
        teachers,
        logoSrc: logoUrl,
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-3 sm:p-4 lg:p-5 space-y-4 w-full max-w-full mx-auto">
      {/* Cabecera Oficial */}
      <header className="bg-[#0c4da2] text-white rounded-3xl px-6 py-5 sm:px-8 sm:py-6 shadow-xl border-b-4 border-amber-400">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Izquierda y Centro: Logo Institucional + Título del Sistema */}
          <div className="flex flex-col md:flex-row md:items-center gap-5 lg:gap-7 min-w-0">
            <div className="shrink-0 flex items-center">
              <img
                src={logoUrl}
                alt="Logo Institucional"
                className="h-14 sm:h-16 lg:h-[68px] w-auto object-contain select-none"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_BASE64;
                }}
              />
            </div>

            <div className="hidden md:block h-12 w-px bg-white/25 shrink-0" />

            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-[26px] font-extrabold tracking-tight text-white leading-tight">
                <span className="block">Sistema de Agendamiento Escolar</span>
                <span className="block text-sky-200 font-bold text-sm sm:text-base lg:text-lg mt-0.5">
                  Horarios, actividades y jornadas académicas
                </span>
              </h1>
            </div>
          </div>

          {/* Derecha: Acciones (Descargar PDF e Imprimir) */}
          <div className="flex items-center justify-end gap-2.5 shrink-0 print:hidden">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold text-xs shadow-md hover:shadow-lg transition active:scale-95 cursor-pointer whitespace-nowrap"
              title="Descargar horario actual en formato PDF"
            >
              <FileDown className="w-4 h-4 shrink-0" />
              <span>{isExportingPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold text-xs backdrop-blur-md transition active:scale-95 cursor-pointer shadow-xs whitespace-nowrap"
              title="Imprimir horario"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Barra de Filtros y Controles Interactivos */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 print:hidden">
        {/* Fila Superior: Selector de Jornada + Grado, Docente y Barra de Búsqueda en la misma línea */}
        <div className="flex flex-wrap xl:flex-nowrap gap-3 items-center justify-between">
          {/* Selector de Jornada */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Jornada:</span>
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
              <button
                type="button"
                onClick={() => handleShiftChange('morning')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
                  selectedShift === 'morning'
                    ? 'bg-slate-900 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-semibold'
                }`}
              >
                <Sun className={`w-3.5 h-3.5 ${selectedShift === 'morning' ? 'text-amber-400' : 'text-slate-500'}`} />
                <span>Bachillerato (Mañana)</span>
              </button>

              <button
                type="button"
                onClick={() => handleShiftChange('afternoon')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
                  selectedShift === 'afternoon'
                    ? 'bg-slate-900 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-semibold'
                }`}
              >
                <Moon className={`w-3.5 h-3.5 ${selectedShift === 'afternoon' ? 'text-sky-300' : 'text-slate-500'}`} />
                <span>Primaria (Tarde)</span>
              </button>

              <button
                type="button"
                onClick={() => handleShiftChange('transicion-1')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
                  selectedShift === 'transicion-1'
                    ? 'bg-slate-900 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-semibold'
                }`}
              >
                <Sparkles
                  className={`w-3.5 h-3.5 ${selectedShift === 'transicion-1' ? 'text-purple-400' : 'text-slate-500'}`}
                />
                <span>Transición</span>
              </button>
            </div>
          </div>

          {/* Grado, Docente y Barra de Búsqueda en la misma línea */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Selector de Grado */}
            <div ref={gradeMenuRef} className="relative w-48 sm:w-52">
              <button
                type="button"
                onClick={() => setIsGradeMenuOpen((prev) => !prev)}
                className={`h-8 w-full flex items-center justify-between gap-2 px-3 rounded-xl border transition-all text-xs font-semibold cursor-pointer select-none shadow-2xs ${
                  selectedGrade !== 'ALL'
                    ? 'bg-sky-50 border-sky-300 text-sky-950 ring-1 ring-sky-300/60'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
                title="Filtrar por Grado"
              >
                <span className="flex items-center gap-2 truncate">
                  <GraduationCap className="w-3.5 h-3.5 text-[#0c4da2] shrink-0" />
                  <span className="font-bold truncate">
                    {selectedGrade === 'ALL'
                      ? `Todos los grados (${shiftGrades.length})`
                      : `Grado ${selectedGrade}`}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {selectedGrade !== 'ALL' && (
                    <span className="w-2 h-2 rounded-full bg-[#0c4da2]" />
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${
                      isGradeMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </span>
              </button>

              {isGradeMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-full max-h-72 overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 select-none">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGrade('ALL');
                      setIsGradeMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors whitespace-nowrap text-left"
                  >
                    <span
                      className={`text-xs font-semibold ${
                        selectedGrade === 'ALL' ? 'text-[#0c4da2] font-bold' : 'text-slate-700'
                      }`}
                    >
                      Todos los grados ({shiftGrades.length})
                    </span>
                    {selectedGrade === 'ALL' && (
                      <span className="w-2 h-2 rounded-full bg-[#0c4da2] shrink-0" />
                    )}
                  </button>
                  {shiftGrades.map((g) => {
                    const isSelected = selectedGrade === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          setSelectedGrade(g);
                          setIsGradeMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors whitespace-nowrap text-left"
                      >
                        <span
                          className={`text-xs font-semibold ${
                            isSelected ? 'text-[#0c4da2] font-bold' : 'text-slate-700'
                          }`}
                        >
                          Grado {g}
                        </span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-[#0c4da2] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selector de Docente */}
            <div ref={teacherMenuRef} className="relative w-52 sm:w-56">
              <button
                type="button"
                onClick={() => setIsTeacherMenuOpen((prev) => !prev)}
                className={`h-8 w-full flex items-center justify-between gap-2 px-3 rounded-xl border transition-all text-xs font-semibold cursor-pointer select-none shadow-2xs ${
                  selectedTeacher !== 'ALL'
                    ? 'bg-sky-50 border-sky-300 text-sky-950 ring-1 ring-sky-300/60'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
                title="Filtrar por Docente"
              >
                <span className="flex items-center gap-2 truncate">
                  <User className="w-3.5 h-3.5 text-[#0c4da2] shrink-0" />
                  <span className="font-bold truncate">
                    {selectedTeacher === 'ALL' ? 'Todos los docentes' : selectedTeacher}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {selectedTeacher !== 'ALL' && (
                    <span className="w-2 h-2 rounded-full bg-[#0c4da2]" />
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${
                      isTeacherMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </span>
              </button>

              {isTeacherMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-full max-h-72 overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 select-none">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeacher('ALL');
                      setIsTeacherMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors whitespace-nowrap text-left"
                  >
                    <span
                      className={`text-xs font-semibold ${
                        selectedTeacher === 'ALL' ? 'text-[#0c4da2] font-bold' : 'text-slate-700'
                      }`}
                    >
                      Todos los docentes
                    </span>
                    {selectedTeacher === 'ALL' && (
                      <span className="w-2 h-2 rounded-full bg-[#0c4da2] shrink-0" />
                    )}
                  </button>
                  {teachers
                    .filter(
                      (t) =>
                        t.id !== 't-adriana-mier' &&
                        !String(t.displayName || '').toLowerCase().includes('adriana mier') &&
                        !String(t.displayName || '').toLowerCase().includes('adriana luc')
                    )
                    .map((t) => {
                      const isSelected = selectedTeacher === t.displayName;
                      return (
                        <button
                          key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTeacher(t.displayName);
                          setIsTeacherMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors whitespace-nowrap text-left"
                      >
                        <span
                          className={`text-xs font-semibold truncate ${
                            isSelected ? 'text-[#0c4da2] font-bold' : 'text-slate-700'
                          }`}
                        >
                          {t.displayName}
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                          style={{ backgroundColor: t.color || '#0c4da2' }}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Búsqueda rápida */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar asignatura o aula..."
                className="h-8 pl-8 pr-7 bg-white hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#0c4da2] focus:ring-1 focus:ring-[#0c4da2] rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 outline-none transition shadow-2xs w-48 sm:w-56"
              />
              {searchTerm.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition p-0.5 rounded-full cursor-pointer"
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Fila Inferior: Días de la Semana (Más grandes y con mayor contraste) + Datos de Periodo y Semana */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3.5 border-t border-slate-200">
          {/* Pestañas de Días de la Semana */}
          <div className="flex flex-wrap items-center gap-2 bg-brand-50/70 p-1.5 rounded-2xl border border-brand-100 overflow-x-auto">
            {DAYS.map((d) => {
              const dayIsHoliday = Boolean(dayConfigs.holidayDays?.[d.key]);
              const isSelected = selectedDay === d.key;
              const isToday = d.key === todayDayKey;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setSelectedDay(d.key)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-extrabold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? dayIsHoliday
                        ? 'bg-red-600 text-white shadow-md ring-2 ring-red-600/25'
                        : 'bg-villa-blue text-white shadow-md ring-2 ring-villa-blue/25'
                      : dayIsHoliday
                      ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                      : isToday
                      ? 'bg-brand-50 text-villa-blue-dark border-2 border-villa-blue-light hover:bg-brand-100/80 shadow-2xs'
                      : 'bg-white text-villa-dark border border-slate-300 hover:bg-brand-50/60 hover:border-villa-blue-light/60 hover:text-villa-blue-dark shadow-2xs'
                  }`}
                >
                  <span>{d.label}</span>
                  {isToday && (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider leading-none ${
                        isSelected
                          ? 'bg-villa-blue-light text-white border border-white/30 shadow-2xs'
                          : 'bg-villa-blue text-white'
                      }`}
                    >
                      Hoy
                    </span>
                  )}
                  {dayIsHoliday && (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider leading-none ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      Festivo
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Información de Periodo y Semana Académica junto a los días */}
          <div className="flex items-center gap-3 bg-slate-100 border border-slate-200/90 rounded-2xl px-4 py-2 text-right shrink-0">
            {isBlankSchedule && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 border border-blue-200 text-[11px] font-extrabold tracking-wide">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                Parrilla en blanco
              </span>
            )}
            <div className="leading-snug">
              <div className="text-sm font-extrabold text-[#0c4da2]">
                {displayAcademicPeriod}
              </div>
              <div className="text-xs font-bold text-slate-600">
                Semana académica {displayAcademicWeek} de 14
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Matriz / Cuadrícula de Horarios en Vivo (Por Jornada y por Día) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isBlankSchedule && (
          <div className="bg-blue-50/90 border-b border-blue-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-blue-950 text-xs font-extrabold">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-700 text-white text-[10px] uppercase tracking-wider font-black">
                Estado activo
              </span>
              <span>Parrilla en blanco &bull; Sin asignaciones académicas registradas</span>
            </div>
            <span className="text-[11px] font-semibold text-blue-800">
              Todas las franjas se encuentran disponibles para programación
            </span>
          </div>
        )}
        {!isBlankSchedule &&
        !isHoliday &&
        !isMeetingDay &&
        filteredBlocks.length === 0 &&
        (selectedTeacher !== 'ALL' || searchTerm.trim().length > 0) ? (
          <div className="p-12 text-center space-y-3">
            <Info className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-700">No se encontraron asignaciones para esta selección</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Prueba cambiando el día de la semana, la jornada o restableciendo los filtros de grado y docente.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            <table className="w-full table-fixed border-collapse text-left text-xs">
              <thead>
                {isSupportPlanD ? (
                  <>
                    <tr className="border-b border-slate-400">
                      <th className="p-2 font-extrabold text-white uppercase tracking-wider text-xs w-28 sm:w-32 border-r border-slate-500 bg-slate-700 text-center">
                        Horario
                      </th>
                      {supportPlanGroups.map((grp, i) => (
                        <th
                          key={`room-${grp.room}-${i}`}
                          colSpan={grp.grades.length}
                          className="p-2 font-black text-white text-center border-r border-slate-500 last:border-r-0 bg-[#7f7f7f] text-sm sm:text-base tracking-wide"
                        >
                          {grp.room}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="p-2 font-extrabold text-slate-700 uppercase tracking-wider text-xs w-28 sm:w-32 border-r border-slate-300 bg-slate-100 whitespace-nowrap text-center">
                        Horario {activeScheduleType}
                      </th>
                      {activeGrades.map((g) => (
                        <th
                          key={g}
                          className="p-1.5 font-black text-slate-900 text-center border-r border-slate-300 last:border-r-0 bg-[#b8cce4] text-xs sm:text-sm"
                        >
                          <div>{g}</div>
                          <div className="text-[10px] font-semibold text-slate-700 mt-0.5 truncate">
                            {getSupportRoomForGrade(g)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </>
                ) : (
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {selectedShift === 'transicion-1' ? (
                      activeGrades.map((g) => (
                        <React.Fragment key={`th-pair-${g}`}>
                          <th className="p-2 font-extrabold text-slate-600 uppercase tracking-wider text-xs w-28 sm:w-32 border-r border-slate-200 bg-slate-50 whitespace-nowrap text-center">
                            Horario {activeScheduleType}
                          </th>
                          <th className="p-1.5 font-bold text-slate-800 text-center border-r border-slate-200 last:border-r-0 truncate">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200/60 font-extrabold text-[11px] truncate max-w-full">
                              {g}
                            </span>
                            {g === 'Transición 1' && (
                              <div className="text-[9.5px] font-mono text-slate-500 font-semibold mt-0.5">07:00 - 12:00</div>
                            )}
                            {g === 'Transición 2' && (
                              <div className="text-[9.5px] font-mono text-slate-500 font-semibold mt-0.5">12:30 - 17:30</div>
                            )}
                          </th>
                        </React.Fragment>
                      ))
                    ) : (
                      <>
                        <th className="p-2 font-extrabold text-slate-600 uppercase tracking-wider text-xs w-28 sm:w-32 border-r border-slate-200 bg-slate-50 whitespace-nowrap text-center">
                          Horario {activeScheduleType}
                        </th>
                        {activeGrades.map((g) => (
                          <th key={g} className="p-1.5 font-bold text-slate-800 text-center border-r border-slate-200 last:border-r-0 truncate">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200/60 font-extrabold text-[11px] truncate max-w-full">
                              {g}
                            </span>
                            {REGULAR_GRADE_CLASSROOMS[g] && (
                              <div className="text-[10px] font-medium text-slate-500 mt-0.5 truncate">
                                {REGULAR_GRADE_CLASSROOMS[g]}
                              </div>
                            )}
                          </th>
                        ))}
                      </>
                    )}
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isHoliday && (
                  <tr className="bg-red-50 border-b-2 border-red-200">
                    <td
                      colSpan={selectedShift === 'transicion-1' ? activeGrades.length * 2 : activeGrades.length + 1}
                      className="py-2 px-4 text-center font-extrabold text-red-800 text-xs tracking-wide"
                    >
                      📅 Día Festivo Institucional &bull; Sin actividad académica programada
                    </td>
                  </tr>
                )}
                {activePeriodSlots.map((slot) => {
                  if (slot.isPreJornada && !isHoliday) {
                    if (selectedShift === 'transicion-1') {
                      return (
                        <tr key="pre-jornada-public" className="bg-amber-50/80 border-y-2 border-amber-300">
                          {activeGrades.map((g) => {
                            const isT2 = g === 'Transición 2';
                            const slotTime = isT2 && slot.secondaryTime ? slot.secondaryTime : slot.time;
                            return (
                              <React.Fragment key={`pre-jornada-${g}`}>
                                <td className="p-2 bg-amber-50 border-r border-amber-300 w-28 sm:w-32 whitespace-nowrap align-middle text-center">
                                  <div className="font-extrabold text-amber-900 text-sm uppercase whitespace-nowrap leading-tight">{slot.label}</div>
                                  <div className="text-xs font-mono font-bold text-amber-800 flex items-center justify-center gap-1 mt-1 whitespace-nowrap">
                                    <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span className="whitespace-nowrap">{slotTime}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-center bg-amber-50/70 border-r border-amber-300 last:border-r-0">
                                  <div className="text-sm font-black text-slate-900 uppercase tracking-wider">
                                    👥 {slot.meetingTitle}
                                  </div>
                                  <div className="text-xs font-semibold text-amber-900/80 mt-0.5">
                                    Franja institucional de excepción ({slotTime}) &bull; Sin asignación de clases ni sustituciones
                                  </div>
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    }
                    return (
                      <tr key="pre-jornada-public" className="bg-amber-50/80 border-y-2 border-amber-300">
                        <td className="p-2 bg-amber-50 border-r border-amber-300 w-28 sm:w-32 whitespace-nowrap align-middle text-center">
                          <div className="font-extrabold text-amber-900 text-sm uppercase whitespace-nowrap leading-tight">{slot.label}</div>
                          <div className="text-xs font-mono font-bold text-amber-800 flex items-center justify-center gap-1 mt-1 whitespace-nowrap">
                            <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="whitespace-nowrap">{slot.time}</span>
                          </div>
                        </td>
                        <td colSpan={activeGrades.length} className="py-3 px-4 text-center bg-amber-50/70">
                          <div className="text-sm font-black text-slate-900 uppercase tracking-wider">
                            👥 {slot.meetingTitle}
                          </div>
                          <div className="text-xs font-semibold text-amber-900/80 mt-0.5">
                            {slot.meetingDesc}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (slot.isBreak) {
                    if (selectedShift === 'transicion-1') {
                      return (
                        <tr key={`break-${slot.period}`} className="bg-amber-50/70 border-y border-amber-200/80">
                          {activeGrades.map((g) => {
                            const isT2 = g === 'Transición 2';
                            const slotTime = isT2 && slot.secondaryTime ? slot.secondaryTime : slot.time;
                            return (
                              <React.Fragment key={`break-${g}`}>
                                <td className="p-2 bg-amber-100/80 border-r border-amber-200 w-28 sm:w-32 whitespace-nowrap align-middle text-center">
                                  <div className="font-extrabold text-amber-950 text-sm whitespace-nowrap leading-tight">Receso</div>
                                  <div className="text-xs font-mono font-bold text-amber-800 flex items-center justify-center gap-1 mt-1 whitespace-nowrap">
                                    <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span className="whitespace-nowrap">{slotTime}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-4 text-center font-bold text-amber-900 text-xs tracking-wide border-r border-amber-200 last:border-r-0">
                                  ☕ {slot.label}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    }
                    return (
                      <tr key={`break-${slot.period}`} className="bg-amber-50/70 border-y border-amber-200/80">
                        <td
                          colSpan={activeGrades.length + 1}
                          className="py-2 px-4 text-center font-bold text-amber-900 text-xs tracking-wide"
                        >
                          ☕ {slot.label} &bull; ({slot.time})
                        </td>
                      </tr>
                    );
                  }

                  if (slot.isTransition) {
                    return (
                      <tr key="transition-mt" className="bg-slate-100 border-y-2 border-slate-300">
                        <td
                          colSpan={activeGrades.length + 1}
                          className="py-1.5 px-4 text-center font-extrabold text-slate-600 text-[11px] uppercase tracking-wider"
                        >
                          🎓 {slot.label} &bull; ({slot.time})
                        </td>
                      </tr>
                    );
                  }

                  if (slot.isMeetingFirstHour && !isHoliday) {
                    return (
                      <tr key="meeting-first-hour" className="bg-amber-50/70 border-y-2 border-amber-300">
                        <td className="p-2 bg-slate-100 border-r border-slate-300 w-28 sm:w-32 whitespace-nowrap align-middle text-center">
                          <div className="font-extrabold text-[#0c4da2] text-sm sm:text-[15px] whitespace-nowrap leading-tight">{slot.label}</div>
                          <div className="text-xs sm:text-[13px] font-mono font-bold text-slate-700 flex items-center justify-center gap-1 mt-1 whitespace-nowrap">
                            <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="whitespace-nowrap">{slot.time}</span>
                          </div>
                        </td>
                        <td colSpan={activeGrades.length} className="py-3 px-4 text-center bg-gray-200/90">
                          <div className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wider">
                            👥 {slot.meetingTitle}
                          </div>
                          <div className="text-xs font-semibold text-slate-600 mt-0.5">
                            {slot.meetingDesc}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (selectedShift === 'transicion-1') {
                    return (
                      <tr key={`slot-${slot.period}`} className="hover:bg-slate-50/50 transition">
                        {activeGrades.map((grade) => {
                          const isT2 = grade === 'Transición 2';
                          const slotTime = isT2 && slot.secondaryTime ? slot.secondaryTime : slot.time;
                          const cellBlocks = filteredBlocks.filter(
                            (b) => b.period === slot.period && b.gradeName === grade
                          );
                          const primaryBlock =
                            cellBlocks.length > 0
                              ? cellBlocks.find((b) => b.block_type === 'novelty' || b.motivo_novedad) || cellBlocks[0]
                              : null;

                          return (
                            <React.Fragment key={`${slot.period}-${grade}`}>
                              <td className="p-2 bg-slate-50/80 border-r border-slate-200 w-28 sm:w-32 whitespace-nowrap align-middle text-center">
                                <div className="font-extrabold text-[#0c4da2] text-sm sm:text-[15px] whitespace-nowrap leading-tight">{slot.label}</div>
                                <div className="text-xs sm:text-[13px] font-mono font-bold text-slate-700 flex items-center justify-center gap-1 mt-1 whitespace-nowrap">
                                  <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                  <span className="whitespace-nowrap">{slotTime}</span>
                                </div>
                              </td>
                              {isHoliday ? (
                                <td className="p-0.5 border-r border-slate-200 last:border-r-0 align-top h-[104px] max-h-[108px] overflow-hidden">
                                  <div className="h-full min-h-[94px] max-h-[100px] rounded-lg bg-gray-100 border border-gray-200 flex flex-col items-center justify-center text-center p-1.5 select-none space-y-0.5">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                      Festivo
                                    </span>
                                    <span className="text-[9px] text-gray-400 font-medium leading-tight">
                                      Sin actividad académica
                                    </span>
                                  </div>
                                </td>
                              ) : (
                                <td className="p-0.5 border-r border-slate-200 last:border-r-0 align-top h-[104px] max-h-[108px] overflow-hidden">
                                  {!primaryBlock ? (
                                    <MatrixSlotCard timeBlock={null} />
                                  ) : (
                                    <div className="h-full max-h-[102px]">
                                      <MatrixSlotCard key={primaryBlock.id} timeBlock={primaryBlock} />
                                    </div>
                                  )}
                                </td>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    );
                  }

                  return (
                    <React.Fragment key={`slot-group-${slot.period}`}>
                      {isSupportPlanD && slot.period === 1 && (
                        <tr className="bg-slate-50 border-y-2 border-slate-300">
                          <th className="p-2 font-extrabold text-slate-600 uppercase tracking-wider text-xs w-28 sm:w-32 border-r border-slate-200 bg-slate-50 whitespace-nowrap text-center">
                            Horario {activeScheduleType}
                          </th>
                          {activeGrades.map((g) => (
                            <th
                              key={`inline-regular-${g}`}
                              className="p-1.5 font-bold text-slate-800 text-center border-r border-slate-200 last:border-r-0 bg-slate-50 truncate"
                            >
                              <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200/60 font-extrabold text-[11px] truncate max-w-full">
                                {g}
                              </span>
                              {REGULAR_GRADE_CLASSROOMS[g] && (
                                <div className="text-[10px] font-medium text-slate-500 mt-0.5 truncate">
                                  {REGULAR_GRADE_CLASSROOMS[g]}
                                </div>
                              )}
                            </th>
                          ))}
                        </tr>
                      )}
                      <tr className="hover:bg-slate-50/50 transition">
                        {/* Columna Horaria Fija */}
                        <td className="p-2 bg-slate-50/80 border-r border-slate-200 w-28 sm:w-32 whitespace-nowrap align-middle text-center">
                          <div className="font-extrabold text-[#0c4da2] text-sm sm:text-[15px] whitespace-nowrap leading-tight">{slot.label}</div>
                          <div className="text-xs sm:text-[13px] font-mono font-bold text-slate-700 flex items-center justify-center gap-1 mt-1 whitespace-nowrap">
                            <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="whitespace-nowrap">{slot.time}</span>
                          </div>
                        </td>

                        {/* Celdas por Grado */}
                        {activeGrades.map((grade) => {
                          if (isHoliday) {
                            return (
                              <td
                                key={`${slot.period}-${grade}`}
                                className="p-0.5 border-r border-slate-200 last:border-r-0 align-top h-[104px] max-h-[108px] overflow-hidden"
                              >
                                <div className="h-full min-h-[94px] max-h-[100px] rounded-lg bg-gray-100 border border-gray-200 flex flex-col items-center justify-center text-center p-1.5 select-none space-y-0.5">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    Festivo
                                  </span>
                                  <span className="text-[9px] text-gray-400 font-medium leading-tight">
                                    Sin actividad académica
                                  </span>
                                </div>
                              </td>
                            );
                          }

                          const cellBlocks = filteredBlocks.filter(
                            (b) => b.period === slot.period && b.gradeName === grade
                          );
                          const isSeniorHigh = grade.startsWith('10') || grade.startsWith('11');
                          const isBeyondRegularMorning =
                            selectedShift === 'morning' && slot.period >= 7 && slot.period <= 11 && !isSeniorHigh;
                          const primaryBlock =
                            cellBlocks.length > 0
                              ? cellBlocks.find((b) => b.block_type === 'novelty' || b.motivo_novedad) || cellBlocks[0]
                              : null;

                          return (
                            <td
                              key={`${slot.period}-${grade}`}
                              className="p-0.5 border-r border-slate-200 last:border-r-0 align-top h-[104px] max-h-[108px] overflow-hidden"
                            >
                              {!primaryBlock ? (
                                isBeyondRegularMorning ? (
                                  <div className="h-full min-h-[94px] max-h-[100px] rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-center p-1.5">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                      Fin de jornada
                                    </span>
                                  </div>
                                ) : (
                                  <MatrixSlotCard timeBlock={null} />
                                )
                              ) : (
                                <div className="h-full max-h-[102px]">
                                  <MatrixSlotCard key={primaryBlock.id} timeBlock={primaryBlock} />
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pie de Página */}
      <div className="text-center text-xs text-slate-500 pt-2 space-y-1">
        <p>
          Última actualización:{' '}
          <span className="font-semibold text-slate-700">{snapshot?.metadata.lastUpdated || 'En tiempo real'}</span>
        </p>
        <p className="text-[11px] text-slate-400">
          Sistema de Agendamiento Escolar — Horarios, actividades y jornadas académicas
        </p>
        <p className="text-[11px] font-bold text-slate-600">
          Desarrollado y diseñado por Reakta Group
        </p>
      </div>
    </div>
  );
};
