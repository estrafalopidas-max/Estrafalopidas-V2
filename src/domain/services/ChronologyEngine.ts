export interface AcademicPeriod {
  period: number;
  start: string;
  end: string;
  totalWeeks: number;
}

export type AcademicRecessType = 'institutional_development' | 'vacation';

export interface AcademicRecess {
  start: string;
  end: string;
  name: string;
  type?: AcademicRecessType;
  weeks?: number;
}

export function getTodayDayOfWeek(date: Date = new Date()): DayOfWeek {
  const day = date.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb
  if (day === 1) return 'lunes';
  if (day === 2) return 'martes';
  if (day === 3) return 'miercoles';
  if (day === 4) return 'jueves';
  if (day === 5) return 'viernes';
  return 'lunes';
}

export const academicPeriods: AcademicPeriod[] = [
  { period: 1, start: '2026-01-26', end: '2026-05-01', totalWeeks: 13 },
  { period: 2, start: '2026-05-04', end: '2026-08-14', totalWeeks: 13 },
  { period: 3, start: '2026-08-17', end: '2026-11-29', totalWeeks: 14 }
];

/**
 * Artículo 3 Decreto SEM 2026: Seis (6) semanas de Desarrollo Institucional
 */
export const institutionalDevelopmentWeeks: AcademicRecess[] = [
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

/**
 * Artículo 4 Decreto SEM 2026: Siete (7) semanas de Vacaciones de Docentes y Directivos Docentes
 */
export const teacherVacations: AcademicRecess[] = [
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

export const academicRecesses: AcademicRecess[] = [
  ...teacherVacations,
  ...institutionalDevelopmentWeeks,
].sort((a, b) => a.start.localeCompare(b.start));

export interface CurrentWeekData {
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
 * Motor de Formateo y Cronología Académica:
 * 1. Identifica el lunes y el viernes de la semana que corresponde a activeDate.
 * 2. Usa Intl.DateTimeFormat para extraer el día y el mes abreviado (ej. '19 de oct').
 * 3. Identifica el periodo activo y calcula el número de la semana académica.
 * 4. Retorna un objeto con las variables separadas:
 *    { lunesFormat, viernesFormat, weekNumber, periodNumber, totalWeeksInPeriod }
 */
export function getCurrentWeekText(activeDate: Date | string = new Date()): CurrentWeekData {
  const d = typeof activeDate === 'string' && activeDate.length === 10
    ? new Date(`${activeDate}T00:00:00`)
    : typeof activeDate === 'string'
    ? new Date(activeDate)
    : new Date(activeDate.getTime());

  const validDate = isNaN(d.getTime()) ? new Date() : d;

  // 1. Identificar el lunes y el viernes de la semana que corresponde a activeDate
  const day = validDate.getDay(); // 0: domingo, 1: lunes, ..., 6: sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(validDate);
  monday.setDate(validDate.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  // 2. Extraer día y mes completo con Intl.DateTimeFormat (ej. '19 de octubre')
  const formatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });
  const formatDay = (date: Date): string => {
    return formatter.format(date).replace(/\./g, '').trim();
  };

  const lunesFormat = formatDay(monday);
  const viernesFormat = formatDay(friday);

  const mondayTime = monday.getTime();

  // 3. Comprobar si ese lunes cae dentro de academicRecesses
  let matchedRecess: AcademicRecess | undefined;
  for (const recess of academicRecesses) {
    const rStart = new Date(`${recess.start}T00:00:00`).getTime();
    const rEnd = new Date(`${recess.end}T23:59:59`).getTime();
    if (mondayTime >= rStart && mondayTime <= rEnd) {
      matchedRecess = recess;
      break;
    }
  }

  // 4. Identificar el periodo activo
  let activePeriod = academicPeriods.find((p) => {
    const pStart = new Date(`${p.start}T00:00:00`).getTime();
    const pEnd = new Date(`${p.end}T23:59:59`).getTime();
    return mondayTime >= pStart && mondayTime <= pEnd;
  });

  if (!activePeriod) {
    const firstPeriodStart = new Date(`${academicPeriods[0].start}T00:00:00`).getTime();
    if (mondayTime < firstPeriodStart) {
      activePeriod = academicPeriods[0];
    } else {
      activePeriod = academicPeriods[academicPeriods.length - 1];
    }
  }

  // 5. Iterar desde el inicio del period activo, contando cuántos lunes hábiles han pasado hasta llegar al lunes actual
  let cur = new Date(`${activePeriod.start}T00:00:00`);
  let weekNumber = 0;
  while (cur.getTime() <= mondayTime) {
    const curTime = cur.getTime();
    const isRecess = academicRecesses.some((r) => {
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
  return 'º'; // Fallback de seguridad
};

export function evaluateChronology(
  targetDate: Date | string = new Date(),
  periods: AcademicPeriod[] = academicPeriods
): string {
  const data = getCurrentWeekText(targetDate);
  return `Semana del ${data.lunesFormat} al ${data.viernesFormat} y semana ${data.weekNumber} del ${data.periodNumber}${getOrdinalSuffix(data.periodNumber)} periodo`;
}

export const officialColombianHolidays2026: { date: string; name: string }[] = [
  { date: '2026-01-01', name: 'Año Nuevo' },
  { date: '2026-01-12', name: 'Día de los Reyes Magos' },
  { date: '2026-03-23', name: 'Día de San José' },
  { date: '2026-04-02', name: 'Jueves Santo' },
  { date: '2026-04-03', name: 'Viernes Santo' },
  { date: '2026-05-01', name: 'Día del Trabajo' },
  { date: '2026-05-18', name: 'Ascensión del Señor' },
  { date: '2026-06-08', name: 'Corpus Christi' },
  { date: '2026-06-15', name: 'Sagrado Corazón de Jesús' },
  { date: '2026-06-29', name: 'San Pedro y San Pablo' },
  { date: '2026-07-20', name: 'Día de la Independencia' },
  { date: '2026-08-07', name: 'Batalla de Boyacá' },
  { date: '2026-08-17', name: 'La Asunción de la Virgen' },
  { date: '2026-10-12', name: 'Día de la Raza' },
  { date: '2026-11-02', name: 'Todos los Santos' },
  { date: '2026-11-16', name: 'Independencia de Cartagena' },
  { date: '2026-12-08', name: 'Inmaculada Concepción' },
  { date: '2026-12-25', name: 'Navidad' },
];

export type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';

export interface DynamicDayHeader {
  id: DayOfWeek;
  dayOfWeek: DayOfWeek;
  label: string; // ej. 'Lunes 19 de oct'
  short: string; // ej. 'Lun 19'
  date: Date;
  dateString: string; // ej. '2026-10-19'
  formatted: string; // ej. 'Lunes 19 de oct'
  isHoliday: boolean;
  holidayName?: string;
}

/**
 * Valida si una fecha específica corresponde a un día festivo oficial, receso institucional o festivo manual.
 */
export function isDateHoliday(
  date: Date | string,
  customHolidays?: Set<string> | string[]
): { isHoliday: boolean; name?: string } {
  const d =
    typeof date === 'string' && date.length === 10
      ? new Date(`${date}T00:00:00`)
      : typeof date === 'string'
      ? new Date(date)
      : new Date(date.getTime());

  if (isNaN(d.getTime())) return { isHoliday: false };

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const isoDate = `${y}-${m}-${day}`;

  // 1. Custom holidays override (manuales)
  if (customHolidays) {
    const isCustom =
      customHolidays instanceof Set
        ? customHolidays.has(isoDate)
        : customHolidays.includes(isoDate);
    if (isCustom) {
      return { isHoliday: true, name: 'Festivo Institucional' };
    }
  }

  // 2. Festivos oficiales de Colombia 2026
  const official = officialColombianHolidays2026.find((h) => h.date === isoDate);
  if (official) {
    return { isHoliday: true, name: official.name };
  }

  // 3. Recesos institucionales (ej. Semana Santa, Vacaciones de mitad de año, Receso de octubre)
  for (const recess of academicRecesses) {
    if (isoDate >= recess.start && isoDate <= recess.end) {
      return { isHoliday: true, name: recess.name };
    }
  }

  return { isHoliday: false };
}

/**
 * Calcula el lunes de la semana para una fecha dada (Fecha Ancla).
 * @param currentDate Fecha base (instancia de Date o string ISO)
 * @returns Instancia de Date configurada al lunes a las 00:00:00.000 local
 */
export function getStartOfWeek(currentDate: Date | string = new Date()): Date {
  const d = typeof currentDate === 'string' && currentDate.length === 10
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

  const day = d.getDay(); // 0: Domingo, 1: Lunes, ..., 6: Sábado
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Motor de Generación Dinámica de Cabeceras (Date-Driven Columns):
 * Itera 5 veces (de lunes a viernes), sumando un día por cada ciclo a la fecha base.
 * Extrae la cadena de texto usando la API de internacionalización del navegador:
 * new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: '2-digit', month: 'short' }).format(date)
 * Capitaliza la primera letra (ej. 'Lunes 19 de oct').
 * Evalúa automáticamente isHoliday contra el calendario de festivos y recesos.
 *
 * @param startDate Fecha ancla (lunes de la semana o fecha en curso)
 * @param customHolidays Conjunto opcional de fechas adicionales marcadas como festivo
 * @returns Array dinámico de cabeceras de lunes a viernes
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

    // Formateo Nativo con Intl
    const rawFormatted = formatter.format(currentDay);
    // Limpieza de caracteres (remover comas como en 'lunes, 19 de octubre')
    const cleanFormatted = rawFormatted.replace(/,/g, '').replace(/\./g, '').trim();
    // Inyección y Capitalización de la primera letra
    const capitalized = cleanFormatted.charAt(0).toUpperCase() + cleanFormatted.slice(1);

    const id = dayIds[i];
    const dayNum = currentDay.getDate().toString().padStart(2, '0');
    const shortLabel = `${dayShorts[i]} ${dayNum}`;
    const y = currentDay.getFullYear();
    const m = String(currentDay.getMonth() + 1).padStart(2, '0');
    const dStr = String(currentDay.getDate()).padStart(2, '0');
    const dateString = `${y}-${m}-${dStr}`;

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
    });
  }

  return headers;
}

export default evaluateChronology;
