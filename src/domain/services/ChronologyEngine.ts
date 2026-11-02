export interface AcademicPeriod {
  period: number;
  start: string;
  end: string;
  totalWeeks: number;
  label?: string;
}

export type AcademicRecessType =
  | 'institutional_development'
  | 'vacation'
  | 'student_recess'
  | 'clei';

export interface AcademicRecess {
  start: string;
  end: string;
  name: string;
  type?: AcademicRecessType;
  weeks?: number;
}

export interface AcademicLectureBlock {
  id: string;
  start: string;
  end: string;
  weeks: number;
  label: string;
}

export interface HolidayEntry {
  date: string;
  name: string;
  isCustom?: boolean;
}

export type InstitutionalEventModality = 'A' | 'B' | 'D' | 'holiday' | 'novelty';

export interface InstitutionalCalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD (fecha de inicio o día único)
  endDate?: string; // YYYY-MM-DD (opcional para rangos de días)
  title: string;
  description?: string;
  badgeLabel?: string;
  modality: InstitutionalEventModality;
  notes?: string;
}

export interface AcademicYearCalendarConfig {
  year: number;
  resolutionTitle: string;
  resolutionImageUrl?: string;
  totalWeeks: number;
  periods: AcademicPeriod[];
  lectureBlocks?: AcademicLectureBlock[];
  institutionalDevelopmentWeeks: AcademicRecess[];
  teacherVacations: AcademicRecess[];
  studentRecesses?: AcademicRecess[];
  cleiAdditionalWeeks?: AcademicRecess[];
  holidays: HolidayEntry[];
  institutionalEvents: InstitutionalCalendarEvent[];
  seededProjection2026?: boolean;
  updatedAt?: number;
}

export interface AcademicCalendarsStore {
  activePlannerYear: number;
  years: Record<number, AcademicYearCalendarConfig>;
  updatedAtMs: number;
}

export type WeekSlotMode = 'current' | 'next';

export const FRIDAY_CUTOFF_HOUR = 18;
export const FRIDAY_CUTOFF_MINUTE = 0;

const ACADEMIC_CALENDARS_STORAGE_KEY = 'ievf_academic_calendars_v1';

/**
 * Calcula la fecha del Domingo de Pascua para cualquier año (Algoritmo de Meeus/Jones/Butcher)
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Ley 51 de 1983 (Ley Emiliani): Traslada ciertos festivos religiosos/cívicos al siguiente lunes
 * si no caen en lunes.
 */
function moveToNextMonday(year: number, month1Based: number, day: number): string {
  const d = new Date(year, month1Based - 1, day, 0, 0, 0, 0);
  const dow = d.getDay(); // 0 Dom, 1 Lun, ..., 6 Sáb
  if (dow === 1) return formatIsoDate(d);
  const daysUntilMonday = dow === 0 ? 1 : 8 - dow;
  return formatIsoDate(addDays(d, daysUntilMonday));
}

/**
 * Calcula automáticamente los 18 días festivos oficiales de Colombia para cualquier año (ej. 2026, 2027, 2028+).
 */
export function computeColombianHolidaysForYear(year: number): HolidayEntry[] {
  const easter = getEasterSunday(year);

  const list: HolidayEntry[] = [
    // Festivos de fecha fija
    { date: `${year}-01-01`, name: 'Año Nuevo' },
    { date: `${year}-05-01`, name: 'Día del Trabajo' },
    { date: `${year}-07-20`, name: 'Día de la Independencia' },
    { date: `${year}-08-07`, name: 'Batalla de Boyacá' },
    { date: `${year}-12-08`, name: 'Inmaculada Concepción' },
    { date: `${year}-12-25`, name: 'Navidad' },

    // Festivos trasladables al lunes (Ley Emiliani)
    { date: moveToNextMonday(year, 1, 6), name: 'Día de los Reyes Magos' },
    { date: moveToNextMonday(year, 3, 19), name: 'Día de San José' },
    { date: moveToNextMonday(year, 6, 29), name: 'San Pedro y San Pablo' },
    { date: moveToNextMonday(year, 8, 15), name: 'La Asunción de la Virgen' },
    { date: moveToNextMonday(year, 10, 12), name: 'Día de la Raza' },
    { date: moveToNextMonday(year, 11, 1), name: 'Todos los Santos' },
    { date: moveToNextMonday(year, 11, 11), name: 'Independencia de Cartagena' },

    // Festivos relativos a la Pascua
    { date: formatIsoDate(addDays(easter, -3)), name: 'Jueves Santo' },
    { date: formatIsoDate(addDays(easter, -2)), name: 'Viernes Santo' },
    { date: formatIsoDate(addDays(easter, 43)), name: 'Ascensión del Señor' },
    { date: formatIsoDate(addDays(easter, 64)), name: 'Corpus Christi' },
    { date: formatIsoDate(addDays(easter, 71)), name: 'Sagrado Corazón de Jesús' },
  ];

  // Ordenar cronológicamente y evitar duplicados si un móvil coincide con fijo
  const byDate = new Map<string, HolidayEntry>();
  for (const h of list.sort((a, b) => a.date.localeCompare(b.date))) {
    const existing = byDate.get(h.date);
    if (existing) {
      existing.name = `${existing.name} / ${h.name}`;
    } else {
      byDate.set(h.date, { ...h });
    }
  }
  return Array.from(byDate.values());
}

export const officialColombianHolidays2026: HolidayEntry[] = computeColombianHolidaysForYear(2026);
export const officialColombianHolidays2027: HolidayEntry[] = computeColombianHolidaysForYear(2027);

export const academicPeriods2026: AcademicPeriod[] = [
  { period: 1, start: '2026-01-26', end: '2026-05-01', totalWeeks: 13, label: '1er Periodo' },
  { period: 2, start: '2026-05-04', end: '2026-08-14', totalWeeks: 13, label: '2do Periodo' },
  { period: 3, start: '2026-08-17', end: '2026-11-29', totalWeeks: 14, label: '3er Periodo' },
];

