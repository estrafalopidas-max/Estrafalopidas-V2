import { IClassroomRepository } from '../../domain/repositories/iclassroom.repository';
import { ClassroomEntity } from '../../domain/entities/classroom.entity';

const LS_BACKUP_KEY = 'ievf_classrooms_v1';

export class FirestoreClassroomRepository implements IClassroomRepository {
  async getAll(): Promise<ClassroomEntity[]> {
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async getById(id: string): Promise<ClassroomEntity | null> {
    const all = await this.getAll();
    return all.find((c) => c.id === id) || null;
  }

  async getActive(): Promise<ClassroomEntity[]> {
    const all = await this.getAll();
    return all.filter((c) => c.isActive);
  }
}
