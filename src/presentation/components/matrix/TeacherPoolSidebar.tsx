import React, { useState, useMemo } from 'react';
import { ChevronLeft, Search, Users, X, Plus, Pencil } from 'lucide-react';
import { UserEntity } from '../../../domain/entities/user.entity';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { useTeacherLoad } from '../../hooks/useTeacherLoad';
import { getFirstAndLastNameInitials, getContrastTextColor } from './MatrixSlotCard';
import { setGlobalActiveDraggedBlock } from './MatrixCell';
import {
  getFullTeacherName,
  getShortTeacherName,
  isLowPriorityListingTeacher,
} from '../../../domain/services/teacher-visual-identity.service';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';

export interface TeacherPoolSidebarProps {
  teachers: UserEntity[];
  timeBlocks: TimeBlockEntity[];
  getTeacherColor: (teacherId?: string, teacherName?: string) => string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export const TeacherPoolSidebar: React.FC<TeacherPoolSidebarProps> = ({
  teachers,
  timeBlocks,
  getTeacherColor,
  isOpen,
  onToggle,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const { getTeacherLoad } = useTeacherLoad(teachers, timeBlocks);
  const { openTeacherModal } = useCoordinatorMatrix();

  const { availableCount, assignedCount } = useMemo(() => {
    let avail = 0;
    let assigned = 0;
    for (const t of teachers) {
      const load = getTeacherLoad(t.id, t.displayName);
      if (load.currentAssignedHours >= load.maxWeeklyHours) {
        assigned++;
      } else {
        avail++;
      }
    }
    return { availableCount: avail, assignedCount: assigned };
  }, [teachers, getTeacherLoad]);

  const filteredTeachers = useMemo(() => {
    const normalizeStr = (val: string | null | undefined) =>
      (val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const tokens = normalizeStr(search).split(/\s+/).filter(Boolean);
    const list = teachers.filter((t) => {
      if (tokens.length === 0) return true;
      const haystack = [
        t.displayName || '',
        t.shortName || '',
        t.groupDirection || '',
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

    return [...list].sort((a, b) => {
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
  }, [teachers, search, getTeacherLoad]);

  return (
    <div
      className={`fixed top-0 right-0 h-screen z-50 flex items-center transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Pestaña lateral estilizada acoplada al borde izquierdo del cajón */}
      <button
        type="button"
        onClick={onToggle}
        title={
          isOpen
            ? 'Ocultar panel de docentes disponibles'
            : `Abrir panel de docentes (${availableCount} disponibles / ${assignedCount} asignados)`
        }
        aria-expanded={isOpen}
        className="group absolute right-full top-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-3 py-4 px-2.5 rounded-l-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 shadow-lg border border-r-0 border-amber-500/50 cursor-pointer select-none transition-all duration-300 ease-in-out hover:pr-3.5"
      >
        {/* Indicador de flecha apuntando hacia la izquierda (rota suavemente al abrir) */}
        <span className="w-6 h-6 rounded-full bg-slate-950/10 group-hover:bg-slate-950/15 flex items-center justify-center transition-colors duration-300 ease-in-out">
          <ChevronLeft
            className={`w-4 h-4 text-slate-950 stroke-[2.5] transition-transform duration-300 ease-in-out ${
              isOpen ? 'rotate-180' : 'rotate-0 group-hover:-translate-x-0.5'
            }`}
          />
        </span>

        {/* Texto vertical de abajo hacia arriba */}
        <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-normal tracking-wider uppercase text-slate-950 whitespace-nowrap leading-none py-1">
          Docentes disponibles
        </span>

        {/* Ícono decorativo inferior con contador rápido de disponibles */}
        <span className="w-6 h-6 rounded-lg bg-white/40 border border-amber-600/20 flex items-center justify-center text-[10px] font-black text-slate-950 shadow-2xs">
          {availableCount}
        </span>
      </button>

      {/* Panel lateral deslizante con transición ease-in-out suave (20% más angosto: w-64 = 256px) */}
      <aside
        aria-hidden={!isOpen}
        className={`h-screen w-64 bg-white border-l border-slate-200 flex flex-col transition-shadow duration-300 ease-in-out ${
          isOpen ? 'shadow-2xl' : 'shadow-none pointer-events-none'
        }`}
      >
        <div className="bg-slate-900 px-3.5 py-3 text-white flex items-center justify-between gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Users className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-bold truncate">Docentes disponibles</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => openTeacherModal(null, false)}
              className="w-6 h-6 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              title="Registrar nuevo docente (+)"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
            <button
              type="button"
              onClick={() => {
                const initialTeacher = teachers && teachers.length > 0 ? teachers[0] : null;
                openTeacherModal(initialTeacher, true);
              }}
              className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              title="Editar docentes (✎)"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-slate-200 bg-slate-50 shrink-0 space-y-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar docente o materia..."
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-200 transition"
            />
            {search.length > 0 && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-0.5 rounded-full transition cursor-pointer"
                title="Limpiar búsqueda"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] font-semibold px-0.5">
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Disponibles: {availableCount}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              Asignados: {assignedCount}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredTeachers.map((teacher) => {
            const fullName = getFullTeacherName(teacher.id, teacher.displayName);
            const shortName = teacher.shortName || getShortTeacherName(teacher.id, teacher.displayName);
            const color = getTeacherColor(teacher.id, teacher.displayName);
            const contrast = getContrastTextColor(color);
            const initials = getFirstAndLastNameInitials(shortName);
            const load = getTeacherLoad(teacher.id, teacher.displayName);
            const isAlreadyAssigned = load.currentAssignedHours >= load.maxWeeklyHours;

            return (
              <div
                key={teacher.id}
                role="button"
                tabIndex={isAlreadyAssigned ? -1 : 0}
                aria-disabled={isAlreadyAssigned}
                draggable={!isAlreadyAssigned}
                onClick={() => {
                  if (!isAlreadyAssigned) {
                    openTeacherModal(teacher, false);
                  }
                }}
                onDragStart={(e) => {
                  if (isAlreadyAssigned) {
                    e.preventDefault();
                    return;
                  }
                  const primarySubject =
                    teacher.subjects?.[0] || teacher.assignedSubject || 'Asignatura';
                  const payload = JSON.stringify({
                    type: 'TEACHER_POOL',
                    isTeacherCard: true,
                    id: `teacher-${teacher.id}`,
                    teacherId: teacher.id,
                    teacherName: shortName,
                    subject: primarySubject,
                    sourceId: 'teacher-pool',
                  });
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', payload);
                  e.dataTransfer.setData('application/json', payload);
                  setGlobalActiveDraggedBlock({
                    id: `teacher-${teacher.id}`,
                    block_type: 'class',
                    dayOfWeek: 'lunes',
                    period: 0,
                    startTime: '',
                    endTime: '',
                    shift: 'morning',
                    gradeId: '',
                    gradeName: '',
                    subject: primarySubject,
                    teacherId: teacher.id,
                    teacherName: shortName,
                    classroomId: '',
                    classroomName: '',
                    status: 'regular',
                    updatedAt: new Date().toISOString(),
                  });
                }}
                onDragEnd={() => {
                  setGlobalActiveDraggedBlock(null);
                }}
                title={
                  isAlreadyAssigned
                    ? `${fullName} — Ya asignado (${load.currentAssignedHours}/${load.maxWeeklyHours}h completadas)`
                    : `Disponible (${load.remainingHours}h libres)${teacher.entrySchedule?.label ? ` • ${teacher.entrySchedule.label}` : ''} • Arrastrar a una casilla o clic para editar a ${fullName}`
                }
                className={`group p-2.5 rounded-xl border flex items-center justify-between gap-2 transition select-none ${
                  isAlreadyAssigned
                    ? 'bg-slate-100 border-slate-200/80 text-slate-400 opacity-60 cursor-not-allowed shadow-none'
                    : 'bg-white hover:bg-amber-50/40 hover:border-amber-400 border-slate-200 shadow-2xs cursor-grab active:cursor-grabbing active:scale-[0.99]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 relative transition ${contrast} ${
                      isAlreadyAssigned ? 'grayscale opacity-50' : 'shadow-2xs'
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    <span className={!isAlreadyAssigned ? 'group-hover:opacity-0 transition-opacity duration-150' : ''}>
                      {initials}
                    </span>
                    {!isAlreadyAssigned && (
                      <Pencil
                        className={`w-3.5 h-3.5 absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${contrast}`}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={`text-xs font-bold truncate ${
                          isAlreadyAssigned ? 'text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {fullName}
                      </p>
                      {!isAlreadyAssigned && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                          title="Docente activo y disponible"
                        />
                      )}
                    </div>
                    <p
                      className={`text-[10px] truncate ${
                        isAlreadyAssigned ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {isAlreadyAssigned
                        ? 'Ya asignado • Cupo completo'
                        : (teacher.subjects || []).join(', ') || 'Docente Institucional'}
                    </p>
                    {teacher.entrySchedule?.label && (
                      <p className="text-[9.5px] font-medium text-amber-700 truncate">
                        {teacher.entrySchedule.label}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isAlreadyAssigned && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTeacherModal(teacher, false);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-amber-100 transition cursor-pointer"
                      title={`Editar a ${fullName}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                      isAlreadyAssigned
                        ? 'bg-slate-200/70 text-slate-400 border-slate-300/80'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {load.currentAssignedHours}/{load.maxWeeklyHours}h
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
};
