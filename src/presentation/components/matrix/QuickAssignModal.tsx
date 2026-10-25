import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UserEntity } from '../../../domain/entities/user.entity';
import { GradeEntity, ShiftType } from '../../../domain/entities/grade.entity';
import { TimeBlockEntity, DayOfWeek } from '../../../domain/entities/time-block.entity';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';
import { useTeacherLoad } from '../../hooks/useTeacherLoad';
import {
  getFirstAndLastNameInitials,
  getContrastTextColor,
} from './MatrixSlotCard';
import {
  toTitleCase,
  isTeacherPresentAtSlot,
  isLowPriorityListingTeacher,
} from '../../../domain/services/teacher-visual-identity.service';
import { asignaturasOficiales, ALL_OFFICIAL_MATERIAS, findOfficialSubject } from '../../../domain/constants/subjects';
import {
  X,
  Search,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  UserCheck,
  CalendarDays,
  Flag,
  Users,
  ShieldCheck,
  Edit3,
  Check,
} from 'lucide-react';

export type InstitutionalEventType =
  | 'Acto cívico'
  | 'Reunión de área'
  | 'Jornada pedagógica'
  | 'Dirección de grupo'
  | 'Personalizada';

interface InstitutionalEventOption {
  id: InstitutionalEventType;
  title: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  badge: string;
}

const INSTITUTIONAL_EVENT_OPTIONS: InstitutionalEventOption[] = [
  {
    id: 'Acto cívico',
    title: 'Acto cívico',
    description: 'Izada de bandera, conmemoración patria o acto cultural protocolario.',
    icon: Flag,
    badge: 'Protocolario',
  },
  {
    id: 'Reunión de área',
    title: 'Reunión de área',
    description: 'Encuentro pedagógico o planeación de ciclo curricular con estudiantes.',
    icon: Users,
    badge: 'Académico',
  },
  {
    id: 'Jornada pedagógica',
    title: 'Jornada pedagógica',
    description: 'Actividad formativa institucional especial, taller o refuerzo para el grupo.',
    icon: BookOpen,
    badge: 'Institucional',
  },
  {
    id: 'Dirección de grupo',
    title: 'Dirección de grupo',
    description: 'Acompañamiento integral, convivencia escolar o inducción con el grado.',
    icon: ShieldCheck,
    badge: 'Formativo',
  },
  {
    id: 'Personalizada',
    title: 'Personalizada',
    description: 'Especificar un evento particular o salida pedagógica para los estudiantes.',
    icon: Edit3,
    badge: 'Ajustable',
  },
];

export interface QuickAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  grade: GradeEntity | null;
  period: number | null;
  dayOfWeek: DayOfWeek;
  shift: ShiftType;
  startTime: string;
  endTime: string;
  allBlocks: TimeBlockEntity[];
  teachers: UserEntity[];
  officialSubjects?: string[];
  onAssign: (data: {
    teacher: UserEntity;
    subject: string;
    grade: GradeEntity;
    period: number;
    startTime: string;
    endTime: string;
  }) => void;
  onAssignInstitutionalEvent?: (data: {
    eventName: string;
    grade: GradeEntity;
    period: number;
    startTime: string;
    endTime: string;
  }) => void;
  disableInstitutionalEvents?: boolean;
}

