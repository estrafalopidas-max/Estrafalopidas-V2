import React, { useState, useMemo, useRef, useEffect } from 'react';
import { UserEntity } from '../../../domain/entities/user.entity';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { ALL_OFFICIAL_MATERIAS } from '../../../domain/constants/subjects';
import { useTeacherLoad } from '../../hooks/useTeacherLoad';
import {
  getFirstAndLastNameInitials,
  getContrastTextColor,
} from './MatrixSlotCard';
import {
  toTitleCase,
  isLowPriorityListingTeacher,
} from '../../../domain/services/teacher-visual-identity.service';
import { resolveTeacherDefaultSubject } from '../../../domain/services/batch-cell-assignment.service';
import {
  CheckSquare,
  UserPlus,
  BookOpen,
  Trash2,
  X,
  Search,
  ChevronUp,
  Check,
  Sparkles,
} from 'lucide-react';

export interface BatchActionQuickMenuProps {
  selectedCount: number;
  teachers: UserEntity[];
  allBlocks: TimeBlockEntity[];
  getTeacherColor: (teacherId?: string, teacherName?: string) => string;
  onAssignTeacher: (teacher: UserEntity, subjectOverride?: string | null, overwriteSubject?: boolean) => void;
  onAssignSubject: (subject: string) => void;
  onOpenBatchNovelty: () => void;
  onClearSelection: () => void;
}

