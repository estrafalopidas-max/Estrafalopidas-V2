import { UserEntity, UserRole } from '../entities/user.entity';

export interface IUserRepository {
  getAll(): Promise<UserEntity[]>;
  getTeachers(): Promise<UserEntity[]>;
  getPendingTeachers(): Promise<UserEntity[]>;
  getById(id: string): Promise<UserEntity | null>;
  getByRole(role: UserRole): Promise<UserEntity[]>;
  create(user: UserEntity): Promise<UserEntity>;
  update(id: string, partial: Partial<UserEntity>): Promise<void>;
  subscribe(callback: (users: UserEntity[]) => void): () => void;
}
