/**
 * Teacher Normalization & HSL Golden Ratio Visual Identity Service
 * 
 * Implements:
 * 1. Title Case normalization (e.g. 'ALEJANDRO' -> 'Alejandro').
 * 2. Official 32-Teacher Roster Dictionary (Full Name + Short Name 'Nombre Apellido').
 * 3. Dynamic HSL Golden Angle color generation ensuring maximum chromatic distance.
 * 4. Automatic WCAG luminance contrast calculation.
 */

import {
  getTeacherDeterministicColor,
  hashTeacherString,
  calculateLuminanceContrast,
  hexToRgb,
} from './teacher-color.service';

export interface TeacherExcelIdentity {
  id: string;
  originalName: string;
  normalizedName: string; // Full Name (Nombres y Apellidos)
  shortName: string;      // Short Name (Solo Nombre y Primer Apellido)
  initials: string;
  originalExcelHex: string;
  color_hex: string;       // Inmutable static Hex ('#RRGGBB')
  backgroundColor: string; // 20% opacity rgba(r, g, b, 0.20)
  borderColor: string;     // 40% opacity rgba(r, g, b, 0.40)
  accentColor: string;     // Solid hex from Golden Ratio engine or persistent profile
  avatarBg: string;        // Solid hex or high-contrast accent
  avatarText: string;      // Crisp white #FFFFFF
  textColor: string;       // Dynamic contrast text for WCAG compliance
  badgeBg: string;         // Soft pill background
  badgeText: string;       // Contrast text for pill
}

export interface TeacherEntrySchedule {
  defaultEntryTime: string; // Ej: '09:25'
  exceptions?: Partial<Record<'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes', string>>;
  label: string;
}

export interface ExcelTeacherEntry {
  id?: string;
  canonicalName: string; // Nombre completo (Nombres y Apellidos)
  shortName: string;     // Solo Nombre y Apellido (para las casillas)
  originalExcelHex?: string;
  specialty?: string;
  groupDirection?: string;
  entrySchedule?: TeacherEntrySchedule;
}

/**
 * Converts uppercase or unformatted text to proper Title Case.
 */
