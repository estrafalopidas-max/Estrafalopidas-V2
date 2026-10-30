import { DayOfWeek } from '../entities/time-block.entity';
import { ShiftType } from '../entities/grade.entity';
import {
  resolveOfficialTeacherEntry,
  getTeacherExcelIdentity,
  getTeacherInitials,
  toTitleCase,
} from './teacher-normalization.service';
import { calculateLuminanceContrast } from './teacher-color.service';

export interface BreakSupervisionZoneRow {
  id: string;
  zoneName: string;
  subLabel?: string;
  isHighlighted?: boolean;
  isMediaTecnica?: boolean;
  days: Record<DayOfWeek, string>;
}

export type BreakSupervisionScheduleMap = Record<ShiftType, BreakSupervisionZoneRow[]>;

export interface SupervisionCellTeacherBadge {
  raw: string;
  teacherId?: string;
  shortName: string;
  fullName: string;
  initials: string;
  colorHex: string;
  textColor: string;
}

export const BREAK_SUPERVISION_STORAGE_KEY = 'ievf_break_supervision_v1';

export const DEFAULT_BACHILLERATO_BREAK_ZONES: BreakSupervisionZoneRow[] = [
  {
    id: 'zone-1',
    zoneName: '1. Primer piso',
    days: {
      lunes: 'Alejandra Pérez',
      martes: 'Sara Casafus',
      miercoles: 'Linda Montoya',
      jueves: 'Diego Castaño',
      viernes: 'Katia Agualimpia',
    },
  },
  {
    id: 'zone-2',
    zoneName: '2. Segundo piso y baño de damas',
    days: {
      lunes: 'Betty Vásquez',
      martes: 'Lorena Lopera',
      miercoles: 'Lorena Lopera',
      jueves: 'Diana Silva',
      viernes: 'Diego Castaño',
    },
  },
  {
    id: 'zone-3',
    zoneName: '3. Restaurante zona de distribución',
    days: {
      lunes: 'Liscy Palacios',
      martes: 'Liscy Palacios',
      miercoles: 'Liscy Palacios',
      jueves: 'Liscy Palacios',
      viernes: 'Liscy Palacios',
    },
  },
  {
    id: 'zone-4',
    zoneName: '4. Restaurante móvil en escalas',
    days: {
      lunes: 'Mª Isabel Giraldo',
      martes: 'Mª Isabel Giraldo',
      miercoles: 'Mª Isabel Giraldo',
      jueves: 'Mª Isabel Giraldo',
      viernes: 'Mª Isabel Giraldo',
    },
  },
  {
    id: 'zone-5',
    zoneName: '5. Escaleras caracol',
    days: {
      lunes: 'Lorena Lopera',
      martes: 'Katia Agualimpia',
      miercoles: 'Sara Casafus',
      jueves: 'Lorena Lopera',
      viernes: 'Alejandra Pérez',
    },
  },
  {
    id: 'zone-6',
    zoneName: '6. Zona ambiental parte superior',
    days: {
      lunes: 'Jairo Murcia',
      martes: 'Betty Vásquez',
      miercoles: 'Katia Agualimpia',
      jueves: 'Betty Vásquez',
      viernes: 'Sara Casafus',
    },
  },
  {
    id: 'zone-7',
    zoneName: '7. Zona ambiental palo de mangos',
    days: {
      lunes: 'Diego Castaño',
      martes: 'Claudia Castañeda',
      miercoles: 'Laura Gallego',
      jueves: 'Jairo Murcia',
      viernes: 'Betty Vásquez',
    },
  },
  {
    id: 'zone-bano-hombres',
    zoneName: 'Baño de hombres',
    subLabel: '(Exclusivo masculino)',
    isHighlighted: true,
    days: {
      lunes: 'Alexander Uribe',
      martes: 'Jairo Murcia',
      miercoles: 'Diego Castaño',
      jueves: 'Omar Mosquera',
      viernes: 'Jairo Murcia',
    },
  },
  {
    id: 'zone-8',
    zoneName: '8. Cuarto piso',
    days: {
      lunes: 'Linda Montoya',
      martes: 'Diego Castaño',
      miercoles: 'Betty Vásquez',
      jueves: 'Alejandra Pérez',
      viernes: 'Claudia Castañeda',
    },
  },
  {
    id: 'zone-9',
    zoneName: '9. Tienda al lado de baños',
    days: {
      lunes: 'Katia Agualimpia',
      martes: 'Diana Silva',
      miercoles: 'Claudia Castañeda',
      jueves: 'Linda Montoya',
      viernes: 'Eliana Osorio',
    },
  },
  {
    id: 'zone-10',
    zoneName: '10. Corredores tercer piso',
    days: {
      lunes: 'Claudia Castañeda',
      martes: 'Eliana Osorio',
      miercoles: 'Jairo Murcia',
      jueves: 'Katia Agualimpia',
      viernes: 'Diana Silva',
    },
  },
  {
    id: 'zone-11',
    zoneName: '11. Cancha costado parque infantil',
    days: {
      lunes: 'Laura Gallego',
      martes: 'Laura Gallego',
      miercoles: 'Alejandra Pérez',
      jueves: 'Eliana Osorio',
      viernes: 'Linda Montoya',
    },
  },
  {
    id: 'zone-12',
    zoneName: '12. Cancha costado cerca a coordinación',
    days: {
      lunes: 'Diana Silva',
      martes: 'Linda Montoya',
      miercoles: 'Eliana Osorio',
      jueves: 'Claudia Castañeda',
      viernes: 'Laura Gallego',
    },
  },
  {
    id: 'zone-13',
    zoneName: '13. Tienda parte frontal y auditorio',
    days: {
      lunes: 'Eliana Osorio',
      martes: 'Alejandra Pérez',
      miercoles: 'Diana Silva',
      jueves: 'Laura Gallego',
      viernes: 'Lorena Lopera',
    },
  },
  {
    id: 'zone-media-tecnica',
    zoneName: 'Acompañamiento descansos Media Técnica',
    isMediaTecnica: true,
    days: {
      lunes: 'Omar Mosquera / Sara Casafus / Paola',
      martes: 'Alexander Uribe / Omar Mosquera / Paola',
      miercoles: 'Alexander Uribe / Omar Mosquera / Paola',
      jueves: 'Alexander Uribe / Sara Casafus / Paola',
      viernes: 'Alexander Uribe / Omar Mosquera / Paola',
    },
  },
];

