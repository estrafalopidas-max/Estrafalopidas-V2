/**
 * Subject Normalization & Canonical Reconciliation Service
 * Single Source of Truth: Reconciles informal Excel subject abbreviations
 * to official curriculum subjects backed by the Teacher Registration roster.
 */

import { toTitleCase } from './teacher-normalization.service';
import {
  MateriaOficial,
  ALL_OFFICIAL_MATERIAS,
  findOfficialSubject,
  getSubjectShortName,
  getSubjectOfficialName,
  normalizeCatalogKey,
} from '../constants/subjects';

export interface NormalizedSubjectResult {
  displayName: string;
  shortName: string;
  officialName: string;
  isOrphan: boolean;
  isSpecialBlock: boolean;
  rawSubject: string;
  matchedOfficialSubject?: string;
  materiaOficial?: MateriaOficial;
}

/**
 * Reconciles informal Excel abbreviations and variants into official subjects
 */
export const SUBJECT_NORMALIZATION_MAP: Record<string, string> = {
  // Ciencias Naturales, Biología, Química, Física
  'NATURALES': 'Ciencias Naturales',
  'CIENCIAS NATURALES': 'Ciencias Naturales',
  'CIENCIAS NATURALES AULA 102': 'Ciencias Naturales',
  'BIOLOG': 'Biología',
  'BIOLOG AULA': 'Biología',
  'BIOLOGIA': 'Biología',
  'BIOLOGÍA': 'Biología',
  'QUIM': 'Química',
  'QUÍM': 'Química',
  'QUIMICA': 'Química',
  'QUÍMICA': 'Química',
  'FISICA': 'Física',
  'FÍSICA': 'Física',

  // Lengua Castellana, Literatura, Plan Lector
  'LENGUA CASTELLANA': 'Lengua Castellana',
  'LENGUA CASTELLANA AULA 401': 'Lengua Castellana',
  'LENGUA CASTELLANA AULA 402': 'Lengua Castellana',
  'CASTELLANO': 'Lengua Castellana',
  'ESPAÑOL': 'Lengua Castellana',
  'LITERATURA': 'Literatura',
  'LITERATURA AULA 301': 'Literatura',
  'LITERATURA AULA 304': 'Literatura',
  'PLAN LECTOR': 'Plan Lector',
  'LECTOESCRITURA': 'Lengua Castellana y Lectoescritura',

  // Matemáticas, Geometría, Estadística
  'MATEMATICAS': 'Matemáticas',
  'MATEMÁTICAS': 'Matemáticas',
  'MATÉMATICAS': 'Matemáticas',
  'MATÉMATICAS AULA 402': 'Matemáticas',
  'MATEMATICA': 'Matemáticas',
  'GEOMETRIA': 'Geometría',
  'GEOMETRÍA': 'Geometría',
  'GEOMETRÍA AULA 402': 'Geometría',
  'ESTADISTICA': 'Estadística',
  'ESTADÍSTICA': 'Estadística',
  'ESTADÍSTICA AULA 401': 'Estadística',

  // Inglés y Laboratorios
  'INGLES': 'Inglés',
  'INGLÉS': 'Inglés',
  'INGLÉS AULA 304': 'Inglés',
  'LAB INGLES': 'Laboratorio de Inglés',
  'LAB INGLÉS': 'Laboratorio de Inglés',
  'LABORATORIO DE IN': 'Laboratorio de Inglés',
  'LABORATORIO DE INGLES': 'Laboratorio de Inglés',
  'LABORATORIO DE INGLÉS': 'Laboratorio de Inglés',
  'LABORATORIO': 'Laboratorio de Inglés',

  // Ciencias Sociales, Filosofía, Economía y Política, Cátedra de Paz
  'SOCIALES': 'Ciencias Sociales',
  'CIENCIAS SOCIALES': 'Ciencias Sociales',
  'CIENCIAS SOCIALES AULA 302': 'Ciencias Sociales',
  'CIENCIAS SOCIALES AULA 304': 'Ciencias Sociales',
  'CIENCIAS SOCIALES AULA 402': 'Ciencias Sociales',
  'FILOSOFIA': 'Filosofía',
  'FILOSOFÍA': 'Filosofía',
  'ECONOMIA Y POLITICA': 'Ciencias Políticas y Económicas',
  'ECONOMÍA Y POLÍTICA': 'Ciencias Políticas y Económicas',
  'CIENCIAS POLITICAS': 'Ciencias Políticas y Económicas',
  'CATEDRA DE PAZ': 'Cátedra de Paz',
  'CÁTEDRA DE PAZ': 'Cátedra de Paz',

  // Educación Artística
  'ARTISTICA': 'Educación Artística',
  'ARTÍSTICA': 'Educación Artística',
  'ARTÍSTICA AULA 301': 'Educación Artística',
  'ED ARTISTICA': 'Educación Artística',
  'ED ARTÍSTICA': 'Educación Artística',

  // Educación Física
  'ED FISICA': 'Educación Física',
  'ED FÍSICA': 'Educación Física',
  'ED. FISICA': 'Educación Física',
  'ED. FÍSICA': 'Educación Física',
  'ED FISICA CANCHA': 'Educación Física',
  'EDUCACION FISICA': 'Educación Física',
  'EDUCACIÓN FÍSICA': 'Educación Física',

  // Ética y Valores
  'ETICA': 'Ética y Valores',
  'ÉTICA': 'Ética y Valores',
  'ED ETICA': 'Ética y Valores',
  'ED ÉTICA': 'Ética y Valores',
  'ED. ETICA': 'Ética y Valores',
  'ED. ÉTICA': 'Ética y Valores',
  'ED ÉTICA AULA 301': 'Ética y Valores',
  'ETICA Y VALORES': 'Ética y Valores',
  'ÉTICA Y VALORES': 'Ética y Valores',

  // Religión
  'RELIGION': 'Educación Religiosa',
  'RELIGIÓN': 'Educación Religiosa',
  'EDUC. RELIGIOSA': 'Educación Religiosa',
  'EDUCACION RELIGIOSA': 'Educación Religiosa',
  'EDUCACIÓN RELIGIOSA': 'Educación Religiosa',

  // Tecnología e Informática
  'TECNOLOGIA': 'Tecnología e Informática',
  'TECNOLOGÍA': 'Tecnología e Informática',
  'TECNO E INFO': 'Tecnología e Informática',
  'TEC E INFORM': 'Tecnología e Informática',
  'TEC E INFORM 2PISO': 'Tecnología e Informática',
  'TEC E INFORM 4 PISO': 'Tecnología e Informática',
  'TECN E INFORM': 'Tecnología e Informática',
  'TECN E INFORM 2 PISO': 'Tecnología e Informática',
  'INFORMATICA': 'Tecnología e Informática',
  'INFORMÁTICA': 'Tecnología e Informática',

  // Media Técnica y Nuevas Vertientes Oficiales (Bases de Datos, Audiovisuales)
  'MEDIA TECNICA': 'Media Técnica',
  'MEDIA TÉCNICA': 'Media Técnica',
  'MEDIA TÉCNICA 2P': 'Media Técnica',
  'MEDIA TÉCNICA 4P': 'Media Técnica',
  'MEDIA TÉCNICA AUDITORIO': 'Media Técnica',
  'MEDIA TÉCNICA ITM': 'Media Técnica',
  'MEDIA TÉCNICA ITM 1:00 A 5:00 P.M.': 'Media Técnica',
  'MT': 'Media Técnica',
  'MT 4P': 'Media Técnica',
  'BASES DE DATOS': 'Bases de datos',
  'BASE DE DATOS': 'Bases de datos',
  'CREACIÓN DE AUDIOVISUALES': 'Creación de audiovisuales',
  'CREACION DE AUDIOVISUALES': 'Creación de audiovisuales',
  'AUDIOVISUALES': 'Creación de audiovisuales',

  // Salida y Descanso
  'SALIDA 12:10': 'Sin asignación académica',
  'SIN ASIGNACIÓN ACADÉMICA': 'Sin asignación académica',
  'SIN ASIGNACION ACADEMICA': 'Sin asignación académica',
  'DESCANSO': 'Descanso Pedagógico',
  'DESCANSO PEDAGOGICO': 'Descanso Pedagógico',
  'DESCANSO PEDAGÓGICO': 'Descanso Pedagógico',
};

