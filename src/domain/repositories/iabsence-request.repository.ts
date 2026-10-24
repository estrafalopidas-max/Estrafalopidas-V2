import { AbsenceRequestEntity, AbsenceStatus } from '../entities/absence-request.entity';

export interface IAbsenceRequestRepository {
  getAll(): Promise<AbsenceRequestEntity[]>;
  getPending(): Promise<AbsenceRequestEntity[]>;
  getById(id: string): Promise<AbsenceRequestEntity | null>;
  create(request: Omit<AbsenceRequestEntity, 'id'>): Promise<AbsenceRequestEntity>;
  updateStatus(
    id: string,
    status: AbsenceStatus,
    reviewer: string,
    replacementTeacherId?: string | null,
    replacementTeacherName?: string | null,
    notes?: string | null
  ): Promise<void>;
  subscribe(callback: (requests: AbsenceRequestEntity[]) => void): () => void;
}
