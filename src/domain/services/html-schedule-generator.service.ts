import { TimeBlockEntity, DayOfWeek, classifyBlockType } from '../entities/time-block.entity';
import { calculateLuminanceContrast } from './teacher-color.service';
import { toTitleCase, getShortTeacherName, getFullTeacherName } from './teacher-visual-identity.service';
import {
  getTeacherExcelIdentity,
  resolveOfficialTeacherEntry,
  sortTeachersWithLowPriorityLast,
} from './teacher-normalization.service';
import { DEFAULT_LOGO_BASE64 } from './default-logo-base64';
import {
  generateWeekHeaders,
  WeekSlotMode,
  getDefaultWeekSlotMode,
  getAnchorDateForWeekSlot,
  getWeekMondayIso,
} from './ChronologyEngine';
import {
  resolveCanonicalGradeName,
  resolveCanonicalShift,
  normalizeTimeBlocksGrades,
  resolveEffectiveClassroomForBlock,
} from './grade-normalization.service';

export { DEFAULT_LOGO_BASE64 };

export interface PublicDayConfigs {
  meetingDays: Record<string, boolean>;
  eventDays: Record<string, boolean>;
  holidayDays: Record<string, boolean>;
  customHolidays: string[];
  scheduleTypes?: Record<string, 'A' | 'B' | 'C' | 'D'>;
  blankMatrixMode?: boolean;
  updatedAtMs?: number;
  activeWeekSlot?: WeekSlotMode;
  anchorMondayIso?: string;
}

export function resolveEffectiveDayConfigs(custom?: Partial<PublicDayConfigs>): PublicDayConfigs {
  let storedMeeting: Record<string, boolean> = {};
  let storedEvent: Record<string, boolean> = {};
  let storedCustomHolidays: string[] = [];
  let storedScheduleTypes: Record<string, 'A' | 'B' | 'C' | 'D'> = {};
  let storedWeekSlot: WeekSlotMode | undefined;
  let storedMondayIso: string | undefined;

  try {
    const m = localStorage.getItem('ievf_meeting_days');
    if (m) storedMeeting = JSON.parse(m);
  } catch {
    // ignore
  }

  try {
    const e = localStorage.getItem('ievf_event_days');
    if (e) storedEvent = JSON.parse(e);
  } catch {
    // ignore
  }

  try {
    const h = localStorage.getItem('ievf_custom_holidays');
    if (h) storedCustomHolidays = JSON.parse(h);
  } catch {
    // ignore
  }

  try {
    const s = localStorage.getItem('ievf_schedule_types');
    if (s) storedScheduleTypes = JSON.parse(s);
  } catch {
    // ignore
  }

  try {
    const ws = localStorage.getItem('ievf_active_week_slot');
    if (ws === 'current' || ws === 'next') storedWeekSlot = ws;
    const mi = localStorage.getItem('ievf_active_monday_iso');
    if (mi && /^\d{4}-\d{2}-\d{2}$/.test(mi)) storedMondayIso = mi;
  } catch {
    // ignore
  }

  const meetingDays = custom?.meetingDays !== undefined ? custom.meetingDays : storedMeeting;
  const eventDays = custom?.eventDays !== undefined ? custom.eventDays : storedEvent;
  const customHolidays = custom?.customHolidays !== undefined ? custom.customHolidays : storedCustomHolidays;
  const scheduleTypes = custom?.scheduleTypes !== undefined ? custom.scheduleTypes : storedScheduleTypes;
  const activeWeekSlot: WeekSlotMode =
    custom?.activeWeekSlot || storedWeekSlot || getDefaultWeekSlotMode(new Date());
  const effectiveAnchorDate =
    custom?.anchorMondayIso ||
    storedMondayIso ||
    getAnchorDateForWeekSlot(activeWeekSlot, new Date());
  const anchorMondayIso = getWeekMondayIso(effectiveAnchorDate);

  const weekHeaders = generateWeekHeaders(effectiveAnchorDate, customHolidays);
  const holidayDays: Record<string, boolean> = { ...(custom?.holidayDays || {}) };
  weekHeaders.forEach((d) => {
    if (d.isHoliday) {
      holidayDays[d.id] = true;
    } else if (custom?.holidayDays?.[d.id] === undefined) {
      holidayDays[d.id] = false;
    }
  });

  const isLocalBlank = (() => {
    try {
      return localStorage.getItem('ievf_blank_matrix_mode') === '1';
    } catch {
      return false;
    }
  })();

  return {
    meetingDays,
    eventDays,
    holidayDays,
    customHolidays,
    scheduleTypes,
    blankMatrixMode: custom?.blankMatrixMode !== undefined ? custom.blankMatrixMode : isLocalBlank,
    updatedAtMs: custom?.updatedAtMs,
    activeWeekSlot,
    anchorMondayIso,
  };
}

export interface HtmlScheduleGenerationOptions {
  timeBlocks: TimeBlockEntity[];
  teachers: Array<{
    id: string;
    displayName?: string;
    color?: string;
    color_hex?: string;
    [key: string]: any;
  }>;
  academicPeriod?: string;
  academicWeek?: number;
  lastUpdated?: string;
  institutionName?: string;
  logoDataUrl?: string;
  dayConfigs?: Partial<PublicDayConfigs>;
}

export interface PublicScheduleSnapshot {
  metadata: {
    institutionName: string;
    academicPeriod: string;
    academicWeek: number;
    lastUpdated: string;
    totalBlocks: number;
    totalTeachers: number;
    blankMatrixMode?: boolean;
    updatedAtMs?: number;
  };
  timeBlocks: TimeBlockEntity[];
  teachers: Array<{
    id: string;
    displayName: string;
    color: string;
  }>;
  dayConfigs?: PublicDayConfigs;
}

/**
 * Algoritmo oficial de Iniciales de Coordinación / Admin (Primera letra de nombre y apellido)
 */
