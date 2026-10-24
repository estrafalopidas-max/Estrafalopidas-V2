import { IAbsenceRequestRepository } from '../../domain/repositories/iabsence-request.repository';
import { AbsenceRequestEntity, AbsenceStatus } from '../../domain/entities/absence-request.entity';

const LS_BACKUP_KEY = 'ievf_absence_requests_v1';
const EVENT_NAME = 'absence_requests_updated';

export class FirestoreAbsenceRequestRepository implements IAbsenceRequestRepository {
  async getAll(): Promise<AbsenceRequestEntity[]> {
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async getPending(): Promise<AbsenceRequestEntity[]> {
    const all = await this.getAll();
    return all.filter((r) => r.status === 'pending');
  }

  async getById(id: string): Promise<AbsenceRequestEntity | null> {
    const all = await this.getAll();
    return all.find((r) => r.id === id) || null;
  }

  async create(data: Omit<AbsenceRequestEntity, 'id'>): Promise<AbsenceRequestEntity> {
    const id = `abs-req-${Date.now()}`;
    const newDoc: AbsenceRequestEntity = { id, ...data };

    const all = await this.getAll();
    all.unshift(newDoc);
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event(EVENT_NAME));

    return newDoc;
  }

  async updateStatus(
    id: string,
    status: AbsenceStatus,
    reviewer: string,
    replacementTeacherId?: string | null,
    replacementTeacherName?: string | null,
    notes?: string | null
  ): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex((r) => r.id === id);
    const now = new Date().toISOString();

    const partial: Partial<AbsenceRequestEntity> = {
      status,
      reviewed_by: reviewer,
      reviewed_at: now,
      replacement_teacher_id: replacementTeacherId || null,
      replacement_teacher_name: replacementTeacherName || null,
      review_notes: notes || null,
    };

    if (idx !== -1) {
      all[idx] = { ...all[idx], ...partial };
      localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(all));
      window.dispatchEvent(new Event(EVENT_NAME));
    }
  }

  subscribe(callback: (requests: AbsenceRequestEntity[]) => void): () => void {
    callback(this.getFallbackData());

    const handler = () => callback(this.getFallbackData());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener('storage', handler);
    };
  }

  private getFallbackData(): AbsenceRequestEntity[] {
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}