/**
 * Normalizes accent marks and case for reliable matching
 */
export function normalizeCompare(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Cleans whitespace and linebreaks from raw strings
 */
export function cleanRawSubject(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Translates raw informal Excel subject string to its Title Case canonical name
 */
export function getCanonicalSubjectName(rawSubject: string | null | undefined): string {
  const cleaned = cleanRawSubject(rawSubject);
  if (!cleaned) return '';

  const upper = cleaned.toUpperCase();

  // 1. Direct dictionary match
  if (SUBJECT_NORMALIZATION_MAP[upper]) {
    return SUBJECT_NORMALIZATION_MAP[upper];
  }

  // 2. Strip trailing classroom/location suffix (e.g. "AULA 301", "CANCHA", "4 PISO")
  const stripped = upper
    .replace(/\s+AULA(\s+\w+)?$/i, '')
    .replace(/\s+CANCHA$/i, '')
    .replace(/\s+\d+\s*PISO$/i, '')
    .replace(/\s+\d+P$/i, '')
    .trim();

  if (SUBJECT_NORMALIZATION_MAP[stripped]) {
    return SUBJECT_NORMALIZATION_MAP[stripped];
  }

  // 3. Heuristic prefixes
  if (stripped.startsWith('CIENCIAS NATURALES') || stripped.startsWith('NATURALES')) return 'Ciencias Naturales';
  if (stripped.startsWith('CIENCIAS SOCIALES') || stripped === 'SOCIALES') return 'Ciencias Sociales';
  if (stripped.startsWith('LENGUA CASTELLANA')) return 'Lengua Castellana';
  if (stripped.startsWith('LITERATURA')) return 'Literatura';
  if (stripped.startsWith('MATEM') || stripped.startsWith('MATÉM')) return 'Matemáticas';
  if (stripped.startsWith('GEOMETR')) return 'Geometría';
  if (stripped.startsWith('ESTAD')) return 'Estadística';
  if (stripped.startsWith('LAB') && stripped.includes('INGL')) return 'Laboratorio de Inglés';
  if (stripped.startsWith('INGL')) return 'Inglés';
  if (stripped.startsWith('ED') && (stripped.includes('ÉTICA') || stripped.includes('ETICA') || stripped === 'ÉTICA' || stripped === 'ETICA')) return 'Ética y Valores';
  if (stripped.startsWith('ED') && (stripped.includes('FÍSICA') || stripped.includes('FISICA'))) return 'Educación Física';
  if (stripped.startsWith('ART') || (stripped.startsWith('ED') && stripped.includes('ART'))) return 'Educación Artística';
  if (stripped.startsWith('RELIG') || stripped.includes('RELIGIOSA')) return 'Educación Religiosa';
  if (stripped.startsWith('TEC') || stripped.includes('INFORM')) return 'Tecnología e Informática';
  if (stripped.startsWith('ECONOM')) return 'Ciencias Políticas y Económicas';
  if (stripped.startsWith('MEDIA T') || stripped === 'MT' || stripped.startsWith('MT ')) return 'Media Técnica';
  if (stripped.startsWith('PLAN LECTOR')) return 'Plan Lector';
  if (stripped.startsWith('SALIDA')) return 'Sin asignación académica';
  if (stripped.includes('SIN ASIGNAC')) return 'Sin asignación académica';
  if (stripped.startsWith('DESCANSO')) return 'Descanso Pedagógico';

  // 4. Fallback to strict Title Case formatting
  return toTitleCase(cleaned);
}

/**
 * Mapa de Resolución Directa de Variantes a ID de Asignatura Oficial MEN
 */
export const OFFICIAL_SUBJECT_ID_MAP: Record<string, string> = {
  // Ciencias Naturales y Educación Ambiental
  'CN_CNEA': 'CN_CNEA',
  'NATURALES': 'CN_CNEA',
  'CIENCIAS NATURALES': 'CN_CNEA',
  'CIENCIAS NATURALES Y EDUCACION AMBIENTAL': 'CN_CNEA',
  'CIENCIAS NATURALES Y EDUCACIÓN AMBIENTAL': 'CN_CNEA',
  'C. NATURALES': 'CN_CNEA',
  'C NATURALES': 'CN_CNEA',

  // Biología
  'CN_BIO': 'CN_BIO',
  'BIOLOG': 'CN_BIO',
  'BIOLOGIA': 'CN_BIO',
  'BIOLOGÍA': 'CN_BIO',
  'BIOLOGÍA Y CIENCIAS NATURALES': 'CN_BIO',

  // Física
  'CN_FIS': 'CN_FIS',
  'FISICA': 'CN_FIS',
  'FÍSICA': 'CN_FIS',

  // Química
  'CN_QUI': 'CN_QUI',
  'QUIM': 'CN_QUI',
  'QUÍM': 'CN_QUI',
  'QUIMICA': 'CN_QUI',
  'QUÍMICA': 'CN_QUI',

  // Ciencias Sociales
  'CS_SOC': 'CS_SOC',
  'SOCIALES': 'CS_SOC',
  'CIENCIAS SOCIALES': 'CS_SOC',
  'CIENCIAS SOCIALES E HISTORIA': 'CS_SOC',
  'CIENCIAS SOCIALES, HISTORIA, GEOGRAFÍA, CONSTITUCIÓN POLÍTICA Y DEMOCRACIA': 'CS_SOC',
  'HISTORIA': 'CS_SOC',

  // Economía y Política
  'CS_ECO': 'CS_ECO',
  'ECONOMIA': 'CS_ECO',
  'ECONOMÍA': 'CS_ECO',
  'ECONOMIA Y POLITICA': 'CS_ECO',
  'ECONOMÍA Y POLÍTICA': 'CS_ECO',
  'ECONOMÍA Y POL.': 'CS_ECO',
  'ECONOMIA Y POL.': 'CS_ECO',
  'CIENCIAS POLITICAS': 'CS_ECO',
  'CIENCIAS POLÍTICAS Y ECONÓMICAS': 'CS_ECO',

  // Filosofía
  'CS_FIL': 'CS_FIL',
  'FILOSOFIA': 'CS_FIL',
  'FILOSOFÍA': 'CS_FIL',

  // Cátedra de la Paz
  'CS_PAZ': 'CS_PAZ',
  'CATEDRA DE PAZ': 'CS_PAZ',
  'CÁTEDRA DE PAZ': 'CS_PAZ',
  'CATEDRA DE LA PAZ': 'CS_PAZ',
  'CÁTEDRA DE LA PAZ': 'CS_PAZ',

  // Matemáticas
  'MAT_MAT': 'MAT_MAT',
  'MATEMATICAS': 'MAT_MAT',
  'MATEMÁTICAS': 'MAT_MAT',
  'MATÉMATICAS': 'MAT_MAT',
  'MATEMATICA': 'MAT_MAT',
  'MATEMÁTICAS BÁSICA': 'MAT_MAT',

  // Estadística
  'MAT_EST': 'MAT_EST',
  'ESTADISTICA': 'MAT_EST',
  'ESTADÍSTICA': 'MAT_EST',

  // Geometría
  'MAT_GEO': 'MAT_GEO',
  'GEOMETRIA': 'MAT_GEO',
  'GEOMETRÍA': 'MAT_GEO',
  'GEOMETRÍA Y ESTADÍSTICA': 'MAT_GEO',

  // Lengua Castellana
  'HUM_CAS': 'HUM_CAS',
  'LENGUA CASTELLANA': 'HUM_CAS',
  'HUMANIDADES, LENGUA CASTELLANA': 'HUM_CAS',
  'CASTELLANO': 'HUM_CAS',
  'ESPAÑOL': 'HUM_CAS',
  'LECTOESCRITURA': 'HUM_CAS',
  'LENGUA CASTELLANA Y LECTOESCRITURA': 'HUM_CAS',

  // Literatura
  'HUM_LIT': 'HUM_LIT',
  'LITERATURA': 'HUM_LIT',
  'PLAN LECTOR': 'HUM_LIT',
  'LITERATURA Y COMPRENSIÓN LECTORA': 'HUM_LIT',

  // Inglés
  'HUM_ING': 'HUM_ING',
  'INGLES': 'HUM_ING',
  'INGLÉS': 'HUM_ING',
  'INGLÉS BÁSICO': 'HUM_ING',
  'HUMANIDADES, IDIOMA EXTRANJERO: INGLÉS': 'HUM_ING',

  // Laboratorio de Inglés
  'HUM_LAB': 'HUM_LAB',
  'LAB INGLES': 'HUM_LAB',
  'LAB INGLÉS': 'HUM_LAB',
  'LAB. INGLES': 'HUM_LAB',
  'LAB. INGLÉS': 'HUM_LAB',
  'LABORATORIO': 'HUM_LAB',
  'LABORATORIO DE IN': 'HUM_LAB',
  'LABORATORIO DE INGLES': 'HUM_LAB',
  'LABORATORIO DE INGLÉS': 'HUM_LAB',
  'LABORATORIO DE IDIOMA EXTRANJERO: INGLÉS': 'HUM_LAB',

  // Educación Artística
  'AEV_ART': 'AEV_ART',
  'ARTISTICA': 'AEV_ART',
  'ARTÍSTICA': 'AEV_ART',
  'ED ARTISTICA': 'AEV_ART',
  'ED ARTÍSTICA': 'AEV_ART',
  'EDUCACION ARTISTICA': 'AEV_ART',
  'EDUCACIÓN ARTÍSTICA': 'AEV_ART',
  'EDUCACIÓN ARTÍSTICA Y CULTURAL': 'AEV_ART',
  'EDUCACIÓN ARTÍSTICA Y MANUALIDADES': 'AEV_ART',

  // Educación Física
  'AEV_FIS': 'AEV_FIS',
  'ED FISICA': 'AEV_FIS',
  'ED FÍSICA': 'AEV_FIS',
  'ED. FISICA': 'AEV_FIS',
  'ED. FÍSICA': 'AEV_FIS',
  'EDUCACION FISICA': 'AEV_FIS',
  'EDUCACIÓN FÍSICA': 'AEV_FIS',
  'EDUCACIÓN FÍSICA, RECREACIÓN Y DEPORTES': 'AEV_FIS',
  'EDUCACIÓN FÍSICA Y MOTRICIDAD': 'AEV_FIS',

  // Ética
  'AEV_ETI': 'AEV_ETI',
  'ETICA': 'AEV_ETI',
  'ÉTICA': 'AEV_ETI',
  'ED ETICA': 'AEV_ETI',
  'ED ÉTICA': 'AEV_ETI',
  'ED. ETICA': 'AEV_ETI',
  'ED. ÉTICA': 'AEV_ETI',
  'ETICA Y VALORES': 'AEV_ETI',
  'ÉTICA Y VALORES': 'AEV_ETI',
  'ÉTICA Y VALORES HUMANOS': 'AEV_ETI',
  'EDUCACIÓN ÉTICA Y EN VALORES HUMANOS': 'AEV_ETI',

  // Religión
  'AEV_REL': 'AEV_REL',
  'RELIGION': 'AEV_REL',
  'RELIGIÓN': 'AEV_REL',
  'EDUC. RELIGIOSA': 'AEV_REL',
  'EDUCACION RELIGIOSA': 'AEV_REL',
  'EDUCACIÓN RELIGIOSA': 'AEV_REL',
  'EDUCACIÓN RELIGIOSA ESCOLAR': 'AEV_REL',

  // Tecnología
  'TEC_INF': 'TEC_INF',
  'TECNOLOGIA': 'TEC_INF',
  'TECNOLOGÍA': 'TEC_INF',
  'TECNO E INFO': 'TEC_INF',
  'TEC E INFORM': 'TEC_INF',
  'TECN E INFORM': 'TEC_INF',
  'INFORMATICA': 'TEC_INF',
  'INFORMÁTICA': 'TEC_INF',
  'TECNOLOGÍA E INFORMÁTICA': 'TEC_INF',
  'TECNOLOGÍA E INNOVACIÓN INFANTIL': 'TEC_INF',

  // Media Técnica en Audiovisuales
  'EMT_AUD': 'EMT_AUD',
  'AUDIOVISUALES': 'EMT_AUD',
  'CREACION DE AUDIOVISUALES': 'EMT_AUD',
  'CREACIÓN DE AUDIOVISUALES': 'EMT_AUD',
  'MT - AUDIOVISUALES': 'EMT_AUD',
  'MT-AUDIOVISUALES': 'EMT_AUD',
  'MT AUDIOVISUALES': 'EMT_AUD',
  'EDUCACIÓN MEDIA TÉCNICA EN AUDIOVISUALES': 'EMT_AUD',
  'MEDIA TECNICA': 'EMT_AUD',
  'MEDIA TÉCNICA': 'EMT_AUD',
  'MT': 'EMT_AUD',

  // Media Técnica en Bases de Datos
  'EMT_BD': 'EMT_BD',
  'BASES DE DATOS': 'EMT_BD',
  'BASE DE DATOS': 'EMT_BD',
  'MT - BASES DE DATOS': 'EMT_BD',
  'MT-BASES DE DATOS': 'EMT_BD',
  'MT BASES DE DATOS': 'EMT_BD',
  'MEDIA TÉCNICA BASE DE DATOS': 'EMT_BD',
  'MEDIA TECNICA BASE DE DATOS': 'EMT_BD',
  'EDUCACIÓN MEDIA TÉCNICA EN BASES DE DATOS': 'EMT_BD',

  // Media Técnica Audiovisual
  'MEDIA TÉCNICA AUDIOVISUAL': 'EMT_AUD',
  'MEDIA TECNICA AUDIOVISUAL': 'EMT_AUD',

  // Educación Inicial / Transición
  'TRANS_PROP': 'TRANS_PROP',
  'PROPÓSITOS 1, 2, 3 Y 4': 'TRANS_PROP',
  'PROPOSITOS 1, 2, 3 Y 4': 'TRANS_PROP',
  'PROPÓSITOS 1, 2, 3 Y 4 (EDUCACIÓN INICIAL/TRANSICIÓN)': 'TRANS_PROP',
  'PROPOSITOS 1, 2, 3 Y 4 (EDUCACION INICIAL/TRANSICION)': 'TRANS_PROP',
  'DIMENSIONES DEL DESARROLLO': 'TRANS_PROP',
  'TRANS_PROY': 'TRANS_PROY',
  'PROYECTOS LÚDICO PEDAGÓGICOS': 'TRANS_PROY',
  'PROYECTOS LUDICO PEDAGOGICOS': 'TRANS_PROY',
};

/**
 * Reconciles subject with the official teacher registration catalog and MEN catalog.
 * Guarantees immutable officialName for MEN compliance while exposing compressed shortName.
 */
export function reconcileSubjectWithCatalog(
  rawSubject: string | null | undefined,
  officialSubjects?: string[]
): NormalizedSubjectResult {
  const cleaned = cleanRawSubject(rawSubject);
  if (!cleaned) {
    return {
      displayName: 'Sin Asignar',
      shortName: 'Sin Asignar',
      officialName: 'Sin asignación académica',
      isOrphan: false,
      isSpecialBlock: false,
      rawSubject: '',
    };
  }

  const canonical = getCanonicalSubjectName(cleaned);

  // Check if it's a non-class institutional block (exit, break, etc.)
  const isSpecialBlock =
    canonical === 'Sin asignación académica' ||
    canonical === 'Salida 12:10' ||
    canonical === 'Descanso Pedagógico' ||
    canonical.toLowerCase().includes('descanso') ||
    canonical.toLowerCase().includes('salida') ||
    canonical.toLowerCase().includes('sin asignaci');

  if (isSpecialBlock) {
    const isDescanso = canonical.toLowerCase().includes('descanso');
    const shortLabel = isDescanso ? 'Descanso' : 'Sin Asignar';
    const officialLabel = isDescanso ? 'Descanso Pedagógico' : 'Sin asignación académica';
    return {
      displayName: shortLabel,
      shortName: shortLabel,
      officialName: officialLabel,
      isOrphan: false,
      isSpecialBlock: true,
      rawSubject: cleaned,
      matchedOfficialSubject: officialLabel,
    };
  }

  // 1. Direct resolution via OFFICIAL_SUBJECT_ID_MAP (high priority & exact)
  const upperClean = cleaned.toUpperCase();
  const upperCanonical = canonical.toUpperCase();
  const directId = OFFICIAL_SUBJECT_ID_MAP[upperClean] || OFFICIAL_SUBJECT_ID_MAP[upperCanonical];

  if (directId) {
    const materia = ALL_OFFICIAL_MATERIAS.find((m) => m.id === directId);
    if (materia) {
      return {
        displayName: materia.shortName,
        shortName: materia.shortName,
        officialName: materia.officialName,
        isOrphan: false,
        isSpecialBlock: false,
        rawSubject: cleaned,
        matchedOfficialSubject: materia.officialName,
        materiaOficial: materia,
      };
    }
  }

  // 2. Lookup against ALL_OFFICIAL_MATERIAS master catalog (by ID, officialName, or shortName)
  const masterMatch = findOfficialSubject(canonical) || findOfficialSubject(cleaned);
  if (masterMatch) {
    return {
      displayName: masterMatch.shortName,
      shortName: masterMatch.shortName,
      officialName: masterMatch.officialName,
      isOrphan: false,
      isSpecialBlock: false,
      rawSubject: cleaned,
      matchedOfficialSubject: masterMatch.officialName,
      materiaOficial: masterMatch,
    };
  }

  // 3. Fallback: match against contextual teacher registration roster (if provided)
  if (officialSubjects && officialSubjects.length > 0) {
    const canonicalKey = normalizeCompare(canonical);
    const matched = officialSubjects.find((official) => {
      const offKey = normalizeCompare(official);
      return (
        offKey === canonicalKey ||
        offKey.includes(canonicalKey) ||
        canonicalKey.includes(offKey)
      );
    });

    if (matched) {
      const matchedMateria = findOfficialSubject(matched);
      const shortName = matchedMateria ? matchedMateria.shortName : canonical;
      const officialName = matchedMateria ? matchedMateria.officialName : matched;

      return {
        displayName: shortName,
        shortName,
        officialName,
        isOrphan: false,
        isSpecialBlock: false,
        rawSubject: cleaned,
        matchedOfficialSubject: matched,
        materiaOficial: matchedMateria,
      };
    }
  }

  // 4. Orphan subject: Has no backing in the teacher registration roster or MEN catalog
  return {
    displayName: cleaned,
    shortName: cleaned,
    officialName: cleaned,
    isOrphan: true,
    isSpecialBlock: false,
    rawSubject: cleaned,
  };
}