export const QuickAssignModal: React.FC<QuickAssignModalProps> = ({
  isOpen,
  onClose,
  grade,
  period,
  dayOfWeek,
  shift: _shift,
  startTime,
  endTime,
  allBlocks,
  teachers,
  officialSubjects,
  onAssign,
  onAssignInstitutionalEvent,
  disableInstitutionalEvents = false,
}) => {
  const { getTeacherColor, officialSubjects: ctxSubjects } = useCoordinatorMatrix();
  const effectiveOfficialSubjects = officialSubjects || ctxSubjects || [];

  // Pestaña Activa: Asignación Académica o Eventos Institucionales
  const [activeTab, setActiveTab] = useState<'academic' | 'institutional'>('academic');

  // Estados Tab 1: Asignación Académica
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Estados Tab 2: Eventos Institucionales
  const [selectedEventType, setSelectedEventType] = useState<InstitutionalEventType>('Acto cívico');
  const [customEventName, setCustomEventName] = useState<string>('');
  const customInputRef = useRef<HTMLInputElement>(null);

  // Arquitectura de Bloqueo de Scroll y Prevención de Layout Shift
  useEffect(() => {
    if (!isOpen) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('academic');
      setSearchTerm('');
      setSelectedTeacherId(null);
      setSelectedSubject('');
      setSelectedEventType('Acto cívico');
      setCustomEventName('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, grade, period]);

  useEffect(() => {
    if (disableInstitutionalEvents && activeTab === 'institutional') {
      setActiveTab('academic');
    }
  }, [disableInstitutionalEvents, activeTab]);

  // Enfocar input personalizado al seleccionar 'Personalizada'
  useEffect(() => {
    if (activeTab === 'institutional' && selectedEventType === 'Personalizada') {
      setTimeout(() => {
        customInputRef.current?.focus();
      }, 50);
    }
  }, [activeTab, selectedEventType]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Hook reactivo de control de carga semanal
  const { getTeacherLoad } = useTeacherLoad(teachers, allBlocks);

  // List of active teachers
  const activeTeachers = useMemo(() => {
    return teachers.filter((t) => t.role === 'teacher' && t.isActive !== false);
  }, [teachers]);

  // Collision and school arrival schedule checking for each teacher in this specific period and day
  const teacherAvailabilityMap = useMemo(() => {
    const map = new Map<string, { isAvailable: boolean; occupiedInGrade?: string; entryRestriction?: string }>();

    for (const teacher of activeTeachers) {
      const presence = isTeacherPresentAtSlot(
        teacher.id,
        teacher.displayName,
        dayOfWeek,
        period,
        _shift
      );
      if (!presence.isPresent) {
        map.set(teacher.id, {
          isAvailable: false,
          entryRestriction: `Ingresa 9:25 a.m.`,
        });
        continue;
      }

      const collisionBlock = allBlocks.find(
        (b) =>
          (b.teacherId === teacher.id ||
            (b.status === 'covered' && b.replacementTeacherId === teacher.id)) &&
          b.dayOfWeek === dayOfWeek &&
          b.period === period &&
          b.status !== 'cancelled' &&
          b.status !== 'absent'
      );

      if (collisionBlock) {
        map.set(teacher.id, {
          isAvailable: false,
          occupiedInGrade: collisionBlock.gradeName || `Grado ${collisionBlock.gradeId}`,
        });
      } else {
        map.set(teacher.id, { isAvailable: true });
      }
    }

    return map;
  }, [activeTeachers, allBlocks, dayOfWeek, period, _shift]);

  // Filtered teachers list based on search term
  const filteredTeachers = useMemo(() => {
    const normalizeStr = (val: string | null | undefined) =>
      (val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const tokens = normalizeStr(searchTerm).split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
      return [...activeTeachers].sort((a, b) => {
        const aAvail = teacherAvailabilityMap.get(a.id)?.isAvailable ? 0 : 1;
        const bAvail = teacherAvailabilityMap.get(b.id)?.isAvailable ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;
        const lowA = isLowPriorityListingTeacher(a) ? 1 : 0;
        const lowB = isLowPriorityListingTeacher(b) ? 1 : 0;
        if (lowA !== lowB) return lowA - lowB;
        const nameA = a.displayName || (a as any).fullName || '';
        const nameB = b.displayName || (b as any).fullName || '';
        return nameA.localeCompare(nameB);
      });
    }

    return activeTeachers
      .filter((t) => {
        const haystack = [
          t.displayName || (t as any).fullName || '',
          t.documentId || '',
          ...(t.subjects || []),
          ...(t.specialty || []),
          t.assignedSubject || '',
          t.subject || '',
        ]
          .map(normalizeStr)
          .join(' ');

        return tokens.every((tok) => haystack.includes(tok));
      })
      .sort((a, b) => {
        const aAvail = teacherAvailabilityMap.get(a.id)?.isAvailable ? 0 : 1;
        const bAvail = teacherAvailabilityMap.get(b.id)?.isAvailable ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;
        const lowA = isLowPriorityListingTeacher(a) ? 1 : 0;
        const lowB = isLowPriorityListingTeacher(b) ? 1 : 0;
        if (lowA !== lowB) return lowA - lowB;
        const nameA = a.displayName || (a as any).fullName || '';
        const nameB = b.displayName || (b as any).fullName || '';
        return nameA.localeCompare(nameB);
      });
  }, [activeTeachers, searchTerm, teacherAvailabilityMap]);

  // Selected teacher details
  const currentSelectedTeacher = useMemo(() => {
    return activeTeachers.find((t) => t.id === selectedTeacherId) || null;
  }, [activeTeachers, selectedTeacherId]);

  // Subjects for the currently selected teacher
  const teacherSubjects = useMemo(() => {
    if (!currentSelectedTeacher) return [];
    const subs: string[] = [
      ...(currentSelectedTeacher.subjects || []),
      ...(currentSelectedTeacher.specialty || []),
      currentSelectedTeacher.assignedSubject || '',
      currentSelectedTeacher.subject || '',
    ]
      .map((s) => s?.trim())
      .filter((s): s is string => Boolean(s));

    return [...new Set(subs)];
  }, [currentSelectedTeacher]);

  const handleSelectTeacher = (teacher: UserEntity) => {
    setSelectedTeacherId(teacher.id);
    const subs: string[] = [
      ...(teacher.subjects || []),
      ...(teacher.specialty || []),
      teacher.assignedSubject || '',
      teacher.subject || '',
    ]
      .map((s) => s?.trim())
      .filter((s): s is string => Boolean(s));

    const matchedMateria = subs.length > 0 ? findOfficialSubject(subs[0]) : undefined;
    if (matchedMateria) {
      setSelectedSubject(matchedMateria.officialName);
    } else {
      setSelectedSubject(ALL_OFFICIAL_MATERIAS[0].officialName);
    }
  };

  const handleQuickAssignImmediate = (teacher: UserEntity) => {
    if (!grade || period === null) return;

    // Cortocircuito estricto de carga semanal
    const load = getTeacherLoad(teacher.id);
    if (load.currentAssignedHours >= load.maxWeeklyHours) {
      alert('Límite legal excedido');
      return;
    }

    const subs: string[] = [
      ...(teacher.subjects || []),
      ...(teacher.specialty || []),
      teacher.assignedSubject || '',
      teacher.subject || '',
    ]
      .map((s) => s?.trim())
      .filter((s): s is string => Boolean(s));

    const matchedMateria = subs.length > 0 ? findOfficialSubject(subs[0]) : undefined;
    const finalSubject = matchedMateria ? matchedMateria.officialName : ALL_OFFICIAL_MATERIAS[0].officialName;

    onAssign({
      teacher,
      subject: finalSubject,
      grade,
      period,
      startTime,
      endTime,
    });
    onClose();
  };

  const handleConfirmAssignment = () => {
    if (!currentSelectedTeacher || !grade || period === null || !selectedSubject) return;

    // Cortocircuito estricto de carga semanal
    const load = getTeacherLoad(currentSelectedTeacher.id);
    if (load.currentAssignedHours >= load.maxWeeklyHours) {
      alert('Límite legal excedido');
      return;
    }

    onAssign({
      teacher: currentSelectedTeacher,
      subject: selectedSubject,
      grade,
      period,
      startTime,
      endTime,
    });
    onClose();
  };

  // Mutación Directa de Evento Institucional
  const handleConfirmInstitutionalEvent = (overrideEvent?: string) => {
    if (disableInstitutionalEvents || !grade || period === null) return;
    const finalEvent =
      overrideEvent ||
      (selectedEventType === 'Personalizada' ? customEventName.trim() : selectedEventType);

    if (!finalEvent) return;

    if (onAssignInstitutionalEvent) {
      onAssignInstitutionalEvent({
        eventName: finalEvent,
        grade,
        period,
        startTime,
        endTime,
      });
    } else {
      // Fallback si no se inyecta onAssignInstitutionalEvent directamente
      onAssign({
        teacher: {
          id: 'evento-institucional',
          email: 'evento@ievillaflora.edu.co',
          displayName: finalEvent,
          role: 'teacher',
          documentId: '00000000',
          subjects: [finalEvent],
          allowedSubjects: [finalEvent],
          isActive: true,
          maxWeeklyHours: 24,
          createdAt: '',
          updatedAt: '',
        },
        subject: finalEvent,
        grade,
        period,
        startTime,
        endTime,
      });
    }
    onClose();
  };

  if (!isOpen || !grade || period === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Unificado */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs transition-colors ${
              activeTab === 'academic'
                ? 'bg-blue-100 text-blue-600'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {activeTab === 'academic' ? (
                <Sparkles className="w-5 h-5" />
              ) : (
                <CalendarDays className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {activeTab === 'academic'
                  ? 'Asignación Académica de Clase'
                  : 'Programación de Evento Institucional'}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  {grade.fullName}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {period >= 101 && period <= 104
                    ? `Plan de apoyo (${startTime} - ${endTime})`
                    : `${period}ª Hora (${startTime} - ${endTime})`}
                </span>
                <span>•</span>
                <span className="capitalize font-medium">{dayOfWeek}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Control / Tabs: Unificación sin modales anidados */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex p-1 bg-slate-200/80 rounded-xl gap-1 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setActiveTab('academic')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'academic'
                  ? 'bg-white text-blue-700 shadow-xs ring-1 ring-slate-900/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Asignación Académica</span>
            </button>
            <button
              type="button"
              disabled={disableInstitutionalEvents}
              onClick={() => {
                if (!disableInstitutionalEvents) {
                  setActiveTab('institutional');
                }
              }}
              title={
                disableInstitutionalEvents
                  ? 'Opción deshabilitada en la modalidad Planes de apoyo'
                  : 'Programar evento institucional'
              }
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg transition-all ${
                disableInstitutionalEvents
                  ? 'text-slate-400 bg-slate-200/50 opacity-50 cursor-not-allowed select-none'
                  : activeTab === 'institutional'
                  ? 'bg-white text-amber-700 shadow-xs ring-1 ring-slate-900/5 cursor-pointer'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 cursor-pointer'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Eventos Institucionales</span>
            </button>
          </div>
        </div>

        {/* TAB 1: ASIGNACIÓN ACADÉMICA */}
        {activeTab === 'academic' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Search Bar */}
            <div className="p-4 border-b border-slate-100 bg-white shrink-0">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar profesor por nombre o asignatura..."
                  className="w-full pl-10 pr-9 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 p-1 rounded-full transition cursor-pointer"
                    title="Limpiar búsqueda"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Teacher List con Scroll Seguro Delegado */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {filteredTeachers.length === 0 ? (
                <div className="py-12 text-center">
                  <UserCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No se encontraron profesores</p>
                  <p className="text-xs text-slate-400 mt-1">Prueba con otro término de búsqueda</p>
                </div>
              ) : (
                filteredTeachers.map((teacher) => {
                  const teacherName = teacher.displayName || (teacher as any).fullName || teacher.id;
                  const normalizedName = toTitleCase(teacherName);
                  const colorHex = getTeacherColor
                    ? getTeacherColor(teacher.id, teacherName)
                    : (teacher.color_hex || '#007DC5');
                  const initials = getFirstAndLastNameInitials(teacherName);
                  const contrast = getContrastTextColor(colorHex);
                  const avail = teacherAvailabilityMap.get(teacher.id);
                  const load = getTeacherLoad(teacher.id);
                  const isExhausted = load.currentAssignedHours >= load.maxWeeklyHours;
                  const isAvailable = avail?.isAvailable ?? true;
                  const isSelected = selectedTeacherId === teacher.id;

                  const subs: string[] = [
                    ...(teacher.subjects || []),
                    ...(teacher.specialty || []),
                    teacher.assignedSubject || '',
                    teacher.subject || '',
                  ]
                    .map((s) => s?.trim())
                    .filter((s): s is string => Boolean(s));
                  const uniqueSubs = [...new Set(subs)];

                  return (
                    <div
                      key={teacher.id}
                      onClick={() => !isExhausted && handleSelectTeacher(teacher)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isExhausted
                          ? 'opacity-50 pointer-events-none border-red-500 bg-red-50/20'
                          : isSelected
                          ? 'border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-500'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white'
                      }`}
                    >
                      {/* Left: Avatar & Teacher Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs ${contrast}`}
                          style={{ backgroundColor: colorHex }}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {normalizedName}
                            </span>
                            {/* Badge de Horas Semanales Asignadas */}
                            <span
                              className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                isExhausted
                                  ? 'bg-red-50 text-red-700 border-red-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {load.currentAssignedHours}/{load.maxWeeklyHours} hrs
                            </span>

                            {isAvailable ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200 shrink-0">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Disponible
                              </span>
                            ) : avail?.entryRestriction ? (
                              <span
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-300 shrink-0"
                                title={teacher.entrySchedule?.label || avail.entryRestriction}
                              >
                                <Clock className="w-2.5 h-2.5" />
                                {avail.entryRestriction}
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200 shrink-0"
                                title={`Ocupado en ${avail?.occupiedInGrade}`}
                              >
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {avail?.occupiedInGrade ? `Ocupado (${avail.occupiedInGrade})` : 'Ocupado'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 truncate">
                            <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">
                              {uniqueSubs.length > 0 ? uniqueSubs.join(' • ') : 'Docente'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Quick Action Button */}
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isExhausted}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAssignImmediate(teacher);
                          }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition-colors ${
                            isExhausted
                              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                          }`}
                        >
                          {isExhausted ? 'Límite alcanzado' : 'Asignar'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Selected Teacher Detailed Assignment Footer */}
            {currentSelectedTeacher && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="w-full sm:w-auto flex-1 flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      Materia Oficial a Asignar:
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">Catálogo Único MEN</span>
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
                  >
                    {asignaturasOficiales.map((area) => (
                      <optgroup key={area.area} label={area.area}>
                        {area.materias.map((m) => (
                          <option key={m.id} value={m.officialName}>
                            {m.officialName} ({m.shortName})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAssignment}
                    className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Confirmar Asignación
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: EVENTOS INSTITUCIONALES (Restricción Estricta: Opciones que ocupan a los estudiantes) */}
        {activeTab === 'institutional' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0">
              <div className="text-xs text-slate-500 mb-2 font-medium">
                Selecciona un evento institucional que ocupe a los estudiantes de <strong className="text-slate-800">{grade.fullName}</strong> durante esta hora lectiva:
              </div>

              {INSTITUTIONAL_EVENT_OPTIONS.map((option) => {
                const IconComponent = option.icon;
                const isSelected = selectedEventType === option.id;

                return (
                  <div
                    key={option.id}
                    onClick={() => setSelectedEventType(option.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/70 shadow-xs ring-1 ring-amber-500'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white'
                    }`}
                  >
                    {/* Left: Event Details */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-2xs transition-colors ${
                        isSelected
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 truncate">
                            {option.title}
                          </span>
                          <span className="inline-flex items-center text-[10px] font-semibold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-200">
                            {option.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug line-clamp-1">
                          {option.description}
                        </p>
                      </div>
                    </div>

                    {/* Right: Quick Action Button */}
                    <div className="shrink-0 flex items-center gap-2">
                      {option.id !== 'Personalizada' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConfirmInstitutionalEvent(option.title);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Asignar</span>
                        </button>
                      ) : (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-amber-600 bg-amber-600' : 'border-slate-300'
                        }`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Input Obligatorio Condicional para Opción Personalizada */}
              {selectedEventType === 'Personalizada' && (
                <div className="mt-3 p-3 bg-amber-50/80 rounded-xl border border-amber-300 animate-in fade-in slide-in-from-top-1 duration-150">
                  <label className="block text-xs font-bold text-amber-950 mb-1.5 flex items-center gap-1">
                    <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                    Nombre del Evento Institucional Personalizado: <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={customInputRef}
                    type="text"
                    value={customEventName}
                    onChange={(e) => setCustomEventName(e.target.value)}
                    placeholder="Ej. Salida Pedagógica al Planetario, Feria de la Ciencia..."
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium shadow-2xs"
                  />
                  {!customEventName.trim() && (
                    <p className="text-[11px] text-amber-800 mt-1 font-medium">
                      Debes ingresar el nombre del evento para habilitar la confirmación.
                    </p>
                  )}
                </div>
              )}

              {/* Callout Informativo de Mutación Directa */}
              <div className="mt-3 p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-start gap-2 text-xs text-slate-600">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Mutación Directa:</strong> Al confirmar, la celda mutará directamente a la tarjeta visual de advertencia de alto contraste (fondo ámbar con badge de novedad), omitiendo modales intermedios.
                </span>
              </div>
            </div>

            {/* Footer de Confirmación Tab 2 */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmInstitutionalEvent()}
                disabled={selectedEventType === 'Personalizada' && !customEventName.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar Evento Institucional</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