export const institutionalDevelopmentWeeks2026: AcademicRecess[] = [
  {
    start: '2026-01-12',
    end: '2026-01-25',
    name: 'Desarrollo Institucional (2 semanas)',
    type: 'institutional_development',
    weeks: 2,
  },
  {
    start: '2026-03-30',
    end: '2026-04-05',
    name: 'Desarrollo Institucional • Semana Santa',
    type: 'institutional_development',
    weeks: 1,
  },
  {
    start: '2026-10-05',
    end: '2026-10-11',
    name: 'Desarrollo Institucional • Receso de Octubre',
    type: 'institutional_development',
    weeks: 1,
  },
  {
    start: '2026-11-30',
    end: '2026-12-13',
    name: 'Desarrollo Institucional • Cierre Lectivo (2 semanas)',
    type: 'institutional_development',
    weeks: 2,
  },
];

export const teacherVacations2026: AcademicRecess[] = [
  {
    start: '2025-12-22',
    end: '2026-01-11',
    name: 'Vacaciones de Docentes y Directivos (3 semanas)',
    type: 'vacation',
    weeks: 3,
  },
  {
    start: '2026-06-22',
    end: '2026-07-05',
    name: 'Vacaciones de Docentes • Mitad de Año (2 semanas)',
    type: 'vacation',
    weeks: 2,
  },
  {
    start: '2026-12-14',
    end: '2026-12-27',
    name: 'Vacaciones de Docentes • Fin de Año (2 semanas)',
    type: 'vacation',
    weeks: 2,
  },
];

/**
 * Configuración oficial 2027 según Resolución del Distrito de Medellín adjunta:
 * - Artículo 2: 40 semanas lectivas (18 ene - 21 mar: 9 sem; 29 mar - 13 jun: 11 sem; 5 jul - 10 oct: 14 sem; 18 oct - 28 nov: 6 sem)
 *   Distribuidas en los 3 periodos institucionales de I.E. Villa Flora (13 + 13 + 14 = 40 semanas).
 * - Artículo 3: 5 semanas de Desarrollo Institucional
 * - Artículo 4: 7 semanas de Vacaciones de Docentes y Directivos Docentes
 * - Artículo 5: 12 semanas de Receso Estudiantil
 * - Artículo 6: 4 semanas lectivas adicionales CLEI V y VI
 */
export const academicPeriods2027: AcademicPeriod[] = [
  { period: 1, start: '2027-01-18', end: '2027-04-25', totalWeeks: 13, label: '1er Periodo' },
  { period: 2, start: '2027-04-26', end: '2027-08-15', totalWeeks: 13, label: '2do Periodo' },
  { period: 3, start: '2027-08-16', end: '2027-11-28', totalWeeks: 14, label: '3er Periodo' },
];

export const lectureBlocks2027: AcademicLectureBlock[] = [
  {
    id: '2027-b1',
    start: '2027-01-18',
    end: '2027-03-21',
    weeks: 9,
    label: 'Bloque Lectivo 1 (Enero – Marzo)',
  },
  {
    id: '2027-b2',
    start: '2027-03-29',
    end: '2027-06-13',
    weeks: 11,
    label: 'Bloque Lectivo 2 (Marzo – Junio)',
  },
  {
    id: '2027-b3',
    start: '2027-07-05',
    end: '2027-10-10',
    weeks: 14,
    label: 'Bloque Lectivo 3 (Julio – Octubre)',
  },
  {
    id: '2027-b4',
    start: '2027-10-18',
    end: '2027-11-28',
    weeks: 6,
    label: 'Bloque Lectivo 4 (Octubre – Noviembre)',
  },
];

export const institutionalDevelopmentWeeks2027: AcademicRecess[] = [
  {
    start: '2027-01-11',
    end: '2027-01-17',
    name: 'Desarrollo Institucional • Inicio de Año (1 semana)',
    type: 'institutional_development',
    weeks: 1,
  },
  {
    start: '2027-03-22',
    end: '2027-03-28',
    name: 'Desarrollo Institucional • Semana Santa (1 semana)',
    type: 'institutional_development',
    weeks: 1,
  },
  {
    start: '2027-06-28',
    end: '2027-07-04',
    name: 'Desarrollo Institucional • Mitad de Año (1 semana)',
    type: 'institutional_development',
    weeks: 1,
  },
  {
    start: '2027-10-11',
    end: '2027-10-17',
    name: 'Desarrollo Institucional • Receso de Octubre (1 semana)',
    type: 'institutional_development',
    weeks: 1,
  },
  {
    start: '2027-11-29',
    end: '2027-12-05',
    name: 'Desarrollo Institucional • Cierre Lectivo (1 semana)',
    type: 'institutional_development',
    weeks: 1,
  },
];

export const teacherVacations2027: AcademicRecess[] = [
  {
    start: '2026-12-28',
    end: '2027-01-10',
    name: 'Vacaciones de Docentes y Directivos • Inicio de Año (2 semanas)',
    type: 'vacation',
    weeks: 2,
  },
  {
    start: '2027-06-14',
    end: '2027-06-27',
    name: 'Vacaciones de Docentes • Mitad de Año (2 semanas)',
    type: 'vacation',
    weeks: 2,
  },
  {
    start: '2027-12-06',
    end: '2027-12-26',
    name: 'Vacaciones de Docentes • Fin de Año (3 semanas)',
    type: 'vacation',
    weeks: 3,
  },
];

