import { IUserRepository } from '../../domain/repositories/iuser.repository';
import { UserEntity, UserRole } from '../../domain/entities/user.entity';
import {
  getTeacherExcelIdentity,
  sortTeachersWithLowPriorityLast,
  updateTeacherDictionaryProfile,
} from '../../domain/services/teacher-normalization.service';

const LS_BACKUP_KEY = 'ievf_users_v1';
const LS_DELETED_TEACHERS_KEY = 'ievf_deleted_teacher_ids_v1';

function getDeletedTeacherIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_DELETED_TEACHERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((id: any) => String(id)));
      }
    }
  } catch {
    // ignore
  }
  return new Set<string>();
}

function isRemovedTeacher(u: Partial<UserEntity> | null | undefined, deletedIds: Set<string>): boolean {
  if (!u) return true;
  if (u.id && deletedIds.has(u.id)) return true;
  if (u.id === 't-adriana-mier') return true;
  const name = (u.displayName || u.shortName || '').toLowerCase();
  return name.includes('adriana mier') || name.includes('adriana lucía mier') || name.includes('adriana lucia mier');
}

function normalizeUserRecord(u: UserEntity & { userEdited?: boolean }): UserEntity {
  if (u.userEdited) {
    const hex = u.color_hex || u.color || '#007DC5';
    updateTeacherDictionaryProfile(u.id, {
      fullName: u.displayName,
      shortName: u.shortName,
      colorHex: hex,
      groupDirection: u.groupDirection,
    });
    return {
      ...u,
      color: hex,
      color_hex: hex,
      avatarColor: hex,
      maxWeeklyHours: !u.maxWeeklyHours ? 24 : u.maxWeeklyHours,
    };
  }

  let shortName = u.shortName;
  if (u.id === 't-m-isabel') shortName = 'Mª Isabel Giraldo';
  if (u.id === 't-alejandra') shortName = 'Alejandra Pérez';
  if (u.id === 't-betty') shortName = 'Betty Vásquez';
  const lockedColor =
    u.color_hex ||
    u.color ||
    getTeacherExcelIdentity(u.id, u.displayName).color_hex ||
    '#007DC5';
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
    const deletedIds = getDeletedTeacherIds();
    return sortTeachersWithLowPriorityLast(
      parsed.filter((u) => !isRemovedTeacher(u, deletedIds)).map(normalizeUserRecord)
    );
  }

  async getTeachers(): Promise<UserEntity[]> {
    const all = await this.getAll();
    return all.filter((u) => (!u.role || u.role === 'teacher') && u.isActive !== false);
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
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    const localUsers: any[] = raw ? JSON.parse(raw) : [];
    const entry = { ...user, userEdited: true };
    localUsers.push(entry);
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(localUsers));
    updateTeacherDictionaryProfile(user.id, {
      fullName: user.displayName,
      shortName: user.shortName,
      colorHex: user.color_hex || user.color,
      groupDirection: user.groupDirection,
    });
    window.dispatchEvent(new Event('users_collection_updated'));
    window.dispatchEvent(new Event('schedule_matrix_updated'));
    return entry;
  }

  async update(id: string, partial: Partial<UserEntity>): Promise<void> {
    const now = new Date().toISOString();

    try {
      const raw = localStorage.getItem(LS_BACKUP_KEY);
      const localUsers: any[] = raw ? JSON.parse(raw) : [];
      const localIdx = localUsers.findIndex((u) => u.id === id);

      const prevRecord = localIdx !== -1 ? localUsers[localIdx] : null;
      const merged = {
        ...(prevRecord || { id }),
        ...partial,
        id,
        userEdited: true,
        updatedAt: now,
      };

      if (localIdx !== -1) {
        localUsers[localIdx] = merged;
      } else {
        localUsers.push(merged);
      }

      localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(localUsers));

      const newHex = merged.color_hex || merged.color;
      if (newHex) {
        try {
          const lockedRaw = localStorage.getItem('ievf_locked_teacher_colors_v1');
          const lockedMap = lockedRaw ? JSON.parse(lockedRaw) : {};
          lockedMap[id] = newHex;
          localStorage.setItem('ievf_locked_teacher_colors_v1', JSON.stringify(lockedMap));
        } catch {
          // ignore
        }
      }

      updateTeacherDictionaryProfile(id, {
        fullName: merged.displayName,
        shortName: merged.shortName,
        colorHex: newHex,
        groupDirection: merged.groupDirection,
      });

      // Actualizar nombre corto en bloques horarios existentes de este docente
      const nextShort = merged.shortName || merged.displayName;
      if (nextShort) {
        for (const matrixKey of ['ievf_time_blocks_v1', 'villaFloraMatrix']) {
          try {
            const rawBlocks = localStorage.getItem(matrixKey);
            if (rawBlocks) {
              const blocks = JSON.parse(rawBlocks);
              if (Array.isArray(blocks)) {
                let changedBlocks = false;
                const updatedBlocks = blocks.map((b: any) => {
                  const matchById = b.teacherId === id;
                  const matchByOldName =
                    prevRecord &&
                    (b.teacherName === prevRecord.shortName ||
                      b.teacherName === prevRecord.displayName);
                  if (matchById || matchByOldName) {
                    changedBlocks = true;
                    return {
                      ...b,
                      teacherId: id,
                      teacherName: nextShort,
                    };
                  }
                  return b;
                });
                if (changedBlocks) {
                  localStorage.setItem(matrixKey, JSON.stringify(updatedBlocks));
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }

      window.dispatchEvent(new Event('users_collection_updated'));
      window.dispatchEvent(new Event('schedule_matrix_updated'));
    } catch (e) {
      console.warn('[FirestoreUserRepo] Local update error:', e);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const deletedIds = getDeletedTeacherIds();
      deletedIds.add(id);
      localStorage.setItem(LS_DELETED_TEACHERS_KEY, JSON.stringify(Array.from(deletedIds)));

      const raw = localStorage.getItem(LS_BACKUP_KEY);
      const localUsers: any[] = raw ? JSON.parse(raw) : [];
      const targetUser = localUsers.find((u) => u.id === id);
      const filteredUsers = localUsers.filter((u) => u.id !== id);
      localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(filteredUsers));

      // Desasignar bloques horarios que pertenecían al docente eliminado
      for (const matrixKey of ['ievf_time_blocks_v1', 'villaFloraMatrix']) {
        try {
          const rawBlocks = localStorage.getItem(matrixKey);
          if (rawBlocks) {
            const blocks = JSON.parse(rawBlocks);
            if (Array.isArray(blocks)) {
              let changedBlocks = false;
              const updatedBlocks = blocks.map((b: any) => {
                const matchById = b.teacherId === id;
                const matchByName =
                  targetUser &&
                  (b.teacherName === targetUser.shortName ||
                    b.teacherName === targetUser.displayName);
                if (matchById || matchByName) {
                  changedBlocks = true;
                  return {
                    ...b,
                    teacherId: 'unassigned',
                    teacherName: 'Sin Asignar',
                  };
                }
                return b;
              });
              if (changedBlocks) {
                localStorage.setItem(matrixKey, JSON.stringify(updatedBlocks));
              }
            }
          }
        } catch {
          // ignore
        }
      }

      window.dispatchEvent(new Event('users_collection_updated'));
      window.dispatchEvent(new Event('schedule_matrix_updated'));
    } catch (e) {
      console.warn('[FirestoreUserRepo] Local delete error:', e);
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
    const deletedIds = getDeletedTeacherIds();
    return sortTeachersWithLowPriorityLast(
      parsed.filter((u) => !isRemovedTeacher(u, deletedIds)).map(normalizeUserRecord)
    );
  }
}