function normalizeToken(val: string | null | undefined): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const CANONICAL_ZONE_NAME_MAP: Record<string, string> = {
  '1 PRIMER PISO': '1. Primer piso',
  '2 SEGUNDO PISO Y BANO DE DAMAS': '2. Segundo piso y baño de damas',
  '3 RESTAURANTE ZONA DE DISTRIBUCION': '3. Restaurante zona de distribución',
  '4 RESTAURANTE MOVIL EN ESCALAS': '4. Restaurante móvil en escalas',
  '5 ESCALERAS CARACOL': '5. Escaleras caracol',
  '6 ZONA AMBIENTAL PARTE SUPERIOR': '6. Zona ambiental parte superior',
  '7 ZONA AMBIENTAL PALO DE MANGOS': '7. Zona ambiental palo de mangos',
  'BANO DE HOMBRES': 'Baño de hombres',
  '8 CUARTO PISO': '8. Cuarto piso',
  '9 TIENDA AL LADO DE BANOS': '9. Tienda al lado de baños',
  '10 CORREDORES TERCER PISO': '10. Corredores tercer piso',
  '11 CANCHA COSTADO PARQUE INFANTIL': '11. Cancha costado parque infantil',
  '12 CANCHA COSTADO CERCA A COORDINACION': '12. Cancha costado cerca a coordinación',
  '13 TIENDA PARTE FRONTAL Y AUDITORIO': '13. Tienda parte frontal y auditorio',
  'ACOMPANAMIENTO DESCANSOS MEDIA TECNICA': 'Acompañamiento descansos Media Técnica',
};