export const studentRecesses2027: AcademicRecess[] = [
  {
    start: '2026-12-28',
    end: '2027-01-17',
    name: 'Receso Estudiantil • Inicio de Año (3 semanas)',
    type: 'student_recess',
    weeks: 3,
  },
  {
    start: '2027-03-22',
    end: '2027-03-28',
    name: 'Receso Estudiantil • Semana Santa (1 semana)',
    type: 'student_recess',
    weeks: 1,
  },
  {
    start: '2027-06-14',
    end: '2027-07-04',
    name: 'Receso Estudiantil • Mitad de Año (3 semanas)',
    type: 'student_recess',
    weeks: 3,
  },
  {
    start: '2027-10-11',
    end: '2027-10-17',
    name: 'Receso Estudiantil • Octubre (1 semana)',
    type: 'student_recess',
    weeks: 1,
  },
  {
    start: '2027-11-29',
    end: '2027-12-26',
    name: 'Receso Estudiantil • Fin de Año (4 semanas)',
    type: 'student_recess',
    weeks: 4,
  },
];

export const cleiAdditionalWeeks2027: AcademicRecess[] = [
  {
    start: '2027-01-11',
    end: '2027-01-17',
    name: 'Semana Lectiva Adicional CLEI V y VI (Enero)',
    type: 'clei',
    weeks: 1,
  },
  {
    start: '2027-03-22',
    end: '2027-03-28',
    name: 'Semana Lectiva Adicional CLEI V y VI (Marzo)',
    type: 'clei',
    weeks: 1,
  },
  {
    start: '2027-06-28',
    end: '2027-07-04',
    name: 'Semana Lectiva Adicional CLEI V y VI (Junio - Julio)',
    type: 'clei',
    weeks: 1,
  },
  {
    start: '2027-11-29',
    end: '2027-12-05',
    name: 'Semana Lectiva Adicional CLEI V y VI (Noviembre - Diciembre)',
    type: 'clei',
    weeks: 1,
  },
];

export const DEFAULT_INSTITUTIONAL_EVENTS_2026: InstitutionalCalendarEvent[] = [
  {
    id: 'proj-2026-nov-09-13',
    date: '2026-11-09',
    endDate: '2026-11-13',
    title: 'Proyectos, autoevaluación y coevaluación',
    badgeLabel: 'Proyectos y Eval.',
    description:
      'Del 9 al 13 de noviembre: Desarrollo de proyectos institucionales, autoevaluación y coevaluación estudiantil.',
    modality: 'A',
  },
  {
    id: 'proj-2026-nov-18',
    date: '2026-11-18',
    title: 'Aplicación de pruebas de periodo',
    badgeLabel: 'Pruebas Periodo',
    description:
      '18 de noviembre: Aplicación de pruebas acumulativas de tercer periodo académico.',
    modality: 'A',
  },
  {
    id: 'proj-2026-nov-23-25',
    date: '2026-11-23',
    endDate: '2026-11-25',
    title: 'Planes de apoyo de tercer periodo con horario especial',
    badgeLabel: 'Planes de apoyo',
    description:
      'Del 23 al 25 de noviembre: Planes de apoyo de tercer periodo con horario especial.',
    modality: 'D',
  },
  {
    id: 'proj-2026-nov-26',
    date: '2026-11-26',
    title: 'Primera comisión',
    badgeLabel: '1ª Comisión',
    description: '26 de noviembre: Primera comisión de evaluación y promoción.',
    modality: 'A',
  },
  {
    id: 'proj-2026-nov-27',
    date: '2026-11-27',
    title: 'Notificación a estudiantes',
    badgeLabel: 'Notificación',
    description: '27 de noviembre: Notificación de resultados y planes de apoyo a estudiantes.',
    modality: 'A',
  },
  {
    id: 'proj-2026-nov-30-dic-02',
    date: '2026-11-30',
    endDate: '2026-12-02',
    title: 'Entrega y sustentación de Planes de apoyo anuales',
    badgeLabel: 'Sustentación Anual',
    description:
      'Del 30 de noviembre al 2 de diciembre: Entrega y sustentación de Planes de apoyo anuales.',
    modality: 'D',
  },
  {
    id: 'proj-2026-dic-03',
    date: '2026-12-03',
    title: 'Segunda comisión',
    badgeLabel: '2ª Comisión',
    description: '3 de diciembre: Segunda comisión de evaluación y promoción.',
    modality: 'A',
  },
  {
    id: 'proj-2026-dic-04',
    date: '2026-12-04',
    title: 'Socialización de resultados con los estudiantes',
    badgeLabel: 'Socialización',
    description: '4 de diciembre: Socialización de resultados finales con los estudiantes.',
    modality: 'A',
  },
  {
    id: 'proj-2026-dic-07-11',
    date: '2026-12-07',
    endDate: '2026-12-11',
    title: 'Semana de desarrollo Institucional',
    badgeLabel: 'Desarrollo Inst.',
    description: 'Del 7 al 11 de diciembre: Semana de Desarrollo Institucional.',
    modality: 'A',
  },
  {
    id: 'proj-2026-dic-09',
    date: '2026-12-09',
    title: 'Entrega de notas académicas de fin de año',
    badgeLabel: 'Entrega de notas',
    description: '9 de diciembre: Entrega de notas e informes académicos de fin de año.',
    modality: 'B',
  },
  {
    id: 'proj-2026-dic-10',
    date: '2026-12-10',
    title: 'Acto de graduación',
    badgeLabel: 'Graduación',
    description:
      '10 de diciembre: Acto de graduación • Hora: 2:00 p. m. • Lugar: ESUMER • Entrega de togas: 12:30 p. m.',
    modality: 'novelty',
  },
];

export const DEFAULT_CALENDAR_2026: AcademicYearCalendarConfig = {
  year: 2026,
  resolutionTitle: 'Calendario Académico General (A) Año Escolar 2026 - Distrito de Medellín',
  totalWeeks: 40,
  periods: academicPeriods2026,
  lectureBlocks: [
    { id: '2026-b1', start: '2026-01-26', end: '2026-03-29', weeks: 9, label: 'Bloque Lectivo 1' },
    { id: '2026-b2', start: '2026-04-06', end: '2026-06-21', weeks: 11, label: 'Bloque Lectivo 2' },
    { id: '2026-b3', start: '2026-07-06', end: '2026-10-04', weeks: 13, label: 'Bloque Lectivo 3' },
    { id: '2026-b4', start: '2026-10-12', end: '2026-11-29', weeks: 7, label: 'Bloque Lectivo 4' },
  ],
  institutionalDevelopmentWeeks: institutionalDevelopmentWeeks2026,
  teacherVacations: teacherVacations2026,
  holidays: officialColombianHolidays2026,
  institutionalEvents: DEFAULT_INSTITUTIONAL_EVENTS_2026,
  seededProjection2026: true,
  updatedAt: Date.now(),
};