export function getFirstAndLastNameInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '--';

  const shortName = getShortTeacherName(name);
  if (!shortName || shortName === 'Sin Asignar') return '--';

  const words = shortName.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '--';

  if (words.length === 1) {
    const single = words[0];
    return single.length >= 2
      ? (single[0] + single[1]).toUpperCase()
      : single[0].toUpperCase();
  }

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Genera el documento HTML autónomo con las casillas IDÉNTICAS al panel administrativo:
 * - Proporción 60/40 estricta.
 * - Bloque superior (60%): fondo gris claro (#f9fafb), materia centrada en negrita y aula en fuente monospace.
 * - Bloque inferior (40%): color oficial del docente, avatar izquierdo con fondo translúcido e iniciales, y nombre corto (Nombre Apellido) en la casilla.
 * - Soporte para Novedades (fondo ámbar con badge) y Sin asignación académica (borde punteado).
 */
export function generateStandaloneScheduleHtml(options: HtmlScheduleGenerationOptions): string {
  const {
    timeBlocks,
    teachers,
    academicPeriod = '3er Periodo',
    academicWeek = 9,
    lastUpdated = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }),
    dayConfigs,
  } = options;

  const effectiveLogo = DEFAULT_LOGO_BASE64;
  const rawPeriod = !academicPeriod || academicPeriod === '3° Periodo' ? '3er Periodo' : academicPeriod;
  const displayPeriod =
    rawPeriod.toLowerCase().includes('académico') || rawPeriod.toLowerCase().includes('academico')
      ? rawPeriod
      : `${rawPeriod} académico`;
  const displayWeek = !academicWeek || academicWeek === 8 ? 9 : academicWeek;
  const effectiveDayConfigs = resolveEffectiveDayConfigs(dayConfigs);
  const dayConfigsSerialized = JSON.stringify(effectiveDayConfigs).replace(/</g, '\\u003c');
  const weekHeadersList = generateWeekHeaders(
    effectiveDayConfigs.anchorMondayIso || new Date(),
    effectiveDayConfigs.customHolidays
  );
  const weekHeadersMap: Record<string, string> = {};
  weekHeadersList.forEach((h) => {
    weekHeadersMap[h.id] = h.label;
  });
  const weekHeadersSerialized = JSON.stringify(weekHeadersMap).replace(/</g, '\\u003c');

  // Helper to resolve shift from block or grade name
  const resolveBlockShift = (b: TimeBlockEntity): 'morning' | 'afternoon' | 'transicion-1' => {
    return resolveCanonicalShift(b);
  };

  // Build teacher map for quick lookup with locked canonical colors
  const teacherMap = new Map<string, { name: string; color: string }>();
  teachers.forEach((t) => {
    const official = resolveOfficialTeacherEntry(t.id, t.displayName);
    const identity = getTeacherExcelIdentity(t.id, t.displayName);
    const color = identity.color_hex || t.color_hex || t.color || '#007DC5';
    const name = getFullTeacherName(t.id, t.displayName || 'Docente');
    teacherMap.set(t.id, { name, color });
    if (official) {
      if (official.id) {
        teacherMap.set(official.id, { name, color });
      }
      teacherMap.set(official.canonicalName.toLowerCase().trim(), { name, color });
      teacherMap.set(official.shortName.toLowerCase().trim(), { name, color });
    }
    if (t.displayName) {
      teacherMap.set(t.displayName.toLowerCase().trim(), { name, color });
    }
    if (t.shortName) {
      teacherMap.set(t.shortName.toLowerCase().trim(), { name, color });
    }
  });

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

  // Prepare sanitized JSON payload for client-side filtering
  const normalizedTimeBlocks = normalizeTimeBlocksGrades(timeBlocks);
  const scheduleData = normalizedTimeBlocks.filter(isAssignedBlock).map((b) => {
    const fallbackIdentity = getTeacherExcelIdentity(b.teacherId, b.teacherName);
    const teacherInfo =
      teacherMap.get(b.teacherId) ||
      teacherMap.get(b.teacherName?.toLowerCase().trim() || '') || {
        name: b.teacherName || 'Sin asignar',
        color: fallbackIdentity.color_hex,
      };

    const teacherShortName = getShortTeacherName(b.teacherId, b.teacherName || teacherInfo.name || 'Sin Asignar');
    const teacherFullName = getFullTeacherName(b.teacherId, teacherInfo.name || b.teacherName || 'Sin Asignar');
    const colorHex = fallbackIdentity.color_hex || teacherInfo.color || '#034EA2';
    const initials = getFirstAndLastNameInitials(teacherShortName);
    const contrast = calculateLuminanceContrast(colorHex) === 'text-white' ? '#ffffff' : '#111827';
    
    const isNovelty =
      b.block_type === 'novelty' ||
      Boolean(b.motivo_novedad) ||
      Boolean(b.notes && b.notes.toLowerCase().includes('novedad')) ||
      Boolean(b.subject && b.subject.toUpperCase().startsWith('NOVEDAD'));

    const effectiveType = isNovelty
      ? 'novelty'
      : (b.block_type && b.block_type !== 'class')
      ? b.block_type
      : classifyBlockType(b.subject);

    const rawNoveltyReason =
      b.motivo_novedad ||
      (b.notes
        ? b.notes
            .replace(/^novedad:\s*/i, '')
            .replace(/^evento institucional programado:\s*/i, '')
            .trim()
        : '') ||
      (b.teacherId === 'evento-institucional' ||
      (b.subject &&
        /^(NOVEDAD|ACTO\s|ACTIVIDAD\s|REUNI[OÓ]N\s|JORNADA\s|DIRECCI[OÓ]N\s)/i.test(
          b.subject.trim()
        ))
        ? b.subject
        : '');

    const noveltyReason = isNovelty
      ? (rawNoveltyReason || 'NOVEDAD DOCENTE').replace(/🇨🇴/g, '').trim().toUpperCase()
      : null;

    return {
      id: b.id,
      day: b.dayOfWeek,
      period: b.period,
      shift: resolveBlockShift(b),
      grade: resolveCanonicalGradeName(b),
      subject: b.subject,
      teacher: teacherShortName,
      teacherFullName,
      teacherColor: colorHex,
      teacherInitials: initials,
      teacherTextColor: contrast,
      classroom: resolveEffectiveClassroomForBlock(b),
      type: effectiveType,
      isNovelty,
      noveltyReason: noveltyReason || null,
      motivo_novedad: b.motivo_novedad || noveltyReason || null,
      status: b.status || 'regular',
      replacement: b.replacementTeacherName
        ? getShortTeacherName(b.replacementTeacherId, b.replacementTeacherName)
        : null,
      notes: b.notes || null,
      startTime: b.startTime,
      endTime: b.endTime,
    };
  });

  const activeTeachers = sortTeachersWithLowPriorityLast(
    teachers.filter(
      (t) =>
        t.id !== 't-adriana-mier' &&
        !String(t.displayName || '').toLowerCase().includes('adriana mier') &&
        !String(t.displayName || '').toLowerCase().includes('adriana luc')
    )
  );

  const jsonSerialized = JSON.stringify(scheduleData).replace(/</g, '\\u003c');
  const teachersSerialized = JSON.stringify(
    activeTeachers.map((t) => ({
      id: t.id,
      name: getShortTeacherName(t.id, t.displayName || ''),
      fullName: getFullTeacherName(t.id, t.displayName || ''),
      color: t.color_hex || t.color || '#007DC5',
    }))
  ).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sistema de Agendamiento Escolar Horarios, actividades y jornadas académicas</title>
  <style>
    :root {
      --primary: #0c4da2;
      --primary-light: #007DC5;
      --primary-dark: #022b5c;
      --accent: #10b981;
      --magenta: #ED145B;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --radius: 12px;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding-bottom: 50px;
    }
    .header-banner {
      background-color: #0c4da2;
      color: #ffffff;
      padding: 20px 28px;
      box-shadow: 0 8px 24px rgba(12, 77, 162, 0.22);
      border-bottom: 4px solid #fbbf24;
    }
    .header-container {
      max-width: 100%;
      margin: 0 auto;
      padding: 0 12px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .header-brand-wrap {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 24px;
      min-width: 0;
    }
    .logo-box {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .header-logo {
      height: 66px;
      width: auto;
      object-fit: contain;
      display: block;
    }
    .header-divider {
      width: 1px;
      height: 48px;
      background-color: rgba(255, 255, 255, 0.25);
      flex-shrink: 0;
    }
    .brand-title h1 {
      font-size: 1.55rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.25;
      color: #ffffff;
    }
    .brand-title h1 span {
      display: block;
      color: #bae6fd;
      font-weight: 700;
      font-size: 1.1rem;
      margin-top: 2px;
    }
    .header-meta-box {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 14px;
    }
    .meta-card {
      background: rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.22);
      padding: 10px 18px;
      border-radius: 14px;
      text-align: right;
    }
    .meta-card-label {
      font-size: 0.65rem;
      color: #bae6fd;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .meta-card-value {
      font-size: 1.05rem;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.25;
    }
    .meta-card-sub {
      font-size: 0.75rem;
      color: #e0f2fe;
      margin-top: 2px;
      font-weight: 500;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn-header-pdf {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 10px 16px;
      border-radius: 12px;
      background-color: #10b981;
      color: #ffffff;
      font-size: 0.78rem;
      font-weight: 700;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-header-pdf:hover {
      background-color: #059669;
    }
    .btn-header-print {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 10px 16px;
      border-radius: 12px;
      background-color: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: #ffffff;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-header-print:hover {
      background-color: rgba(255, 255, 255, 0.25);
    }
    .container {
      max-width: 100%;
      margin: 16px auto 0;
      padding: 0 12px;
    }
    .controls-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 18px;
      box-shadow: var(--shadow);
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .controls-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
    .filter-group {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .shifts-nav {
      display: inline-flex;
      gap: 6px;
      background: #f1f5f9;
      padding: 4px;
      border-radius: 10px;
      border: 1px solid var(--border);
      overflow-x: auto;
    }
    .shift-tab {
      padding: 7px 14px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .shift-tab:hover {
      color: #0f172a;
      background: rgba(255, 255, 255, 0.6);
    }
    .shift-tab.active {
      background: #0f172a;
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    }
    .form-control {
      height: 32px;
      padding: 0 12px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      font-size: 0.78rem;
      font-weight: 700;
      background-color: #ffffff;
      color: #1e293b;
      outline: none;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      transition: all 0.15s ease;
    }
    .form-control:hover {
      background-color: #f8fafc;
    }
    .form-control:focus {
      border-color: #0c4da2;
      background-color: #ffffff;
      box-shadow: 0 0 0 2px rgba(12, 77, 162, 0.15);
    }
    .search-input-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .search-clear-btn {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 20px;
      border-radius: 9999px;
      border: none;
      background: transparent;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 800;
      line-height: 1;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      transition: all 0.15s ease;
    }
    .search-clear-btn:hover {
      background: #e2e8f0;
      color: #334155;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn-outline {
      background: #ffffff;
      border: 1px solid var(--border);
      color: var(--text);
    }
    .btn-outline:hover {
      background: #f1f5f9;
    }
    .days-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      background: #eff6ff;
      padding: 6px;
      border-radius: 16px;
      border: 1px solid #dbeafe;
      overflow-x: auto;
    }
    .day-tab {
      padding: 10px 20px;
      border-radius: 12px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #0f172a;
      font-size: 0.9rem;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }
    .day-tab:hover {
      background: #eff6ff;
      border-color: #007DC5;
      color: #022047;
    }
    .day-tab.is-today-tab {
      background: #eff6ff;
      color: #022047;
      border: 2px solid #007DC5;
    }
    .day-tab.active {
      background: #034EA2;
      color: #ffffff;
      border-color: #034EA2;
      box-shadow: 0 4px 10px rgba(3, 78, 162, 0.25);
    }
    .badge-today {
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 0.65rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #034EA2;
      color: #ffffff;
      line-height: 1;
    }
    .day-tab.active .badge-today {
      background: #007DC5;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.35);
    }
    .period-inline-box {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 8px 16px;
      text-align: right;
      line-height: 1.3;
    }
    .period-inline-title {
      font-size: 0.9rem;
      font-weight: 800;
      color: #0c4da2;
    }
    .period-inline-sub {
      font-size: 0.78rem;
      font-weight: 700;
      color: #475569;
    }
    .schedule-grid-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow-x: hidden;
      width: 100%;
    }
    table.schedule-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.78rem;
    }
    table.schedule-table th {
      background: #f8fafc;
      color: #334155;
      padding: 8px 4px;
      font-weight: 800;
      font-size: 0.78rem;
      border-bottom: 2px solid var(--border);
      border-right: 1px solid var(--border);
      text-align: center;
      position: sticky;
      top: 0;
      z-index: 2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    table.schedule-table th:first-child,
    table.schedule-table th.time-col-th {
      text-align: center;
      padding: 8px 8px;
      font-size: 0.80rem;
      font-weight: 800;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      width: 112px;
    }
    table.schedule-table td {
      padding: 3px;
      border-bottom: 1px solid var(--border);
      border-right: 1px solid var(--border);
      vertical-align: top;
      height: 92px;
      overflow: hidden;
    }
    table.schedule-table td:first-child,
    table.schedule-table td.time-col-td {
      padding: 8px 6px;
      width: 112px;
      vertical-align: middle;
      text-align: center;
      background: #f8fafc;
    }
    .time-slot-label {
      font-weight: 800;
      color: var(--primary);
      display: block;
      font-size: 0.96rem;
      line-height: 1.2;
      white-space: nowrap;
    }
    .time-slot-hours {
      font-size: 0.84rem;
      color: #1e293b;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 800;
      display: block;
      margin-top: 4px;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }

    /* ==========================================================================
       CASILLAS EXACTAS DEL ADMIN (58% Datos Clase + 42% Firma Docente)
       ========================================================================== */
    .admin-card {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 84px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #ffffff;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
      position: relative;
      user-select: none;
      transition: transform 0.1s ease, box-shadow 0.1s ease;
    }
    .admin-card:hover {
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      transform: translateY(-1px);
    }
    .admin-card.is-absent {
      border: 2px solid #f87171;
      box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.2);
    }
    .admin-card.is-covered {
      border: 2px solid #34d399;
      box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.2);
    }

    /* 58% BLOQUE SUPERIOR (Datos de Clase) */
    .admin-card-top {
      background-color: #f9fafb;
      height: 58%;
      min-height: 48px;
      padding: 3px 2px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      position: relative;
      width: 100%;
      overflow: hidden;
    }
    .admin-card-subject {
      font-size: 10.5px;
      font-weight: 700;
      line-height: 1.12;
      color: #111827;
      word-break: break-word;
      padding: 0 2px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .admin-card-classroom {
      font-size: 9.5px;
      font-weight: 500;
      color: #6b7280;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      margin-top: 2px;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .admin-badge-absent {
      margin-top: 2px;
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      color: var(--magenta);
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      padding: 1px 4px;
      border-radius: 4px;
      line-height: 1.2;
    }
    .admin-badge-covered {
      margin-top: 2px;
      font-size: 8px;
      font-weight: 800;
      color: #065f46;
      background-color: #ecfdf5;
      border: 1px solid #a7f3d0;
      padding: 1px 4px;
      border-radius: 4px;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 95%;
    }

    /* 42% BLOQUE INFERIOR (Firma del Docente) */
    .admin-card-bottom {
      width: 100%;
      height: 42%;
      min-height: 34px;
      display: flex;
      align-items: center;
      flex-shrink: 0;
      overflow: hidden;
    }
    .admin-card-initials {
      width: 20px;
      height: 100%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(0, 0, 0, 0.2);
      font-weight: 800;
      font-size: 9px;
      color: #ffffff;
      user-select: none;
      letter-spacing: -0.05em;
    }
    .admin-card-teacher-name {
      flex: 1;
      padding: 0 3px;
      font-size: 10px;
      line-height: 1.12;
      text-align: center;
      font-weight: 700;
      word-break: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    /* Casilla Novedad Institucional (Bloque Único 2/3 Superiores) */
    .admin-card-novelty {
      height: 100%;
      min-height: 84px;
      padding: 0;
      border-radius: 8px;
      border: 1.5px solid #f59e0b;
      background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 1px 2px rgba(245, 158, 11, 0.08);
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: stretch;
      text-align: center;
      overflow: hidden;
    }
    .novelty-upper-zone {
      width: 100%;
      min-height: 67%;
      height: auto;
      padding: 6px 5px 4px 5px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
    }
    .novelty-icon-row {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 21px;
      line-height: 1;
      flex-shrink: 0;
    }
    .novelty-reason {
      width: 100%;
      font-size: 9.5px;
      font-weight: 900;
      color: #451a03;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      line-height: 1.15;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      flex-shrink: 0;
    }
    .novelty-sub-label {
      font-size: 8px;
      font-weight: 600;
      color: #92400e;
      line-height: 1;
      letter-spacing: -0.01em;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .colombia-flag-svg {
      display: block;
      width: 15px;
      height: 10px;
      margin-top: 2px;
      border-radius: 2px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
      border: 1px solid rgba(69, 26, 3, 0.2);
      flex-shrink: 0;
    }
    .novelty-category-svg {
      display: block;
      width: 13px;
      height: 13px;
      margin-top: 1px;
      color: #92400e;
      flex-shrink: 0;
    }

    /* Casilla Vacía / Sin asignación académica */
    .admin-card-empty {
      height: 100%;
      min-height: 84px;
      padding: 4px;
      background-color: #f9fafb;
      border: 1px dashed #d1d5db;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #6b7280;
      font-size: 10px;
      line-height: 1.2;
    }
    .admin-card-exit {
      height: 100%;
      min-height: 84px;
      padding: 4px;
      background-color: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #94a3b8;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .admin-card-holiday {
      height: 100%;
      min-height: 84px;
      padding: 6px;
      background-color: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 2px;
    }
    .holiday-title {
      font-size: 10px;
      font-weight: 800;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .holiday-sub {
      font-size: 9px;
      font-weight: 600;
      color: #9ca3af;
      line-height: 1.15;
    }
    .meeting-row-cell {
      background-color: #fef3c7;
      border-top: 2px solid #f59e0b;
      border-bottom: 2px solid #f59e0b;
      padding: 16px 12px;
      text-align: center;
    }
    .meeting-row-title {
      font-size: 0.92rem;
      font-weight: 900;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .meeting-row-sub {
      font-size: 0.75rem;
      font-weight: 600;
      color: #78350f;
      margin-top: 3px;
    }
    .holiday-banner-row {
      background-color: #fef2f2;
      color: #991b1b;
      text-align: center;
      padding: 10px 14px;
      font-weight: 800;
      font-size: 0.82rem;
      border-bottom: 2px solid #fecaca;
    }
    .day-tab.is-holiday-tab {
      color: #dc2626;
    }
    .day-tab.is-holiday-tab.active {
      background-color: #dc2626;
      color: #ffffff;
    }

    .break-row {
      background-color: #fef3c7;
      text-align: center;
      padding: 13px 16px !important;
      color: #78350f;
      font-weight: 800;
      font-size: 0.85rem;
      border-top: 2px solid #fcd34d !important;
      border-bottom: 2px solid #fcd34d !important;
      height: auto !important;
    }
    .transition-row {
      background-color: #e2e8f0;
      text-align: center;
      padding: 13px 16px !important;
      color: #1e293b;
      font-weight: 800;
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-top: 2px solid #94a3b8 !important;
      border-bottom: 2px solid #94a3b8 !important;
      height: auto !important;
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
    }
    .footer-note {
      text-align: center;
      margin-top: 24px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    @media print {
      .header-banner {
        background-color: #0c4da2 !important;
        color: #ffffff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        padding: 14px 20px;
      }
      .controls-card, .btn, .header-actions, .days-nav, .shifts-nav, .footer-note button {
        display: none !important;
      }
      body {
        background: #ffffff;
        padding: 0;
      }
      .schedule-grid-container {
        border: none;
        box-shadow: none;
      }
      .admin-card {
        border: 1px solid #aaa;
        page-break-inside: avoid;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <header class="header-banner">
    <div class="header-container">
      <div class="header-brand-wrap">
        <div class="logo-box">
          <img src="${effectiveLogo}" alt="Logo Institucional" class="header-logo" />
        </div>
        <div class="header-divider"></div>
        <div class="brand-title">
          <h1>
            Sistema de Agendamiento Escolar
            <span>Horarios, actividades y jornadas académicas</span>
          </h1>
        </div>
      </div>

      <div class="header-meta-box">
        <div class="header-actions">
          <button type="button" class="btn-header-pdf" id="btnDownloadPdf" onclick="downloadPdf()">
            📥 Descargar PDF
          </button>
          <button type="button" class="btn-header-print" onclick="window.print()">
            🖨️ Imprimir
          </button>
        </div>
      </div>
    </div>
  </header>

  <main class="container">
    <div class="controls-card">
      <!-- Fila Superior: Selector de Jornada + Grado, Docente y Búsqueda en la misma línea -->
      <div class="controls-row">
        <div class="filter-group">
          <span style="font-size: 0.8rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em;">Jornada:</span>
          <div class="shifts-nav" id="shiftsNav">
            <button type="button" class="shift-tab active" data-shift="morning" onclick="selectShift('morning')">☀️ Bachillerato (Mañana)</button>
            <button type="button" class="shift-tab" data-shift="afternoon" onclick="selectShift('afternoon')">🌤️ Primaria (Tarde)</button>
            <button type="button" class="shift-tab" data-shift="transicion-1" onclick="selectShift('transicion-1')">✨ Transición</button>
          </div>
        </div>

        <div class="filter-group">
          <select id="gradeSelect" class="form-control" onchange="renderSchedule()" title="Filtrar por Grado">
            <option value="ALL">Todos los grados de la jornada</option>
          </select>

          <select id="teacherSelect" class="form-control" onchange="renderSchedule()" title="Filtrar por Docente">
            <option value="ALL">Todos los docentes</option>
          </select>

          <div class="search-input-wrap">
            <input type="text" id="searchInput" class="form-control" placeholder="Buscar asignatura o aula..." oninput="handleSearchInput()" style="width: 210px; padding-right: 28px; cursor: text;">
            <button type="button" id="clearSearchBtn" class="search-clear-btn" onclick="clearSearchInput()" title="Limpiar búsqueda" aria-label="Limpiar búsqueda">&#10005;</button>
          </div>
        </div>
      </div>

      <!-- Fila Inferior: Días de la Semana (Más grandes y con más contraste) + Periodo y Semana Académica -->
      <div class="controls-row" style="border-top: 1px solid #e2e8f0; padding-top: 12px;">
        <div class="filter-group">
          <div class="days-nav" id="daysNav">
            <button type="button" class="day-tab active" data-day="lunes" data-label="Lunes" onclick="selectDay('lunes')">Lunes</button>
            <button type="button" class="day-tab" data-day="martes" data-label="Martes" onclick="selectDay('martes')">Martes</button>
            <button type="button" class="day-tab" data-day="miercoles" data-label="Miércoles" onclick="selectDay('miercoles')">Miércoles</button>
            <button type="button" class="day-tab" data-day="jueves" data-label="Jueves" onclick="selectDay('jueves')">Jueves</button>
            <button type="button" class="day-tab" data-day="viernes" data-label="Viernes" onclick="selectDay('viernes')">Viernes</button>
          </div>
        </div>

        <div class="period-inline-box">
          <div class="period-inline-title">${displayPeriod}</div>
          <div class="period-inline-sub">Semana académica ${displayWeek} de 14</div>
        </div>
      </div>
    </div>

    <div class="schedule-grid-container" id="scheduleContainer">
      <!-- Dynamic table rendered here -->
    </div>

    <div class="footer-note">
      <p>Actualizado: <strong>${lastUpdated}</strong> — Sistema de Agendamiento Escolar • Horarios, actividades y jornadas académicas</p>
      <p style="margin-top: 4px; font-weight: 700; color: #475569;">Desarrollado y diseñado por Reakta Group</p>
    </div>
  </main>

  <script>
    const ALL_BLOCKS = ${jsonSerialized};
    const ALL_TEACHERS = ${teachersSerialized};
    const DAY_CONFIGS = ${dayConfigsSerialized};
    const INITIAL_WEEK_HEADERS = ${weekHeadersSerialized};
    const MEETING_DAYS = (DAY_CONFIGS && DAY_CONFIGS.meetingDays) || {};
    const EVENT_DAYS = (DAY_CONFIGS && DAY_CONFIGS.eventDays) || {};
    const HOLIDAY_DAYS = (DAY_CONFIGS && DAY_CONFIGS.holidayDays) || {};
    const SCHEDULE_TYPES = (DAY_CONFIGS && DAY_CONFIGS.scheduleTypes) || {};

    const SHIFT_GRADES = {
      'morning': ['6°1', '6°2', '7°1', '7°2', '8°1', '8°2', '9°1', '9°2', '10°1', '10°2', '11°1', '11°2'],
      'afternoon': ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '3.3', '4.1', '4.2', '5.1', '5.2'],
      'transicion-1': ['Transición 1', 'Transición 2']
    };

    function formatMin(m) {
      const h = Math.floor(m / 60);
      const mins = m % 60;
      return String(h).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
    }

    function buildShiftPeriodSlots(shift, isMeeting, isEvent, scheduleType) {
      if (shift === 'transicion-1') {
        const list = [];
        if (isMeeting) {
          list.push({
            period: -2,
            time: '06:30 - 07:00',
            secondaryTime: '12:00 - 12:30',
            label: 'Pre-Jornada',
            isPreJornada: true,
            meetingTitle: 'ATENCIÓN A PADRES',
            meetingDesc: 'Franja institucional de excepción • Sin asignación de clases ni sustituciones'
          });
        }
        list.push(
          { period: 1, time: '07:00 - 07:50', secondaryTime: '12:30 - 13:20', label: '1ª Hora' },
          { period: 2, time: '07:50 - 08:40', secondaryTime: '13:20 - 14:10', label: '2ª Hora' },
          { period: 3, time: '08:40 - 09:30', secondaryTime: '14:10 - 15:00', label: '3ª Hora' },
          { period: 0, time: '09:30 - 10:20', secondaryTime: '15:00 - 15:50', label: 'Descanso Pedagógico y Alimentación Escolar', isBreak: true },
          { period: 4, time: '10:20 - 11:10', secondaryTime: '15:50 - 16:40', label: '4ª Hora' },
          { period: 5, time: '11:10 - 12:00', secondaryTime: '16:40 - 17:30', label: '5ª Hora' }
        );
        return list;
      }

      if (shift === 'afternoon') {
        const list = [];
        if (isMeeting) {
          list.push({
            period: -2,
            time: '11:30 - 12:10',
            label: 'Pre-Jornada',
            isPreJornada: true,
            meetingTitle: 'ATENCIÓN A PADRES',
            meetingDesc: 'Franja institucional previa a la jornada lectiva (11:30 a 12:10) • Primaria • Sin asignación de clases ni sustituciones'
          });
        }
        let cur = isEvent ? (13 * 60) : (12 * 60 + 30);
        for (let p = 1; p <= 3; p++) {
          const end = cur + 55;
          list.push({ period: p, time: formatMin(cur) + ' - ' + formatMin(end), label: p + 'ª Hora' });
          cur = end;
        }
        const bEnd = cur + 30;
        list.push({
          period: 0,
          time: formatMin(cur) + ' - ' + formatMin(bEnd),
          label: isEvent ? 'Descanso Pedagógico (Horario Especial Evento)' : 'Descanso Pedagógico y Alimentación Escolar',
          isBreak: true
        });
        cur = bEnd;
        for (let p = 4; p <= 5; p++) {
          const end = cur + 55;
          list.push({ period: p, time: formatMin(cur) + ' - ' + formatMin(end), label: p + 'ª Hora' });
          cur = end;
        }
        return list;
      }

      // morning (Bachillerato)
      if (scheduleType === 'D' && !isMeeting) {
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
          { period: -1, time: '12:40 - 17:35', label: 'Salida General / Jornada Media Técnica', isTransition: true, mediaTecnicaOnly: true },
          { period: 7, time: '12:40 - 13:35', label: '7ª Hora', mediaTecnicaOnly: true },
          { period: 8, time: '13:35 - 14:30', label: '8ª Hora', mediaTecnicaOnly: true },
          { period: 9, time: '14:30 - 15:25', label: '9ª Hora', mediaTecnicaOnly: true },
          { period: 10, time: '15:45 - 16:40', label: '10ª Hora', mediaTecnicaOnly: true },
          { period: 11, time: '16:40 - 17:35', label: '11ª Hora', mediaTecnicaOnly: true }
        ];
      }
      if (!isMeeting) {
        return [
          { period: 1, time: '06:10 - 07:05', label: '1ª Hora' },
          { period: 2, time: '07:05 - 08:00', label: '2ª Hora' },
          { period: 3, time: '08:00 - 08:55', label: '3ª Hora' },
          { period: 0, time: '08:55 - 09:25', label: 'Descanso Pedagógico y Alimentación Escolar', isBreak: true },
          { period: 4, time: '09:25 - 10:20', label: '4ª Hora' },
          { period: 5, time: '10:20 - 11:15', label: '5ª Hora' },
          { period: 6, time: '11:15 - 12:10', label: '6ª Hora' },
          { period: -1, time: '12:40 - 17:35', label: 'Salida General / Jornada Media Técnica', isTransition: true, mediaTecnicaOnly: true },
          { period: 7, time: '12:40 - 13:35', label: '7ª Hora', mediaTecnicaOnly: true },
          { period: 8, time: '13:35 - 14:30', label: '8ª Hora', mediaTecnicaOnly: true },
          { period: 9, time: '14:30 - 15:25', label: '9ª Hora', mediaTecnicaOnly: true },
          { period: 10, time: '15:45 - 16:40', label: '10ª Hora', mediaTecnicaOnly: true },
          { period: 11, time: '16:40 - 17:35', label: '11ª Hora', mediaTecnicaOnly: true }
        ];
      } else {
        return [
          {
            period: 1,
            time: '06:10 - 07:00',
            label: 'Horario',
            isMeetingFirstHour: true,
            meetingTitle: 'ATENCIÓN A PADRES',
            meetingDesc: 'Franja institucional reservada para atención personalizada a padres de familia y acudientes (06:10 - 07:00) • Sin asignación de clases.'
          },
          { period: 2, time: '07:00 - 07:55', label: '1ª Hora' },
          { period: 3, time: '07:55 - 08:50', label: '2ª Hora' },
          { period: 4, time: '08:50 - 09:45', label: '3ª Hora' },
          { period: 0, time: '09:45 - 10:15', label: 'Descanso Pedagógico y Alimentación Escolar', isBreak: true },
          { period: 5, time: '10:15 - 11:10', label: '4ª Hora' },
          { period: 6, time: '11:10 - 12:05', label: '5ª Hora' },
          { period: -1, time: '12:40 - 17:35', label: 'Salida General / Jornada Media Técnica', isTransition: true, mediaTecnicaOnly: true },
          { period: 7, time: '12:40 - 13:35', label: '6ª Hora', mediaTecnicaOnly: true },
          { period: 8, time: '13:35 - 14:30', label: '7ª Hora', mediaTecnicaOnly: true },
          { period: 9, time: '14:30 - 15:25', label: '8ª Hora', mediaTecnicaOnly: true },
          { period: 10, time: '15:45 - 16:40', label: '9ª Hora', mediaTecnicaOnly: true },
          { period: 11, time: '16:40 - 17:35', label: '10ª Hora', mediaTecnicaOnly: true }
        ];
      }
    }

    const dayMap = { 1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes' };
    const todayIndex = new Date().getDay();
    const todayDayKey = dayMap[todayIndex] || 'lunes';
    let currentDay = todayDayKey;
    let currentShift = 'morning';

    const gradeSelect = document.getElementById('gradeSelect');
    const teacherSelect = document.getElementById('teacherSelect');

    ALL_TEACHERS.forEach(t => {
      if (!t.name && !t.fullName) return;
      const opt = document.createElement('option');
      opt.value = t.name || t.fullName;
      opt.textContent = t.fullName || t.name;
      teacherSelect.appendChild(opt);
    });

    function computeDynamicFullDayLabel(dayKey, fallbackLabel) {
      try {
        const now = new Date();
        const d = now.getDay();
        const diff = d === 0 ? -6 : 1 - d;
        const mon = new Date(now);
        mon.setDate(now.getDate() + diff);
        const offsets = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4 };
        const target = new Date(mon);
        target.setDate(mon.getDate() + (offsets[dayKey] || 0));
        const raw = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: '2-digit', month: 'long' }).format(target);
        const clean = raw.replace(/,/g, '').replace(/\./g, '').trim();
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      } catch (e) {
        return INITIAL_WEEK_HEADERS[dayKey] || fallbackLabel;
      }
    }

    function updateDayTabLabels() {
      document.querySelectorAll('.day-tab').forEach(b => {
        const dayKey = b.getAttribute('data-day');
        const baseLabel = b.getAttribute('data-label') || b.textContent;
        const fullLabel = computeDynamicFullDayLabel(dayKey, baseLabel);
        const isHol = Boolean(HOLIDAY_DAYS[dayKey]);
        const isToday = dayKey === todayDayKey;
        if (isToday) {
          b.classList.add('is-today-tab');
        } else {
          b.classList.remove('is-today-tab');
        }
        let htmlContent = '<span>' + fullLabel + '</span>';
        if (isToday) {
          htmlContent += '<span class="badge-today">Hoy</span>';
        }
        if (isHol) {
          b.classList.add('is-holiday-tab');
          htmlContent += '<span>• Festivo</span>';
        } else {
          b.classList.remove('is-holiday-tab');
        }
        b.innerHTML = htmlContent;
      });
    }

    function getShiftGradesList(shift) {
      const base = SHIFT_GRADES[shift] ? [...SHIFT_GRADES[shift]] : [];
      ALL_BLOCKS.forEach(b => {
        if (b.shift === shift && b.grade && !base.includes(b.grade)) {
          base.push(b.grade);
        }
      });
      return base;
    }

    function populateGradesForShift(shift) {
      const currentVal = gradeSelect.value;
      const grades = getShiftGradesList(shift);
      gradeSelect.innerHTML = '<option value="ALL">Todos los grados (' + grades.length + ')</option>';
      grades.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        gradeSelect.appendChild(opt);
      });
      if (grades.includes(currentVal)) {
        gradeSelect.value = currentVal;
      } else {
        gradeSelect.value = 'ALL';
      }
    }

    function selectShift(shift) {
      currentShift = shift;
      document.querySelectorAll('.shift-tab').forEach(b => {
        if (b.getAttribute('data-shift') === shift) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      populateGradesForShift(shift);
      renderSchedule();
    }

    function selectDay(day) {
      currentDay = day;
      document.querySelectorAll('.day-tab').forEach(b => {
        if (b.getAttribute('data-day') === day) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      renderSchedule();
    }

    function handleSearchInput() {
      const inp = document.getElementById('searchInput');
      const btn = document.getElementById('clearSearchBtn');
      if (btn && inp) {
        btn.style.display = inp.value.length > 0 ? 'inline-flex' : 'none';
      }
      renderSchedule();
    }

    function clearSearchInput() {
      const inp = document.getElementById('searchInput');
      const btn = document.getElementById('clearSearchBtn');
      if (inp) {
        inp.value = '';
        inp.focus();
      }
      if (btn) {
        btn.style.display = 'none';
      }
      renderSchedule();
    }

    function normalizeSearchStr(val) {
      return String(val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    }

    function matchesSearchTokens(b, tokens) {
      if (!tokens || tokens.length === 0) return true;
      const haystack = [
        b.subject || '',
        b.teacher || '',
        b.teacherFullName || '',
        b.replacement || '',
        b.classroom || '',
        b.grade || '',
        b.noveltyReason || '',
        b.motivo_novedad || '',
        b.notes || ''
      ].map(normalizeSearchStr).join(' ');
      return tokens.every(tok => haystack.includes(tok));
    }

    function renderSchedule() {
      const container = document.getElementById('scheduleContainer');
      const selectedGrade = gradeSelect.value;
      const selectedTeacher = teacherSelect.value;
      const rawTerm = document.getElementById('searchInput').value || '';
      const searchTokens = normalizeSearchStr(rawTerm).split(/\s+/).filter(Boolean);

      const isHoliday = Boolean(HOLIDAY_DAYS[currentDay]);
      const isMeetingDay = Boolean(
        MEETING_DAYS[currentShift + '_' + currentDay] !== undefined
          ? MEETING_DAYS[currentShift + '_' + currentDay]
          : MEETING_DAYS[currentDay]
      );
      const isEventDay = Boolean(EVENT_DAYS[currentDay]);

      // Filter blocks strictly by currentShift and currentDay
      const filtered = ALL_BLOCKS.filter(b => {
        if (b.shift !== currentShift) return false;
        if (b.day !== currentDay) return false;
        if (selectedGrade !== 'ALL' && b.grade !== selectedGrade) return false;
        if (selectedTeacher !== 'ALL' && b.teacher !== selectedTeacher && b.teacherFullName !== selectedTeacher) return false;
        if (!matchesSearchTokens(b, searchTokens)) return false;
        return true;
      });

      const shiftGrades = getShiftGradesList(currentShift);
      const isBlankSchedule = ALL_BLOCKS.length === 0;
      const hasCustomFilter = !isBlankSchedule && (selectedTeacher !== 'ALL' || searchTokens.length > 0);

      if (!isHoliday && !isMeetingDay && hasCustomFilter && filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No hay clases para los filtros seleccionados</h3><p>Prueba seleccionando otro día, jornada, grado o docente.</p></div>';
        return;
      }

      const gradesInFilter = selectedGrade !== 'ALL'
        ? [selectedGrade]
        : (hasCustomFilter && !isHoliday)
          ? shiftGrades.filter(g => filtered.some(b => b.grade === g))
          : shiftGrades;

      const rawScheduleType = SCHEDULE_TYPES[currentShift + '_' + currentDay] || SCHEDULE_TYPES[currentDay] || 'A';
      const scheduleType = (currentShift === 'morning' && rawScheduleType === 'D' && !isMeetingDay) ? 'D' : (isMeetingDay ? 'B' : 'A');
      const rawPeriods = buildShiftPeriodSlots(currentShift, isMeetingDay, isEventDay, scheduleType);
      const hasMediaTecnicaInFiltered = filtered.some(b => b.period >= 7 && b.period <= 11);
      const activePeriods = rawPeriods.filter(slot => {
        if (!slot.mediaTecnicaOnly) return true;
        if (!hasMediaTecnicaInFiltered) return false;
        if (slot.isTransition) return true;
        return filtered.some(b => b.period === slot.period);
      });

      const isTransicionShift = currentShift === 'transicion-1';
      const totalCols = isTransicionShift ? (gradesInFilter.length * 2) : (gradesInFilter.length + 1);
      let html = '';
      if (isBlankSchedule) {
        html += '<div style="background-color:#eff6ff;border-bottom:1px solid #bfdbfe;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">';
        html += '<div style="display:flex;align-items:center;gap:8px;color:#1e3a8a;font-size:12px;font-weight:800;">';
        html += '<span style="background-color:#1d4ed8;color:#ffffff;padding:3px 9px;border-radius:9999px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">Estado activo</span>';
        html += '<span>Parrilla en blanco &bull; Sin asignaciones académicas registradas</span>';
        html += '</div>';
        html += '<span style="font-size:11px;font-weight:600;color:#1e40af;">Todas las franjas se encuentran disponibles para programación</span>';
        html += '</div>';
      }
      const isSupportPlanD = currentShift === 'morning' && scheduleType === 'D' && !isMeetingDay;
      const SUPPORT_ROOMS_MAP: Record<string, string> = {
        '6°': 'Aula 303',
        '7°': 'Aula 201',
        '8°': 'Aula 103',
        '9°': 'Aula 301',
        '10°': 'Aula 202',
        '11°': 'Aula 102',
      };
      const REGULAR_ROOMS_MAP: Record<string, string> = {
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
      };

      html += '<table class="schedule-table"><thead>';
      if (isTransicionShift) {
        html += '<tr>';
        gradesInFilter.forEach(g => {
          html += '<th class="time-col-th">Horario ' + scheduleType + '</th>';
          html += '<th>' + g + '</th>';
        });
        html += '</tr>';
      } else if (isSupportPlanD) {
        const groups: Array<{ lvl: string; room: string; count: number }> = [];
        gradesInFilter.forEach(g => {
          const m = g.match(/^(\d+°?)/);
          const lvl = m ? m[1].replace('°','') + '°' : g;
          const rawRoom = SUPPORT_ROOMS_MAP[lvl] || 'Aula Base';
          const cleanRoom = rawRoom.trim();
          const room = /^aula\b/i.test(cleanRoom) ? cleanRoom : ('Aula ' + cleanRoom);
          const last = groups[groups.length - 1];
          if (last && last.lvl === lvl) {
            last.count++;
          } else {
            groups.push({ lvl, room, count: 1 });
          }
        });

        html += '<tr style="border-bottom: 1.5px solid #64748b;">';
        html += '<th class="time-col-th" style="background-color: #334155; color: #ffffff; font-size: 11px; text-transform: uppercase; font-weight: 800;">Horario</th>';
        groups.forEach(grp => {
          html += '<th colspan="' + grp.count + '" style="background-color: #7f7f7f; color: #ffffff; font-size: 14px; font-weight: 900; text-align: center; border-right: 1px solid #64748b; letter-spacing: 0.03em;">' + grp.room + '</th>';
        });
        html += '</tr>';

        html += '<tr>';
        html += '<th class="time-col-th">Horario ' + scheduleType + '</th>';
        gradesInFilter.forEach(g => {
          const m = g.match(/^(\d+°?)/);
          const lvl = m ? m[1].replace('°','') + '°' : g;
          const supportRoom = SUPPORT_ROOMS_MAP[lvl] || REGULAR_ROOMS_MAP[g] || 'Aula Base';
          html += '<th style="background-color: #b8cce4; color: #0f172a; font-weight: 900; font-size: 13px;"><div>' + g + '</div><div style="font-size: 10px; font-weight: 700; color: #334155; margin-top: 2px;">' + supportRoom + '</div></th>';
        });
        html += '</tr>';
      } else {
        html += '<tr>';
        html += '<th class="time-col-th">Horario ' + scheduleType + '</th>';
        gradesInFilter.forEach(g => {
          const regRoom = REGULAR_ROOMS_MAP[g] || '';
          html += '<th><div>' + g + '</div>' + (regRoom ? '<div style="font-size: 10px; font-weight: 600; color: #cbd5e1; margin-top: 2px;">' + regRoom + '</div>' : '') + '</th>';
        });
        html += '</tr>';
      }
      html += '</thead><tbody>';

      if (isHoliday) {
        html += '<tr><td colspan="' + totalCols + '" class="holiday-banner-row">📅 Día Festivo Institucional &bull; Sin actividad académica programada</td></tr>';
      }

      activePeriods.forEach(slot => {
        if (slot.isPreJornada && !isHoliday) {
          if (isTransicionShift) {
            html += '<tr>';
            gradesInFilter.forEach(g => {
              const slotTime = (g === 'Transición 2' && slot.secondaryTime) ? slot.secondaryTime : slot.time;
              html += '<td class="time-col-td" style="background-color: #fffbeb;"><span class="time-slot-label" style="color: #92400e;">' + slot.label + '</span><span class="time-slot-hours">' + slotTime + '</span></td>';
              html += '<td class="meeting-row-cell">';
              html += '<div class="meeting-row-title">👥 ' + slot.meetingTitle + '</div>';
              html += '<div class="meeting-row-sub">' + slot.meetingDesc + ' (' + slotTime + ')</div>';
              html += '</td>';
            });
            html += '</tr>';
            return;
          }
          html += '<tr>';
          html += '<td class="time-col-td" style="background-color: #fffbeb;"><span class="time-slot-label" style="color: #92400e;">' + slot.label + '</span><span class="time-slot-hours">' + slot.time + '</span></td>';
          html += '<td colspan="' + gradesInFilter.length + '" class="meeting-row-cell">';
          html += '<div class="meeting-row-title">👥 ' + slot.meetingTitle + '</div>';
          html += '<div class="meeting-row-sub">' + slot.meetingDesc + '</div>';
          html += '</td></tr>';
          return;
        }

        if (slot.isBreak) {
          if (isTransicionShift) {
            html += '<tr>';
            gradesInFilter.forEach(g => {
              const slotTime = (g === 'Transición 2' && slot.secondaryTime) ? slot.secondaryTime : slot.time;
              html += '<td class="time-col-td" style="background-color: #fde68a;"><span class="time-slot-label" style="color: #78350f;">Receso</span><span class="time-slot-hours">' + slotTime + '</span></td>';
              html += '<td class="break-row">☕ ' + slot.label + '</td>';
            });
            html += '</tr>';
            return;
          }
          html += '<tr><td colspan="' + totalCols + '" class="break-row">☕ ' + slot.label + ' &bull; (' + slot.time + ')</td></tr>';
          return;
        }
        if (slot.isTransition) {
          html += '<tr><td colspan="' + totalCols + '" class="transition-row">🎓 ' + slot.label + ' &bull; (' + slot.time + ')</td></tr>';
          return;
        }

        if (slot.isMeetingFirstHour && !isHoliday) {
          html += '<tr>';
          html += '<td class="time-col-td"><span class="time-slot-label">' + slot.label + '</span><span class="time-slot-hours">' + slot.time + '</span></td>';
          html += '<td colspan="' + gradesInFilter.length + '" class="meeting-row-cell">';
          html += '<div class="meeting-row-title">👥 ' + slot.meetingTitle + '</div>';
          html += '<div class="meeting-row-sub">' + slot.meetingDesc + '</div>';
          html += '</td></tr>';
          return;
        }

        if (isSupportPlanD && slot.period === 1) {
          html += '<tr style="border-top: 2px solid #475569; border-bottom: 2px solid #475569;">';
          html += '<th class="time-col-th" style="background-color: #1e293b; color: #ffffff; text-align: center; vertical-align: middle; padding: 8px 6px;">';
          html += '<div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Horario ' + scheduleType + '</div>';
          html += '<div style="font-size: 10px; font-weight: 500; color: #cbd5e1; margin-top: 2px;">Planes de Apoyo</div>';
          html += '</th>';
          gradesInFilter.forEach(g => {
            const regRoom = REGULAR_ROOMS_MAP[g] || 'Aula Base';
            html += '<th style="background-color: #b8cce4; color: #0f172a; text-align: center; vertical-align: middle; padding: 6px 4px; border-right: 1px solid #94a3b8;">';
            html += '<div style="font-size: 13px; font-weight: 900; line-height: 1.15;">' + g + '</div>';
            html += '<div style="font-size: 10px; font-weight: 700; color: #1e293b; margin-top: 2px;">' + regRoom + '</div>';
            html += '</th>';
          });
          html += '</tr>';
        }

        html += '<tr>';
        if (!isTransicionShift) {
          html += '<td class="time-col-td"><span class="time-slot-label">' + slot.label + '</span><span class="time-slot-hours">' + slot.time + '</span></td>';
        }

        gradesInFilter.forEach(grade => {
          if (isTransicionShift) {
            const gradeSlotTime = (grade === 'Transición 2' && slot.secondaryTime) ? slot.secondaryTime : slot.time;
            html += '<td class="time-col-td"><span class="time-slot-label">' + slot.label + '</span><span class="time-slot-hours">' + gradeSlotTime + '</span></td>';
          }
          if (isHoliday) {
            html += '<td><div class="admin-card-holiday"><span class="holiday-title">Festivo</span><span class="holiday-sub">Sin actividad académica</span></div></td>';
            return;
          }

          const cellBlocks = filtered.filter(b => b.period === slot.period && b.grade === grade);
          const isSeniorHigh = grade.startsWith('10') || grade.startsWith('11');
          const isBeyondRegularMorning = currentShift === 'morning' && slot.period >= 7 && slot.period <= 11 && !isSeniorHigh;

          html += '<td>';
          if (cellBlocks.length === 0) {
            if (isBeyondRegularMorning) {
              html += '<div class="admin-card-exit"><span>Fin de jornada</span></div>';
            } else {
              html += '<div class="admin-card-empty"><span>Sin asignación académica</span></div>';
            }
          } else {
            const b = cellBlocks.find((x) => x.type === 'novelty' || x.isNovelty) || cellBlocks[0];
            const isNov = b.type === 'novelty' || b.isNovelty || Boolean(b.motivo_novedad) || Boolean(b.notes && b.notes.toLowerCase().includes('novedad')) || Boolean(b.subject && b.subject.toUpperCase().startsWith('NOVEDAD'));
            if (isNov) {
              const rawReason = b.noveltyReason || b.motivo_novedad || (b.notes ? b.notes.replace(/^novedad:\s*/i, '').replace(/^evento institucional programado:\s*/i, '').trim() : '') || (b.subject && /^(NOVEDAD|ACTO\s|ACTIVIDAD\s|REUNI[OÓ]N\s|JORNADA\s|DIRECCI[OÓ]N\s)/i.test(b.subject.trim()) ? b.subject : 'NOVEDAD DOCENTE');
              const reasonUpper = String(rawReason).replace(/🇨🇴/g, '').trim().toUpperCase();
              const isActoCivico = reasonUpper.includes('ACTO CÍVICO') || reasonUpper.includes('ACTO CIVICO');
              let noveltyBadgeSvg = '';
              if (isActoCivico) {
                noveltyBadgeSvg = '<svg class="colombia-flag-svg" viewBox="0 0 24 16" aria-label="Bandera de Colombia"><rect width="24" height="8" y="0" fill="#FCD116"/><rect width="24" height="4" y="8" fill="#003893"/><rect width="24" height="4" y="12" fill="#CE1126"/></svg>';
              } else if (reasonUpper.includes('JORNADA PEDAG') || reasonUpper.includes('CAPACITACI') || reasonUpper.includes('TALLER')) {
                noveltyBadgeSvg = '<svg class="novelty-category-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Jornada pedagógica"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
              } else if (reasonUpper.includes('REUNI') || reasonUpper.includes('ÁREA') || reasonUpper.includes('AREA') || reasonUpper.includes('CONSEJO')) {
                noveltyBadgeSvg = '<svg class="novelty-category-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Reunión de área"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
              } else if (reasonUpper.includes('DIRECCI') || reasonUpper.includes('GRUPO') || reasonUpper.includes('CONVIVENCIA')) {
                noveltyBadgeSvg = '<svg class="novelty-category-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Dirección de grupo"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>';
              } else if (reasonUpper.includes('SINDICAL') || reasonUpper.includes('ASAMBLEA') || reasonUpper.includes('PARO')) {
                noveltyBadgeSvg = '<svg class="novelty-category-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Actividad sindical"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>';
              } else if (reasonUpper.includes('DOCENTE') || reasonUpper.includes('PERMISO') || reasonUpper.includes('INCAPACIDAD') || reasonUpper.includes('CALAMIDAD')) {
                noveltyBadgeSvg = '<svg class="novelty-category-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Novedad docente"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>';
              } else {
                noveltyBadgeSvg = '<svg class="novelty-category-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Evento institucional"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>';
              }

              html += '<div class="admin-card-novelty" title="Novedad institucional: ' + reasonUpper.replace(/"/g, '&quot;') + '">';
              html += '<div class="novelty-upper-zone">';
              html += '<div class="novelty-icon-row"><span>⚠️</span></div>';
              html += '<div class="novelty-sub-label">Novedad institucional</div>';
              html += '<div class="novelty-reason">' + reasonUpper + '</div>';
              html += noveltyBadgeSvg;
              html += '</div>';
              html += '</div>';
            } else {
              const isAbsent = b.status === 'absent';
              const isCovered = b.status === 'covered' || Boolean(b.replacement);
              const cardClass = 'admin-card' + (isAbsent ? ' is-absent' : (isCovered ? ' is-covered' : ''));

              html += '<div class="' + cardClass + '">';
              
              // 60% Top Block
              const mRoom = grade.match(/^(\d+°?)/);
              const lvlRoom = mRoom ? mRoom[1].replace('°','') + '°' : grade;
              const subjNorm = String(b.subject || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const mtClassroom = subjNorm.indexOf('bases de datos') !== -1
                ? 'Medellín Digital/Auditorio'
                : (subjNorm.indexOf('audiovisuales') !== -1 ? 'Nube/Auditorio' : '');
              const effectiveCardClassroom = mtClassroom
                ? mtClassroom
                : ((slot.period >= 101 && slot.period <= 104)
                  ? (SUPPORT_ROOMS_MAP[lvlRoom] || b.classroom || 'Aula Base')
                  : (b.classroom || REGULAR_ROOMS_MAP[grade] || 'Aula Base'));
              html += '<div class="admin-card-top">';
              html += '<span class="admin-card-subject" title="' + (b.subject || '') + '">' + (b.subject || 'Sin Asignatura') + '</span>';
              html += '<span class="admin-card-classroom">' + effectiveCardClassroom + '</span>';
              if (isAbsent) {
                html += '<span class="admin-badge-absent">Ausente</span>';
              } else if (isCovered) {
                html += '<span class="admin-badge-covered">R: ' + (b.replacement || 'Cubierto') + '</span>';
              }
              html += '</div>';

              // 40% Bottom Block (Short Name in cell, Full Name in tooltip)
              html += '<div class="admin-card-bottom" style="background-color: ' + (b.teacherColor || '#034EA2') + ';" title="' + (b.teacherFullName || b.teacher || '') + '">';
              html += '<div class="admin-card-initials">' + (b.teacherInitials || '--') + '</div>';
              html += '<span class="admin-card-teacher-name" style="color: ' + (b.teacherTextColor || '#ffffff') + ';">' + (b.teacher || 'Docente') + '</span>';
              html += '</div>';

              html += '</div>';
            }
          }
          html += '</td>';
        });

        html += '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    }

    function buildPdfBlobFromJpeg(jpegDataUrl, imgW, imgH) {
      const base64 = jpegDataUrl.split(',')[1];
      const bin = atob(base64);
      const jpegBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) jpegBytes[i] = bin.charCodeAt(i);
      const pageW = 841.89;
      const pageH = Math.max(595.28, Math.round((imgH / imgW) * pageW * 100) / 100);
      const enc = new TextEncoder();
      const chunks = [];
      const offsets = [];
      let cur = 0;
      const pushS = (s) => { const b = enc.encode(s); chunks.push(b); cur += b.length; };
      const pushB = (b) => { chunks.push(b); cur += b.length; };
      pushS('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
      offsets[1] = cur; pushS('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
      offsets[2] = cur; pushS('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
      offsets[3] = cur; pushS('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
      offsets[4] = cur; pushS('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + imgW + ' /Height ' + imgH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpegBytes.length + ' >>\nstream\n');
      pushB(jpegBytes); pushS('\nendstream\nendobj\n');
      const cs = 'q\n' + pageW + ' 0 0 ' + pageH + ' 0 0 cm\n/Im0 Do\nQ\n';
      offsets[5] = cur; pushS('5 0 obj\n<< /Length ' + cs.length + ' >>\nstream\n' + cs + 'endstream\nendobj\n');
      const xref = cur;
      pushS('xref\n0 6\n0000000000 65535 f \n');
      for (let i = 1; i <= 5; i++) pushS(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
      pushS('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
      return new Blob(chunks, { type: 'application/pdf' });
    }

    function downloadPdf() {
      const btn = document.getElementById('btnDownloadPdf');
      if (btn) btn.textContent = '⏳ Generando PDF...';
      setTimeout(() => {
        try {
          const selectedGrade = gradeSelect.value;
          const selectedTeacher = teacherSelect.value;
          const rawTerm = document.getElementById('searchInput').value || '';
          const searchTokens = normalizeSearchStr(rawTerm).split(/\s+/).filter(Boolean);
          const isHoliday = Boolean(HOLIDAY_DAYS[currentDay]);
          const isMeetingDay = Boolean(
            MEETING_DAYS[currentShift + '_' + currentDay] !== undefined
              ? MEETING_DAYS[currentShift + '_' + currentDay]
              : MEETING_DAYS[currentDay]
          );
          const isEventDay = Boolean(EVENT_DAYS[currentDay]);
          const filtered = ALL_BLOCKS.filter(b => {
            if (b.shift !== currentShift) return false;
            if (b.day !== currentDay) return false;
            if (selectedGrade !== 'ALL' && b.grade !== selectedGrade) return false;
            if (selectedTeacher !== 'ALL' && b.teacher !== selectedTeacher) return false;
            if (!matchesSearchTokens(b, searchTokens)) return false;
            return true;
          });
          const shiftGrades = getShiftGradesList(currentShift);
          const hasCustomFilter = selectedTeacher !== 'ALL' || searchTokens.length > 0;
          const grades = selectedGrade !== 'ALL'
            ? [selectedGrade]
            : (hasCustomFilter && !isHoliday)
              ? shiftGrades.filter(g => filtered.some(b => b.grade === g))
              : shiftGrades;
          const rawScheduleType = SCHEDULE_TYPES[currentShift + '_' + currentDay] || SCHEDULE_TYPES[currentDay] || 'A';
          const pdfScheduleType = (currentShift === 'morning' && rawScheduleType === 'D' && !isMeetingDay) ? 'D' : (isMeetingDay ? 'B' : 'A');
          const rawPeriods = buildShiftPeriodSlots(currentShift, isMeetingDay, isEventDay, pdfScheduleType);
          const hasMT = filtered.some(b => b.period >= 7 && b.period <= 11);
          const activePeriods = rawPeriods.filter(slot => {
            if (!slot.mediaTecnicaOnly) return true;
            if (!hasMT) return false;
            if (slot.isTransition) return true;
            return filtered.some(b => b.period === slot.period);
          });
          const scale = 2;
          const timeColW = 128;
          const tableW = Math.max(1360, timeColW + Math.max(1, grades.length) * 128);
          const gradeColW = (tableW - timeColW) / Math.max(1, grades.length);
          const padX = 28;
          const logW = tableW + padX * 2;
          const rowHeights = activePeriods.map(s => s.isBreak ? 44 : s.isTransition ? 40 : ((s.isPreJornada || s.isMeetingFirstHour) && !isHoliday) ? 68 : 96);
          const totalRowsH = rowHeights.reduce((a, b) => a + b, 0);
          const holH = isHoliday ? 38 : 0;
          const logH = 20 + 108 + 16 + 42 + holH + totalRowsH + 40;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(logW * scale);
          canvas.height = Math.round(logH * scale);
          const ctx = canvas.getContext('2d');
          ctx.scale(scale, scale);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, logW, logH);
          ctx.fillStyle = '#0c4da2';
          ctx.fillRect(padX, 20, tableW, 108);
          const logoEl = document.querySelector('.header-logo');
          let tx = padX + 24;
          if (logoEl && logoEl.complete && logoEl.naturalWidth > 0) {
            const lh = 64;
            const lw = (logoEl.naturalWidth / logoEl.naturalHeight) * lh;
            ctx.drawImage(logoEl, padX + 24, 20 + (108 - lh) / 2, lw, lh);
            tx = padX + 24 + lw + 24;
          }
          ctx.fillStyle = '#ffffff';
          ctx.font = '800 22px sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText('Sistema de Agendamiento Escolar — Horarios, actividades y jornadas académicas', tx, 20 + 44);
          ctx.fillStyle = '#bae6fd';
          ctx.font = '700 13px sans-serif';
          ctx.fillText('${displayPeriod} • Semana académica ${displayWeek} de 14', tx, 20 + 72);

          let curY = 20 + 108 + 16;
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(padX, curY, tableW, 42);
          ctx.fillStyle = '#334155';
          ctx.font = '800 12px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('HORARIO ' + pdfScheduleType, padX + 12, curY + 21);
          grades.forEach((g, idx) => {
            ctx.fillStyle = '#0f172a';
            ctx.font = '800 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(g, padX + timeColW + idx * gradeColW + gradeColW / 2, curY + 21);
          });
          curY += 42;
          if (isHoliday) {
            ctx.fillStyle = '#fef2f2';
            ctx.fillRect(padX, curY, tableW, holH);
            ctx.fillStyle = '#991b1b';
            ctx.font = '800 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Día Festivo Institucional • Sin actividad académica programada', padX + tableW / 2, curY + holH / 2);
            curY += holH;
          }
          activePeriods.forEach((slot, rIdx) => {
            const rH = rowHeights[rIdx];
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(padX, curY, tableW, rH);
            if (slot.isBreak || slot.isTransition) {
              ctx.fillStyle = slot.isBreak ? '#fef3c7' : '#e2e8f0';
              ctx.fillRect(padX, curY, tableW, rH);
              ctx.fillStyle = slot.isBreak ? '#78350f' : '#1e293b';
              ctx.font = '800 12.5px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText((slot.isBreak ? '☕ ' : '🎓 ') + slot.label + ' • (' + slot.time + ')', padX + tableW / 2, curY + rH / 2);
              curY += rH;
              return;
            }
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(padX, curY, timeColW, rH);
            ctx.fillStyle = '#0c4da2';
            ctx.font = '800 14.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(slot.label, padX + timeColW / 2, curY + rH / 2 - 9);
            ctx.fillStyle = '#1e293b';
            ctx.font = '800 13px monospace';
            ctx.fillText(slot.time, padX + timeColW / 2, curY + rH / 2 + 11);
            if ((slot.isPreJornada || slot.isMeetingFirstHour) && !isHoliday) {
              ctx.fillStyle = '#e5e7eb';
              ctx.fillRect(padX + timeColW, curY, tableW - timeColW, rH);
              ctx.fillStyle = '#111827';
              ctx.font = '900 14px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(slot.meetingTitle || 'ATENCIÓN A PADRES', padX + timeColW + (tableW - timeColW) / 2, curY + rH / 2 - 9);
              ctx.fillStyle = '#374151';
              ctx.font = '600 11px sans-serif';
              ctx.fillText(slot.meetingDesc || '', padX + timeColW + (tableW - timeColW) / 2, curY + rH / 2 + 10);
              curY += rH;
              return;
            }
            grades.forEach((grade, gIdx) => {
              const cx = padX + timeColW + gIdx * gradeColW + 4;
              const cy = curY + 4;
              const cw = gradeColW - 8;
              const ch = rH - 8;
              const cb = filtered.filter(b => b.period === slot.period && b.grade === grade);
              if (isHoliday || cb.length === 0) {
                ctx.fillStyle = '#f9fafb';
                ctx.fillRect(cx, cy, cw, ch);
                ctx.strokeStyle = '#e2e8f0';
                ctx.strokeRect(cx, cy, cw, ch);
                ctx.fillStyle = '#9ca3af';
                ctx.font = '600 9.5px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(isHoliday ? 'Festivo' : 'Sin asignación', cx + cw / 2, cy + ch / 2);
                return;
              }
              const b = cb[0];
              const isNov = b.type === 'novelty' || b.isNovelty || Boolean(b.motivo_novedad) || Boolean(b.notes && b.notes.toLowerCase().includes('novedad')) || Boolean(b.subject && b.subject.toUpperCase().startsWith('NOVEDAD'));
              if (isNov) {
                const rawReason = b.noveltyReason || b.motivo_novedad || (b.notes ? b.notes.replace(/^novedad:\s*/i, '').replace(/^evento institucional programado:\s*/i, '').trim() : '') || (b.subject && /^(NOVEDAD|ACTO\s|ACTIVIDAD\s|REUNI[OÓ]N\s|JORNADA\s|DIRECCI[OÓ]N\s)/i.test(b.subject.trim()) ? b.subject : 'NOVEDAD DOCENTE');
                const reasonUpper = String(rawReason).replace(/🇨🇴/g, '').trim().toUpperCase();
                const isActoCivico = reasonUpper.includes('ACTO CÍVICO') || reasonUpper.includes('ACTO CIVICO');
                ctx.fillStyle = '#fffbeb';
                ctx.fillRect(cx, cy, cw, ch);
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(cx, cy, cw, ch);
                ctx.lineWidth = 1;
                const iconY = cy + 14;
                const subY = cy + 25;
                const descY = cy + 38;
                ctx.textAlign = 'center';
                ctx.font = '700 18px sans-serif';
                ctx.fillStyle = '#d97706';
                ctx.fillText('⚠️', cx + cw / 2, iconY);
                ctx.fillStyle = '#92400e';
                ctx.font = '600 7.5px sans-serif';
                ctx.fillText('Novedad institucional', cx + cw / 2, subY);
                ctx.fillStyle = '#451a03';
                ctx.font = '900 9.5px sans-serif';
                ctx.fillText(reasonUpper.slice(0, 22), cx + cw / 2, descY);
                if (isActoCivico) {
                  const flagW = 14;
                  const flagH = 9;
                  const flagX = cx + (cw - flagW) / 2;
                  const flagY = descY + 6;
                  ctx.fillStyle = '#FCD116';
                  ctx.fillRect(flagX, flagY, flagW, flagH * 0.5);
                  ctx.fillStyle = '#003893';
                  ctx.fillRect(flagX, flagY + flagH * 0.5, flagW, flagH * 0.25);
                  ctx.fillStyle = '#CE1126';
                  ctx.fillRect(flagX, flagY + flagH * 0.75, flagW, flagH * 0.25);
                  ctx.strokeStyle = 'rgba(69,26,3,0.2)';
                  ctx.strokeRect(flagX, flagY, flagW, flagH);
                } else {
                  let catSymbol = '📅';
                  if (reasonUpper.includes('JORNADA PEDAG') || reasonUpper.includes('CAPACITACI') || reasonUpper.includes('TALLER')) catSymbol = '📖';
                  else if (reasonUpper.includes('REUNI') || reasonUpper.includes('ÁREA') || reasonUpper.includes('AREA') || reasonUpper.includes('CONSEJO')) catSymbol = '👥';
                  else if (reasonUpper.includes('DIRECCI') || reasonUpper.includes('GRUPO') || reasonUpper.includes('CONVIVENCIA')) catSymbol = '🛡️';
                  else if (reasonUpper.includes('SINDICAL') || reasonUpper.includes('ASAMBLEA') || reasonUpper.includes('PARO')) catSymbol = '📢';
                  else if (reasonUpper.includes('DOCENTE') || reasonUpper.includes('PERMISO') || reasonUpper.includes('INCAPACIDAD') || reasonUpper.includes('CALAMIDAD')) catSymbol = '👤';
                  ctx.font = '700 10px sans-serif';
                  ctx.fillStyle = '#92400e';
                  ctx.fillText(catSymbol, cx + cw / 2, descY + 14);
                }
                return;
              }
              const topH = Math.round(ch * 0.58);
              const botH = ch - topH;
              ctx.fillStyle = '#f9fafb';
              ctx.fillRect(cx, cy, cw, topH);
              ctx.fillStyle = '#111827';
              ctx.font = '700 10px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText((b.subject || '').slice(0, 22), cx + cw / 2, cy + topH / 2 - 6);
              ctx.fillStyle = '#6b7280';
              ctx.font = '500 9.5px monospace';
              ctx.fillText(b.classroom || 'Aula Base', cx + cw / 2, cy + topH - 9);
              ctx.fillStyle = b.teacherColor || '#0c4da2';
              ctx.fillRect(cx, cy + topH, cw, botH);
              ctx.fillStyle = 'rgba(0,0,0,0.22)';
              ctx.fillRect(cx, cy + topH, 24, botH);
              ctx.fillStyle = '#ffffff';
              ctx.font = '800 9.5px sans-serif';
              ctx.fillText(b.teacherInitials || '--', cx + 12, cy + topH + botH / 2);
              ctx.fillStyle = b.teacherTextColor || '#ffffff';
              ctx.font = '700 10px sans-serif';
              ctx.fillText((b.teacher || '').slice(0, 18), cx + 24 + (cw - 24) / 2, cy + topH + botH / 2);
              ctx.strokeStyle = '#e5e7eb';
              ctx.strokeRect(cx, cy, cw, ch);
            });
            curY += rH;
          });
          const jpegUrl = canvas.toDataURL('image/jpeg', 0.95);
          const blob = buildPdfBlobFromJpeg(jpegUrl, canvas.width, canvas.height);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'Horario_Academico_' + currentShift + '_' + currentDay + '.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } finally {
          if (btn) btn.textContent = '📥 Descargar PDF';
        }
      }, 30);
    }

    // Initial setup: jornada Bachillerato y día actual de la semana
    updateDayTabLabels();
    populateGradesForShift(currentShift);
    selectDay(currentDay);
  </script>
</body>
</html>`;
}

/**
 * Saves and prepares the public snapshot in localStorage for instantaneous loading
 * on the public viewer page.
 */
export function savePublicScheduleSnapshot(
  timeBlocks: TimeBlockEntity[],
  teachers: Array<{ id: string; displayName?: string; color?: string; color_hex?: string; [key: string]: any }>,
  academicPeriod = '3er Periodo',
  academicWeek = 9,
  dayConfigs?: Partial<PublicDayConfigs>
): PublicScheduleSnapshot {
  const timestamp = new Date().toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const nowMs = Date.now();
  const isBlankMatrix = timeBlocks.length === 0;
  const effectiveDayConfigs = resolveEffectiveDayConfigs({
    ...dayConfigs,
    blankMatrixMode: isBlankMatrix,
    updatedAtMs: nowMs,
  });
  const normalizedPeriod = !academicPeriod || academicPeriod === '3° Periodo' ? '3er Periodo' : academicPeriod;
  const normalizedWeek = !academicWeek || academicWeek === 8 ? 9 : academicWeek;

  const activeTeachers = sortTeachersWithLowPriorityLast(
    teachers.filter(
      (t) =>
        t.id !== 't-adriana-mier' &&
        !String(t.displayName || '').toLowerCase().includes('adriana mier') &&
        !String(t.displayName || '').toLowerCase().includes('adriana luc')
    )
  );

  const snapshot: PublicScheduleSnapshot = {
    metadata: {
      institutionName: 'Sistema de Agendamiento Escolar Horarios, actividades y jornadas académicas',
      academicPeriod: normalizedPeriod,
      academicWeek: normalizedWeek,
      lastUpdated: timestamp,
      totalBlocks: timeBlocks.length,
      totalTeachers: activeTeachers.length,
      blankMatrixMode: isBlankMatrix,
      updatedAtMs: nowMs,
    },
    timeBlocks: isBlankMatrix ? [] : normalizeTimeBlocksGrades(timeBlocks),
    teachers: activeTeachers.map((t) => {
      const identity = getTeacherExcelIdentity(t.id, t.displayName);
      return {
        id: t.id,
        displayName: t.userEdited && t.displayName ? t.displayName : getFullTeacherName(t.id, t.displayName || ''),
        color: t.color_hex || t.color || identity.color_hex || '#007DC5',
      };
    }),
    dayConfigs: effectiveDayConfigs,
  };

  try {
    const nowStr = String(nowMs);
    if (isBlankMatrix) {
      localStorage.setItem('ievf_blank_matrix_mode', '1');
    } else {
      localStorage.removeItem('ievf_blank_matrix_mode');
    }
    localStorage.setItem('ievf_public_schedule_snapshot', JSON.stringify(snapshot));
    localStorage.setItem('ievf_last_published_at', timestamp);
    localStorage.setItem('ievf_local_schedule_updated_at', nowStr);
    localStorage.setItem('ievf_cloud_schedule_fetched_at', nowStr);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('public_schedule_snapshot_updated'));
    }
  } catch (err) {
    console.warn('[savePublicScheduleSnapshot] Error saving snapshot to localStorage:', err);
  }

  return snapshot;
}

/**
 * Retrieves the currently published public schedule snapshot.
 */
export function getPublicScheduleSnapshot(): PublicScheduleSnapshot | null {
  try {
    const raw = localStorage.getItem('ievf_public_schedule_snapshot');
    if (raw) {
      const parsed = JSON.parse(raw) as PublicScheduleSnapshot;
      parsed.dayConfigs = resolveEffectiveDayConfigs(parsed.dayConfigs);
      if (Array.isArray(parsed.teachers)) {
        parsed.teachers = sortTeachersWithLowPriorityLast(
          parsed.teachers.map((t) => {
            const identity = getTeacherExcelIdentity(t.id, t.displayName);
            return {
              ...t,
              displayName: t.displayName || getFullTeacherName(t.id, ''),
              color: t.color || identity.color_hex || '#007DC5',
            };
          })
        );
      }
      return parsed;
    }
  } catch (err) {
    console.warn('[getPublicScheduleSnapshot] Error loading snapshot from localStorage:', err);
  }
  return null;
}
