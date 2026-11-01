import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  UserPlus,
  UserCog,
  Check,
  Lock,
  Trash2,
  AlertTriangle,
  AlertCircle,
  GraduationCap,
} from 'lucide-react';
import { UserEntity, AcademicLevel } from '../../../domain/entities/user.entity';
import { FirestoreUserRepository } from '../../../infrastructure/repositories/firestore-user.repository';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';
import { ALL_OFFICIAL_MATERIAS } from '../../../domain/constants/subjects';
import { VILLA_FLORA_PALETTE } from '../../../domain/services/teacher-color.service';
import {
  computeDefaultShortName,
  getTeacherVisualIdentity,
} from '../../../domain/services/teacher-visual-identity.service';
import { CustomSelectDropdown } from '../common/CustomSelectDropdown';

interface TeacherFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: UserEntity | null;
  onSelectTeacher?: (teacher: UserEntity | null) => void;
  onSuccess?: (message?: string) => void;
}

export const TeacherFormModal: React.FC<TeacherFormModalProps> = ({
  isOpen,
  onClose,
  teacher,
  onSelectTeacher,
  onSuccess,
}) => {
  const { teachers, setTeachers, triggerReload } = useCoordinatorMatrix();
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [displayName, setDisplayName] = useState('');
  const [shortName, setShortName] = useState('');
  const [isShortNameCustom, setIsShortNameCustom] = useState(false);
  const [academicLevel, setAcademicLevel] = useState<AcademicLevel>('bachillerato');
  const [groupDirection, setGroupDirection] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [email, setEmail] = useState('');
  const [maxWeeklyHours, setMaxWeeklyHours] = useState(24);
  const [colorHex, setColorHex] = useState('#007DC5');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    setErrorMessage(null);

    if (teacher) {
      setMode('edit');
      const currentFull = teacher.displayName || '';
      const currentShort =
        teacher.shortName || computeDefaultShortName(currentFull);
      setDisplayName(currentFull);
      setShortName(currentShort);
      setIsShortNameCustom(false);
      setAcademicLevel(
        teacher.academicLevel ||
          (teacher.groupDirection?.startsWith('TS-') || teacher.groupDirection?.match(/^0[1-5]-/)
            ? 'primaria'
            : 'bachillerato')
      );
      setGroupDirection(
        teacher.groupDirection && teacher.groupDirection !== 'Sin asignación'
          ? teacher.groupDirection
          : ''
      );
      setDocumentId(teacher.documentId || '');
      setEmail(teacher.email || '');
      setMaxWeeklyHours(
        !teacher.maxWeeklyHours || teacher.maxWeeklyHours === 22
          ? 24
          : teacher.maxWeeklyHours
      );
      const currentHex =
        teacher.color_hex ||
        teacher.color ||
        getTeacherVisualIdentity(teacher.id, teacher.displayName).color_hex ||
        '#007DC5';
      setColorHex(currentHex);
      setSelectedSubjects(
        teacher.subjects || teacher.allowedSubjects || teacher.specialty || []
      );
    } else {
      setMode('create');
      setDisplayName('');
      setShortName('');
      setIsShortNameCustom(false);
      setAcademicLevel('bachillerato');
      setGroupDirection('');
      setDocumentId('');
      setEmail('');
      setMaxWeeklyHours(24);
      setColorHex(
        VILLA_FLORA_PALETTE[teachers.length % VILLA_FLORA_PALETTE.length] ||
          '#007DC5'
      );
      setSelectedSubjects([]);
    }
  }, [teacher, isOpen, teachers.length]);

  if (!isOpen) return null;

  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val);
    if (!isShortNameCustom) {
      setShortName(val.trim() ? computeDefaultShortName(val) : '');
    }
  };

  const toggleSubject = (subName: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subName) ? prev.filter((s) => s !== subName) : [...prev, subName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const cleanFull = displayName.trim();
    if (!cleanFull) {
      setErrorMessage('Por favor ingresa el nombre completo del docente.');
      return;
    }

    setSaving(true);
    try {
      const repo = new FirestoreUserRepository();
      const now = new Date().toISOString();
      const cleanShort = shortName.trim() || computeDefaultShortName(cleanFull);
      const cleanGroup = groupDirection.trim() || 'Sin asignación';
      const isCreate = mode === 'create' || !teacher;

      const finalColorHex = !isCreate && teacher
        ? teacher.color_hex ||
          teacher.color ||
          getTeacherVisualIdentity(teacher.id, teacher.displayName).color_hex ||
          colorHex
        : colorHex;

      const teacherId = isCreate ? `t-custom-${Date.now()}` : teacher!.id;

      const updatedTeacher: UserEntity = {
        ...(isCreate ? {} : teacher),
        id: teacherId,
        displayName: cleanFull,
        shortName: cleanShort,
        academicLevel,
        groupDirection: cleanGroup,
        documentId: documentId.trim(),
        email:
          email.trim() ||
          `${cleanFull
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '.')}@villaflora.edu.co`,
        role: 'teacher',
        maxWeeklyHours: Number(maxWeeklyHours) || 24,
        color_hex: finalColorHex,
        color: finalColorHex,
        avatarColor: finalColorHex,
        allowedSubjects: selectedSubjects,
        subjects: selectedSubjects,
        specialty: selectedSubjects,
        isActive: true,
        userEdited: true,
        createdAt: isCreate ? now : teacher?.createdAt || now,
        updatedAt: now,
      };

      if (isCreate) {
        await repo.create(updatedTeacher);
      } else {
        await repo.update(teacherId, updatedTeacher);
      }

      const all = await repo.getTeachers();
      setTeachers(all);
      triggerReload();

      const successMsg = isCreate
        ? `Docente «${cleanFull}» registrado correctamente en la plantilla institucional.`
        : `Cambios guardados: Docente «${cleanFull}» actualizado correctamente.`;

      onSuccess?.(successMsg);
      onClose();
    } catch (err: any) {
      console.error('[TeacherFormModal] Error saving teacher:', err);
      setErrorMessage(
        err?.message || 'Ocurrió un error al guardar el docente en el sistema. Intenta de nuevo.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeacher = async () => {
    if (!teacher) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const repo = new FirestoreUserRepository();
      const removedName = teacher.displayName;
      await repo.delete(teacher.id);
      const all = await repo.getTeachers();
      setTeachers(all);
      triggerReload();
      onSuccess?.(`Docente «${removedName}» eliminado correctamente de la plantilla.`);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al eliminar el docente.');
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            {mode === 'create' ? (
              <UserPlus className="w-5 h-5 text-emerald-400" />
            ) : (
              <UserCog className="w-5 h-5 text-sky-400" />
            )}
            <div>
              <h2 className="text-base font-bold leading-tight">
                {mode === 'create' ? 'Registrar Nuevo Docente' : 'Editar Datos de Docente'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {mode === 'create'
                  ? 'Agrega un docente a la plantilla institucional'
                  : `Modificando perfil de ${displayName || teacher?.displayName || 'docente'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas de Navegación Segmentada */}
        <div className="flex items-center border-b border-slate-200 px-6 bg-slate-50 shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('create');
              onSelectTeacher?.(null);
            }}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              mode === 'create'
                ? 'border-blue-600 text-blue-600 bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4 text-emerald-600" />
            <span>Registrar Nuevo Docente</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('edit');
              if (!teacher && teachers.length > 0) {
                onSelectTeacher?.(teachers[0]);
              }
            }}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              mode === 'edit'
                ? 'border-blue-600 text-blue-600 bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCog className="w-4 h-4 text-sky-600" />
            <span>Editar Docente Existente</span>
            {teachers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
                {teachers.length}
              </span>
            )}
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {errorMessage && (
            <div className="bg-red-50 border border-red-300 text-red-900 px-3.5 py-2.5 rounded-xl flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* En modo Edición: selector rápido del docente */}
          {mode === 'edit' && teachers.length > 0 && (
            <div className="bg-sky-50/70 p-3 rounded-xl border border-sky-200">
              <label className="font-bold text-sky-950 block mb-1">
                Seleccionar docente para editar:
              </label>
              <CustomSelectDropdown
                value={teacher?.id || ''}
                onChange={(val) => {
                  const found = teachers.find((t) => t.id === val) || null;
                  onSelectTeacher?.(found);
                }}
                defaultAllValue=""
                size="md"
                placeholder="-- Seleccionar docente --"
                icon={<UserCog className="w-3.5 h-3.5 text-[#0c4da2]" />}
                title="Seleccionar docente a editar"
                options={teachers.map((t) => {
                  const hex =
                    t.color_hex ||
                    t.color ||
                    getTeacherVisualIdentity(t.id, t.displayName).color_hex ||
                    '#007DC5';
                  const hours = !t.maxWeeklyHours || t.maxWeeklyHours === 22 ? 24 : t.maxWeeklyHours;
                  const dir =
                    t.groupDirection && t.groupDirection !== 'Sin asignación'
                      ? ` — Dir. ${t.groupDirection}`
                      : '';
                  return {
                    value: t.id,
                    label: `${t.displayName}${dir} (${hours}h)`,
                    colorHex: hex,
                  };
                })}
              />
            </div>
          )}

          {/* Nombre y Nombre Corto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Nombre Completo (Nombres y Apellidos) *
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                placeholder="Ej: Alejandro Giraldo"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Nombre en Celdas (Nombre y Apellido)
              </label>
              <input
                type="text"
                value={shortName}
                onChange={(e) => {
                  setShortName(e.target.value);
                  setIsShortNameCustom(true);
                }}
                placeholder="Ej: Alejandro Giraldo"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition"
              />
            </div>
          </div>

          {/* Nivel Académico, Dirección de Grupo y Carga Semanal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Nivel Académico</label>
              <div className="relative">
                <select
                  value={academicLevel}
                  onChange={(e) => setAcademicLevel(e.target.value as AcademicLevel)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus:border-blue-600 outline-none text-xs font-semibold appearance-none pr-8 cursor-pointer"
                >
                  <option value="bachillerato">Bachillerato (6° a 11°)</option>
                  <option value="primaria">Básica Primaria y Preescolar (TS a 5°)</option>
                </select>
                <GraduationCap className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Dirección de Grupo</label>
              <input
                type="text"
                value={groupDirection}
                onChange={(e) => setGroupDirection(e.target.value)}
                placeholder="Ej: 06-01 o dejar vacío"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:border-blue-600 outline-none transition"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Carga Máxima (Horas)</label>
              <input
                type="number"
                min={1}
                max={40}
                value={maxWeeklyHours}
                onChange={(e) => setMaxWeeklyHours(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:border-blue-600 outline-none transition font-bold text-slate-900"
              />
            </div>
          </div>

          {/* Cédula y Correo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Documento / Cédula</label>
              <input
                type="text"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                placeholder="Ej: 71234567"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:border-blue-600 outline-none transition"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Correo Institucional</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="docente@villaflora.edu.co"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:border-blue-600 outline-none transition"
              />
            </div>
          </div>

          {/* Selector de Color Identificador */}
          <div>
            <label className="font-bold text-slate-700 block mb-1.5">
              Color Identificador en Matriz {mode === 'edit' && teacher ? '(Bloqueado Ad Perpetuum)' : ''}
            </label>
            {mode === 'edit' && teacher ? (
              <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50">
                <div
                  className="w-7 h-7 rounded-lg border-2 border-slate-900/20 shadow-xs shrink-0 flex items-center justify-center text-white"
                  style={{ backgroundColor: colorHex }}
                >
                  <Lock className="w-3.5 h-3.5 drop-shadow" />
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  Color institucional bloqueado permanentemente ({colorHex.toUpperCase()}).
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                {VILLA_FLORA_PALETTE.slice(0, 18).map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColorHex(hex)}
                    className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition cursor-pointer ${
                      colorHex.toLowerCase() === hex.toLowerCase()
                        ? 'border-slate-900 scale-110 shadow-sm'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                    title={hex}
                  >
                    {colorHex.toLowerCase() === hex.toLowerCase() && (
                      <Check className="w-3.5 h-3.5 text-white drop-shadow" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Asignaturas Autorizadas */}
          <div>
            <label className="font-bold text-slate-700 block mb-1.5">
              Asignaturas Autorizadas ({selectedSubjects.length})
            </label>
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
                        ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {sub.shortName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Confirmación de Eliminación en Modo Edición */}
          {mode === 'edit' && teacher && confirmDelete && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
              <div className="flex items-start gap-2 text-red-900">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">¿Confirmas eliminar a {teacher.displayName}?</p>
                  <p className="text-[11px] text-red-700">
                    Se retirará de la plantilla docente y sus bloques quedarán sin docente asignado.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleDeleteTeacher()}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          )}

          {/* Barra de Acciones Inferior */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            <div>
              {mode === 'edit' && teacher && !confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold cursor-pointer transition text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Docente</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer transition text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl font-bold text-white shadow-xs transition cursor-pointer text-xs ${
                  mode === 'create'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                } disabled:opacity-60`}
              >
                {mode === 'create' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>{saving ? 'Registrando...' : 'Registrar Docente'}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
