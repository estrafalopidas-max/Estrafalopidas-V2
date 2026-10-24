import { IncidenceEntity } from '../entities/incidence.entity';

export interface IIncidenceRepository {
  getAll(): Promise<IncidenceEntity[]>;
  getActive(referenceDate?: string): Promise<IncidenceEntity[]>;
  getHistorical(referenceDate?: string): Promise<IncidenceEntity[]>;
  getByTarget(target: string): Promise<IncidenceEntity[]>;
  create(data: Omit<IncidenceEntity, 'id'>): Promise<IncidenceEntity>;
  delete(id: string): Promise<void>;
  subscribe(callback: (incidences: IncidenceEntity[]) => void): () => void;
}
