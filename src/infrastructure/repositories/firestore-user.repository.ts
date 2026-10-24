import { IUserRepository } from '../../domain/repositories/iuser.repository';
import { UserEntity, UserRole } from '../../domain/entities/user.entity';
import { getTeacherExcelIdentity } from '../../domain/services/teacher-normalization.service';

const LS_BACKUP_KEY = 'ievf_users_v1';

function isRemovedTeacher(u: Partial<UserEntity> | null | undefined): boolean {
  if (!u) return true;
  if (u.id === 't-adriana-mier') return true;
  const name = (u.displayName || u.shortName || '').toLowerCase();
  return name.includes('adriana mier') || name.includes('adriana lucía mier') || name.includes('adriana lucia mier');
}

function normalizeUserRecord(u: UserEntity): UserEntity {
  let shortName = u.shortName;
  if (u.id === 't-m-isabel') shortName = 'Mª Isabel Giraldo';
  if (u.id === 't-alejandra') shortName = 'Alejandra Pérez';
  if (u.id === 't-betty') shortName = 'Betty Vásquez';
  const lockedColor = getTeacherExcelIdentity(u.id, u.displayName).color_hex || u.color_hex || u.color || '#007DC5';
  return {
    ...u,
    shortName,
    color: lockedColor,
    color_hex: lockedColor,
    avatarColor: lockedColor,
    maxWeeklyHours: !u.maxWeeklyHours || u.maxWeeklyHours === 22 ? 24 : u.maxWeeklyHours,
  };
}

export class FirestoreUserRepository implements IUserRepository {
  async getAll(): Promise<UserEntity[]> {
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    if (!raw) return [];
    const parsed: UserEntity[] = JSON.parse(raw);
    return parsed
      .filter((u) => !isRemovedTeacher(u))
      .map(normalizeUserRecord);
  }

  async getTeachers(): Promise<UserEntity[]> {
    const all = await this.getAll();
    return all.filter((u) => u.role === 'teacher' && u.isActive);
  }

  async getPendingTeachers(): Promise<UserEntity[]> {
    const all = await this.getAll();
    return all.filter(
      (u) => u.role === 'teacher' && u.academicAssignmentStatus === 'pending_assignment'
    );
  }

  async getById(id: string): Promise<UserEntity | null> {
    const all = await this.getAll();
    return all.find((u) => u.id === id) || null;
  }

  async getByRole(role: UserRole): Promise<UserEntity[]> {
    const all = await this.getAll();
    return all.filter((u) => u.role === role);
  }

  async create(user: UserEntity): Promise<UserEntity> {
    const all = await this.getAll();
    all.push(user);
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event('users_collection_updated'));
    return user;
  }

  async update(id: string, partial: Partial<UserEntity>): Promise<void> {
    const now = new Date().toISOString();

    try {
      const raw = localStorage.getItem(LS_BACKUP_KEY);
      let localUsers: UserEntity[] = raw ? JSON.parse(raw) : [];
      const localIdx = localUsers.findIndex(
        (u) =>
          u.id === id ||
          (Boolean(partial.displayName) && u.displayName?.toLowerCase() === partial.displayName?.toLowerCase())
      );
      if (localIdx !== -1) {
        localUsers[localIdx] = { ...localUsers[localIdx], ...partial, updatedAt: now };
      } else {
        localUsers.push({ id, ...partial, updatedAt: now } as UserEntity);
      }
      localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(localUsers));
      window.dispatchEvent(new Event('users_collection_updated'));
    } catch (e) {
      console.warn('[FirestoreUserRepo] Local update error:', e);
    }
  }

  subscribe(callback: (users: UserEntity[]) => void): () => void {
    callback(this.getFallbackData());

    const handler = () => callback(this.getFallbackData());
    window.addEventListener('users_collection_updated', handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener('users_collection_updated', handler);
      window.removeEventListener('storage', handler);
    };
  }

  private getFallbackData(): UserEntity[] {
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    if (!raw) return [];
    const parsed: UserEntity[] = JSON.parse(raw);
    return parsed
      .filter((u) => !isRemovedTeacher(u))
      .map(normalizeUserRecord);
  }
}