export const DEFAULT_CALENDAR_2027: AcademicYearCalendarConfig = {
  year: 2027,
  resolutionTitle:
    'Resolución Calendario Académico General (A) Año Escolar 2027 - Distrito Especial de Medellín',
  resolutionImageUrl: '/assets/aistudio/image_8e3d5042.png',
  totalWeeks: 40,
  periods: academicPeriods2027,
  lectureBlocks: lectureBlocks2027,
  institutionalDevelopmentWeeks: institutionalDevelopmentWeeks2027,
  teacherVacations: teacherVacations2027,
  studentRecesses: studentRecesses2027,
  cleiAdditionalWeeks: cleiAdditionalWeeks2027,
  holidays: officialColombianHolidays2027,
  institutionalEvents: [],
  updatedAt: Date.now(),
};

export function getDefaultAcademicCalendarsStore(): AcademicCalendarsStore {
  return {
    activePlannerYear: 2026,
    years: {
      2026: DEFAULT_CALENDAR_2026,
      2027: DEFAULT_CALENDAR_2027,
    },
    updatedAtMs: Date.now(),
  };
}

export function loadAcademicCalendarsStore(): AcademicCalendarsStore {
  const defaults = getDefaultAcademicCalendarsStore();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(ACADEMIC_CALENDARS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AcademicCalendarsStore>;
    if (!parsed || typeof parsed !== 'object' || !parsed.years) {
      return defaults;
    }
    const mergedYears: Record<number, AcademicYearCalendarConfig> = {
      2026: DEFAULT_CALENDAR_2026,
      2027: DEFAULT_CALENDAR_2027,
      ...parsed.years,
    };

    // Asegurar que la Proyección de Finalización 2026 quede cargada en tiendas previas
    if (mergedYears[2026] && !mergedYears[2026].seededProjection2026) {
      const existingEvents = Array.isArray(mergedYears[2026].institutionalEvents)
        ? mergedYears[2026].institutionalEvents
        : [];
      const existingIds = new Set(existingEvents.map((e) => e.id));
      const combined = [
        ...existingEvents,
        ...DEFAULT_INSTITUTIONAL_EVENTS_2026.filter((e) => !existingIds.has(e.id)),
      ].sort((a, b) => a.date.localeCompare(b.date));
      mergedYears[2026] = {
        ...mergedYears[2026],
        institutionalEvents: combined,
        seededProjection2026: true,
      };
    }

    return {
      activePlannerYear:
        typeof parsed.activePlannerYear === 'number' && mergedYears[parsed.activePlannerYear]
          ? parsed.activePlannerYear
          : 2026,
      years: mergedYears,
      updatedAtMs: Number(parsed.updatedAtMs || Date.now()),
    };
  } catch {
    return defaults;
  }
}

export function saveAcademicCalendarsStore(
  store: AcademicCalendarsStore,
  syncServer = true
): AcademicCalendarsStore {
  const mergedYears: Record<number, AcademicYearCalendarConfig> = {
    2026: DEFAULT_CALENDAR_2026,
    2027: DEFAULT_CALENDAR_2027,
    ...(store?.years || {}),
  };

  let needsServerResync = false;
  if (mergedYears[2026] && !mergedYears[2026].seededProjection2026) {
    const existingEvents = Array.isArray(mergedYears[2026].institutionalEvents)
      ? mergedYears[2026].institutionalEvents
      : [];
    const existingIds = new Set(existingEvents.map((e) => e.id));
    const combined = [
      ...existingEvents,
      ...DEFAULT_INSTITUTIONAL_EVENTS_2026.filter((e) => !existingIds.has(e.id)),
    ].sort((a, b) => a.date.localeCompare(b.date));
    mergedYears[2026] = {
      ...mergedYears[2026],
      institutionalEvents: combined,
      seededProjection2026: true,
    };
    needsServerResync = true;
  }

  const normalized: AcademicCalendarsStore = {
    ...store,
    activePlannerYear:
      typeof store?.activePlannerYear === 'number' && mergedYears[store.activePlannerYear]
        ? store.activePlannerYear
        : 2026,
    years: mergedYears,
    updatedAtMs: Date.now(),
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(ACADEMIC_CALENDARS_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent('academic_calendars_updated', { detail: normalized }));
    } catch {
      // ignore storage errors
    }
    if ((syncServer || needsServerResync) && typeof fetch === 'function') {
      try {
        const token =
          localStorage.getItem('ievf_session_token') ||
          localStorage.getItem('ievf_session_token_v1') ||
          '';
        void fetch('/api/academic-calendar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-ievf-session-token': token } : {}),
          },
          body: JSON.stringify(normalized),
        }).catch(() => {});
      } catch {
        // ignore network errors
      }
    }
  }
  return normalized;
}

export function getCalendarConfigForYear(year: number): AcademicYearCalendarConfig {
  const store = loadAcademicCalendarsStore();
  if (store.years[year]) {
    return store.years[year];
  }
  if (year === 2027) return DEFAULT_CALENDAR_2027;
  if (year === 2026) return DEFAULT_CALENDAR_2026;
  return {
    year,
    resolutionTitle: `Calendario Académico General (A) Año Escolar ${year}`,
    totalWeeks: 40,
    periods: [
      { period: 1, start: `${year}-01-18`, end: `${year}-04-25`, totalWeeks: 13, label: '1er Periodo' },
      { period: 2, start: `${year}-04-26`, end: `${year}-08-15`, totalWeeks: 13, label: '2do Periodo' },
      { period: 3, start: `${year}-08-16`, end: `${year}-11-28`, totalWeeks: 14, label: '3er Periodo' },
    ],
    institutionalDevelopmentWeeks: [],
    teacherVacations: [],
    holidays: computeColombianHolidaysForYear(year),
    institutionalEvents: [],
    updatedAt: Date.now(),
  };
}

