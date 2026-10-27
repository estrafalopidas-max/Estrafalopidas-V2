import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, BookOpen, User, MapPin } from 'lucide-react';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import { ClassroomEntity } from '../../../domain/entities/classroom.entity';
import { ALL_OFFICIAL_MATERIAS, findOfficialSubject } from '../../../domain/constants/subjects';
import {
  buildSlotEditUpdatePayload,
  resolveTeacherDefaultSubject,
} from '../../../domain/services/batch-cell-assignment.service';
import { isLowPriorityListingTeacher } from '../../../domain/services/teacher-visual-identity.service';
import {
  getSuggestedClassroomsForSlot,
  SPECIAL_SCHOOL_SPACES,
} from '../../../domain/services/grade-normalization.service';

export interface SlotEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  block: TimeBlockEntity | null;
  allBlocks: TimeBlockEntity[];
  teachers: UserEntity[];
  classrooms: ClassroomEntity[];
  onSave: (updates: any) => Promise<void>;
}

export const SlotEditModal: React.FC<SlotEditModalProps> = ({
  isOpen,
  onClose,
  block,
  allBlocks,
  teachers,
  classrooms,
  onSave,
}) => {
  const [subject, setSubject] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [classroomName, setClassroomName] = useState('');
  const [saving, setSaving] = useState(false);

  const sortedTeachers = useMemo(() => {
    return [...teachers]
      .filter((t) => t.role === 'teacher' && t.isActive !== false)
      .sort((a, b) => {
        const lowA = isLowPriorityListingTeacher(a) ? 1 : 0;
        const lowB = isLowPriorityListingTeacher(b) ? 1 : 0;
        if (lowA !== lowB) return lowA - lowB;
        const nameA = a.displayName || (a as any).fullName || '';
        const nameB = b.displayName || (b as any).fullName || '';
        return nameA.localeCompare(nameB);
      });
  }, [teachers]);

  const classroomSuggestions = useMemo(() => {
    if (!block || !isOpen) return { suggestedFree: [], allFixed: [] };
    return getSuggestedClassroomsForSlot(allBlocks || [], block.dayOfWeek, block.period, block.id);
  }, [block, isOpen, allBlocks]);

  useEffect(() => {
    if (block) {
      const isNoveltyBlock = Boolean(
        block.block_type === 'novelty' ||
          block.motivo_novedad ||
          block.teacherId === 'evento-institucional' ||
          (block.notes && block.notes.toLowerCase().includes('novedad')) ||
          (block.subject && block.subject.toUpperCase().startsWith('NOVEDAD'))
      );

      const isInstitutionalEventSubject =
        isNoveltyBlock &&
        (block.teacherId === 'evento-institucional' ||
          (block.motivo_novedad &&
            block.subject &&
            block.subject.trim().toLowerCase() === block.motivo_novedad.trim().toLowerCase()));

      const matchedSubject = !isInstitutionalEventSubject
        ? findOfficialSubject(block.subject)
        : undefined;

      setSubject(matchedSubject ? matchedSubject.shortName : '');

      const hasValidTeacher =
        Boolean(block.teacherId) &&
        block.teacherId !== 'unassigned' &&
        block.teacherId !== 'evento-institucional' &&
        teachers.some((t) => t.id === block.teacherId);

      setTeacherId(hasValidTeacher ? block.teacherId : '');
      setClassroomName(block.classroomName || '');
    }
  }, [block, isOpen, teachers]);

  if (!isOpen || !block) return null;

  const handleTeacherChange = (nextTeacherId: string) => {
    setTeacherId(nextTeacherId);
    if (!subject && nextTeacherId) {
      const foundTeacher = teachers.find((t) => t.id === nextTeacherId);
      if (foundTeacher) {
        const defaultOfficial = resolveTeacherDefaultSubject(foundTeacher);
        const matched = findOfficialSubject(defaultOfficial);
        if (matched) {
          setSubject(matched.shortName);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updatedBlock = buildSlotEditUpdatePayload({
        block,
        subject,
        teacherId,
        classroomName,
        teachers,
      });

      await onSave({
        blockId: updatedBlock.id,
        block_type: updatedBlock.block_type,
        subject: updatedBlock.subject,
        teacherId: updatedBlock.teacherId,
        teacherName: updatedBlock.teacherName,
        classroomId: updatedBlock.classroomId,
        classroomName: updatedBlock.classroomName,
        dayOfWeek: updatedBlock.dayOfWeek,
        period: updatedBlock.period,
        shift: updatedBlock.shift,
        startTime: updatedBlock.startTime,
        endTime: updatedBlock.endTime,
        gradeId: updatedBlock.gradeId,
        gradeName: updatedBlock.gradeName,
        status: updatedBlock.status,
        replacementTeacherId: null,
        replacementTeacherName: null,
        motivo_novedad: null,
        notes: null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold">Editar Casilla Horaria</h3>
            <p className="text-[11px] text-slate-300">
              {block.gradeName} &bull; {block.dayOfWeek.toUpperCase()} &bull; {block.period >= 101 && block.period <= 104 ? 'Plan de apoyo' : `${block.period}ª Hora`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 flex items-center gap-1.5 mb-1">
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>Asignatura</span>
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            >
              <option value="">Seleccionar materia...</option>
              {ALL_OFFICIAL_MATERIAS.map((sub) => (
                <option key={sub.id} value={sub.shortName}>
                  {sub.shortName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>Docente Asignado</span>
            </label>
            <select
              value={teacherId}
              onChange={(e) => handleTeacherChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            >
              <option value="">Seleccionar docente...</option>
              {sortedTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="font-bold text-slate-700 flex items-center gap-1.5 mb-1">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>Aula / Ubicación</span>
            </label>
            <input
              type="text"
              value={classroomName}
              onChange={(e) => setClassroomName(e.target.value)}
              list="classrooms-list"
              placeholder="Ej: Aula 301"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
            <datalist id="classrooms-list">
              {classrooms.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
              {classroomSuggestions.allFixed.map((item) => (
                <option key={`fixed-${item.room}`} value={item.room} />
              ))}
              {SPECIAL_SCHOOL_SPACES.map((sp) => (
                <option key={`sp-${sp}`} value={sp} />
              ))}
            </datalist>

            {classroomSuggestions.suggestedFree.length > 0 && (
              <div className="pt-1">
                <div className="text-[10px] font-bold text-emerald-700 mb-1">
                  Sugeridas libres en esta hora:
                </div>
                <div className="flex flex-wrap gap-1">
                  {classroomSuggestions.suggestedFree.map((item) => (
                    <button
                      key={`chip-${item.room}`}
                      type="button"
                      onClick={() => setClassroomName(item.room)}
                      title={item.reason}
                      className={`px-2 py-1 rounded-lg border text-[10.5px] font-mono font-bold transition cursor-pointer ${
                        classroomName === item.room
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
                      }`}
                    >
                      {item.room} ({item.ownerGrade})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

