/**
 * Lista Maestra de Asignaturas Oficiales (I.E. Villa Flora)
 * Plan de Estudios Aprobado - Ministerio de Educación Nacional (MEN)
 * Control estricto de inputs: Sin campos de texto libre.
 */

export interface MateriaOficial {
  id: string;
  officialName: string;
  shortName: string;
}

export interface AreaAsignaturasOficiales {
  area: string;
  materias: MateriaOficial[];
}

export const asignaturasOficiales: AreaAsignaturasOficiales[] = [
  {
    area: "Ciencias Naturales y Educación Ambiental",
    materias: [
      { id: "CN_CNEA", officialName: "Ciencias Naturales y Educación Ambiental", shortName: "Ciencias Naturales" },
      { id: "CN_BIO", officialName: "Biología", shortName: "Biología" },
      { id: "CN_FIS", officialName: "Física", shortName: "Física" },
      { id: "CN_QUI", officialName: "Química", shortName: "Química" }
    ]
  },
  {
    area: "Ciencias Sociales, Humanas y Filosofía",
    materias: [
      { id: "CS_SOC", officialName: "Ciencias Sociales, Historia, Geografía, Constitución Política y Democracia", shortName: "Ciencias Sociales" },
      { id: "CS_ECO", officialName: "Ciencias Económicas y Políticas", shortName: "Economía y Política" },
      { id: "CS_FIL", officialName: "Filosofía", shortName: "Filosofía" },
      { id: "CS_PAZ", officialName: "Cátedra de la Paz", shortName: "Cátedra de la Paz" }
    ]
  },
  {
    area: "Matemáticas",
    materias: [
      { id: "MAT_MAT", officialName: "Matemáticas", shortName: "Matemáticas" },
      { id: "MAT_EST", officialName: "Estadística", shortName: "Estadística" },
      { id: "MAT_GEO", officialName: "Geometría", shortName: "Geometría" }
    ]
  },
  {
    area: "Humanidades y Lengua",
    materias: [
      { id: "HUM_CAS", officialName: "Humanidades, Lengua Castellana", shortName: "Lengua Castellana" },
      { id: "HUM_LIT", officialName: "Literatura", shortName: "Literatura" },
      { id: "HUM_ING", officialName: "Humanidades, Idioma Extranjero: Inglés", shortName: "Inglés" },
      { id: "HUM_LAB", officialName: "Laboratorio de Idioma Extranjero: Inglés", shortName: "Laboratorio de Inglés" }
    ]
  },
  {
    area: "Arte, Educación Física y Valores",
    materias: [
      { id: "AEV_ART", officialName: "Educación Artística", shortName: "Educación Artística" },
      { id: "AEV_FIS", officialName: "Educación Física, Recreación y Deportes", shortName: "Educación Física" },
      { id: "AEV_ETI", officialName: "Educación Ética y en Valores Humanos", shortName: "Ética y Valores" },
      { id: "AEV_REL", officialName: "Educación Religiosa", shortName: "Educación Religiosa" }
    ]
  },
  {
    area: "Tecnología",
    materias: [
      { id: "TEC_INF", officialName: "Tecnología e Informática", shortName: "Tecnología e Informática" }
    ]
  },
  {
    area: "Educación Media Técnica",
    materias: [
      { id: "EMT_AUD", officialName: "Educación Media Técnica en Audiovisuales", shortName: "MT-Audiovisuales" },
      { id: "EMT_BD", officialName: "Educación Media Técnica en Bases de Datos", shortName: "MT-Bases de Datos" }
    ]
  },
  {
    area: "Educación Inicial y Transición",
    materias: [
      { id: "TRANS_PROP", officialName: "Propósitos 1, 2, 3 y 4 (Educación Inicial/Transición)", shortName: "Propósitos 1, 2, 3 y 4" },
      { id: "TRANS_PROY", officialName: "Proyectos Lúdico Pedagógicos", shortName: "Proyectos Lúdico Pedagógicos" }
    ]
  }
];

export const ALL_OFFICIAL_MATERIAS: MateriaOficial[] = asignaturasOficiales.flatMap((a) => a.materias);

/**
 * Normaliza claves para comparación estricta insensible a mayúsculas y tildes
 */