export function toTitleCase(input: string | null | undefined): string {
  if (!input || !input.trim()) return '';

  const lowercaseWords = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a']);

  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (word.length === 0) return '';
      if (index > 0 && lowercaseWords.has(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Normalizes a string by removing accents and lowercasing for reliable dictionary lookup
 */
function normalizeKey(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

interface OfficialTeacherDef {
  id: string;
  fullName: string;
  shortName: string;
  pdfName: string;
  groupDirection: string;
  colorHex?: string;
  entrySchedule?: TeacherEntrySchedule;
  aliases: string[];
}

export const OFFICIAL_TEACHERS_ROSTER: OfficialTeacherDef[] = [
  // 1. Docentes con Dirección de Grupo (24)
  {
    id: 't-docente-trans1',
    fullName: 'Yessica Bolívar Bolívar',
    shortName: 'Yessica Bolívar',
    pdfName: 'Bolivar Bolivar Yessica',
    groupDirection: 'TS-01',
    colorHex: '#60A5FA',
    aliases: ['YESSICA', 'YESSICA BOLIVAR', 'DOCENTE TITULAR TRANSICIÓN 1', 'DOCENTE TITULAR TRANSICION 1'],
  },
  {
    id: 't-docente-trans2',
    fullName: 'Ana María Monsalve García',
    shortName: 'Ana Monsalve',
    pdfName: 'Monsalve Garcia Ana Maria',
    groupDirection: 'TS-02',
    colorHex: '#14532D',
    aliases: ['ANA MONSALVE', 'ANA MARIA MONSALVE', 'DOCENTE TITULAR TRANSICIÓN 2', 'DOCENTE TITULAR TRANSICION 2'],
  },
  {
    id: 't-docente-101',
    fullName: 'Mariluz Viviana Martínez Cortés',
    shortName: 'Mariluz Martínez',
    pdfName: 'Martinez Cortes Mariluz Viviana',
    groupDirection: '01-01',
    colorHex: '#7F1D1D',
    aliases: ['MARILUZ', 'MARILUZ MARTINEZ', 'DOCENTE TITULAR 1.1'],
  },
  {
    id: 't-docente-102',
    fullName: 'Daniela María Murillo Rueda',
    shortName: 'Daniela Murillo',
    pdfName: 'Murillo Rueda Daniela Maria',
    groupDirection: '01-02',
    colorHex: '#F87171',
    aliases: ['DANIELA', 'DANIELA MURILLO', 'DOCENTE TITULAR 1.2'],
  },
  {
    id: 't-docente-201',
    fullName: 'Laura Arroyave Mejía',
    shortName: 'Laura Arroyave',
    pdfName: 'Arroyave Mejia Laura',
    groupDirection: '02-01',
    colorHex: '#4C1D95',
    aliases: ['LAURA ARROYAVE', 'DOCENTE TITULAR 2.1'],
  },
  {
    id: 't-docente-202',
    fullName: 'Juliana Arias Suárez',
    shortName: 'Juliana Arias',
    pdfName: 'Arias Suarez Juliana',
    groupDirection: '02-02',
    colorHex: '#A78BFA',
    aliases: ['JULIANA', 'JULIANA ARIAS', 'DOCENTE TITULAR 2.2'],
  },
  {
    id: 't-docente-301',
    fullName: 'Silvia Rosa Vanegas Villa',
    shortName: 'Silvia Vanegas',
    pdfName: 'Vanegas Villa Silvia Rosa',
    groupDirection: '03-01',
    colorHex: '#78350F',
    aliases: ['SILVIA', 'SILVIA VANEGAS', 'DOCENTE TITULAR 3.1'],
  },
  {
    id: 't-docente-302',
    fullName: 'Mary Luz Mesa Osorio',
    shortName: 'Mary Mesa',
    pdfName: 'Mesa Osorio Mary Luz',
    groupDirection: '03-02',
    colorHex: '#FBBF24',
    aliases: ['MARY', 'MARY LUZ', 'MARY MESA', 'DOCENTE TITULAR 3.2'],
  },
  {
    id: 't-docente-303',
    fullName: 'Eliana Marina Ascuntar Ascuntar',
    shortName: 'Eliana Ascuntar',
    pdfName: 'Ascuntar Ascuntar Eliana Marina',
    groupDirection: '03-03',
    colorHex: '#0E7490',
    aliases: ['ELIANA ASCUNTAR', 'ELIANA MARINA', 'DOCENTE TITULAR 3.3'],
  },
  {
    id: 't-docente-401',
    fullName: 'Gleider Yael Guerra Ortiz',
    shortName: 'Gleider Guerra',
    pdfName: 'Guerra Ortiz Gleider Yael',
    groupDirection: '04-01',
    colorHex: '#38BDF8',
    aliases: ['GLEIDER', 'GLEIDER GUERRA', 'DOCENTE TITULAR 4.1'],
  },
  {
    id: 't-docente-402',
    fullName: 'Edelmira Mena Mosquera',
    shortName: 'Edelmira Mena',
    pdfName: 'Mena Mosquera Edelmira',
    groupDirection: '04-02',
    colorHex: '#831843',
    aliases: ['EDELMIRA', 'EDELMIRA MENA', 'DOCENTE TITULAR 4.2'],
  },
  {
    id: 't-docente-501',
    fullName: 'Cristina Liceth Henao Taborda',
    shortName: 'Cristina Henao',
    pdfName: 'Henao Taborda Cristina Liceth',
    groupDirection: '05-01',
    colorHex: '#F472B6',
    aliases: ['CRISTINA', 'CRISTINA HENAO', 'DOCENTE TITULAR 5.1'],
  },
  {
    id: 't-docente-502',
    fullName: 'Luis Eduardo Williams Flórez',
    shortName: 'Luis Williams',
    pdfName: 'Williams Florez Luis Eduardo',
    groupDirection: '05-02',
    colorHex: '#312E81',
    aliases: ['LUIS WILLIAMS', 'LUIS EDUARDO', 'WILLIAMS', 'DOCENTE TITULAR 5.2'],
  },
  {
    id: 't-m-isabel',
    fullName: 'María Isabel Giraldo Rojas',
    shortName: 'Mª Isabel Giraldo',
    pdfName: 'Giraldo Rojas Maria Isabel',
    groupDirection: '06-01',
    colorHex: '#818CF8',
    aliases: ['M ISABEL', 'Mª ISABEL GIRALDO', 'MARIA ISABEL', 'ISABEL GIRALDO', 'MARIA GIRALDO'],
  },
  {
    id: 't-claudia',
    fullName: 'Claudia Cecilia Castañeda Ceballos',
    shortName: 'Claudia Castañeda',
    pdfName: 'Castañeda Ceballos Claudia Cecilia',
    groupDirection: '06-02',
    colorHex: '#34D399',
    aliases: ['CLAUDIA', 'CLAUDIA CASTAÑEDA', 'CLAUDIA CASTANEDA', 'CLAUDIA GOMEZ', 't-claudia-gomez'],
  },
  {
    id: 't-diana',
    fullName: 'Diana Yasmín Silva Granda',
    shortName: 'Diana Silva',
    pdfName: 'Silva Granda Diana Yasmin',
    groupDirection: '07-01',
    colorHex: '#7C2D12',
    aliases: ['DIANA', 'DIANA SILVA', 'DIANA YASMIN'],
  },
  {
    id: 't-eliana',
    fullName: 'Eliana María Osorio Zapata',
    shortName: 'Eliana Osorio',
    pdfName: 'Osorio Zapata Eliana Maria',
    groupDirection: '07-02',
    colorHex: '#FB923C',
    aliases: ['ELIANA', 'ELIANA OSORIO', 'ELIANA MARIA'],
  },
  {
    id: 't-linda',
    fullName: 'Linda Patricia Montoya Vega',
    shortName: 'Linda Montoya',
    pdfName: 'Montoya Vega Linda Patricia',
    groupDirection: '08-01',
    colorHex: '#064E3B',
    aliases: ['LINDA', 'LINDA MONTOYA', 'LINDA PATRICIA'],
  },
  {
    id: 't-diego',
    fullName: 'Diego Alexander Castaño Aristizábal',
    shortName: 'Diego Castaño',
    pdfName: 'Castaño Aristizabal Diego Alexander',
    groupDirection: '08-02',
    colorHex: '#6EE7B7',
    aliases: ['DIEGO', 'DIEGO CASTAÑO', 'DIEGO CASTANO'],
  },
  {
    id: 't-katia',
    fullName: 'Katia Danesa Agualimpia Puerta',
    shortName: 'Katia Agualimpia',
    pdfName: 'Agualimpia Puerta Katia Danesa',
    groupDirection: '09-01',
    colorHex: '#581C87',
    aliases: ['KATIA', 'KATIA AGUALIMPIA'],
  },
  {
    id: 't-betty',
    fullName: 'María Betty Vásquez Vélez',
    shortName: 'Betty Vásquez',
    pdfName: 'Vasquez Velez Maria Betty',
    groupDirection: '09-02',
    colorHex: '#C084FC',
    aliases: ['BETTY', 'MARIA BETTY', 'BETTY VASQUEZ', 'MARIA VASQUEZ'],
  },
  {
    id: 't-alejandra',
    fullName: 'María Alejandra Pérez Pino',
    shortName: 'Alejandra Pérez',
    pdfName: 'Perez Pino Maria Alejandra',
    groupDirection: '10-01',
    colorHex: '#134E4A',
    aliases: ['ALEJANDRA', 'MARIA ALEJANDRA', 'ALEJANDRA PEREZ', 'MARIA PEREZ'],
  },
  {
    id: 't-lorena-l',
    fullName: 'Lizhet Lorena Lopera Mazo',
    shortName: 'Lorena Lopera',
    pdfName: 'Lopera Mazo Lizhet Lorena',
    groupDirection: '10-02',
    colorHex: '#2DD4BF',
    aliases: ['LORENA L', 'LIZHET', 'LIZHET LOPERA', 'LORENA LOPERA', 't-lizhet'],
  },
  {
    id: 't-natalia',
    fullName: 'Natalia Andrea Caro Sánchez',
    shortName: 'Natalia Caro',
    pdfName: 'Caro Sanchez Natalia Andrea',
    groupDirection: '11-01',
    colorHex: '#854D0E',
    aliases: ['NATALIA', 'NATALIA CARO'],
  },

  // 2. Docentes sin Dirección de Grupo
  {
    id: 't-laura',
    fullName: 'Laura Gallego Cortés',
    shortName: 'Laura Gallego',
    pdfName: 'Gallego Cortes Laura',
    groupDirection: 'Sin asignación',
    colorHex: '#FDE047',
    aliases: ['LAURA', 'LAURA GALLEGO'],
  },
  {
    id: 't-omar',
    fullName: 'Gleysher Omar Mosquera Perea',
    shortName: 'Omar Mosquera',
    pdfName: 'Mosquera Perea Gleysher Omar',
    groupDirection: 'Sin asignación',
    colorHex: '#0F172A',
    entrySchedule: {
      defaultEntryTime: '09:25',
      exceptions: { jueves: '06:10' },
      label: 'Ingreso 9:25 a.m. (Jueves 6:10 a.m.)',
    },
    aliases: ['OMAR', 'GLEYSHER', 'GLEYSHER MOSQUERA', 'OMAR MOSQUERA'],
  },
  {
    id: 't-jairo-andres',
    fullName: 'Jairo Andrés Murcia Velasco',
    shortName: 'Jairo Murcia',
    pdfName: 'Murcia Velasco Jairo Andres',
    groupDirection: 'Sin asignación',
    colorHex: '#EA580C',
    aliases: ['JAIRO', 'JAIRO ANDRES', 'JAIRO MURCIA', 't-jairo'],
  },
  {
    id: 't-liscy',
    fullName: 'Liscy Vanessa Palacios Ibargüen',
    shortName: 'Liscy Palacios',
    pdfName: 'Palacios Ibarguen Liscy Vanessa',
    groupDirection: 'Sin asignación',
    colorHex: '#94A3B8',
    aliases: ['LISCY', 'LISCY PALACIOS', 'LORENA M', 't-lorena-m'],
  },
  {
    id: 't-alejandro',
    fullName: 'Alejandro Ramírez Cañas',
    shortName: 'Alejandro Ramírez',
    pdfName: 'Ramirez Cañas Alejandro',
    groupDirection: 'Sin asignación',
    colorHex: '#1E3A8A',
    aliases: ['ALEJANDRO', 'ALEJANDRO RAMIREZ', 'ALEJANDRO RESTREPO', 't-alejandro-restrepo'],
  },
  {
    id: 't-camilo',
    fullName: 'Camilo Andrés Torres Charry',
    shortName: 'Camilo Torres',
    pdfName: 'Torres Charry Camilo Andres',
    groupDirection: 'Sin asignación',
    colorHex: '#701A75',
    aliases: ['CAMILO', 'CAMILO TORRES'],
  },
  {
    id: 't-sara',
    fullName: 'Sara Casafus',
    shortName: 'Sara Casafus',
    pdfName: 'Casafus Sara',
    groupDirection: 'Sin asignación',
    colorHex: '#365314',
    aliases: ['SARA', 'SARA CASAFUS', 't-sara'],
  },
  {
    id: 't-paola',
    fullName: 'Paola',
    shortName: 'Paola',
    pdfName: 'Paola',
    groupDirection: 'Sin asignación',
    colorHex: '#A3E635',
    aliases: ['PAOLA', 't-paola'],
  },
  {
    id: 't-alexander',
    fullName: 'Alexander Uribe Montalvo',
    shortName: 'Alexander Uribe',
    pdfName: 'Uribe Montalvo Alexander',
    groupDirection: 'Sin asignación',
    colorHex: '#E879F9',
    entrySchedule: {
      defaultEntryTime: '09:25',
      exceptions: { lunes: '06:10' },
      label: 'Ingreso 9:25 a.m. (Lunes 6:10 a.m.)',
    },
    aliases: ['ALEXANDER', 'ALEX', 'ALEXANDER URIBE', 'ALEX URIBE', 't-alex', 'JAVIER', 't-javier'],
  },
];

/**
 * Master Dictionary of Teachers (populated from OFFICIAL_TEACHERS_ROSTER)
 */
export const EXCEL_TEACHERS_DICTIONARY: Record<string, ExcelTeacherEntry> = {};

OFFICIAL_TEACHERS_ROSTER.forEach((t) => {
  const entry: ExcelTeacherEntry = {
    id: t.id,
    canonicalName: t.fullName,
    shortName: t.shortName,
    originalExcelHex: t.colorHex,
    groupDirection: t.groupDirection,
    entrySchedule: t.entrySchedule,
  };
  EXCEL_TEACHERS_DICTIONARY[t.id] = entry;
  EXCEL_TEACHERS_DICTIONARY[t.id.toUpperCase()] = entry;
  EXCEL_TEACHERS_DICTIONARY[t.fullName.toUpperCase()] = entry;
  EXCEL_TEACHERS_DICTIONARY[normalizeKey(t.fullName)] = entry;
  EXCEL_TEACHERS_DICTIONARY[t.shortName.toUpperCase()] = entry;
  EXCEL_TEACHERS_DICTIONARY[normalizeKey(t.shortName)] = entry;
  EXCEL_TEACHERS_DICTIONARY[t.pdfName.toUpperCase()] = entry;
  EXCEL_TEACHERS_DICTIONARY[normalizeKey(t.pdfName)] = entry;
  t.aliases.forEach((alias) => {
    EXCEL_TEACHERS_DICTIONARY[alias] = entry;
    EXCEL_TEACHERS_DICTIONARY[alias.toUpperCase()] = entry;
    EXCEL_TEACHERS_DICTIONARY[normalizeKey(alias)] = entry;
  });
});

/**
 * Resolves a teacher entry from the dictionary by ID or Name
 */
export function resolveOfficialTeacherEntry(
  teacherId?: string | null,
  teacherName?: string | null
): ExcelTeacherEntry | undefined {
  if (teacherId) {
    const idTrim = teacherId.trim();
    if (EXCEL_TEACHERS_DICTIONARY[idTrim]) return EXCEL_TEACHERS_DICTIONARY[idTrim];
    const idNorm = normalizeKey(idTrim);
    if (EXCEL_TEACHERS_DICTIONARY[idNorm]) return EXCEL_TEACHERS_DICTIONARY[idNorm];
  }
  if (teacherName) {
    const nameTrim = teacherName.trim();
    if (EXCEL_TEACHERS_DICTIONARY[nameTrim]) return EXCEL_TEACHERS_DICTIONARY[nameTrim];
    if (EXCEL_TEACHERS_DICTIONARY[nameTrim.toUpperCase()]) return EXCEL_TEACHERS_DICTIONARY[nameTrim.toUpperCase()];
    const nameNorm = normalizeKey(nameTrim);
    if (EXCEL_TEACHERS_DICTIONARY[nameNorm]) return EXCEL_TEACHERS_DICTIONARY[nameNorm];
  }
  return undefined;
}

/**
 * Returns the school arrival schedule (entrySchedule) for a teacher if they have special arrival hours
 * (e.g. Gleysher Mosquera and Alexander Uribe entering at 9:25 AM with specific day exceptions).
 */
export function getTeacherEntrySchedule(
  teacherId?: string | null,
  teacherName?: string | null
): TeacherEntrySchedule | undefined {
  const entry = resolveOfficialTeacherEntry(teacherId, teacherName);
  return entry?.entrySchedule;
}

/**
 * Checks whether a teacher is physically present in the school during a given day and period.
 * Specifically enforces that Gleysher Mosquera (t-omar) and Alexander Uribe (t-alexander)
 * arrive at 9:25 AM (starting at 4H), except:
 * - Alexander Uribe arrives at 6:10 AM on Monday ('lunes')
 * - Gleysher Mosquera arrives at 6:10 AM on Thursday ('jueves')
 */
export function isTeacherPresentAtSlot(
  teacherId?: string | null,
  teacherName?: string | null,
  dayOfWeek?: string | null,
  period?: number | null,
  shift?: string | null
): { isPresent: boolean; entryTime?: string; label?: string } {
  if (shift && shift !== 'morning') {
    return { isPresent: true };
  }
  if (!period || period > 3) {
    return { isPresent: true };
  }
  const schedule = getTeacherEntrySchedule(teacherId, teacherName);
  if (!schedule) {
    return { isPresent: true };
  }
  const normDay = (dayOfWeek || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase() as 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';

  const dayEntryTime = (normDay && schedule.exceptions?.[normDay]) || schedule.defaultEntryTime;
  if (dayEntryTime === '09:25' && period <= 3) {
    return {
      isPresent: false,
      entryTime: '09:25',
      label: schedule.label,
    };
  }
  return { isPresent: true, entryTime: dayEntryTime, label: schedule.label };
}

/**
 * Checks whether a teacher should always be positioned at the end of teacher listings
 * (specifically Alexander Uribe Montalvo).
 */
export function isLowPriorityListingTeacher(
  teacherOrIdOrName:
    | {
        id?: string | null;
        displayName?: string | null;
        fullName?: string | null;
        shortName?: string | null;
        name?: string | null;
      }
    | string
    | null
    | undefined
): boolean {
  if (!teacherOrIdOrName) return false;
  if (typeof teacherOrIdOrName === 'string') {
    const entry = resolveOfficialTeacherEntry(teacherOrIdOrName, teacherOrIdOrName);
    if (entry?.id === 't-alexander') return true;
    const norm = normalizeKey(teacherOrIdOrName);
    return norm.includes('ALEXANDER URIBE') || norm.includes('URIBE MONTALVO');
  }
  const idVal = (teacherOrIdOrName.id || '').trim();
  const nameVal = (
    teacherOrIdOrName.displayName ||
    teacherOrIdOrName.fullName ||
    teacherOrIdOrName.shortName ||
    teacherOrIdOrName.name ||
    ''
  ).trim();
  const entry = resolveOfficialTeacherEntry(idVal, nameVal);
  if (entry?.id === 't-alexander') return true;
  const norm = normalizeKey(`${idVal} ${nameVal}`);
  return norm.includes('ALEXANDER URIBE') || norm.includes('URIBE MONTALVO') || idVal === 't-alexander';
}

/**
 * Sorts a list of teachers ensuring that low-priority listing teachers (Alexander Uribe Montalvo)
 * always appear at the very end of the list.
 */
export function sortTeachersWithLowPriorityLast<
  T extends {
    id?: string | null;
    displayName?: string | null;
    fullName?: string | null;
    shortName?: string | null;
    name?: string | null;
  }
>(teachers: T[], comparator?: (a: T, b: T) => number): T[] {
  if (!Array.isArray(teachers)) return [];
  return [...teachers].sort((a, b) => {
    const lowA = isLowPriorityListingTeacher(a) ? 1 : 0;
    const lowB = isLowPriorityListingTeacher(b) ? 1 : 0;
    if (lowA !== lowB) return lowA - lowB;
    return comparator ? comparator(a, b) : 0;
  });
}

/**
 * Returns ONLY First Name + First Surname ('Nombre Apellido') for compact schedule cells.
 * Example: 'Mariluz Viviana Martínez Cortés' -> 'Mariluz Martínez'
 * Example: 'Alejandro Ramírez Cañas' -> 'Alejandro Ramírez'
 */
function findEditedUserInStorage(idOrName?: string | null): {
  id: string;
  displayName?: string;
  shortName?: string;
  groupDirection?: string;
  color_hex?: string;
  userEdited?: boolean;
} | undefined {
  if (!idOrName) return undefined;
  try {
    const raw = localStorage.getItem('ievf_users_v1');
    if (!raw) return undefined;
    const users = JSON.parse(raw);
    if (!Array.isArray(users)) return undefined;
    const target = idOrName.trim().toLowerCase();
    return users.find(
      (u: any) =>
        u &&
        (String(u.id || '').trim().toLowerCase() === target ||
          String(u.displayName || '').trim().toLowerCase() === target ||
          String(u.shortName || '').trim().toLowerCase() === target)
    );
  } catch {
    return undefined;
  }
}

export function computeDefaultShortName(candidate: string): string {
  const clean = (candidate || '')
    .replace(/^(prof\.|docente|profesor|profesora|lic\.|ing\.|coord\.)\s+/i, '')
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Sin Asignar';
  if (words.length === 1) return toTitleCase(words[0]);
  if (words.length === 2) return toTitleCase(`${words[0]} ${words[1]}`);
  const firstGivenName = words[0];
  const firstSurname = words[words.length - 2];
  return toTitleCase(`${firstGivenName} ${firstSurname}`);
}

export function getShortTeacherName(
  teacherIdOrName?: string | null,
  teacherNameOptional?: string | null
): string {
  const hasTwoArgs = teacherNameOptional !== undefined;
  const rawId = hasTwoArgs ? (teacherIdOrName || '').trim() : '';
  const rawName = hasTwoArgs ? (teacherNameOptional || '').trim() : (teacherIdOrName || '').trim();

  const candidate = rawName || rawId;
  if (
    !candidate ||
    candidate === 'unassigned' ||
    candidate.toLowerCase() === 'sin asignar' ||
    candidate.toLowerCase().includes('sin asignaci') ||
    candidate.toLowerCase() === 'periodo libre'
  ) {
    return 'Sin Asignar';
  }

  const storedUser = findEditedUserInStorage(rawId || candidate);
  if (storedUser?.shortName?.trim()) {
    return storedUser.shortName.trim();
  }
  if (storedUser?.userEdited && storedUser?.displayName?.trim()) {
    return computeDefaultShortName(storedUser.displayName.trim());
  }

  const matched = resolveOfficialTeacherEntry(rawId || candidate, rawName || candidate);
  if (matched?.shortName) {
    return matched.shortName;
  }

  return computeDefaultShortName(candidate);
}

/**
 * Returns the Complete Official Name ('Nombres y Apellidos') for directories, modals, and tooltips.
 */
export function getFullTeacherName(
  teacherIdOrName?: string | null,
  teacherNameOptional?: string | null
): string {
  const hasTwoArgs = teacherNameOptional !== undefined;
  const rawId = hasTwoArgs ? (teacherIdOrName || '').trim() : '';
  const rawName = hasTwoArgs ? (teacherNameOptional || '').trim() : (teacherIdOrName || '').trim();

  const candidate = rawName || rawId;
  if (
    !candidate ||
    candidate === 'unassigned' ||
    candidate.toLowerCase() === 'sin asignar' ||
    candidate.toLowerCase().includes('sin asignaci') ||
    candidate.toLowerCase() === 'periodo libre'
  ) {
    return 'Sin Asignar';
  }

  const storedUser = findEditedUserInStorage(rawId || candidate);
  if (storedUser?.displayName?.trim()) {
    return storedUser.displayName.trim();
  }

  const matched = resolveOfficialTeacherEntry(rawId || candidate, rawName || candidate);
  if (matched?.canonicalName) {
    return matched.canonicalName;
  }

  return toTitleCase(candidate);
}

/**
 * Extracts the first two letters of the teacher's name for Avatar display.
 */
export function getTeacherInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return 'Do';

  const short = getShortTeacherName(name);
  const words = short.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  const firstWord = words[0] || '';
  if (firstWord.length >= 2) {
    return firstWord.charAt(0).toUpperCase() + firstWord.charAt(1).toUpperCase();
  } else if (firstWord.length === 1) {
    return firstWord.toUpperCase() + 'D';
  }

  return 'DO';
}

/**
 * Converts a hex color (#RRGGBB or #RGB) into an rgba string with custom alpha.
 */
export function hexToRgba(hex: string, alpha: number = 0.2): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * In-memory / storage lookup for persistent locked teacher color (Ad Perpetuum)
 */
export function getTeacherColorFromStorage(teacherId?: string | null, teacherName?: string | null): string | null {
  try {
    const resolvedEntry = resolveOfficialTeacherEntry(teacherId, teacherName);
    const canonicalId = (resolvedEntry?.id || teacherId || '').trim().toLowerCase();
    const cleanId = (teacherId || '').trim().toLowerCase();
    const cleanName = (teacherName || '').trim().toLowerCase();
    const canonicalLower = resolvedEntry?.canonicalName.toLowerCase() || '';
    const shortLower = resolvedEntry?.shortName.toLowerCase() || '';

    // 1. Check permanent locked colors map ('ievf_locked_teacher_colors_v1')
    const lockedRaw = localStorage.getItem('ievf_locked_teacher_colors_v1');
    if (lockedRaw) {
      const lockedMap: Record<string, string> = JSON.parse(lockedRaw);
      if (resolvedEntry?.id && lockedMap[resolvedEntry.id]) return lockedMap[resolvedEntry.id];
      if (teacherId && lockedMap[teacherId.trim()]) return lockedMap[teacherId.trim()];
      if (canonicalId && lockedMap[canonicalId]) return lockedMap[canonicalId];
    }

    // 2. Check active teacher profiles ('ievf_users_v1')
    const raw = localStorage.getItem('ievf_users_v1');
    if (raw) {
      const users: Array<{ id: string; displayName: string; shortName?: string; color?: string; color_hex?: string; avatarColor?: string }> = JSON.parse(raw);
      const match = users.find((u) => {
        const uId = (u.id || '').trim().toLowerCase();
        const uName = (u.displayName || '').trim().toLowerCase();
        const uShort = (u.shortName || '').trim().toLowerCase();
        if (canonicalId && uId === canonicalId) return true;
        if (cleanId && uId === cleanId) return true;
        if (cleanName && (uName === cleanName || uShort === cleanName)) return true;
        if (canonicalLower && uName === canonicalLower) return true;
        if (shortLower && (uShort === shortLower || uName === shortLower)) return true;
        return false;
      });

      if (match?.color_hex) return match.color_hex;
      if (match?.color) return match.color;
      if (match?.avatarColor) return match.avatarColor;
    }

    // 3. Check published public schedule snapshot ('ievf_public_schedule_snapshot')
    const snapRaw = localStorage.getItem('ievf_public_schedule_snapshot');
    if (snapRaw) {
      const snap = JSON.parse(snapRaw);
      if (Array.isArray(snap?.teachers)) {
        const snapMatch = snap.teachers.find((t: any) => {
          const tId = String(t?.id || '').trim().toLowerCase();
          const tName = String(t?.displayName || '').trim().toLowerCase();
          if (canonicalId && tId === canonicalId) return true;
          if (cleanId && tId === cleanId) return true;
          if (cleanName && tName === cleanName) return true;
          if (canonicalLower && tName === canonicalLower) return true;
          if (shortLower && tName === shortLower) return true;
          return false;
        });
        if (snapMatch?.color) return snapMatch.color;
      }
    }
  } catch {}
  return null;
}

export { hashTeacherString };

/**
 * Updates a teacher's color in the in-memory canonical dictionary for real-time propagation.
 */
export function updateTeacherDictionaryColor(teacherIdOrName: string, newHex: string): void {
  if (!teacherIdOrName || !newHex) return;
  const entry = resolveOfficialTeacherEntry(teacherIdOrName, teacherIdOrName);
  if (entry) {
    entry.originalExcelHex = newHex;
  }
  const cleanUpper = teacherIdOrName.trim().toUpperCase();
  if (EXCEL_TEACHERS_DICTIONARY[cleanUpper]) {
    EXCEL_TEACHERS_DICTIONARY[cleanUpper].originalExcelHex = newHex;
  }
}

export function updateTeacherDictionaryProfile(
  teacherId: string,
  updates: {
    fullName?: string;
    shortName?: string;
    colorHex?: string;
    groupDirection?: string;
  }
): void {
  if (!teacherId) return;
  const existing = resolveOfficialTeacherEntry(teacherId, updates.fullName);
  if (existing) {
    if (updates.fullName?.trim()) {
      existing.canonicalName = updates.fullName.trim();
      EXCEL_TEACHERS_DICTIONARY[updates.fullName.trim().toUpperCase()] = existing;
      EXCEL_TEACHERS_DICTIONARY[normalizeKey(updates.fullName.trim())] = existing;
    }
    if (updates.shortName?.trim()) {
      existing.shortName = updates.shortName.trim();
      EXCEL_TEACHERS_DICTIONARY[updates.shortName.trim().toUpperCase()] = existing;
      EXCEL_TEACHERS_DICTIONARY[normalizeKey(updates.shortName.trim())] = existing;
    }
    if (updates.colorHex?.trim()) {
      existing.originalExcelHex = updates.colorHex.trim();
    }
    if (updates.groupDirection !== undefined) {
      existing.groupDirection = updates.groupDirection;
    }
  } else if (updates.fullName?.trim()) {
    const newEntry: ExcelTeacherEntry = {
      id: teacherId,
      canonicalName: updates.fullName.trim(),
      shortName: updates.shortName?.trim() || computeDefaultShortName(updates.fullName.trim()),
      originalExcelHex: updates.colorHex?.trim() || '#007DC5',
      groupDirection: updates.groupDirection || 'Sin asignación',
    };
    EXCEL_TEACHERS_DICTIONARY[teacherId] = newEntry;
    EXCEL_TEACHERS_DICTIONARY[teacherId.toUpperCase()] = newEntry;
    EXCEL_TEACHERS_DICTIONARY[newEntry.canonicalName.toUpperCase()] = newEntry;
    EXCEL_TEACHERS_DICTIONARY[normalizeKey(newEntry.canonicalName)] = newEntry;
    EXCEL_TEACHERS_DICTIONARY[newEntry.shortName.toUpperCase()] = newEntry;
    EXCEL_TEACHERS_DICTIONARY[normalizeKey(newEntry.shortName)] = newEntry;
  }
}

/**
 * Normalizes any teacher name or ID, applying Title Case and returning
 * their persistent solid color from VILLA_FLORA_PALETTE and WCAG compliant contrast properties.
 */
export function getTeacherExcelIdentity(
  teacherId?: string | null,
  teacherName?: string | null
): TeacherExcelIdentity {
  const rawId = (teacherId || '').trim();
  const rawName = (teacherName || '').trim();

  if (
    (!rawId && !rawName) ||
    rawId === 'unassigned' ||
    rawName.toLowerCase() === 'sin asignar' ||
    rawName.toLowerCase() === 'sin asignación académica' ||
    rawName.toLowerCase() === 'sin asignacion academica' ||
    rawName.toLowerCase() === 'periodo libre'
  ) {
    return {
      id: rawId || 'unassigned',
      originalName: rawName || 'Sin Asignar',
      normalizedName: 'Sin Asignar',
      shortName: 'Sin Asignar',
      initials: '--',
      originalExcelHex: '#94A3B8',
      color_hex: '#94A3B8',
      backgroundColor: '#F8FAFC',
      borderColor: '#E2E8F0',
      accentColor: '#94A3B8',
      avatarBg: '#E2E8F0',
      avatarText: '#475569',
      textColor: '#475569',
      badgeBg: '#F1F5F9',
      badgeText: '#64748B',
    };
  }

  const matchedEntry = resolveOfficialTeacherEntry(rawId, rawName);
  const canonicalName = matchedEntry?.canonicalName || getFullTeacherName(rawId, rawName);
  const shortName = matchedEntry?.shortName || getShortTeacherName(rawId, rawName);
  const initials = getTeacherInitials(shortName);

  // 1. First priority: Persistent locked color in storage (locked map / user profile / snapshot)
  const storedColor = getTeacherColorFromStorage(matchedEntry?.id || rawId, canonicalName);

  // 2. Second priority: Canonical locked color in official roster dictionary
  const dictionaryColor = matchedEntry?.originalExcelHex;

  // 3. Third priority: Deterministic selection from curated VILLA_FLORA_PALETTE
  const solidColor = storedColor || dictionaryColor || getTeacherDeterministicColor(canonicalName || rawId);

  // Compute contrast according to WCAG
  const contrastClass = calculateLuminanceContrast(solidColor);
  const contrastText = contrastClass === 'text-white' ? '#FFFFFF' : '#1F2937';

  return {
    id: matchedEntry?.id || rawId || canonicalName,
    originalName: rawName || rawId,
    normalizedName: canonicalName,
    shortName,
    initials,
    originalExcelHex: solidColor,
    color_hex: solidColor,
    backgroundColor: hexToRgba(solidColor, 0.20),
    borderColor: hexToRgba(solidColor, 0.40),
    accentColor: solidColor,
    avatarBg: solidColor,
    avatarText: contrastText,
    textColor: '#1F2937',
    badgeBg: hexToRgba(solidColor, 0.15),
    badgeText: '#1F2937',
  };
}
