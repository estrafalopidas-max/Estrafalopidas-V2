import { TimeBlockEntity, DayOfWeek } from '../entities/time-block.entity';
import { ShiftType } from '../entities/grade.entity';

export interface ITimeBlockRepository {
  getAll(): Promise<TimeBlockEntity[]>;
  getByDayAndShift(day: DayOfWeek, shift: ShiftType): Promise<TimeBlockEntity[]>;
  getById(id: string): Promise<TimeBlockEntity | null>;
  update(id: string, partial: Partial<TimeBlockEntity>): Promise<void>;
  updateBatch(updates: { id: string; data: Partial<TimeBlockEntity> }[]): Promise<void>;
  subscribe(callback: (blocks: TimeBlockEntity[]) => void): () => void;
}