export const BatchActionQuickMenu: React.FC<BatchActionQuickMenuProps> = ({
  selectedCount,
  teachers,
  allBlocks,
  getTeacherColor,
  onAssignTeacher,
  onAssignSubject,
  onOpenBatchNovelty,
  onClearSelection,
}) => {
  const [openMenu, setOpenMenu] = useState<'teacher' | 'subject' | null>(null);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [customSubjectForTeacher, setCustomSubjectForTeacher] = useState<string>('');
  const [overwriteExistingSubject, setOverwriteExistingSubject] = useState<boolean>(true);

  const menuContainerRef = useRef<HTMLDivElement>(null);
  const teacherSearchInputRef = useRef<HTMLInputElement>(null);
  const subjectSearchInputRef = useRef<HTMLInputElement>(null);

  const { getTeacherLoad } = useTeacherLoad(teachers, allBlocks);

  useEffect(() => {
    if (selectedCount === 0) {
      setOpenMenu(null);
      setTeacherSearch('');
      setSubjectSearch('');
      setCustomSubjectForTeacher('');
    }
  }, [selectedCount]);

  useEffect(() => {
    if (openMenu === 'teacher') {
      setTimeout(() => teacherSearchInputRef.current?.focus(), 40);
    } else if (openMenu === 'subject') {
      setTimeout(() => subjectSearchInputRef.current?.focus(), 40);
    }
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  const normalizeStr = (val: string | null | undefined) =>
    (val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const filteredTeachers = useMemo(() => {
    const activeList = teachers.filter((t) => !t.role || t.role === 'teacher');
    const tokens = normalizeStr(teacherSearch).split(/\s+/).filter(Boolean);

    const matching = activeList.filter((t) => {
      if (tokens.length === 0) return true;
      const haystack = [
        t.displayName || '',
        t.shortName || '',
        t.documentId || '',
        ...(t.subjects || []),
        ...(t.specialty || []),
        t.assignedSubject || '',
        t.subject || '',
      ]
        .map(normalizeStr)
        .join(' ');
      return tokens.every((tok) => haystack.includes(tok));
    });

    return [...matching].sort((a, b) => {
      const loadA = getTeacherLoad(a.id, a.displayName);
      const loadB = getTeacherLoad(b.id, b.displayName);
      const isFullA = loadA.currentAssignedHours >= loadA.maxWeeklyHours ? 1 : 0;
      const isFullB = loadB.currentAssignedHours >= loadB.maxWeeklyHours ? 1 : 0;
      if (isFullA !== isFullB) return isFullA - isFullB;
      const lowA = isLowPriorityListingTeacher(a) ? 1 : 0;
      const lowB = isLowPriorityListingTeacher(b) ? 1 : 0;
      if (lowA !== lowB) return lowA - lowB;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
  }, [teachers, teacherSearch, getTeacherLoad]);

  const filteredSubjects = useMemo(() => {
    const tokens = normalizeStr(subjectSearch).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return ALL_OFFICIAL_MATERIAS;

    return ALL_OFFICIAL_MATERIAS.filter((m) => {
      const haystack = normalizeStr(`${m.shortName} ${m.officialName}`);
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [subjectSearch]);

  if (selectedCount <= 0) return null;

  return (
    <div
      ref={menuContainerRef}
      role="region"
      aria-label="Menú rápido de acciones en lote"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      {/* Popover: Asignar Docente en Lote */}
      {openMenu === 'teacher' && (
        <div
          role="dialog"
          aria-label="Seleccionar docente para asignar en lote"
          className="mb-2.5 w-[380px] sm:w-[430px] max-w-[94vw] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[430px] animate-in zoom-in-95 duration-150"
        >
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                  Asignar Docente en Lote
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  Se aplicará a {selectedCount} {selectedCount === 1 ? 'casilla seleccionada' : 'casillas seleccionadas'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenMenu(null)}
              aria-label="Cerrar selector de docente en lote"
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Configuración opcional de materia al asignar docente */}
          <div className="px-3.5 py-2.5 bg-slate-50/60 border-b border-slate-100 space-y-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor="batch-teacher-subject-select"
                className="text-[11px] font-bold text-slate-600 shrink-0"
              >
                Materia:
              </label>
              <select
                id="batch-teacher-subject-select"
                aria-label="Materia para asignar junto al docente"
                value={customSubjectForTeacher}
                onChange={(e) => setCustomSubjectForTeacher(e.target.value)}
                className="flex-1 h-7 px-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Automática (especialidad del docente)</option>
                {ALL_OFFICIAL_MATERIAS.map((m) => (
                  <option key={m.id} value={m.officialName}>
                    {m.shortName}
                  </option>
                ))}
              </select>
            </div>

            {!customSubjectForTeacher && (
              <label className="flex items-center gap-2 text-[11px] text-slate-600 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwriteExistingSubject}
                  onChange={(e) => setOverwriteExistingSubject(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                />
                <span>Reemplazar también la materia con la especialidad del docente</span>
              </label>
            )}
          </div>

          {/* Buscador de docentes */}
          <div className="p-2.5 border-b border-slate-100 bg-white">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={teacherSearchInputRef}
                type="text"
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                placeholder="Buscar docente por nombre o asignatura..."
                aria-label="Buscar docente para lote"
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-800 placeholder:text-slate-400"
              />
              {teacherSearch && (
                <button
                  type="button"
                  onClick={() => setTeacherSearch('')}
                  aria-label="Limpiar búsqueda de docente"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Lista de docentes */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[240px]">
            {filteredTeachers.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 font-medium">
                No se encontraron docentes con ese criterio
              </div>
            ) : (
              filteredTeachers.map((teacher) => {
                const name = teacher.displayName || teacher.id;
                const colorHex = getTeacherColor(teacher.id, name);
                const contrast = getContrastTextColor(colorHex);
                const initials = getFirstAndLastNameInitials(name);
                const load = getTeacherLoad(teacher.id, name);
                const isFull = load.currentAssignedHours >= load.maxWeeklyHours;
                const defaultSub = resolveTeacherDefaultSubject(teacher);

                return (
                  <button
                    key={teacher.id}
                    type="button"
                    onClick={() => {
                      onAssignTeacher(
                        teacher,
                        customSubjectForTeacher || null,
                        overwriteExistingSubject
                      );
                      setOpenMenu(null);
                    }}
                    className="w-full flex items-center justify-between gap-2.5 p-2 rounded-xl hover:bg-sky-50/80 border border-transparent hover:border-sky-200 transition-all text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 shadow-2xs ${contrast}`}
                        style={{ backgroundColor: colorHex }}
                      >
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 group-hover:text-sky-950 truncate">
                          {toTitleCase(name)}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {defaultSub}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                          isFull
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {load.currentAssignedHours}/{load.maxWeeklyHours}h
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 group-hover:bg-sky-600 group-hover:text-white text-slate-600 text-[10px] font-bold transition-colors">
                        Asignar
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Popover: Asignar Materia en Lote */}
      {openMenu === 'subject' && (
        <div
          role="dialog"
          aria-label="Seleccionar materia para asignar en lote"
          className="mb-2.5 w-[360px] sm:w-[410px] max-w-[94vw] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[410px] animate-in zoom-in-95 duration-150"
        >
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                  Asignar Materia en Lote
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  Asigna la misma asignatura a {selectedCount} {selectedCount === 1 ? 'casilla' : 'casillas'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenMenu(null)}
              aria-label="Cerrar selector de materia en lote"
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Buscador de materias */}
          <div className="p-2.5 border-b border-slate-100 bg-white">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={subjectSearchInputRef}
                type="text"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                placeholder="Buscar asignatura o área..."
                aria-label="Buscar asignatura para lote"
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 placeholder:text-slate-400"
              />
              {subjectSearch && (
                <button
                  type="button"
                  onClick={() => setSubjectSearch('')}
                  aria-label="Limpiar búsqueda de asignatura"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Lista de asignaturas oficiales */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[260px]">
            {filteredSubjects.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 font-medium">
                No se encontraron asignaturas
              </div>
            ) : (
              filteredSubjects.map((materia) => (
                <button
                  key={materia.id}
                  type="button"
                  onClick={() => {
                    onAssignSubject(materia.officialName);
                    setOpenMenu(null);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-indigo-50/80 border border-transparent hover:border-indigo-200 transition-all text-left cursor-pointer group"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-950 truncate">
                      {materia.shortName}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {materia.officialName}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-600 text-[10px] font-bold shrink-0 transition-colors">
                    Asignar
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Barra Flotante Principal de Acciones Rápidas en Lote */}
      <div className="bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-2 sm:flex-nowrap flex-wrap justify-center">
        {/* Contador de casillas seleccionadas */}
        <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
          <span className="w-6 h-6 rounded-lg bg-red-600 text-white text-xs font-extrabold flex items-center justify-center shadow-xs">
            {selectedCount}
          </span>
          <span className="text-xs font-bold tracking-tight whitespace-nowrap">
            {selectedCount === 1 ? 'casilla seleccionada' : 'casillas seleccionadas'}
          </span>
        </div>

        {/* Botón: Asignar Docente a todas */}
        <button
          type="button"
          onClick={() => setOpenMenu((prev) => (prev === 'teacher' ? null : 'teacher'))}
          aria-expanded={openMenu === 'teacher'}
          className={`h-8 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            openMenu === 'teacher'
              ? 'bg-sky-500 text-white shadow-md ring-2 ring-sky-300/50'
              : 'bg-slate-800 hover:bg-sky-600 text-slate-100 border border-slate-700'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5 shrink-0" />
          <span>Asignar Docente</span>
          <ChevronUp
            className={`w-3.5 h-3.5 transition-transform duration-150 ${
              openMenu === 'teacher' ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Botón: Asignar Materia a todas */}
        <button
          type="button"
          onClick={() => setOpenMenu((prev) => (prev === 'subject' ? null : 'subject'))}
          aria-expanded={openMenu === 'subject'}
          className={`h-8 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            openMenu === 'subject'
              ? 'bg-indigo-500 text-white shadow-md ring-2 ring-indigo-300/50'
              : 'bg-slate-800 hover:bg-indigo-600 text-slate-100 border border-slate-700'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span>Asignar Materia</span>
          <ChevronUp
            className={`w-3.5 h-3.5 transition-transform duration-150 ${
              openMenu === 'subject' ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Botón: Novedad / Vaciar Lote */}
        <button
          type="button"
          onClick={() => {
            setOpenMenu(null);
            onOpenBatchNovelty();
          }}
          className="h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-slate-800 hover:bg-red-600 text-slate-200 hover:text-white border border-slate-700 transition-all cursor-pointer whitespace-nowrap"
          title="Registrar novedad institucional o vaciar las casillas seleccionadas"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Novedad / Vaciar</span>
        </button>

        {/* Botón: Desmarcar / Limpiar selección */}
        <button
          type="button"
          onClick={onClearSelection}
          aria-label="Limpiar selección de casillas"
          title="Desmarcar todas las casillas seleccionadas"
          className="h-8 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Desmarcar</span>
        </button>
      </div>
    </div>
  );
};
