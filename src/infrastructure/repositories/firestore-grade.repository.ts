import { IGradeRepository } from '../../domain/repositories/igrade.repository';
import { GradeEntity, ShiftType } from '../../domain/entities/grade.entity';

const LS_BACKUP_KEY = 'ievf_grades_v1';

export class FirestoreGradeRepository implements IGradeRepository {
  async getAll(): Promise<GradeEntity[]> {
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async getByShift(shift: ShiftType): Promise<GradeEntity[]> {
    const all = await this.getAll();
    return all.filter((g) => g.shift === shift);
  }

  async getById(id: string): Promise<GradeEntity | null> {
    const all = await this.getAll();
    return all.find((g) => g.id === id) || null;
  }
}
