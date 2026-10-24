import { IIncidenceRepository } from '../../domain/repositories/iincidence.repository';
import { IncidenceEntity, MobileIncidenceDto } from '../../domain/entities/incidence.entity';

const LS_BACKUP_KEY = 'ievf_incidences_v1';
const EVENT_NAME = 'incidences_updated';

const SEED_INCIDENCES: IncidenceEntity[] = [
  {
    id: 'inc-101',
    type: 'Aviso',
    title: 'Circular 018: Cronograma de Cierre de Notas Tercer Periodo',
    description: 'Se recuerda a todo el cuerpo docente que la plataforma institucional estará habilitada para la digitación de juicios valorativos y nivelaciones hasta el viernes a las 18:00.',
    target: 'Todos',
    date: '2026-10-18',
    expirationDate: '2026-10-31',
    authorName: 'Coordinación Académica',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'inc-102',
    type: 'Urgencia',
    title: 'Comité de Convivencia Extraordinario - Grado 9°',
    description: 'Reunión urgente en sala de profesores a las 10:15 am para tratar situación de convivencia escolar con presencia de orientación escolar y directores de grupo.',
    target: 'Todos',
    date: '2026-10-18',
    expirationDate: '2026-10-22',
    authorName: 'Rectoría & Coordinación',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'inc-103',
    type: 'Incapacidad',
    title: 'Reporte de Incapacidad Médica (3 Días)',
    description: 'Incapacidad certificada por EPS para docente de área fundamental. Requiere cobertura y activación de talleres autónomos en grados correspondientes.',
    target: 'CARLOS MARIO RAMIREZ',
    targetTeacherName: 'CARLOS MARIO RAMIREZ',
    date: '2026-10-17',
    expirationDate: '2026-10-23',
    authorName: 'Coordinación Académica',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'inc-104',
    type: 'Permiso',
    title: 'Permiso Sindical ASDET - Participación en Mesa Directiva',
    description: 'Permiso institucional concedido de conformidad con la normativa docente para representación ante secretaría de educación.',
    target: 'LUZ STELLA VALENCIA',
    targetTeacherName: 'LUZ STELLA VALENCIA',
    date: '2026-10-01',
    expirationDate: '2026-10-05',
    authorName: 'Secretaría de Educación',
    createdAt: new Date('2026-10-01T08:00:00Z').toISOString(),
  },
  {
    id: 'inc-105',
    type: 'Aviso',
    title: 'Capacitación en Herramientas Digitales y Plan Lector',
    description: 'Taller formativo de actualización pedagógica impartido en aula múltiple con registro de asistencia obligatorio.',
    target: 'Todos',
    date: '2026-09-20',
    expirationDate: '2026-09-25',
    authorName: 'Coordinación Académica',
    createdAt: new Date('2026-09-20T09:00:00Z').toISOString(),
  },
];

export class FirestoreIncidenceRepository implements IIncidenceRepository {
  private getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async getAll(): Promise<IncidenceEntity[]> {
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error('[FirestoreIncidenceRepo] Error parsing cached incidences:', e);
      }
    }

    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(SEED_INCIDENCES));
    return SEED_INCIDENCES;
  }

  async getActive(referenceDate?: string): Promise<IncidenceEntity[]> {
    const all = await this.getAll();
    const today = referenceDate || this.getTodayString();
    return all.filter((inc) => inc.expirationDate >= today);
  }

  async getHistorical(referenceDate?: string): Promise<IncidenceEntity[]> {
    const all = await this.getAll();
    const today = referenceDate || this.getTodayString();
    return all.filter((inc) => inc.expirationDate < today);
  }

  async getByTarget(target: string): Promise<IncidenceEntity[]> {
    const all = await this.getAll();
    return all.filter(
      (inc) =>
        inc.target === 'Todos' ||
        inc.target.toLowerCase() === target.toLowerCase() ||
        (inc.targetTeacherName && inc.targetTeacherName.toLowerCase() === target.toLowerCase())
    );
  }

  async create(data: Omit<IncidenceEntity, 'id'>): Promise<IncidenceEntity> {
    const id = `inc-${Date.now()}`;
    const newDoc: IncidenceEntity = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };

    const all = await this.getAll();
    const updated = [newDoc, ...all];
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event(EVENT_NAME));

    return newDoc;
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    const filtered = all.filter((item) => item.id !== id);
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new Event(EVENT_NAME));
  }

  subscribe(callback: (incidences: IncidenceEntity[]) => void): () => void {
    const handler = async () => {
      const items = await this.getAll();
      callback(items);
    };

    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener('storage', handler);

    this.getAll().then(callback);

    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener('storage', handler);
    };
  }
}

export const incidenceRepository = new FirestoreIncidenceRepository();

export const DummyMobileIncidenceApi = {
  async getFeedForTeacher(teacherIdOrName: string): Promise<{
    statusCode: number;
    success: boolean;
    timestamp: string;
    total: number;
    data: MobileIncidenceDto[];
  }> {
    const repo = new FirestoreIncidenceRepository();
    const active = await repo.getActive();
    const targeted = active.filter(
      (item) =>
        item.target === 'Todos' ||
        item.target.toLowerCase() === teacherIdOrName.toLowerCase() ||
        (item.targetTeacherName && item.targetTeacherName.toLowerCase() === teacherIdOrName.toLowerCase()) ||
        item.targetTeacherId === teacherIdOrName
    );

    const mapped: MobileIncidenceDto[] = targeted.map((item) => ({
      id: item.id,
      category: item.type,
      headline: item.title,
      body: item.description,
      recipient: item.target,
      recipientId: item.targetTeacherId,
      publishDate: item.date,
      expiryDate: item.expirationDate,
      isActive: true,
    }));

    return {
      statusCode: 200,
      success: true,
      timestamp: new Date().toISOString(),
      total: mapped.length,
      data: mapped,
    };
  },

  async getActiveBroadcast(): Promise<{
    statusCode: number;
    success: boolean;
    timestamp: string;
    data: MobileIncidenceDto[];
  }> {
    const repo = new FirestoreIncidenceRepository();
    const active = await repo.getActive();
    return {
      statusCode: 200,
      success: true,
      timestamp: new Date().toISOString(),
      data: active.map((item) => ({
        id: item.id,
        category: item.type,
        headline: item.title,
        body: item.description,
        recipient: item.target,
        recipientId: item.targetTeacherId,
        publishDate: item.date,
        expiryDate: item.expirationDate,
        isActive: true,
      })),
    };
  },
};
