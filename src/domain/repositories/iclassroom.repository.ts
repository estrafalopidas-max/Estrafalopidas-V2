import { ClassroomEntity } from '../entities/classroom.entity';

export interface IClassroomRepository {
  getAll(): Promise<ClassroomEntity[]>;
  getById(id: string): Promise<ClassroomEntity | null>;
  getActive(): Promise<ClassroomEntity[]>;
}
