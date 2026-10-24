/**
 * Domain Entity: Incidence (Novedades & Broadcast Board)
 * Oficial Unidirectional Communication Channel from Coordination to Teachers
 */

export type IncidenceType = 'Aviso' | 'Incapacidad' | 'Permiso' | 'Urgencia';

export interface IncidenceEntity {
  id: string;
  type: IncidenceType;
  title: string;
  description: string;
  target: 'Todos' | string; // 'Todos' o Docente Específico (Nombre o ID)
  targetTeacherId?: string;
  targetTeacherName?: string;
  date: string; // ISO / YYYY-MM-DD (Fecha de emisión o vigencia)
  expirationDate: string; // ISO / YYYY-MM-DD (Fecha límite para visualización por defecto)
  authorName?: string;
  createdAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
}

/**
 * Mobile Broadcast DTO (Estructura de API preparada para clientes móviles)
 */
export interface MobileIncidenceDto {
  id: string;
  category: IncidenceType;
  headline: string;
  body: string;
  recipient: string;
  recipientId?: string;
  publishDate: string;
  expiryDate: string;
  isActive: boolean;
}
