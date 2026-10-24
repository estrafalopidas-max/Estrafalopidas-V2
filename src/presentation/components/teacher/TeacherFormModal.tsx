import React, { useState, useEffect } from 'react';
import { X, Save, UserPlus, UserCog, Check, Lock } from 'lucide-react';
import { UserEntity } from '../../../domain/entities/user.entity';
import { FirestoreUserRepository } from '../../../infrastructure/repositories/firestore-user.repository';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';
import { ALL_OFFICIAL_MATERIAS } from '../../../domain/constants/subjects';
import { VILLA_FLORA_PALETTE } from '../../../domain/services/teacher-color.service';
import { getFullTeacherName, getShortTeacherName, getTeacherVisualIdentity } from '../../../domain/services/teacher-visual-identity.service';

interface TeacherFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: UserEntity | null;
  onSelectTeacher?: (teacher: UserEntity | null) => void;
  onSuccess?: () => void;
}

export const TeacherFormModal: React.FC<TeacherFormModalProps> = ({
  isOpen,
  onClose,
  teacher,
  onSelectTeacher,
  onSuccess,
}) => {
  const { teachers, setTeachers, triggerReload } = useCoordinatorMatrix();
  const [displayName, setDisplayName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [email, setEmail] = useState('');
  const [maxWeeklyHours, setMaxWeeklyHours] = useState(24);
  const [colorHex, setColorHex] = useState('#007DC5');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (teacher) {
      setDisplayName(teacher.displayName || '');
      setDocumentId(teacher.documentId || '');
      setEmail(teacher.email || '');
      setMaxWeeklyHours(
        !teacher.maxWeeklyHours || teacher.maxWeeklyHours === 22
          ? 24
          : teacher.maxWeeklyHours
      );
      const lockedHex = getTeacherVisualIdentity(teacher.id, teacher.displayName).color_hex;
      setColorHex(lockedHex || teacher.color_hex || teacher.color || '#007DC5');
      setSelectedSubjects(teacher.subjects || teacher.allowedSubjects || teacher.specialty || []);
    } else {
      setDisplayName('');
      setDocumentId('');
      setEmail('');
      setMaxWeeklyHours(24);
      setColorHex(VILLA_FLORA_PALETTE[teachers.length % VILLA_FLORA_PALETTE.length] || '#007DC5');
      setSelectedSubjects([]);
    }
  }, [teacher, isOpen, teachers.length]);

  if (!isOpen) return null;

  const toggleSubject = (subName: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subName) ? prev.filter((s) => s !== subName) : [...prev, subName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const repo = new FirestoreUserRepository();
      const now = new Date().toISOString();
      const cleanFull = displayName.trim();
      const updatedTeacher: UserEntity = {
        ...teacher,
        id: teacher?.id || `teacher-${Date.now()}`,
        displayName: cleanFull,
        shortName: teacher?.shortName || getShortTeacherName(teacher?.id, cleanFull),
        groupDirection: teacher?.groupDirection,
        documentId: documentId.trim(),
        email: email.trim() || `${cleanFull.toLowerCase().replace(/\s+/g, '.')}@villaflora.edu.co`,
        role: 'teacher',
        maxWeeklyHours: Number(maxWeeklyHours) || 24,
        color_hex: teacher ? getTeacherVisualIdentity(teacher.id, cleanFull).color_hex : colorHex,
        color: teacher ? getTeacherVisualIdentity(teacher.id, cleanFull).color_hex : colorHex,
        allowedSubjects: selectedSubjects,
        subjects: selectedSubjects,
        specialty: selectedSubjects,
        isActive: true,
        createdAt: teacher?.createdAt || now,
        updatedAt: now,
      };

      if (teacher) {
        await repo.update(teacher.id, updatedTeacher);
      } else {
        await repo.create(updatedTeacher);
      }
      const all = await repo.getTeachers();
      setTeachers(all);
      triggerReload();
      onSuccess?.();
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
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {teacher ? <UserCog className="w-5 h-5 text-sky-400" /> : <UserPlus className="w-5 h-5 text-emerald-400" />}
            <h2 className="text-base font-bold">
              {teacher ? 'Editar Docente' : 'Registrar Nuevo Docente'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {teachers.length > 0 && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Seleccionar docente existente para editar (Opcional):
              </label>
              <select
                value={teacher?.id || ''}
                onChange={(e) => {
                  const found = teachers.find((t) => t.id === e.target.value) || null;
                  onSelectTeacher?.(found);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 text-slate-800 font-medium"
              >
                <option value="">-- Nuevo Docente --</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {getFullTeacherName(t.id, t.displayName)}{t.groupDirection ? ` — Dir. ${t.groupDirection}` : ''} ({!t.maxWeeklyHours || t.maxWeeklyHours === 22 ? 24 : t.maxWeeklyHours}h)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Nombre Completo *</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ej: Alejandro Giraldo"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Documento / Cédula</label>
              <input
                type="text"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                placeholder="Ej: 71234567"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Correo Institucional</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="docente@villaflora.edu.co"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Carga Máxima Legal (Horas)</label>
              <input
                type="number"
                min={1}
                max={40}
                value={maxWeeklyHours}
                onChange={(e) => setMaxWeeklyHours(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1.5">
              Color Identificador en Matriz {teacher ? '(Bloqueado Ad Perpetuum)' : ''}
            </label>
            {teacher ? (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                <div
                  className="w-7 h-7 rounded-lg border-2 border-slate-900/20 shadow-xs shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: colorHex }}
                >
                  <Lock className="w-3.5 h-3.5 text-white drop-shadow" />
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  Color institucional consolidado y bloqueado permanentemente ({colorHex.toUpperCase()}).
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {VILLA_FLORA_PALETTE.slice(0, 18).map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColorHex(hex)}
                    className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition cursor-pointer ${
                      colorHex === hex ? 'border-slate-900 scale-110 shadow-sm' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                  >
                    {colorHex === hex && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1.5">Asignaturas Autorizadas</label>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
              {ALL_OFFICIAL_MATERIAS.map((sub) => {
                const active = selectedSubjects.includes(sub.shortName);
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => toggleSubject(sub.shortName)}
                    className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition cursor-pointer border ${
                      active
                        ? 'bg-blue-600 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {sub.shortName}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
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
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar Docente'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
