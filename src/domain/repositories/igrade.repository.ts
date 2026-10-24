import { GradeEntity, ShiftType } from '../entities/grade.entity';

export interface IGradeRepository {
  getAll(): Promise<GradeEntity[]>;
  getByShift(shift: ShiftType): Promise<GradeEntity[]>;
  getById(id: string): Promise<GradeEntity | null>;
}