export function normalizeCatalogKey(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Busca una materia oficial en el catálogo maestro por id, nombre oficial o shortName
 */
export function findOfficialSubject(term: string | null | undefined): MateriaOficial | undefined {
  if (!term || !term.trim()) return undefined;
  const rawClean = term.trim();
  const key = normalizeCatalogKey(rawClean);

  // 1. Coincidencia directa por ID
  const byId = ALL_OFFICIAL_MATERIAS.find(
    (m) => m.id.toLowerCase() === rawClean.toLowerCase() || normalizeCatalogKey(m.id) === key
  );
  if (byId) return byId;

  // 2. Coincidencia exacta por officialName o shortName
  const byExactName = ALL_OFFICIAL_MATERIAS.find(
    (m) => normalizeCatalogKey(m.officialName) === key || normalizeCatalogKey(m.shortName) === key
  );
  if (byExactName) return byExactName;

  // 3. Coincidencia parcial / substring
  return ALL_OFFICIAL_MATERIAS.find((m) => {
    const kOff = normalizeCatalogKey(m.officialName);
    const kShort = normalizeCatalogKey(m.shortName);
    return kOff.includes(key) || key.includes(kOff) || kShort.includes(key) || key.includes(kShort);
  });
}

/**
 * Retorna el nombre corto comprimido (shortName) para renderizado en celda
 */
export function getSubjectShortName(subjectName: string | null | undefined): string {
  if (!subjectName || !subjectName.trim()) return 'Sin Asignar';
  const match = findOfficialSubject(subjectName);
  return match ? match.shortName : subjectName.trim();
}

/**
 * Retorna el nombre oficial inmutable (officialName) para normativas MEN y accesibilidad
 */
export function getSubjectOfficialName(subjectName: string | null | undefined): string {
  if (!subjectName || !subjectName.trim()) return 'Sin asignación académica';
  const match = findOfficialSubject(subjectName);
  return match ? match.officialName : subjectName.trim();
}

export interface SubjectMasterItem {
  id: string;
  name: string;
  officialName: string;
  shortName: string;
  area: string;
  level?: 'primaria' | 'bachillerato' | 'ambos';
}

/**
 * Catálogo Único Autorizado MEN (Derivado estrictamente de asignaturasOficiales).
 * Queda destruido cualquier listado legacy previo.
 */
export const getSubjectsByLevel = (_level?: 'primaria' | 'bachillerato'): SubjectMasterItem[] => {
  return asignaturasOficiales.flatMap((area) =>
    area.materias.map((m) => ({
      id: m.id,
      name: m.officialName,
      officialName: m.officialName,
      shortName: m.shortName,
      area: area.area,
      level: 'ambos' as const,
    }))
  );
};

/**
 * Paleta Cromática Oficial por Asignatura (I.E. Villa Flora)
 * Asocia cada ID oficial de materia a un tono vibrante y de alto contraste representativo de su área.
 */
export const MATERIAS_COLOR_MAP: Record<string, string> = {
  CN_CNEA: '#10B981', // Verde Esmeralda (C. Naturales)
  CN_BIO: '#059669',  // Verde Bosque (Biología)
  CN_FIS: '#0D9488',  // Teal Intenso (Física)
  CN_QUI: '#06B6D4',  // Cian (Química)
  CS_SOC: '#D97706',  // Ámbar (Sociales)
  CS_ECO: '#B45309',  // Ocre Ámbar (Economía y Pol.)
  CS_FIL: '#92400E',  // Marrón Cálido (Filosofía)
  CS_PAZ: '#F59E0B',  // Amarillo Dorado (Cátedra de Paz)
  MAT_MAT: '#2563EB', // Azul Real (Matemáticas)
  MAT_EST: '#1D4ED8', // Azul Cobalto (Estadística)
  MAT_GEO: '#3B82F6', // Azul Cielo (Geometría)
  HUM_CAS: '#7C3AED', // Púrpura Violeta (Lengua Castellana)
  HUM_LIT: '#6D28D9', // Violeta Profundo (Literatura)
  HUM_ING: '#8B5CF6', // Lavanda Intenso (Inglés)
  HUM_LAB: '#A78BFA', // Lavanda Suave (Lab. Inglés)
  AEV_ART: '#EC4899', // Rosa Frambuesa (Artística)
  AEV_FIS: '#EA580C', // Naranja Fuerte (Ed. Física)
  AEV_ETI: '#14B8A6', // Verde Azulado (Ética)
  AEV_REL: '#84CC16', // Lima (Religión)
  TEC_INF: '#0284C7', // Azul Celeste (Tecnología)
  EMT_AUD: '#C026D3', // Fucsia (MT - Audiovisuales)
  EMT_BD: '#9333EA',  // Violeta (MT - Bases de datos)
  TRANS_PROP: '#0EA5E9', // Azul Cielo (Propósitos Educación Inicial)
  TRANS_PROY: '#F97316', // Naranja Cálido (Proyectos Lúdico Pedagógicos)
};

/**
 * Retorna el color oficial representativo para una asignatura dada (por id, officialName o shortName).
 */
export function getSubjectColor(term: string | null | undefined): string {
  if (!term) return '#94A3B8';
  const match = findOfficialSubject(term);
  if (match && MATERIAS_COLOR_MAP[match.id]) {
    return MATERIAS_COLOR_MAP[match.id];
  }
  return MATERIAS_COLOR_MAP[term] || '#94A3B8';
}
