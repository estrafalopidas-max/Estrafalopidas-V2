import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Users,
  Clock,
  BookOpen,
  UserPlus,
  UserCog,
  Pencil,
  Trash2,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';
import { useTeacherLoad } from '../../hooks/useTeacherLoad';
import { ensureSeedDataLoaded } from '../../../infrastructure/seed/initial-seed';
import { FirestoreUserRepository } from '../../../infrastructure/repositories/firestore-user.repository';
import { UserEntity } from '../../../domain/entities/user.entity';
import { getFirstAndLastNameInitials, getContrastTextColor } from '../../components/matrix/MatrixSlotCard';
import {
  getShortTeacherName,
  sortTeachersWithLowPriorityLast,
} from '../../../domain/services/teacher-visual-identity.service';

const normalizeText = (text: string): string =>
  (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const CoordinatorAssignmentsPage: React.FC = () => {
  const { teachers, setTeachers, getTeacherColor, openTeacherModal, triggerReload } =
    useCoordinatorMatrix();
  const [searchQuery, setSearchQuery] = useState('');
  const [matrixRevision, setMatrixRevision] = useState(0);
  const [confirmationBanner, setConfirmationBanner] = useState<string | null>(null);
  const [teacherToDelete, setTeacherToDelete] = useState<UserEntity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const handleMatrixUpdate = () => setMatrixRevision((r) => r + 1);
    const handleTeacherConfirmed = (ev: Event) => {
      const customEv = ev as CustomEvent<string>;
      if (customEv.detail) {
        setConfirmationBanner(customEv.detail);
        setTimeout(() => setConfirmationBanner(null), 5000);
      }
      setMatrixRevision((r) => r + 1);
    };

    window.addEventListener('schedule_matrix_updated', handleMatrixUpdate);
    window.addEventListener('users_collection_updated', handleMatrixUpdate);
    window.addEventListener('storage', handleMatrixUpdate);
    window.addEventListener('teacher_action_confirmed', handleTeacherConfirmed);
    return () => {
      window.removeEventListener('schedule_matrix_updated', handleMatrixUpdate);
      window.removeEventListener('users_collection_updated', handleMatrixUpdate);
      window.removeEventListener('storage', handleMatrixUpdate);
      window.removeEventListener('teacher_action_confirmed', handleTeacherConfirmed);
    };
  }, []);

  const handleConfirmDeleteTeacher = async () => {
    if (!teacherToDelete) return;
    setIsDeleting(true);
    try {
      const repo = new FirestoreUserRepository();
      const removedName = teacherToDelete.displayName;
      await repo.delete(teacherToDelete.id);
      const updatedList = await repo.getTeachers();
      setTeachers(updatedList);
      triggerReload();
      setTeacherToDelete(null);
      const msg = `Docente «${removedName}» eliminado correctamente de la plantilla.`;
      setConfirmationBanner(msg);
      setTimeout(() => setConfirmationBanner(null), 5000);
    } finally {
      setIsDeleting(false);
    }
  };

  const timeBlocks = useMemo(() => {
    try {
      if (localStorage.getItem('ievf_blank_matrix_mode') === '1') {
        return [];
      }
      const saved =
        localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    ensureSeedDataLoaded();
    try {
      const saved =
        localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, [matrixRevision]);

  const { getTeacherLoad } = useTeacherLoad(teachers, timeBlocks);

  const filteredTeachers = useMemo(() => {
    const tokens = normalizeText(searchQuery).split(/\s+/).filter(Boolean);
    const baseList =
      tokens.length === 0
        ? teachers
        : teachers.filter((teacher) => {
            const haystack = [
              teacher.displayName || '',
              teacher.shortName || '',
              teacher.groupDirection || '',
              teacher.documentId || '',
              ...(teacher.subjects || []),
              ...(teacher.specialty || []),
              teacher.assignedSubject || '',
              teacher.subject || '',
            ]
              .map(normalizeText)
              .join(' ');
            return tokens.every((tok) => haystack.includes(tok));
          });
    return sortTeachersWithLowPriorityLast(baseList);
  }, [teachers, searchQuery]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {confirmationBanner && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-2xl shadow-sm flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{confirmationBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setConfirmationBanner(null)}
            className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100 transition cursor-pointer"
            title="Cerrar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
              <span className="truncate">Directorio de Horarios y Carga Académica Docente</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Control de asignación semanal conforme al Decreto 1850 (Límite oficial 24 horas semanales)
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const initialTeacher =
                  filteredTeachers.length > 0 ? filteredTeachers[0] : teachers[0] || null;
                openTeacherModal(initialTeacher, true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold shadow-2xs transition cursor-pointer"
              title="Administrar y editar perfiles docentes"
            >
              <UserCog className="w-4 h-4 text-slate-600" />
              <span>Editar Docente</span>
              {teachers.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-extrabold">
                  {searchQuery.trim()
                    ? `${filteredTeachers.length}/${teachers.length}`
                    : teachers.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => openTeacherModal(null, false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
              title="Registrar nuevo docente en el sistema"
            >
              <UserPlus className="w-4 h-4" />
              <span>Registrar Docente</span>
            </button>
          </div>
        </div>

        {/* Buscador de docentes */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar docente por nombre, documento o asignatura..."
            aria-label="Buscar docente en horarios"
            className="w-full pl-10 pr-24 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-blue-500 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 transition"
          />
          {searchQuery && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">
                {filteredTeachers.length}{' '}
                {filteredTeachers.length === 1 ? 'resultado' : 'resultados'}
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200/60 transition cursor-pointer"
                title="Limpiar búsqueda"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {filteredTeachers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2 shadow-2xs">
          <Users className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700">
            {searchQuery
              ? `No se encontraron docentes para «${searchQuery}»`
              : 'No hay docentes registrados en la plantilla'}
          </p>
          <p className="text-xs text-slate-500">
            {searchQuery
              ? 'Intenta buscar por otro nombre, número de documento o asignatura.'
              : 'Haz clic en «Registrar Docente» para agregar un docente.'}
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Ver todos los docentes</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeachers.map((teacher) => {
            const fullName = teacher.displayName;
            const shortName =
              teacher.shortName || getShortTeacherName(teacher.id, teacher.displayName);
            const color =
              teacher.color_hex ||
              teacher.color ||
              getTeacherColor(teacher.id, teacher.displayName);
            const contrast = getContrastTextColor(color);
            const initials = getFirstAndLastNameInitials(shortName);
            const load = getTeacherLoad(teacher.id, teacher.displayName);
            const maxH = teacher.maxWeeklyHours || load.maxWeeklyHours || 24;
            const pct = Math.min(100, Math.round((load.currentAssignedHours / maxH) * 100));

            return (
              <div
                key={teacher.id}
                onClick={() => openTeacherModal(teacher)}
                title={`Clic para editar a ${fullName}`}
                className="group bg-white rounded-2xl border border-slate-200 p-4 hover:border-blue-400 transition shadow-2xs cursor-pointer space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 relative ${contrast}`}
                      style={{ backgroundColor: color }}
                    >
                      <span className="group-hover:opacity-0 transition-opacity duration-150">
                        {initials}
                      </span>
                      <Pencil
                        className={`w-4 h-4 absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${contrast}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                        <span className="truncate">{fullName}</span>
                      </h3>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                        <span>
                          {teacher.groupDirection &&
                          teacher.groupDirection !== 'Sin asignación'
                            ? `Dir. Grupo: ${teacher.groupDirection}`
                            : 'Sin dirección de grupo'}
                        </span>
                        <span>•</span>
                        <span>Celdas: {shortName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-1 rounded-lg border shrink-0 ${
                        load.currentAssignedHours > maxH
                          ? 'bg-red-50 text-red-700 border-red-300'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {load.currentAssignedHours}/{maxH}h
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTeacherModal(teacher);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition cursor-pointer"
                      title={`Editar a ${fullName}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTeacherToDelete(teacher);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer"
                      title={`Eliminar a ${fullName}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      load.currentAssignedHours > maxH ? 'bg-red-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-600 truncate">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {(teacher.subjects || []).join(' • ') || 'Asignación General'}
                  </span>
                </div>

                {teacher.entrySchedule?.label && (
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg">
                    <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                    <span className="truncate">{teacher.entrySchedule.label}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de confirmación para eliminar docente */}
      {teacherToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none"
          onClick={() => setTeacherToDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-red-600 to-rose-700 px-5 py-3.5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-white shrink-0" />
                <h3 className="text-sm font-bold">Eliminar docente</h3>
              </div>
              <button
                type="button"
                onClick={() => setTeacherToDelete(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p className="leading-relaxed">
                ¿Estás seguro de que deseas eliminar al docente{' '}
                <strong className="text-slate-900">{teacherToDelete.displayName}</strong> de la
                plantilla docente?
              </p>
              <p className="text-[11px] text-slate-500">
                Sus bloques horarios en la parrilla quedarán como «Sin Asignar» para que puedas
                reasignarlos a otro docente.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setTeacherToDelete(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleConfirmDeleteTeacher()}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Eliminando...' : 'Sí, eliminar docente'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