// Exportaciones compatibles con el resto del sistema (apuntando por defecto a 2026)
export const academicPeriods: AcademicPeriod[] = academicPeriods2026;
export const institutionalDevelopmentWeeks: AcademicRecess[] = institutionalDevelopmentWeeks2026;
export const teacherVacations: AcademicRecess[] = teacherVacations2026;
export const academicRecesses: AcademicRecess[] = [
  ...teacherVacations2026,
  ...institutionalDevelopmentWeeks2026,
].sort((a, b) => a.start.localeCompare(b.start));

export function getAllRecessesForYearConfig(config: AcademicYearCalendarConfig): AcademicRecess[] {
  return [
    ...(config.teacherVacations || []),
    ...(config.institutionalDevelopmentWeeks || []),
  ].sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Evalúa si la fecha/hora actual ya superó el corte de los viernes a las 18:00 (6:00 PM)
 * (viernes >= 18:00, sábado o domingo), momento en el que se activa por defecto la próxima semana.
 */
export function isPastFridayCutoff(date: Date = new Date()): boolean {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const day = d.getDay(); // 0: Dom, 1: Lun, ..., 5: Vie, 6: Sáb
  const hours = d.getHours();
  const minutes = d.getMinutes();

  if (
    day === 5 &&
    (hours > FRIDAY_CUTOFF_HOUR || (hours === FRIDAY_CUTOFF_HOUR && minutes >= FRIDAY_CUTOFF_MINUTE))
  ) {
    return true;
  }
  if (day === 6 || day === 0) {
    return true;
  }
  return false;
}

/**
 * Devuelve el contenedor semanal activo por defecto ('current' o 'next').
 * A partir del viernes a las 18:00 (6:00 PM), la semana que inicia el lunes siguiente
 * pasa automáticamente a ser la "Semana Actual" ('current').
 */
export function getDefaultWeekSlotMode(_date: Date = new Date()): WeekSlotMode {
  return 'current';
}

export function getTodayDayOfWeek(date: Date = new Date(), mode?: WeekSlotMode): DayOfWeek {
  const effectiveMode = mode ?? getDefaultWeekSlotMode(date);
  if (effectiveMode === 'next' || isPastFridayCutoff(date)) {
    return 'lunes';
  }
  const day = date.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb
  if (day === 1) return 'lunes';
  if (day === 2) return 'martes';
  if (day === 3) return 'miercoles';
  if (day === 4) return 'jueves';
  if (day === 5) return 'viernes';
  return 'lunes';
}

export interface CurrentWeekData {
  year: number;
  lunesFormat: string;
  viernesFormat: string;
  weekNumber: number;
  periodNumber: number;
  totalWeeksInPeriod: number;
  recessName?: string;
  recessType?: AcademicRecessType;
  isRecess?: boolean;
}

/**
 * Motor de Formateo y Cronología Académica Multi-Año:
 * Evalúa automáticamente el calendario del año correspondiente al lunes o viernes de la semana consultada.
 */
export function getCurrentWeekText(activeDate: Date | string = new Date()): CurrentWeekData {
  const d =
    typeof activeDate === 'string' && activeDate.length === 10
      ? new Date(`${activeDate}T00:00:00`)
      : typeof activeDate === 'string'
      ? new Date(activeDate)
      : new Date(activeDate.getTime());

  const validDate = isNaN(d.getTime()) ? new Date() : d;

  // 1. Identificar el lunes y el viernes de la semana que corresponde a activeDate
  // Si se evalúa sobre una fecha/hora en vivo tras el cierre del viernes a las 18:00, avanzar al lunes siguiente
  const day = validDate.getDay(); // 0: domingo, 1: lunes, ..., 6: sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(validDate);
  monday.setDate(validDate.getDate() + diffToMonday);
  if (typeof activeDate !== 'string' && isPastFridayCutoff(validDate)) {
    monday.setDate(monday.getDate() + 7);
  }
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  // Resolver el año académico correspondiente (si una semana de fin de diciembre pertenece al receso del nuevo año, revisar ambos)
  const targetYear = friday.getFullYear();
  const yearConfig = getCalendarConfigForYear(targetYear);
  const nextYearConfig = getCalendarConfigForYear(targetYear + 1);
  const yearPeriods =
    yearConfig.periods && yearConfig.periods.length > 0 ? yearConfig.periods : academicPeriods2026;
  const combinedRecesses = [
    ...getAllRecessesForYearConfig(yearConfig),
    ...getAllRecessesForYearConfig(nextYearConfig),
  ];

  // 2. Extraer día y mes completo con Intl.DateTimeFormat (ej. '19 de octubre')
  // Si el lunes y el viernes pertenecen al mismo mes, omitir el primer mes ("Semana del 2 al 6 de noviembre")
  const formatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });
  const formatDay = (date: Date): string => {
    return formatter.format(date).replace(/\./g, '').trim();
  };

  const isSameMonth =
    monday.getMonth() === friday.getMonth() && monday.getFullYear() === friday.getFullYear();
  const lunesFormat = isSameMonth ? String(monday.getDate()) : formatDay(monday);
  const viernesFormat = formatDay(friday);

  const mondayTime = monday.getTime();

  // 3. Comprobar si ese lunes cae dentro de los recesos configurados
  let matchedRecess: AcademicRecess | undefined;
  for (const recess of combinedRecesses) {
    const rStart = new Date(`${recess.start}T00:00:00`).getTime();
    const rEnd = new Date(`${recess.end}T23:59:59`).getTime();
    if (mondayTime >= rStart && mondayTime <= rEnd) {
      matchedRecess = recess;
      break;
    }
  }

  // 4. Identificar el periodo activo del año
  let activePeriod = yearPeriods.find((p) => {
    const pStart = new Date(`${p.start}T00:00:00`).getTime();
    const pEnd = new Date(`${p.end}T23:59:59`).getTime();
    return mondayTime >= pStart && mondayTime <= pEnd;
  });

  if (!activePeriod) {
    const firstPeriodStart = new Date(`${yearPeriods[0].start}T00:00:00`).getTime();
    if (mondayTime < firstPeriodStart) {
      activePeriod = yearPeriods[0];
    } else {
      activePeriod = yearPeriods[yearPeriods.length - 1];
    }
  }

  // 5. Iterar desde el inicio del periodo activo, contando cuántos lunes hábiles han pasado
  const cur = new Date(`${activePeriod.start}T00:00:00`);
  let weekNumber = 0;
  while (cur.getTime() <= mondayTime) {
    const curTime = cur.getTime();
    const isRecess = combinedRecesses.some((r) => {
      const rStart = new Date(`${r.start}T00:00:00`).getTime();
      const rEnd = new Date(`${r.end}T23:59:59`).getTime();
      return curTime >= rStart && curTime <= rEnd;
    });

    if (!isRecess) {
      weekNumber++;
    }

    cur.setDate(cur.getDate() + 7);
  }

  const finalWeek = Math.max(1, Math.min(activePeriod.totalWeeks, weekNumber));

  return {
    year: targetYear,
    lunesFormat,
    viernesFormat,
    weekNumber: finalWeek,
    periodNumber: activePeriod.period,
    totalWeeksInPeriod: activePeriod.totalWeeks,
    recessName: matchedRecess?.name,
    recessType: matchedRecess?.type,
    isRecess: Boolean(matchedRecess),
  };
}

