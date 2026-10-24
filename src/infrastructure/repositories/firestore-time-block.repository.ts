import { ITimeBlockRepository } from '../../domain/repositories/itime-block.repository';
import { TimeBlockEntity, DayOfWeek } from '../../domain/entities/time-block.entity';
import { ShiftType } from '../../domain/entities/grade.entity';
import { resolveCanonicalGradeName, resolveCanonicalShift } from '../../domain/services/grade-normalization.service';

const PRIMARY_LS_KEY = 'villaFloraMatrix';
const BACKUP_LS_KEY = 'ievf_time_blocks_v1';

function syncPublicSnapshotBlocks(allBlocks: TimeBlockEntity[]): void {
  try {
    if (allBlocks.length > 0) {
      localStorage.removeItem('ievf_blank_matrix_mode');
    }
    const nowStr = String(Date.now());
    localStorage.setItem('ievf_local_schedule_updated_at', nowStr);
    localStorage.setItem('ievf_cloud_schedule_fetched_at', nowStr);
    const snapRaw = localStorage.getItem('ievf_public_schedule_snapshot');
    if (snapRaw) {
      const snap = JSON.parse(snapRaw);
      if (snap && typeof snap === 'object') {
        snap.timeBlocks = allBlocks;
        if (snap.metadata) {
          snap.metadata.totalBlocks = allBlocks.length;
          snap.metadata.lastUpdated = new Date().toLocaleString('es-CO', {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        }
        localStorage.setItem('ievf_public_schedule_snapshot', JSON.stringify(snap));
        window.dispatchEvent(new Event('public_schedule_snapshot_updated'));
      }
    }
  } catch {
    // ignore snapshot sync error
  }
}

export class FirestoreTimeBlockRepository implements ITimeBlockRepository {
  async getAll(): Promise<TimeBlockEntity[]> {
    const raw = localStorage.getItem(PRIMARY_LS_KEY) || localStorage.getItem(BACKUP_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async getByDayAndShift(day: DayOfWeek, shift: ShiftType): Promise<TimeBlockEntity[]> {
    const all = await this.getAll();
    return all.filter((b) => b.dayOfWeek === day && b.shift === shift);
  }

  async getById(id: string): Promise<TimeBlockEntity | null> {
    const all = await this.getAll();
    return all.find((b) => b.id === id) || null;
  }

  async update(id: string, partial: Partial<TimeBlockEntity>): Promise<void> {
    const all = await this.getAll();
    const now = new Date().toISOString();
    let idx = all.findIndex((b) => b.id === id);

    if (idx === -1 && partial.gradeId && partial.dayOfWeek && partial.period !== undefined) {
      idx = all.findIndex(
        (b) =>
          b.gradeId === partial.gradeId &&
          b.dayOfWeek === partial.dayOfWeek &&
          b.period === partial.period
      );
    }

    if (idx !== -1) {
      const merged: TimeBlockEntity = {
        ...all[idx],
        ...partial,
        id,
        updatedAt: now,
      };
      merged.gradeName = resolveCanonicalGradeName(merged) || merged.gradeName;
      merged.shift = resolveCanonicalShift(merged);
      all[idx] = merged;
    } else {
      const created: TimeBlockEntity = {
        id,
        block_type: partial.block_type || 'class',
        dayOfWeek: partial.dayOfWeek || 'lunes',
        period: partial.period ?? 1,
        startTime: partial.startTime || '',
        endTime: partial.endTime || '',
        shift: resolveCanonicalShift({ ...partial, id }),
        gradeId: partial.gradeId || '',
        gradeName: resolveCanonicalGradeName({ ...partial, id }) || partial.gradeName || '',
        subject: partial.subject || 'Clase',
        teacherId: partial.teacherId || 'unassigned',
        teacherName: partial.teacherName || 'Sin Asignar',
        classroomId: partial.classroomId || 'aula-base',
        classroomName: partial.classroomName || 'Aula Base',
        status: partial.status || 'regular',
        motivo_novedad: partial.motivo_novedad ?? null,
        notes: partial.notes ?? null,
        ...partial,
        updatedAt: now,
      } as TimeBlockEntity;
      created.gradeName = resolveCanonicalGradeName(created) || created.gradeName;
      created.shift = resolveCanonicalShift(created);
      all.push(created);
    }

    localStorage.setItem(PRIMARY_LS_KEY, JSON.stringify(all));
    localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(all));
    syncPublicSnapshotBlocks(all);
    window.dispatchEvent(new Event('schedule_matrix_updated'));
  }

  async updateBatch(updates: { id: string; data: Partial<TimeBlockEntity> }[]): Promise<void> {
    const all = await this.getAll();
    const now = new Date().toISOString();

    updates.forEach(({ id, data }) => {
      let idx = all.findIndex((b) => b.id === id);
      if (idx === -1 && data.gradeId && data.dayOfWeek && data.period !== undefined) {
        idx = all.findIndex(
          (b) =>
            b.gradeId === data.gradeId &&
            b.dayOfWeek === data.dayOfWeek &&
            b.period === data.period
        );
      }

      if (idx !== -1) {
        const merged: TimeBlockEntity = {
          ...all[idx],
          ...data,
          id,
          updatedAt: now,
        };
        merged.gradeName = resolveCanonicalGradeName(merged) || merged.gradeName;
        merged.shift = resolveCanonicalShift(merged);
        all[idx] = merged;
      } else {
        const created: TimeBlockEntity = {
          id,
          block_type: data.block_type || 'class',
          dayOfWeek: data.dayOfWeek || 'lunes',
          period: data.period ?? 1,
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          shift: resolveCanonicalShift({ ...data, id }),
          gradeId: data.gradeId || '',
          gradeName: resolveCanonicalGradeName({ ...data, id }) || data.gradeName || '',
          subject: data.subject || 'Clase',
          teacherId: data.teacherId || 'unassigned',
          teacherName: data.teacherName || 'Sin Asignar',
          classroomId: data.classroomId || 'aula-base',
          classroomName: data.classroomName || 'Aula Base',
          status: data.status || 'regular',
          motivo_novedad: data.motivo_novedad ?? null,
          notes: data.notes ?? null,
          ...data,
          updatedAt: now,
        } as TimeBlockEntity;
        created.gradeName = resolveCanonicalGradeName(created) || created.gradeName;
        created.shift = resolveCanonicalShift(created);
        all.push(created);
      }
    });

    localStorage.setItem(PRIMARY_LS_KEY, JSON.stringify(all));
    localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(all));
    syncPublicSnapshotBlocks(all);
    window.dispatchEvent(new Event('schedule_matrix_updated'));
  }

  subscribe(callback: (blocks: TimeBlockEntity[]) => void): () => void {
    callback(this.getFallbackData());

    const handler = () => callback(this.getFallbackData());
    window.addEventListener('schedule_matrix_updated', handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener('schedule_matrix_updated', handler);
      window.removeEventListener('storage', handler);
    };
  }

  private getFallbackData(): TimeBlockEntity[] {
    const raw = localStorage.getItem(PRIMARY_LS_KEY) || localStorage.getItem(BACKUP_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}

