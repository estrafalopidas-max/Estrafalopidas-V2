import React, { useState, useEffect } from 'react';
import { X, Save, BookOpen, User, MapPin } from 'lucide-react';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import { ClassroomEntity } from '../../../domain/entities/classroom.entity';
import { ALL_OFFICIAL_MATERIAS } from '../../../domain/constants/subjects';

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
  teachers,
  classrooms,
  onSave,
}) => {
  const [subject, setSubject] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [classroomName, setClassroomName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (block) {
      setSubject(block.subject || '');
      setTeacherId(block.teacherId || '');
      setClassroomName(block.classroomName || '');
    }
  }, [block, isOpen]);

  if (!isOpen || !block) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const selectedTeacher = teachers.find((t) => t.id === teacherId);
      await onSave({
        blockId: block.id,
        subject,
        teacherId: selectedTeacher?.id || teacherId,
        teacherName: selectedTeacher?.displayName || block.teacherName,
        classroomId: block.classroomId,
        classroomName: classroomName || block.classroomName,
        dayOfWeek: block.dayOfWeek,
        period: block.period,
        gradeId: block.gradeId,
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
              {block.gradeName} &bull; {block.dayOfWeek.toUpperCase()} &bull; {block.period}ª Hora
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
              onChange={(e) => setTeacherId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            >
              <option value="">Seleccionar docente...</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>

          <div>
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
            </datalist>
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