export const calculateCurrentAcademicWeek = getCurrentWeekText;
export const getChronologyHeaderText = getCurrentWeekText;
export const evaluateAcademicCalendar = getCurrentWeekText;

/**
 * Motor de Sufijos Ordinales:
 * Evalúa el número del periodo y devuelve la terminación gramatical correcta.
 */
export const getOrdinalSuffix = (periodNumber: number): string => {
  if (periodNumber === 1 || periodNumber === 3) return 'er';
  if (periodNumber === 2) return 'do';
  return 'º';
};

/**
 * Resuelve dinámicamente el nombre de la tercera modalidad de Bachillerato (Horario D)
 * de acuerdo con el periodo académico en curso ("Planes de apoyo XX periodo" o "Planes de apoyo").
 */
export function getSupportPlanModalityLabel(
  activeDate: Date | string = new Date(),
  overridePeriodText?: string
): string {
  if (overridePeriodText && overridePeriodText.toLowerCase().includes('anual')) {
    return 'Planes de apoyo';
  }

  const d =
    typeof activeDate === 'string' && activeDate.length === 10
      ? new Date(`${activeDate}T00:00:00`)
      : typeof activeDate === 'string'
      ? new Date(activeDate)
      : new Date(activeDate.getTime());

  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const yearConfig = getCalendarConfigForYear(validDate.getFullYear());
  const periods =
    yearConfig.periods && yearConfig.periods.length > 0 ? yearConfig.periods : academicPeriods2026;
  const lastPeriod = periods[periods.length - 1];
  const lastPeriodEnd = new Date(`${lastPeriod.end}T23:59:59`).getTime();

  if (validDate.getTime() > lastPeriodEnd) {
    return 'Planes de apoyo';
  }

  const weekData = getCurrentWeekText(validDate);
  if (weekData.periodNumber >= periods.length) {
    return 'Planes de apoyo';
  }

  const suffix = getOrdinalSuffix(weekData.periodNumber);
  return `Planes de apoyo ${weekData.periodNumber}${suffix} periodo`;
}

export function evaluateChronology(
  targetDate: Date | string = new Date(),
  _periods: AcademicPeriod[] = academicPeriods
): string {
  const data = getCurrentWeekText(targetDate);
  return `Semana del ${data.lunesFormat} al ${data.viernesFormat} y semana ${data.weekNumber} del ${data.periodNumber}${getOrdinalSuffix(data.periodNumber)} periodo`;
}

export type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';

export interface DynamicDayHeader {
  id: DayOfWeek;
  dayOfWeek: DayOfWeek;
  label: string;
  short: string;
  date: Date;
  dateString: string;
  formatted: string;
  isHoliday: boolean;
  holidayName?: string;
  institutionalEvent?: InstitutionalCalendarEvent;
  institutionalEvents?: InstitutionalCalendarEvent[];
}

/**
 * Obtiene todas las novedades / días de trabajo especiales que aplican a una fecha ISO (YYYY-MM-DD),
 * incluyendo tanto fechas puntuales como rangos de días (priorizando eventos de un solo día sobre rangos).
 */
export function getInstitutionalEventsForDate(date: Date | string): InstitutionalCalendarEvent[] {
  const d =
    typeof date === 'string' && date.length === 10
      ? new Date(`${date}T00:00:00`)
      : typeof date === 'string'
      ? new Date(date)
      : new Date(date.getTime());

  if (isNaN(d.getTime())) return [];

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const isoDate = `${y}-${m}-${day}`;

  const yearConfig = getCalendarConfigForYear(y);
  const prevYearConfig = getCalendarConfigForYear(y - 1);
  const allEvents = [
    ...(yearConfig.institutionalEvents || []),
    ...(prevYearConfig.institutionalEvents || []),
  ];

  const matched = allEvents.filter((ev) => {
    if (!ev || !ev.date) return false;
    const end = ev.endDate && ev.endDate >= ev.date ? ev.endDate : ev.date;
    return isoDate >= ev.date && isoDate <= end;
  });

  // Ordenar poniendo primero los eventos de fecha única (más específicos) antes que los rangos semanales
  return matched.sort((a, b) => {
    const aIsSingle = !a.endDate || a.endDate === a.date ? 0 : 1;
    const bIsSingle = !b.endDate || b.endDate === b.date ? 0 : 1;
    if (aIsSingle !== bIsSingle) return aIsSingle - bIsSingle;
    return a.date.localeCompare(b.date);
  });
}

