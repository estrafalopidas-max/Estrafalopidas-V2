/**
 * Teacher Color Service - Paleta Curada y Motor Anti-Colisión (Selección sin Reemplazo)
 * 
 * Sustituye el motor matemático HSL por una paleta curada de alto contraste visual
 * que alterna deliberadamente entre tonos oscuros, medios y claros.
 */

/**
 * Paleta Curada Institucional I.E. Villa Flora
 * Al menos 40 códigos HEX alternando estrictamente entre tonos oscuros, medios y claros
 * de cada color base para forzar el máximo contraste visual.
 */
export const VILLA_FLORA_PALETTE: readonly string[] = [
  '#1E3A8A', // 1. Azul Marino Oscuro (White text)
  '#60A5FA', // 2. Azul Cielo Claro (Black text)
  '#14532D', // 3. Verde Bosque Oscuro (White text)
  '#34D399', // 4. Verde Menta Claro (Black text)
  '#7F1D1D', // 5. Rojo Carmesí Oscuro (White text)
  '#F87171', // 6. Coral Claro (Black text)
  '#4C1D95', // 7. Púrpura Imperial Oscuro (White text)
  '#A78BFA', // 8. Lavanda Claro (Black text)
  '#78350F', // 9. Ámbar Chocolate Oscuro (White text)
  '#FBBF24', // 10. Ámbar Dorado Claro (Black text)
  '#0E7490', // 11. Cian Profundo Oscuro (White text)
  '#38BDF8', // 12. Celeste Brillante (Black text)
  '#831843', // 13. Rosa Frambuesa Oscuro (White text)
  '#F472B6', // 14. Rosa Pastel Claro (Black text)
  '#312E81', // 15. Índigo Oscuro (White text)
  '#818CF8', // 16. Índigo Pálido Claro (Black text)
  '#7C2D12', // 17. Naranja Óxido Oscuro (White text)
  '#FB923C', // 18. Naranja Vivo Claro (Black text)
  '#064E3B', // 19. Verde Esmeralda Oscuro (White text)
  '#6EE7B7', // 20. Verde Esmeralda Claro (Black text)
  '#581C87', // 21. Morado Berenjena Oscuro (White text)
  '#C084FC', // 22. Violeta Lila Claro (Black text)
  '#134E4A', // 23. Teal Petróleo Oscuro (White text)
  '#2DD4BF', // 24. Turquesa Menta Claro (Black text)
  '#854D0E', // 25. Mostaza Oscuro (White text)
  '#FDE047', // 26. Amarillo Sol Claro (Black text)
  '#0F172A', // 27. Azul Grisáceo / Pizarra Oscuro (White text)
  '#94A3B8', // 28. Gris Acero Claro (Black text)
  '#701A75', // 29. Fucsia Ciruela Oscuro (White text)
  '#E879F9', // 30. Fucsia Neón Claro (Black text)
  '#365314', // 31. Verde Oliva Oscuro (White text)
  '#A3E635', // 32. Lima Brillante Claro (Black text)
  '#1E1B4B', // 33. Azul Noche Profundo (White text)
  '#93C5FD', // 34. Azul Bebé Claro (Black text)
  '#991B1B', // 35. Rojo Rubí Oscuro (White text)
  '#FCA5A5', // 36. Salmón Claro (Black text)
  '#3730A3', // 37. Azul Cobalto Oscuro (White text)
  '#A5B4FC', // 38. Azul Iris Claro (Black text)
  '#166534', // 39. Verde Trébol Oscuro (White text)
  '#86EFAC', // 40. Verde Manzana Claro (Black text)
  '#9A3412', // 41. Terracota Oscuro (White text)
  '#FDBA74', // 42. Melocotón Claro (Black text)
  '#86198F', // 43. Púrpura Magenta Oscuro (White text)
  '#F0ABFC', // 44. Orquídea Suave Claro (Black text)
  '#0F766E', // 45. Verde Pino Oscuro (White text)
  '#5EEAD4', // 46. Aguamarina Claro (Black text)
  '#B45309', // 47. Ocre Ámbar Oscuro (White text)
  '#FCD34D', // 48. Dorado Cálido Claro (Black text)
];

/**
 * Converts Hex string to RGB numbers [r, g, b].
 */
export function hexToRgb(hexColor: string): [number, number, number] {
  let hex = hexColor.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) return [0, 125, 197];
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return [isNaN(r) ? 0 : r, isNaN(g) ? 125 : g, isNaN(b) ? 197 : b];
}

/**
 * Motor Anti-Colisión (Selección sin reemplazo):
 * Lee los colores ya asignados en la base de datos y los elimina de las opciones disponibles:
 * const availableColors = VILLA_FLORA_PALETTE.filter(color => !usedColors.includes(color));
 * El sistema asigna el primer tono disponible de esa lista filtrada.
 */
export function getNextAvailableTeacherColor(usedColors: string[]): string {
  const normalizedUsed = new Set(
    usedColors
      .filter(Boolean)
      .map((c) => c.trim().toUpperCase())
  );

  const availableColors = VILLA_FLORA_PALETTE.filter(
    (color) => !normalizedUsed.has(color.toUpperCase())
  );

  if (availableColors.length > 0) {
    return availableColors[0];
  }

  // Si se agotan los 48 tonos de la paleta, reiniciar ciclando ordenadamente
  return VILLA_FLORA_PALETTE[usedColors.length % VILLA_FLORA_PALETTE.length];
}

/**
 * Deterministic hash function for teacher strings.
 * Normalizes accents so 'Ómar' and 'Omar' resolve to the exact same hash.
 */
export function hashTeacherString(str: string): number {
  const normalized = str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Fallback determinista que asigna un tono de VILLA_FLORA_PALETTE
 * para registros donde no hay asignación previa en base de datos.
 */
export function getTeacherDeterministicColor(teacherIdOrName: string): string {
  const hash = hashTeacherString(teacherIdOrName);
  return VILLA_FLORA_PALETTE[hash % VILLA_FLORA_PALETTE.length];
}

/**
 * Mantenimiento de Contraste Tipográfico (WCAG ITU-R BT.601):
 * Computa la luminancia percibida del color hexadecimal.
 * Asigna estrictamente texto blanco ('text-white') a tonos oscuros (Y <= 150)
 * y texto negro ('text-gray-900') a tonos claros (Y > 150) para garantizar legibilidad.
 */
export function calculateLuminanceContrast(color: string | null | undefined): 'text-white' | 'text-gray-900' {
  if (!color) return 'text-white';
  const [r, g, b] = hexToRgb(color);

  // Fórmula de luminancia percibida ITU-R BT.601
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 150 ? 'text-gray-900' : 'text-white';
}
