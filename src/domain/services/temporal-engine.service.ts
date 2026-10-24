/**
 * Motor Temporal: Utilidades de Fecha Dinámica y Calendario Institucional
 * 
 * Calcula el lunes y viernes de la semana actual (o fecha seleccionada)
 * y formatea estrictamente la salida como:
 * "Semana del DD de [Mes] al DD de [Mes] de AAAA"
 */

import { getOrdinalSuffix, getCurrentWeekText } from './ChronologyEngine';

const SPANISH_MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * Calcula y formatea el rango semanal escolar (Lunes a Viernes).
 * Si prefixSemana = false (predeterminado): "del DD al DD de [Mes] de AAAA" (ej. "del 19 al 23 de octubre de 2026")
 * Si prefixSemana = true: "Semana del DD al DD de [Mes] de AAAA"
 */
export function formatWeekDateRange(targetDate: Date | string = new Date(), prefixSemana: boolean = false): string {
  const d = new Date(targetDate);
  if (isNaN(d.getTime())) {
    return 'del 19 al 23 de octubre de 2026';
  }

  const dayOfWeek = d.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const startDay = monday.getDate().toString().padStart(2, '0');
  const startMonth = SPANISH_MONTH_NAMES[monday.getMonth()].toLowerCase();
  const endDay = friday.getDate().toString().padStart(2, '0');
  const endMonth = SPANISH_MONTH_NAMES[friday.getMonth()].toLowerCase();
  const year = friday.getFullYear();

  const range = startMonth === endMonth
    ? `del ${startDay} al ${endDay} de ${endMonth} de ${year}`
    : `del ${startDay} de ${startMonth} al ${endDay} de ${endMonth} de ${year}`;

  return prefixSemana ? `Semana ${range}` : range;
}

/**
 * Calcula y formatea el rango lunes - viernes de la semana para una fecha dada.
 * Formato estricto: "Semana del DD de [Mes] al DD de [Mes] de AAAA"
 * Ejemplo: "Semana del 12 de Octubre al 16 de Octubre de 2026"
 */
export function getWeekDateRangeString(targetDate: Date | string = new Date()): string {
  return formatWeekDateRange(targetDate, true);
}

export interface AcademicPeriodBlock {
  id: string;
  name: string;
  label: string;
  weeks: number;
  startDate: string;
  endDate: string;
}

/**
 * Configuración estricta de 3 periodos académicos para 2026:
 * Periodo 1: 13 semanas (inicia 2026-01-26, finaliza 2026-05-01)
 * Periodo 2: 13 semanas (inicia 2026-05-04, finaliza 2026-08-28)
 * Periodo 3: 14 semanas (inicia 2026-08-31, finaliza 2026-12-11)
 * Total: 40 semanas lectivas anuales.
 */
export const ACADEMIC_PERIODS_3: AcademicPeriodBlock[] = [
  {
    id: 'period1',
    name: `1${getOrdinalSuffix(1)}`,
    label: `1${getOrdinalSuffix(1)} Periodo`,
    weeks: 13,
    startDate: '2026-01-26',
    endDate: '2026-05-01',
  },
  {
    id: 'period2',
    name: `2${getOrdinalSuffix(2)}`,
    label: `2${getOrdinalSuffix(2)} Periodo`,
    weeks: 13,
    startDate: '2026-05-04',
    endDate: '2026-08-14',
  },
  {
    id: 'period3',
    name: `3${getOrdinalSuffix(3)}`,
    label: `3${getOrdinalSuffix(3)} Periodo`,
    weeks: 14,
    startDate: '2026-08-17',
    endDate: '2026-11-29',
  },
];

export interface AcademicPeriodInfo {
  periodId: string;
  periodName: string;
  periodLabel: string;
  weekInPeriod: number;
  globalWeek: number;
  displayText: string;
}

/**
 * Algoritmo de Conteo de Periodos Académicos:
 * Itera estrictamente sobre los 3 bloques de periodos para detectar la
 * "Semana X del Periodo Y" (ej. "Semana 9 del 3er periodo") a partir de una fecha o número de semana.
 */
export function getAcademicPeriodAndWeek(
  targetDate: Date | string = new Date(),
  manualWeek?: number
): AcademicPeriodInfo {
  if (typeof manualWeek === 'number' && manualWeek > 0) {
    let accumulated = 0;
    for (let i = 0; i < ACADEMIC_PERIODS_3.length; i++) {
      const p = ACADEMIC_PERIODS_3[i];
      if (manualWeek <= accumulated + p.weeks || i === ACADEMIC_PERIODS_3.length - 1) {
        const weekInPeriod = Math.max(1, manualWeek - accumulated);
        return {
          periodId: p.id,
          periodName: p.name,
          periodLabel: p.label,
          weekInPeriod,
          globalWeek: manualWeek,
          displayText: `Semana ${weekInPeriod} del ${p.name} periodo`,
        };
      }
      accumulated += p.weeks;
    }
  }

  const weekData = getCurrentWeekText(targetDate);
  const periodIdx = Math.max(0, Math.min(ACADEMIC_PERIODS_3.length - 1, weekData.periodNumber - 1));
  const p = ACADEMIC_PERIODS_3[periodIdx];
  const accumulatedWeeks = ACADEMIC_PERIODS_3.slice(0, periodIdx).reduce((acc, item) => acc + item.weeks, 0);
  const globalWeek = Math.min(40, accumulatedWeeks + weekData.weekNumber);

  return {
    periodId: p.id,
    periodName: p.name,
    periodLabel: p.label,
    weekInPeriod: weekData.weekNumber,
    globalWeek,
    displayText: `Semana ${weekData.weekNumber} del ${p.name} periodo`,
  };
}

export {
  getStartOfWeek,
  generateWeekHeaders,
  getOrdinalSuffix,
  type DynamicDayHeader,
} from './ChronologyEngine';