/**
 * Valida si una fecha específica corresponde a un día festivo oficial, receso institucional o festivo manual
 * para cualquier año configurado en el Planificador de Año Escolar.
 */
export function isDateHoliday(
  date: Date | string,
  customHolidays?: Set<string> | string[]
): {
  isHoliday: boolean;
  name?: string;
  institutionalEvent?: InstitutionalCalendarEvent;
  institutionalEvents?: InstitutionalCalendarEvent[];
} {
  const d =
    typeof date === 'string' && date.length === 10
      ? new Date(`${date}T00:00:00`)
      : typeof date === 'string'
      ? new Date(date)
      : new Date(date.getTime());

  if (isNaN(d.getTime())) return { isHoliday: false, institutionalEvents: [] };

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const isoDate = `${y}-${m}-${day}`;

  const yearConfig = getCalendarConfigForYear(y);
  const nextYearConfig = getCalendarConfigForYear(y + 1);
  const matchedEvents = getInstitutionalEventsForDate(isoDate);
  const matchedEvent = matchedEvents[0];

  // 1. Custom holidays override (manuales)
  if (customHolidays) {
    const isCustom =
      customHolidays instanceof Set
        ? customHolidays.has(isoDate)
        : customHolidays.includes(isoDate);
    if (isCustom) {
      return {
        isHoliday: true,
        name: 'Festivo Institucional',
        institutionalEvent: matchedEvent,
        institutionalEvents: matchedEvents,
      };
    }
  }

  // 2. Evento institucional marcado como día sin clase ('holiday')
  const holidayEvent = matchedEvents.find((ev) => ev.modality === 'holiday');
  if (holidayEvent) {
    return {
      isHoliday: true,
      name: holidayEvent.title,
      institutionalEvent: matchedEvent,
      institutionalEvents: matchedEvents,
    };
  }

  // 3. Festivos oficiales del año correspondiente (Colombia + personalizados del año)
  const yearHolidays =
    yearConfig.holidays && yearConfig.holidays.length > 0
      ? yearConfig.holidays
      : computeColombianHolidaysForYear(y);
  const official = yearHolidays.find((h) => h.date === isoDate);
  if (official) {
    return {
      isHoliday: true,
      name: official.name,
      institutionalEvent: matchedEvent,
      institutionalEvents: matchedEvents,
    };
  }

  // 4. Si hay un día de trabajo especial programado (ej. Sustentación anual, Comisión, Entrega de notas, Graduación), no bloquearlo como festivo genérico
  if (matchedEvents.length > 0) {
    return {
      isHoliday: false,
      institutionalEvent: matchedEvent,
      institutionalEvents: matchedEvents,
    };
  }

  // 5. Recesos institucionales (Semana Santa, Vacaciones de mitad de año, Receso de octubre, Fin de año)
  const allRecesses = [
    ...getAllRecessesForYearConfig(yearConfig),
    ...getAllRecessesForYearConfig(nextYearConfig),
  ];
  for (const recess of allRecesses) {
    if (isoDate >= recess.start && isoDate <= recess.end) {
      return {
        isHoliday: true,
        name: recess.name,
        institutionalEvent: matchedEvent,
        institutionalEvents: matchedEvents,
      };
    }
  }

  return {
    isHoliday: false,
    institutionalEvent: matchedEvent,
    institutionalEvents: matchedEvents,
  };
}

/**
 * Calcula el lunes de la semana para una fecha dada (Fecha Ancla).
 */