export function formatSupervisionZoneName(rawName: string | null | undefined, zoneId?: string): string {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return '';

  if (zoneId) {
    const byId = DEFAULT_BACHILLERATO_BREAK_ZONES.find((z) => z.id === zoneId);
    if (byId && normalizeToken(byId.zoneName) === normalizeToken(trimmed)) {
      return byId.zoneName;
    }
  }

  const key = normalizeToken(trimmed);
  if (CANONICAL_ZONE_NAME_MAP[key]) {
    return CANONICAL_ZONE_NAME_MAP[key];
  }

  // Convert sustained uppercase to sentence case while preserving numbering
  const isSustainedUpper = trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(trimmed);
  if (isSustainedUpper) {
    const match = trimmed.match(/^(\d+\.\s*)(.+)$/);
    const prefix = match ? match[1] : '';
    const body = (match ? match[2] : trimmed).toLowerCase();
    const formattedBody = body.charAt(0).toUpperCase() + body.slice(1);
    return `${prefix}${formattedBody}`.replace(/media tecnica/gi, 'Media Técnica');
  }

  return trimmed;
}

export function formatSupervisionTeacherCell(rawCell: string | null | undefined): string {
  const trimmed = String(rawCell || '').trim();
  if (!trimmed) return '';
  if (normalizeToken(trimmed) === 'SIN ASIGNAR') return 'Sin asignar';

  const segments = trimmed
    .split(/[\/,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) return '';

  const formattedSegments = segments.map((seg) => {
    if (normalizeToken(seg) === 'SIN ASIGNAR') return 'Sin asignar';
    const official =
      resolveOfficialTeacherEntry(undefined, seg) ||
      resolveOfficialTeacherEntry(undefined, normalizeToken(seg));
    if (official?.shortName) {
      return official.shortName;
    }
    return toTitleCase(seg);
  });

  return formattedSegments.join(' / ');
}

export function resolveSupervisionCellTeachers(
  rawCell: string | null | undefined,
  customTeachers?: Array<{ id?: string; displayName?: string; color?: string; color_hex?: string }>
): SupervisionCellTeacherBadge[] {
  const trimmed = String(rawCell || '').trim();
  if (!trimmed) return [];

  const segments = trimmed
    .split(/[\/,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return segments.map((seg) => {
    if (normalizeToken(seg) === 'SIN ASIGNAR') {
      return {
        raw: seg,
        shortName: 'Sin asignar',
        fullName: 'Sin asignar',
        initials: '--',
        colorHex: '#64748B',
        textColor: '#ffffff',
      };
    }

    const official =
      resolveOfficialTeacherEntry(undefined, seg) ||
      resolveOfficialTeacherEntry(undefined, normalizeToken(seg));
    const identity = getTeacherExcelIdentity(official?.id, official?.canonicalName || seg);
    const shortName = official?.shortName || identity.shortName || toTitleCase(seg);
    const fullName = official?.canonicalName || identity.normalizedName || shortName;

    let colorHex = official?.originalExcelHex || identity.color_hex || '#034EA2';
    if (Array.isArray(customTeachers) && customTeachers.length > 0) {
      const matchedCustom = customTeachers.find((t) => {
        if (official?.id && t.id === official.id) return true;
        const customOff = resolveOfficialTeacherEntry(t.id, t.displayName);
        return Boolean(official?.id && customOff?.id && official.id === customOff.id);
      });
      if (matchedCustom && (matchedCustom.color_hex || matchedCustom.color)) {
        colorHex = matchedCustom.color_hex || matchedCustom.color || colorHex;
      }
    }

    const initials = getTeacherInitials(shortName);
    const textColor = calculateLuminanceContrast(colorHex) === 'text-white' ? '#ffffff' : '#111827';

    return {
      raw: seg,
      teacherId: official?.id,
      shortName,
      fullName,
      initials,
      colorHex,
      textColor,
    };
  });
}

function normalizeZoneRows(rows: BreakSupervisionZoneRow[]): BreakSupervisionZoneRow[] {
  return rows.map((row) => ({
    ...row,
    zoneName: formatSupervisionZoneName(row.zoneName, row.id),
    days: {
      lunes: formatSupervisionTeacherCell(row.days?.lunes),
      martes: formatSupervisionTeacherCell(row.days?.martes),
      miercoles: formatSupervisionTeacherCell(row.days?.miercoles),
      jueves: formatSupervisionTeacherCell(row.days?.jueves),
      viernes: formatSupervisionTeacherCell(row.days?.viernes),
    },
  }));
}

export function getDefaultBreakSupervisionSchedule(): BreakSupervisionScheduleMap {
  return {
    morning: JSON.parse(JSON.stringify(DEFAULT_BACHILLERATO_BREAK_ZONES)),
    afternoon: [],
    'transicion-1': [],
  };
}

export function normalizeBreakSupervisionSchedule(
  incoming?: Partial<BreakSupervisionScheduleMap> | null
): BreakSupervisionScheduleMap {
  const defaults = getDefaultBreakSupervisionSchedule();
  if (!incoming || typeof incoming !== 'object') {
    return defaults;
  }

  return {
    morning:
      Array.isArray(incoming.morning) && incoming.morning.length > 0
        ? normalizeZoneRows(incoming.morning)
        : defaults.morning,
    afternoon: Array.isArray(incoming.afternoon)
      ? normalizeZoneRows(incoming.afternoon)
      : defaults.afternoon,
    'transicion-1': Array.isArray(incoming['transicion-1'])
      ? normalizeZoneRows(incoming['transicion-1'])
      : defaults['transicion-1'],
  };
}

export function loadBreakSupervisionSchedule(): BreakSupervisionScheduleMap {
  if (typeof window === 'undefined') {
    return getDefaultBreakSupervisionSchedule();
  }
  try {
    const raw = localStorage.getItem(BREAK_SUPERVISION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeBreakSupervisionSchedule(parsed);
    }
  } catch {
    // ignore
  }
  return getDefaultBreakSupervisionSchedule();
}

export function saveBreakSupervisionSchedule(schedule: BreakSupervisionScheduleMap): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeBreakSupervisionSchedule(schedule);
    localStorage.setItem(BREAK_SUPERVISION_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event('break_supervision_updated'));
    window.dispatchEvent(new Event('schedule_matrix_updated'));
  } catch {
    // ignore
  }
}

/**
 * Checks if a given teacher (by displayName, shortName, or ID) is assigned to a cell text
 * such as "BETTY V." or "OMAR / SARA / PAULA" or "MARIA ALEJANDRA".
 */
export function doesTeacherMatchSupervisionCell(
  cellText: string | null | undefined,
  teacherQuery: string | null | undefined
): boolean {
  if (!cellText || !teacherQuery || teacherQuery === 'ALL') return false;

  const cleanQuery = normalizeToken(teacherQuery);
  if (!cleanQuery) return false;

  const targetOfficial = resolveOfficialTeacherEntry(teacherQuery, teacherQuery);
  const segments = cellText
    .split(/[\/,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const cleanSeg = normalizeToken(seg);
    if (!cleanSeg) continue;

    // 1. Direct or substring match on normalized tokens
    if (cleanSeg === cleanQuery || cleanSeg.includes(cleanQuery) || cleanQuery.includes(cleanSeg)) {
      return true;
    }

    // 2. Official teacher dictionary identity resolution
    const segOfficial =
      resolveOfficialTeacherEntry(undefined, seg) ||
      resolveOfficialTeacherEntry(undefined, cleanSeg);

    if (targetOfficial && segOfficial && targetOfficial.id && targetOfficial.id === segOfficial.id) {
      return true;
    }
  }

  return false;
}

export interface TeacherDaySupervisionMatch {
  zoneId: string;
  zoneName: string;
  subLabel?: string;
  assignedText: string;
  isHighlighted?: boolean;
  isMediaTecnica?: boolean;
}

export function getTeacherSupervisionForDay(
  zones: BreakSupervisionZoneRow[],
  day: DayOfWeek,
  teacherQuery: string | null | undefined
): TeacherDaySupervisionMatch[] {
  if (!Array.isArray(zones) || !teacherQuery || teacherQuery === 'ALL') return [];
  const results: TeacherDaySupervisionMatch[] = [];
  for (const z of zones) {
    const assignedText = z.days?.[day] || '';
    if (doesTeacherMatchSupervisionCell(assignedText, teacherQuery)) {
      results.push({
        zoneId: z.id,
        zoneName: z.zoneName,
        subLabel: z.subLabel,
        assignedText,
        isHighlighted: z.isHighlighted,
        isMediaTecnica: z.isMediaTecnica,
      });
    }
  }
  return results;
}
