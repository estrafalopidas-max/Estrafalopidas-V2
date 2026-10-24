import { ITimeBlockRepository } from '../../domain/repositories/itime-block.repository';
import { TimeBlockEntity, DayOfWeek } from '../../domain/entities/time-block.entity';
import { ShiftType } from '../../domain/entities/grade.entity';

const PRIMARY_LS_KEY = 'villaFloraMatrix';
const BACKUP_LS_KEY = 'ievf_time_blocks_v1';

export class FirestoreTimeBlockRepository implements ITimeBlockRepository {
  async getAll(): Promise<TimeBlockEntity[]> {
    const raw = localStorage.getItem(PRIMARY_LS_KEY) || localStorage.getItem(BACKUP_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async getByDayAndShift(day: DayOfWeek, shift: ShiftType): Promise<TimeBlockEntity[]> {
    const all = await this.getAll();
    return all.filter((b) => b.dayOfWeek === day && b.shift === shift);
  }

  async getById(id: string): Promise<TimeBlockEntity | null> {
    const all = await this.getAll();
    return all.find((b) => b.id === id) || null;
  }

  async update(id: string, partial: Partial<TimeBlockEntity>): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex((b) => b.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...partial, updatedAt: new Date().toISOString() };
      localStorage.setItem(PRIMARY_LS_KEY, JSON.stringify(all));
      localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(all));
      window.dispatchEvent(new Event('schedule_matrix_updated'));
    }
  }

  async updateBatch(updates: { id: string; data: Partial<TimeBlockEntity> }[]): Promise<void> {
    const all = await this.getAll();
    const now = new Date().toISOString();

    updates.forEach(({ id, data }) => {
      const idx = all.findIndex((b) => b.id === id);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...data, updatedAt: now };
      }
    });

    localStorage.setItem(PRIMARY_LS_KEY, JSON.stringify(all));
    localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event('schedule_matrix_updated'));
  }

  subscribe(callback: (blocks: TimeBlockEntity[]) => void): () => void {
    callback(this.getFallbackData());

    const handler = () => callback(this.getFallbackData());
    window.addEventListener('schedule_matrix_updated', handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener('schedule_matrix_updated', handler);
      window.removeEventListener('storage', handler);
    };
  }

  private getFallbackData(): TimeBlockEntity[] {
    const raw = localStorage.getItem(PRIMARY_LS_KEY) || localStorage.getItem(BACKUP_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}