export function getStartOfWeek(currentDate: Date | string = new Date()): Date {
  const d =
    typeof currentDate === 'string' && currentDate.length === 10
      ? new Date(`${currentDate}T00:00:00`)
      : typeof currentDate === 'string'
      ? new Date(currentDate)
      : new Date(currentDate.getTime());

  if (isNaN(d.getTime())) {
    const fallback = new Date();
    const day = fallback.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    fallback.setDate(fallback.getDate() + diff);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }

  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calcula la fecha ancla (Lunes 00:00:00) para el contenedor semanal seleccionado ('current' o 'next').
 * A partir del viernes a las 18:00 horas (y durante sábado y domingo), la semana anterior se da por finalizada:
 * - 'current' (Semana Actual) apunta al lunes entrante.
 * - 'next' (Próxima Semana) apunta al lunes subsiguiente (+7 días respecto a la Semana Actual).
 */
export function getAnchorDateForWeekSlot(
  mode: WeekSlotMode = getDefaultWeekSlotMode(),
  baseDate: Date | string = new Date()
): Date {
  const monday = getStartOfWeek(baseDate);
  if (typeof baseDate !== 'string' && isPastFridayCutoff(baseDate)) {
    monday.setDate(monday.getDate() + 7);
  }
  if (mode === 'next') {
    monday.setDate(monday.getDate() + 7);
  }
  return monday;
}

/**
 * Devuelve el identificador ISO (YYYY-MM-DD) del lunes de una fecha dada.
 */
export function getWeekMondayIso(date: Date | string = new Date()): string {
  const monday = getStartOfWeek(date);
  return formatIsoDate(monday);
}

/**
 * Motor de Generación Dinámica de Cabeceras (Date-Driven Columns):
 */
export function generateWeekHeaders(
  startDate: Date | string = new Date(),
  customHolidays?: Set<string> | string[]
): DynamicDayHeader[] {
  const baseMonday = getStartOfWeek(startDate);
  const dayIds: DayOfWeek[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  const dayShorts: string[] = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

  const formatter = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  const headers: DynamicDayHeader[] = [];

  for (let i = 0; i < 5; i++) {
    const currentDay = new Date(baseMonday);
    currentDay.setDate(baseMonday.getDate() + i);

    const rawFormatted = formatter.format(currentDay);
    const cleanFormatted = rawFormatted.replace(/,/g, '').replace(/\./g, '').trim();
    const capitalized = cleanFormatted.charAt(0).toUpperCase() + cleanFormatted.slice(1);

    const id = dayIds[i];
    const dayNum = currentDay.getDate().toString().padStart(2, '0');
    const shortLabel = `${dayShorts[i]} ${dayNum}`;
    const dateString = formatIsoDate(currentDay);

    const holidayInfo = isDateHoliday(currentDay, customHolidays);

    headers.push({
      id,
      dayOfWeek: id,
      label: capitalized,
      short: shortLabel,
      date: currentDay,
      dateString,
      formatted: capitalized,
      isHoliday: holidayInfo.isHoliday,
      holidayName: holidayInfo.name,
      institutionalEvent: holidayInfo.institutionalEvent,
      institutionalEvents: holidayInfo.institutionalEvents,
    });
  }

  return headers;
}

export interface PlannedYearWeekSummary {
  mondayIso: string;
  fridayIso: string;
  lunesFormat: string;
  viernesFormat: string;
  globalWeekNumber: number | null;
  periodNumber: number | null;
  weekInPeriod: number | null;
  totalWeeksInPeriod: number | null;
  isRecess: boolean;
  recessName?: string;
  recessType?: AcademicRecessType;
  holidays: HolidayEntry[];
  events: InstitutionalCalendarEvent[];
}

/**
 * Genera el mapa cronológico completo de semanas de un año escolar configurado (40 semanas lectivas + semanas de desarrollo/receso).
 */
export function generateAcademicYearWeeksTimeline(year: number): PlannedYearWeekSummary[] {
  const config = getCalendarConfigForYear(year);
  const periods = config.periods && config.periods.length > 0 ? config.periods : academicPeriods2026;
  const recesses = getAllRecessesForYearConfig(config);
  const holidays =
    config.holidays && config.holidays.length > 0
      ? config.holidays
      : computeColombianHolidaysForYear(year);
  const events = config.institutionalEvents || [];

  const firstPeriodMonday = getStartOfWeek(periods[0].start);
  const lastPeriodEnd = getStartOfWeek(periods[periods.length - 1].end);

  // Incluir desde la primera semana de Desarrollo Institucional de enero hasta el cierre lectivo
  let startMonday = new Date(firstPeriodMonday.getTime());
  for (const r of config.institutionalDevelopmentWeeks || []) {
    const rMon = getStartOfWeek(r.start);
    if (rMon.getFullYear() === year && rMon.getTime() < startMonday.getTime()) {
      startMonday = rMon;
    }
  }

  let endMonday = new Date(lastPeriodEnd.getTime());
  for (const r of config.institutionalDevelopmentWeeks || []) {
    const rMon = getStartOfWeek(r.end);
    if (rMon.getFullYear() === year && rMon.getTime() > endMonday.getTime()) {
      endMonday = rMon;
    }
  }

  const formatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
  const formatShort = (d: Date) => formatter.format(d).replace(/\./g, '').trim();

  const timeline: PlannedYearWeekSummary[] = [];
  const cur = new Date(startMonday.getTime());
  let globalLectivaCounter = 0;
  const periodWeekCounters: Record<number, number> = {};

  while (cur.getTime() <= endMonday.getTime()) {
    const monday = new Date(cur.getTime());
    const friday = addDays(monday, 4);
    const mondayIso = formatIsoDate(monday);
    const fridayIso = formatIsoDate(friday);
    const mondayTime = monday.getTime();

    const matchedRecess = recesses.find((r) => {
      const rStart = new Date(`${r.start}T00:00:00`).getTime();
      const rEnd = new Date(`${r.end}T23:59:59`).getTime();
      return mondayTime >= rStart && mondayTime <= rEnd;
    });

    const matchedPeriod = periods.find((p) => {
      const pStart = new Date(`${p.start}T00:00:00`).getTime();
      const pEnd = new Date(`${p.end}T23:59:59`).getTime();
      return mondayTime >= pStart && mondayTime <= pEnd;
    });

    let weekInPeriod: number | null = null;
    let globalWeekNumber: number | null = null;

    if (!matchedRecess && matchedPeriod) {
      globalLectivaCounter++;
      globalWeekNumber = globalLectivaCounter;
      periodWeekCounters[matchedPeriod.period] =
        (periodWeekCounters[matchedPeriod.period] || 0) + 1;
      weekInPeriod = periodWeekCounters[matchedPeriod.period];
    }

    const weekHolidays = holidays.filter((h) => h.date >= mondayIso && h.date <= fridayIso);
    const weekEvents = events.filter((ev) => {
      const end = ev.endDate && ev.endDate >= ev.date ? ev.endDate : ev.date;
      return end >= mondayIso && ev.date <= fridayIso;
    });

    const sameMonthShort =
      monday.getMonth() === friday.getMonth() && monday.getFullYear() === friday.getFullYear();

    timeline.push({
      mondayIso,
      fridayIso,
      lunesFormat: sameMonthShort ? String(monday.getDate()) : formatShort(monday),
      viernesFormat: formatShort(friday),
      globalWeekNumber,
      periodNumber: matchedPeriod ? matchedPeriod.period : null,
      weekInPeriod,
      totalWeeksInPeriod: matchedPeriod ? matchedPeriod.totalWeeks : null,
      isRecess: Boolean(matchedRecess),
      recessName: matchedRecess?.name,
      recessType: matchedRecess?.type,
      holidays: weekHolidays,
      events: weekEvents,
    });

    cur.setDate(cur.getDate() + 7);
  }

  return timeline;
}

export default evaluateChronology;
