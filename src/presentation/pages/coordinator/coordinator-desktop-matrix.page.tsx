import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TimeBlockEntity, DayOfWeek } from '../../../domain/entities/time-block.entity';
import { GradeEntity, ShiftType } from '../../../domain/entities/grade.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import { ClassroomEntity } from '../../../domain/entities/classroom.entity';
import { AbsenceRequestEntity } from '../../../domain/entities/absence-request.entity';

import { FirestoreTimeBlockRepository } from '../../../infrastructure/repositories/firestore-time-block.repository';
import { FirestoreAbsenceRequestRepository } from '../../../infrastructure/repositories/firestore-absence-request.repository';
import { FirestoreUserRepository } from '../../../infrastructure/repositories/firestore-user.repository';
import { FirestoreClassroomRepository } from '../../../infrastructure/repositories/firestore-classroom.repository';
import { FirestoreGradeRepository } from '../../../infrastructure/repositories/firestore-grade.repository';

import {
  UpdateSlotWithConstraintsUseCase,
  ConstraintCollisionError,
} from '../../../application/use-cases/schedule/update-slot-with-constraints.usecase';
import { ReviewAbsenceRequestUseCase } from '../../../application/use-cases/absence/review-absence-request.usecase';
import { CollisionValidationResult } from '../../../domain/services/constraint-solver.service';
import { getTeacherVisualIdentity } from '../../../domain/services/teacher-visual-identity.service';
import { savePublicScheduleSnapshot } from '../../../domain/services/html-schedule-generator.service';
import { resolveEffectiveClassroomForBlock } from '../../../domain/services/grade-normalization.service';
import { publishScheduleToCloud } from '../../../infrastructure/firebase/firebase-client';

import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { parseSlotDroppableId, createSlotDroppableId } from '../../../domain/services/dnd-slot.helper';
import {
  DesktopMatrixGrid,
  BACHILLERATO_PERIODS,
  PRIMARIA_PERIODS,
  generateMatrixSchedule,
} from '../../components/matrix/DesktopMatrixGrid';
import { SlotEditModal } from '../../components/matrix/SlotEditModal';
import { MatrixZoomControls } from '../../components/matrix/MatrixZoomControls';
import { AbsenceReviewPanel } from '../../components/maker-checker/AbsenceReviewPanel';
import { ConflictAlertModal } from '../../components/common/ConflictAlertModal';
import { NoveltyTransitionModal } from '../../components/matrix/NoveltyTransitionModal';
import { QuickAssignModal } from '../../components/matrix/QuickAssignModal';
import { BatchActionQuickMenu } from '../../components/matrix/BatchActionQuickMenu';
import { CellCoordData } from '../../components/matrix/MatrixCell';
import {
  resolveSelectedCellTargets,
  applyBatchCellAssignment,
  upsertSingleTimeBlock,
} from '../../../domain/services/batch-cell-assignment.service';
import { ensureSeedDataLoaded, generateSeedBlocks } from '../../../infrastructure/seed/initial-seed';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';
import { ALL_OFFICIAL_MATERIAS, getSubjectShortName, getSubjectOfficialName } from '../../../domain/constants/subjects';
import { useTeacherLoad, calculateTeacherAssignedHours } from '../../hooks/useTeacherLoad';
import { TeacherPoolSidebar } from '../../components/matrix/TeacherPoolSidebar';
import { getTodayDayOfWeek, getSupportPlanModalityLabel } from '../../../domain/services/ChronologyEngine';

import {
  Calendar,
  Layers,
  Search,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Check,
} from 'lucide-react';

const BACHILLERATO_GRADE_LEVELS = ['all', '6°', '7°', '8°', '9°', '10°', '11°'];
const PRIMARIA_GRADE_LEVELS = ['all', '1°', '2°', '3°', '4°', '5°'];
const TRANSICION_GRADE_LEVELS = ['all', 'Transición 1', 'Transición 2'];

export const CoordinatorDesktopMatrixPage: React.FC = () => {
  // Shared Navbar Context: Level Toggle, Review Drawer, Pending Count, KPIs and Filters
  const {
    selectedShift,
    isReviewDrawerOpen,
    setIsReviewDrawerOpen,
    setPendingRequestsCount,
    setKpiStats,
    statusFilter,
    setStatusFilter,
    searchTerm,
    setSearchTerm,
    setActiveTeachers,
    setOfficialSubjects,
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    meetingDays,
    setMeetingDay,
    eventDays,
    setEventDay,
    scheduleTypes,
    setScheduleType,
    setOnReload,
    teachers,
    setTeachers,
    getTeacherColor,
    openTeacherModal,
    setOnRequestNoveltyModal,
    setCanUndo,
    setOnUndo,
    selectedCells,
    setSelectedCells,
    toggleSelectedCell,
    clearSelectedCells,
    setOnBatchDelete,
    weekHeaders,
    customHolidays,
    toggleHoliday,
    currentSection,
    currentPeriod,
    currentAcademicWeek,
    activeWeekSlot,
    setActiveWeekSlot,
    isAutoNextWeekCutoff,
    activeAnchorDate,
    activeMondayIso,
    cloneCurrentWeekToNextWeek,
  } = useCoordinatorMatrix();

  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    searchInputRef.current?.focus();
  }, [setSearchTerm]);

  // Repositories & Use Cases
  const timeBlockRepo = useMemo(() => new FirestoreTimeBlockRepository(), []);
  const absenceRepo = useMemo(() => new FirestoreAbsenceRequestRepository(), []);
  const userRepo = useMemo(() => new FirestoreUserRepository(), []);
  const classroomRepo = useMemo(() => new FirestoreClassroomRepository(), []);
  const gradeRepo = useMemo(() => new FirestoreGradeRepository(), []);

  const updateSlotUseCase = useMemo(
    () => new UpdateSlotWithConstraintsUseCase(timeBlockRepo),
    [timeBlockRepo]
  );
  const reviewAbsenceUseCase = useMemo(
    () => new ReviewAbsenceRequestUseCase(absenceRepo, timeBlockRepo),
    [absenceRepo, timeBlockRepo]
  );

  // Core Data States - Hidratación de Estado Inicial Consolidada 2026
  const [timeBlocks, setTimeBlocks] = useState<TimeBlockEntity[]>(() => {
    ensureSeedDataLoaded();
    try {
      const isBlankMode = localStorage.getItem('ievf_blank_matrix_mode') === '1';
      const saved = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0) {
            return parsed;
          }
          if (isBlankMode) {
            return [];
          }
        }
      } else if (isBlankMode) {
        return [];
      }
    } catch (err) {
      console.warn('[CoordinatorMatrix] Error al leer semilla consolidada 2026:', err);
    }
    return generateSeedBlocks();
  });
  const [absenceRequests, setAbsenceRequests] = useState<AbsenceRequestEntity[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomEntity[]>([]);
  const [grades, setGrades] = useState<GradeEntity[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filter States: Inicialización Automática en el Día Actual de la Semana (o Lunes si es Próxima Semana / post-viernes 12:10 PM)
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => getTodayDayOfWeek(new Date(), activeWeekSlot));
  const [selectedGrade, setSelectedGrade] = useState<string>('all');

  useEffect(() => {
    const handleWeekSlotChanged = (ev: Event) => {
      const customEv = ev as CustomEvent<{ slot: 'current' | 'next'; mondayIso: string }>;
      const nextSlot = customEv.detail?.slot || activeWeekSlot;
      if (nextSlot === 'next') {
        setSelectedDay('lunes');
      } else {
        setSelectedDay(getTodayDayOfWeek(new Date(), 'current'));
      }
      try {
        const saved = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setTimeBlocks(parsed);
          }
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('week_slot_changed', handleWeekSlotChanged);
    return () => window.removeEventListener('week_slot_changed', handleWeekSlotChanged);
  }, [activeWeekSlot]);

  const isMeetingDay = Boolean(meetingDays[`${selectedShift}_${selectedDay}`] ?? meetingDays[selectedDay]);
  const isEventDay = false;
  const rawScheduleType =
    scheduleTypes[`${selectedShift}_${selectedDay}`] || scheduleTypes[selectedDay] || 'A';
  const isSupportPlanDay = selectedShift === 'morning' && rawScheduleType === 'D' && !isMeetingDay;
  const activeScheduleType: 'A' | 'B' | 'C' | 'D' = isSupportPlanDay
    ? 'D'
    : isMeetingDay
    ? 'B'
    : 'A';
  const supportPlanModalityLabel = useMemo(
    () => getSupportPlanModalityLabel(activeAnchorDate, currentPeriod),
    [activeAnchorDate, currentPeriod]
  );
  const activeDayHeader = useMemo(() => weekHeaders.find((w) => w.id === selectedDay), [weekHeaders, selectedDay]);
  const [isGradeMenuOpen, setIsGradeMenuOpen] = useState(false);
  const gradeMenuRef = useRef<HTMLDivElement>(null);
  const [isDayMenuOpen, setIsDayMenuOpen] = useState(false);
  const dayMenuRef = useRef<HTMLDivElement>(null);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isModeMenuOpen && !isGradeMenuOpen && !isDayMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (modeMenuRef.current && !modeMenuRef.current.contains(target)) {
        setIsModeMenuOpen(false);
      }
      if (gradeMenuRef.current && !gradeMenuRef.current.contains(target)) {
        setIsGradeMenuOpen(false);
      }
      if (dayMenuRef.current && !dayMenuRef.current.contains(target)) {
        setIsDayMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModeMenuOpen, isGradeMenuOpen, isDayMenuOpen]);


  // UI Modals & Drawers
  const [selectedSlot, setSelectedSlot] = useState<TimeBlockEntity | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeConflict, setActiveConflict] = useState<CollisionValidationResult | null>(null);

  // Novelty Discard Dropzone & Transition Modal States
  const [noveltyPendingBlock, setNoveltyPendingBlock] = useState<TimeBlockEntity | null>(null);
  const [noveltySelectedBlocks, setNoveltySelectedBlocks] = useState<TimeBlockEntity[]>([]);
  const [isNoveltyModalOpen, setIsNoveltyModalOpen] = useState(false);

  // Feedback Visual de Rechazo (Toast Alert)
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Multidimensional Selection States (Ctrl/Cmd toggle + Shift 2D Bounding Box)
  const [selectedCellIds, setSelectedCellIds] = useState<Set<string>>(new Set());
  const [lastSelectedCoord, setLastSelectedCoord] = useState<{
    gradeIndex: number;
    periodIndex: number;
    slotId: string;
  } | null>(null);

  // Quick Assignment Modal State (Asignación Inversa)
  const [quickAssignTarget, setQuickAssignTarget] = useState<{
    grade: GradeEntity;
    period: number;
    block: TimeBlockEntity | null;
    startTime: string;
    endTime: string;
  } | null>(null);

  // Estructura de Memoria (State History): Undo Stack limitado a los últimos 20 movimientos
  const [history, setHistory] = useState<TimeBlockEntity[][]>([]);

  // Sincronización del estado de habilitación con el botón visual de Navbar
  useEffect(() => {
    setCanUndo(history.length > 0);
  }, [history.length, setCanUndo]);

  // Motor de Captura (Snapshotting): Inyecta copia profunda estricta antes de cada mutación
  const pushSnapshot = useCallback(() => {
    setHistory((prev) => {
      const snapshot: TimeBlockEntity[] = JSON.parse(JSON.stringify(timeBlocks));
      const trimmed = prev.length >= 20 ? prev.slice(prev.length - 19) : prev;
      return [...trimmed, snapshot];
    });
  }, [timeBlocks]);

  // Sincronización Continua (Write-Through Cache + Cloud Sync con Debounce y Deduplicación por Hash):
  // Guarda instantáneamente en localStorage y mantiene sincronizada la Consulta Pública oficial
  useEffect(() => {
    const isBlankMode = localStorage.getItem('ievf_blank_matrix_mode') === '1';
    if (Array.isArray(timeBlocks) && (timeBlocks.length > 0 || isBlankMode)) {
      if (timeBlocks.length > 0 && isBlankMode) {
        localStorage.removeItem('ievf_blank_matrix_mode');
      }
      localStorage.setItem('villaFloraMatrix', JSON.stringify(timeBlocks));
      localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(timeBlocks));

      if (teachers.length > 0) {
        const snapshot = savePublicScheduleSnapshot(
          timeBlocks,
          teachers,
          currentPeriod || '3° Periodo',
          currentAcademicWeek || 8,
          {
            meetingDays,
            eventDays,
            customHolidays,
            scheduleTypes,
            activeWeekSlot,
            anchorMondayIso: activeMondayIso,
          }
        );

        const timer = setTimeout(() => {
          publishScheduleToCloud(snapshot).catch((err) => {
            console.warn('[CoordinatorMatrix] Error sincronizando cambios en la nube:', err);
          });
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [timeBlocks, teachers, currentPeriod, currentAcademicWeek, meetingDays, eventDays, customHolidays, scheduleTypes, activeWeekSlot, activeMondayIso]);

  // Initialize and load catalogs and time blocks
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    ensureSeedDataLoaded();

    Promise.all([
      userRepo.getTeachers(),
      classroomRepo.getAll(),
      gradeRepo.getAll(),
      timeBlockRepo.getAll(),
    ])
      .then(([t, c, g, b]) => {
        if (!isMounted) return;
        setTeachers((prev) => (JSON.stringify(prev) === JSON.stringify(t) ? prev : t));
        setClassrooms(c);
        setGrades(g);
        const isBlankMode = localStorage.getItem('ievf_blank_matrix_mode') === '1';
        if (b && (b.length > 0 || isBlankMode)) {
          setTimeBlocks((prev) => (JSON.stringify(prev) === JSON.stringify(b) ? prev : b));
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.warn('[CoordinatorMatrix] Error loading initial catalogs:', err);
        if (isMounted) setIsLoading(false);
      });

    // Real-time subscriptions
    const unsubBlocks = timeBlockRepo.subscribe((blocks) => {
      if (!isMounted) return;
      setTimeBlocks((prev) => {
        if (prev === blocks) return prev;
        if (prev.length === blocks.length && JSON.stringify(prev) === JSON.stringify(blocks)) {
          return prev;
        }
        return blocks;
      });
      setIsLoading(false);
    });
    const unsubAbsences = absenceRepo.subscribe((reqs) => {
      if (!isMounted) return;
      setAbsenceRequests((prev) => (JSON.stringify(prev) === JSON.stringify(reqs) ? prev : reqs));
    });

    // Real-time propagation of teacher profile & color changes without reload
    const unsubUsers = userRepo.subscribe((allUsers) => {
      if (!isMounted) return;
      const nextTeachers = allUsers.filter((u) => u.role === 'teacher');
      setTeachers((prev) =>
        prev.length === nextTeachers.length && JSON.stringify(prev) === JSON.stringify(nextTeachers)
          ? prev
          : nextTeachers
      );
    });

    const handleTeacherUpdated = () => {
      if (!isMounted) return;
      userRepo.getTeachers().then((t) => {
        if (isMounted) {
          setTeachers((prev) =>
            prev.length === t.length && JSON.stringify(prev) === JSON.stringify(t) ? prev : t
          );
        }
      });
    };

    window.addEventListener('users_collection_updated', handleTeacherUpdated);
    window.addEventListener('teacher_color_updated', handleTeacherUpdated);

    return () => {
      isMounted = false;
      unsubBlocks();
      unsubAbsences();
      unsubUsers();
      window.removeEventListener('users_collection_updated', handleTeacherUpdated);
      window.removeEventListener('teacher_color_updated', handleTeacherUpdated);
    };
  }, [userRepo, classroomRepo, gradeRepo, timeBlockRepo, absenceRepo, setTeachers]);

  // Pending absence requests count
  const pendingRequests = useMemo(
    () => absenceRequests.filter((r) => r.status === 'pending'),
    [absenceRequests]
  );

  useEffect(() => {
    setPendingRequestsCount(pendingRequests.length);
  }, [pendingRequests.length, setPendingRequestsCount]);

  useEffect(() => {
    setSelectedGrade('all');
  }, [selectedShift]);

  // Filtered grades for columns (Eje X) - Mapeo Estricto de Hojas Excel
  const filteredGrades = useMemo(() => {
    let list = grades.filter((g) => g.shift === selectedShift);
    if (selectedGrade !== 'all') {
      const cleanLevel = selectedGrade.replace('°', '');
      list = list.filter(
        (g) =>
          g.gradeLevel === selectedGrade ||
          g.fullName === selectedGrade ||
          g.fullName.startsWith(cleanLevel) ||
          g.fullName.includes(selectedGrade)
      );
    }
    return list;
  }, [grades, selectedShift, selectedGrade]);

  // Catálogo Único Autorizado MEN (Single Source of Truth)
  const officialSubjects = useMemo(() => {
    return ALL_OFFICIAL_MATERIAS.map((m) => m.officialName);
  }, []);

  useEffect(() => {
    setOfficialSubjects(officialSubjects);
  }, [officialSubjects, setOfficialSubjects]);

  // Unificación de Estado: Array único derivado para el día y jornada seleccionados
  const currentBlocks = useMemo(() => {
    return timeBlocks.filter(
      (b) => b.dayOfWeek === selectedDay && b.shift === selectedShift
    );
  }, [timeBlocks, selectedDay, selectedShift]);

  // Función pura para determinar cobertura docente en un bloque
  const isBlockCovered = useCallback((block: TimeBlockEntity): boolean => {
    if (block.status === 'absent') return false;
    if (block.status === 'covered' && block.replacementTeacherId) return true;
    const name = ((block as any).teacher_name || block.teacherName || '').trim();
    if (!name || name.toLowerCase() === 'sin asignar') return false;
    return true;
  }, []);

  // Cálculo Reactivo Estricto de KPIs
  const totalBlocks = currentBlocks.length;

  const coveredBlocks = useMemo(() => {
    return currentBlocks.filter(isBlockCovered).length;
  }, [currentBlocks, isBlockCovered]);

  const uncoveredBlocks = totalBlocks - coveredBlocks;

  // Migración de Estado: Sincronización reactiva con el módulo de KPIs en Navbar
  useEffect(() => {
    setKpiStats({
      total: totalBlocks,
      covered: coveredBlocks,
      uncovered: uncoveredBlocks,
      isLoading,
    });
  }, [totalBlocks, coveredBlocks, uncoveredBlocks, isLoading, setKpiStats]);

  // Filtered time blocks for current Day, Shift, search, and status filter
  const currentFilteredBlocks = useMemo(() => {
    let current = currentBlocks;

    if (searchTerm.trim() !== '') {
      const normalizeStr = (s: string | null | undefined) =>
        (s || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

      const tokens = normalizeStr(searchTerm).split(/\s+/).filter(Boolean);
      if (tokens.length > 0) {
        current = current.filter((b) => {
          const haystack = [
            (b as any).teacher_name || b.teacherName || '',
            b.replacementTeacherName || '',
            b.subject || '',
            b.classroomName || '',
            b.gradeName || '',
            b.motivo_novedad || '',
            b.notes || '',
          ]
            .map(normalizeStr)
            .join(' ');

          return tokens.every((tok) => haystack.includes(tok));
        });
      }
    }

    if (statusFilter === 'covered') {
      current = current.filter((b) => isBlockCovered(b));
    } else if (statusFilter === 'uncovered') {
      current = current.filter((b) => !isBlockCovered(b));
    }

    return current;
  }, [currentBlocks, searchTerm, statusFilter, isBlockCovered]);

  // Distinct active teachers in current day with pastel color identity
  const activeTeachersSummary = useMemo(() => {
    const summaryMap = new Map<string, { teacherName: string; count: number }>();
    currentBlocks.forEach((b) => {
      const isActualClass = (!b.block_type || b.block_type === 'class') && b.teacherId !== 'unassigned' && b.teacherName !== 'Sin Asignar';
      if (isActualClass && b.teacherId && b.teacherName) {
        const existing = summaryMap.get(b.teacherId) || { teacherName: b.teacherName, count: 0 };
        existing.count += 1;
        summaryMap.set(b.teacherId, existing);
      }
    });

    return Array.from(summaryMap.entries()).map(([teacherId, data]) => {
      const visualIdentity = getTeacherVisualIdentity(teacherId, data.teacherName);
      const color = getTeacherColor(teacherId, data.teacherName);
      return {
        teacherId,
        teacherName: data.teacherName,
        hoursCount: data.count,
        identity: {
          ...visualIdentity,
          color_hex: color,
          originalExcelHex: color,
          accentColor: color,
          avatarBg: color,
        },
      };
    });
  }, [currentBlocks, teachers, getTeacherColor]);

  // Sync active teachers with shared context for the Navbar Popover
  useEffect(() => {
    setActiveTeachers(activeTeachersSummary);
  }, [activeTeachersSummary, setActiveTeachers]);

  // Handle slot click
  const handleSlotSelect = useCallback((block: TimeBlockEntity) => {
    setSelectedSlot(block);
    setIsEditModalOpen(true);
  }, []);

  // Handle slot update through Constraint Solver Use Case
  const handleSaveSlot = async (updates: any) => {
    pushSnapshot();
    try {
      const updatedBlock = await updateSlotUseCase.execute(updates);
      setTimeBlocks((prev) => upsertSingleTimeBlock(prev, updatedBlock));
    } catch (err: any) {
      if (err instanceof ConstraintCollisionError) {
        setActiveConflict(err.validation);
      }
      throw err;
    }
  };

  // Handle quick inline classroom change (e.g. for rotating group 9°1)
  const handleQuickChangeClassroom = useCallback(
    async (block: TimeBlockEntity, newClassroom: string) => {
      pushSnapshot();
      const updatedBlock: TimeBlockEntity = {
        ...block,
        classroomId: newClassroom,
        classroomName: newClassroom,
        updatedAt: new Date().toISOString(),
      };
      const nextBlocks = upsertSingleTimeBlock(timeBlocks, updatedBlock);
      setTimeBlocks(nextBlocks);
      try {
        localStorage.removeItem('ievf_blank_matrix_mode');
        localStorage.setItem('villaFloraMatrix', JSON.stringify(nextBlocks));
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(nextBlocks));
        savePublicScheduleSnapshot(
          nextBlocks,
          teachers,
          currentPeriod || '3° Periodo',
          currentAcademicWeek || 8,
          {
            meetingDays,
            eventDays,
            customHolidays,
            scheduleTypes,
          }
        );
        await timeBlockRepo.update(block.id, {
          classroomId: newClassroom,
          classroomName: newClassroom,
          updatedAt: updatedBlock.updatedAt,
        });
        window.dispatchEvent(new Event('schedule_matrix_updated'));
        showToast(`Aula actualizada: ${block.gradeName} → ${newClassroom}`);
      } catch (err) {
        console.error('[handleQuickChangeClassroom] Error actualizando aula:', err);
      }
    },
    [
      pushSnapshot,
      timeBlocks,
      teachers,
      currentPeriod,
      currentAcademicWeek,
      meetingDays,
      eventDays,
      customHolidays,
      scheduleTypes,
      timeBlockRepo,
      showToast,
    ]
  );

  // Handle Maker-Checker Review
  const handleReviewAbsence = async (params: {
    requestId: string;
    decision: 'approved' | 'rejected';
    replacementTeacherId?: string | null;
    replacementTeacherName?: string | null;
    reviewNotes?: string;
  }) => {
    await reviewAbsenceUseCase.execute({
      requestId: params.requestId,
      decision: params.decision,
      reviewerName: 'Coordinadora Académica (I.E. Villa Flora)',
      replacementTeacherId: params.replacementTeacherId,
      replacementTeacherName: params.replacementTeacherName,
      reviewNotes: params.reviewNotes,
    });
  };

  // Handle Drag and Drop End with Strict Atomic Validation
  const executeAtomicSlotMove = async (
    draggableId: string,
    sourceDroppableId: string,
    destinationDroppableId: string,
    overrideSubject?: string
  ) => {
    // 1. If dropped in the exact same cell -> No change
    if (destinationDroppableId === sourceDroppableId) {
      return;
    }

    // 2. Parse destination slot ID: 'drop-aula...-g_...-hora...'
    const targetSlot = parseSlotDroppableId(destinationDroppableId);
    if (!targetSlot) {
      return;
    }

    const targetGrade = grades.find((g) => g.id === targetSlot.gradeId);
    if (!targetGrade) {
      return;
    }

    const isNovelty = draggableId.startsWith('novelty-');
    const isTeacherCard = draggableId.startsWith('teacher-');

    // 3. ATOMICIDAD REGLA 1: Verificar que la celda destino no esté ocupada por otra clase activa (cuando se mueve una celda de la matriz)
    const existingTargetBlock = timeBlocks.find(
      (b) =>
        b.dayOfWeek === selectedDay &&
        b.shift === selectedShift &&
        b.gradeId === targetSlot.gradeId &&
        b.period === targetSlot.period &&
        b.status !== 'cancelled'
    );

    const isCellOccupied = Boolean(
      existingTargetBlock &&
      existingTargetBlock.teacherId !== 'unassigned' &&
      existingTargetBlock.teacherName !== 'Sin Asignar' &&
      existingTargetBlock.subject !== 'Sin asignación académica' &&
      existingTargetBlock.block_type !== 'exit'
    );

    if (isCellOccupied && existingTargetBlock && !isTeacherCard) {
      // Cell is already occupied! Reject drop and rebound
      setActiveConflict({
        isValid: false,
        conflictType: 'classroom',
        conflictingBlock: existingTargetBlock,
        message: `¡Celda Destino Ocupada! La posición en ${targetGrade.fullName} (Hora ${targetSlot.period}) ya está asignada a la materia "${existingTargetBlock.subject}" (${existingTargetBlock.teacherName}). Debe soltar sobre una celda Sin asignación académica.`,
      });
      return; // Return without updating UI -> Rebounds to original coordinate!
    }

    // 4. ATOMICIDAD REGLA 2: Verificar que el docente no tenga colisión horaria en otra aula
    let draggedBlock: TimeBlockEntity | null = null;
    let movingTeacherId: string = '';
    let movingTeacherName: string = '';

    if (isNovelty) {
      const reqId = draggableId.replace('novelty-', '');
      const req = absenceRequests.find((r) => r.id === reqId);
      if (!req) return;
      movingTeacherId = req.replacement_teacher_id || req.teacher_id;
      movingTeacherName = req.replacement_teacher_name || req.teacher_name || 'Docente';
    } else if (isTeacherCard) {
      const tId = draggableId.replace('teacher-', '');
      const teacher = teachers.find((t) => t.id === tId);
      if (!teacher) return;
      movingTeacherId = teacher.id;
      movingTeacherName = teacher.displayName;
    } else {
      draggedBlock = timeBlocks.find((b) => b.id === draggableId) || null;
      if (!draggedBlock) return;
      movingTeacherId = draggedBlock.teacherId;
      movingTeacherName = draggedBlock.teacherName;
    }

    // Doble Cortocircuito en Drag & Drop (Drop Validation):
    if (movingTeacherId && movingTeacherId !== 'unassigned' && movingTeacherName !== 'Sin Asignar') {
      const teacherObj = teachers.find(
        (t) => t.id === movingTeacherId || t.displayName.toLowerCase() === movingTeacherName.toLowerCase()
      );
      if (teacherObj) {
        const currentAssignedHours = calculateTeacherAssignedHours(
          teacherObj.id,
          teacherObj.displayName,
          timeBlocks
        );
        const rawMax = Number(teacherObj.maxWeeklyHours);
        const maxWeeklyHours = !rawMax || rawMax === 22 || rawMax === 25 ? 24 : rawMax;

        // Validación 1 (Capacidad):
        if (isTeacherCard && currentAssignedHours >= maxWeeklyHours) {
          showToast(`Límite legal alcanzado: ${teacherObj.displayName} ya tiene ${currentAssignedHours}/${maxWeeklyHours}h asignadas`);
          return;
        }
      }
    }

    // Check teacher collision at target period (excluding the target cell itself if replacing from teacher pool)
    if (movingTeacherId && movingTeacherId !== 'unassigned' && movingTeacherName !== 'Sin Asignar') {
      const teacherCollision = timeBlocks.find(
        (b) =>
          b.id !== (draggedBlock ? draggedBlock.id : '') &&
          !(isTeacherCard && existingTargetBlock && b.id === existingTargetBlock.id) &&
          b.gradeId !== targetGrade.id &&
          b.dayOfWeek === selectedDay &&
          b.shift === selectedShift &&
          b.period === targetSlot.period &&
          b.status !== 'cancelled' &&
          b.status !== 'absent' &&
          (b.teacherId === movingTeacherId ||
            (b.status === 'covered' && b.replacementTeacherId === movingTeacherId))
      );

      if (teacherCollision) {
        setActiveConflict({
          isValid: false,
          conflictType: 'teacher',
          conflictingBlock: teacherCollision,
          message: `¡Colisión Horaria de Docente! El profesor "${movingTeacherName}" ya tiene clase en el grupo "${teacherCollision.gradeName}" (${teacherCollision.classroomName}) durante la Hora ${targetSlot.period} (${selectedDay}). Un docente no puede dictar en dos aulas simultáneamente.`,
        });
        return; // Return without updating UI -> Rebounds to original coordinate!
      }
    }

    // Period 1 is strictly locked for Atención a Padres on meeting days in Bachillerato
    if (isMeetingDay && selectedShift === 'morning' && targetSlot.period === 1) {
      setActiveConflict({
        isValid: false,
        conflictType: 'classroom',
        message: '¡Franja Bloqueada! El Horario (06:10 a 07:00) está reservado exclusivamente para la Atención a Padres de Familia.',
      });
      return;
    }

    // Safety guard: Primaria y Transición constan estrictamente de 5 horas pedagógicas
    if ((selectedShift === 'afternoon' || selectedShift === 'transicion-1') && targetSlot.period > 5) {
      setActiveConflict({
        isValid: false,
        conflictType: 'classroom',
        message: '¡Franja Inválida! La jornada finaliza estrictamente en la 5ª hora pedagógica.',
      });
      return;
    }

    // Period timing calculations with dynamic schedule
    const { periods: periodDefs } = generateMatrixSchedule(selectedShift, isMeetingDay, isEventDay, activeScheduleType);
    const periodInfo = periodDefs.find((p) => p.period === targetSlot.period);
    const isTargetT2 = targetGrade.id === 'g-trans-2' || targetGrade.fullName === 'Transición 2';
    const rawTimeRange =
      (isTargetT2 && periodInfo?.secondaryTime ? periodInfo.secondaryTime : periodInfo?.time) ||
      (selectedShift === 'morning' ? '06:10 - 07:05' : isTargetT2 ? '12:30 - 13:20' : '07:00 - 07:50');
    const [startTime, endTime] = rawTimeRange.split(' - ');
    const preservedTargetClassroom =
      existingTargetBlock?.classroomName &&
      existingTargetBlock.classroomName !== 'Aula (ROTACIÓN)'
        ? existingTargetBlock.classroomName
        : undefined;
    const resolvedTargetClassroom = resolveEffectiveClassroomForBlock({
      gradeId: targetGrade.id,
      gradeName: targetGrade.fullName,
      period: targetSlot.period,
      subject: draggedBlock?.subject || existingTargetBlock?.subject,
      classroomName:
        preservedTargetClassroom ||
        targetGrade.defaultClassroomId ||
        draggedBlock?.classroomName ||
        'Aula Base',
    });
    const targetClassroomId = resolvedTargetClassroom;
    const targetClassroomName = resolvedTargetClassroom;

    // 5. SOLO TRAS VALIDAR: Snapshotting de historial Undo + Actualización Optimista + updateDoc en Firestore
    pushSnapshot();

    if (draggedBlock) {
      const previousBlock = { ...draggedBlock };
      const updates: Partial<TimeBlockEntity> = {
        dayOfWeek: selectedDay,
        shift: targetGrade.shift || selectedShift,
        gradeId: targetGrade.id,
        gradeName: targetGrade.fullName,
        period: targetSlot.period,
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        classroomId: targetClassroomId,
        classroomName: targetClassroomName,
        updatedAt: new Date().toISOString(),
      };

      // Optimistic UI update: remove any placeholder exit block at the destination so the moved block takes its place
      setTimeBlocks((prev) =>
        prev
          .filter(
            (b) =>
              b.id === draggedBlock!.id ||
              !(
                b.dayOfWeek === selectedDay &&
                b.shift === selectedShift &&
                b.gradeId === targetGrade.id &&
                b.period === targetSlot.period
              )
          )
          .map((b) => (b.id === draggedBlock!.id ? { ...b, ...updates } : b))
      );

      try {
        await timeBlockRepo.update(draggedBlock.id, updates);
      } catch (err) {
        console.error('Error actualizando TimeBlock en Firestore:', err);
        setTimeBlocks((prev) =>
          prev.map((b) => (b.id === draggedBlock!.id ? previousBlock : b))
        );
        setActiveConflict({
          isValid: false,
          message: 'Error de conexión con Firestore al mover el bloque. Se restauró a la posición original.',
        });
      }
    } else if (isNovelty) {
      const reqId = draggableId.replace('novelty-', '');
      const req = absenceRequests.find((r) => r.id === reqId);
      if (req) {
        const newBlockId = existingTargetBlock?.id || `tb-${targetGrade.id}-${selectedDay}-p${targetSlot.period}`;
        const newBlock: TimeBlockEntity = {
          id: newBlockId,
          block_type: 'class',
          dayOfWeek: selectedDay,
          period: targetSlot.period,
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          shift: selectedShift,
          gradeId: targetGrade.id,
          gradeName: targetGrade.fullName,
          subject: req.reason || 'Reemplazo Asignado',
          teacherId: movingTeacherId,
          teacherName: movingTeacherName,
          classroomId: targetClassroomId,
          classroomName: targetClassroomName,
          status: 'covered',
          absenceRequestId: req.id,
          replacementTeacherId: req.replacement_teacher_id || null,
          replacementTeacherName: req.replacement_teacher_name || null,
          notes: `Reasignado mediante Drag & Drop desde Novedad #${req.id}`,
          updatedAt: new Date().toISOString(),
        };

        setTimeBlocks((prev) => [
          ...prev.filter(
            (b) =>
              b.id !== newBlockId &&
              !(
                b.dayOfWeek === selectedDay &&
                b.shift === selectedShift &&
                b.gradeId === targetGrade.id &&
                b.period === targetSlot.period
              )
          ),
          newBlock,
        ]);
        try {
          await timeBlockRepo.update(newBlockId, newBlock);
        } catch (err) {
          console.error('Error al registrar novedad en time_blocks:', err);
          setTimeBlocks((prev) => prev.filter((b) => b.id !== newBlockId));
        }
      }
    } else if (isTeacherCard) {
      const newBlockId = existingTargetBlock?.id || `tb-${targetGrade.id}-${selectedDay}-p${targetSlot.period}`;
      const teacherObj = teachers.find((t) => t.id === movingTeacherId);
      const assignedSubject =
        overrideSubject ||
        teacherObj?.subjects?.[0] ||
        teacherObj?.assignedSubject ||
        teacherObj?.subject ||
        'Clase';
      const newBlock: TimeBlockEntity = {
        id: newBlockId,
        block_type: 'class',
        dayOfWeek: selectedDay,
        period: targetSlot.period,
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        shift: selectedShift,
        gradeId: targetGrade.id,
        gradeName: targetGrade.fullName,
        subject: assignedSubject,
        teacherId: movingTeacherId,
        teacherName: movingTeacherName,
        classroomId: targetClassroomId,
        classroomName: targetClassroomName,
        status: 'regular',
        motivo_novedad: null,
        notes: null,
        updatedAt: new Date().toISOString(),
      };

      setTimeBlocks((prev) => [
        ...prev.filter(
          (b) =>
            b.id !== newBlockId &&
            !(
              b.dayOfWeek === selectedDay &&
              b.shift === selectedShift &&
              b.gradeId === targetGrade.id &&
              b.period === targetSlot.period
            )
        ),
        newBlock,
      ]);
      try {
        await timeBlockRepo.update(newBlockId, newBlock);
        window.dispatchEvent(new Event('schedule_matrix_updated'));
      } catch (err) {
        console.error('Error al registrar nuevo bloque desde TeacherPool:', err);
      }
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    await executeAtomicSlotMove(draggableId, source.droppableId, destination.droppableId);
  };

  const handleHtml5Drop = async (
    draggedItem: any,
    sourceDroppableId: string,
    targetDroppableId: string
  ) => {
    let draggableId = '';
    if (typeof draggedItem === 'string') {
      draggableId = draggedItem;
    } else if (
      draggedItem?.isTeacherCard ||
      draggedItem?.type === 'TEACHER_POOL' ||
      (draggedItem?.teacherId && !draggedItem?.gradeId)
    ) {
      draggableId = draggedItem.id || `teacher-${draggedItem.teacherId}`;
    } else {
      draggableId =
        draggedItem?.id || (draggedItem?.noveltyId ? `novelty-${draggedItem.noveltyId}` : '');
    }

    if (!draggableId) return;

    await executeAtomicSlotMove(
      draggableId,
      sourceDroppableId,
      targetDroppableId,
      typeof draggedItem === 'object' ? draggedItem?.subject : undefined
    );
  };

  // Intercepción de Estado: Al soltar en la Papelera / Registro de Novedades,
  // suspende inmediatamente cualquier actualización en la matriz y abre el modal
  const handleDropOnNoveltyZone = useCallback(
    (droppedItem: any) => {
      let block: TimeBlockEntity | null = null;
      if (droppedItem && typeof droppedItem === 'object') {
        if (droppedItem.id && droppedItem.gradeId) {
          block = droppedItem as TimeBlockEntity;
        } else if (droppedItem.item) {
          block = droppedItem.item as TimeBlockEntity;
        }
      }
      if (!block && typeof droppedItem === 'string') {
        block = timeBlocks.find((b) => b.id === droppedItem) || null;
      }
      if (!block) return;

      // Suspende inmediatamente cualquier actualización y abre el modal
      setNoveltyPendingBlock(block);
      setNoveltySelectedBlocks([block]);
      setIsNoveltyModalOpen(true);
    },
    [timeBlocks]
  );

  // Limpiar selección de celdas al cambiar de día o jornada
  useEffect(() => {
    setSelectedCellIds(new Set());
  }, [selectedDay, selectedShift]);

  // Sincronizar contexto global de casillas seleccionadas con el Set local
  useEffect(() => {
    setSelectedCells(Array.from(selectedCellIds));
  }, [selectedCellIds, setSelectedCells]);

  // Motor de Selección Múltiple (State & Listeners)
  const handleCellClick = useCallback(
    (e: React.MouseEvent, data: CellCoordData) => {
      // Lógica Ctrl / Cmd: Intercala (toggle) el ID de esa celda en el Set de selecciones
      if (e.ctrlKey || e.metaKey) {
        setSelectedCellIds((prev) => {
          const next = new Set(prev);
          const blockId = data.block?.id;
          const hadSlot = next.has(data.slotId) || Boolean(blockId && next.has(blockId));
          if (hadSlot) {
            next.delete(data.slotId);
            if (blockId) next.delete(blockId);
          } else {
            next.add(data.slotId);
          }
          return next;
        });
        setLastSelectedCoord({
          gradeIndex: data.gradeIndex,
          periodIndex: data.periodIndex,
          slotId: data.slotId,
        });
        return;
      }

      // Lógica Shift: Calcula el rango 2D entre lastSelected y la celda actual y añade todas las celdas intermedias
      if (e.shiftKey && lastSelectedCoord) {
        const minG = Math.min(lastSelectedCoord.gradeIndex, data.gradeIndex);
        const maxG = Math.max(lastSelectedCoord.gradeIndex, data.gradeIndex);
        const minP = Math.min(lastSelectedCoord.periodIndex, data.periodIndex);
        const maxP = Math.max(lastSelectedCoord.periodIndex, data.periodIndex);

        const { periods: allPeriods } = generateMatrixSchedule(selectedShift, isMeetingDay, isEventDay, activeScheduleType);
        const next = new Set(selectedCellIds);

        for (let g = minG; g <= maxG; g++) {
          const grade = filteredGrades[g];
          if (!grade) continue;
          for (let p = minP; p <= maxP; p++) {
            const periodItem = allPeriods[p];
            if (!periodItem) continue;
            const slotId = createSlotDroppableId(grade, periodItem.period);
            next.add(slotId);
          }
        }

        setSelectedCellIds(next);
        return;
      }

      // Clic normal sin modificadores: actualiza lastSelectedCoord
      setLastSelectedCoord({
        gradeIndex: data.gradeIndex,
        periodIndex: data.periodIndex,
        slotId: data.slotId,
      });
      // Si el usuario da clic directo en una celda sin Ctrl/Shift y no era parte del lote seleccionado, resetea la selección
      if (selectedCellIds.size > 0 && !selectedCellIds.has(data.slotId) && !(data.block && selectedCellIds.has(data.block.id))) {
        setSelectedCellIds(new Set());
      }
    },
    [lastSelectedCoord, selectedCellIds, selectedShift, isMeetingDay, isEventDay, activeScheduleType, filteredGrades]
  );

  // Resolución de entidades de bloque según IDs de celda o bloque
  const resolveBlocksForIds = useCallback(
    (ids: string[] | Set<string>): TimeBlockEntity[] => {
      const idList = Array.from(ids);
      const { periods: allPeriods } = generateMatrixSchedule(selectedShift, isMeetingDay, isEventDay, activeScheduleType);
      const batchBlocks: TimeBlockEntity[] = [];

      idList.forEach((sId) => {
        // Coincidencia directa por id de bloque
        const direct = timeBlocks.find((b) => b.id === sId);
        if (direct) {
          batchBlocks.push(direct);
          return;
        }

        // Coincidencia por droppableId
        const parsed = parseSlotDroppableId(sId);
        if (parsed) {
          const found = timeBlocks.find(
            (b) => b.gradeId === parsed.gradeId && b.period === parsed.period && b.dayOfWeek === selectedDay
          );
          if (found) {
            batchBlocks.push(found);
          } else {
            const grade = grades.find((g) => g.id === parsed.gradeId);
            const periodInfo = allPeriods.find((p) => p.period === parsed.period);
            const isT2 = grade?.id === 'g-trans-2' || grade?.fullName === 'Transición 2';
            const [st, et] = (
              (isT2 && periodInfo?.secondaryTime ? periodInfo.secondaryTime : periodInfo?.time) ||
              '06:10 - 07:05'
            ).split(' - ');
            if (grade) {
              const resolvedClassroom = resolveEffectiveClassroomForBlock({
                gradeId: grade.id,
                gradeName: grade.fullName,
                period: parsed.period,
                classroomName: grade.defaultClassroomId || 'Aula Base',
              });
              batchBlocks.push({
                id: `tb-${grade.id}-${selectedDay}-p${parsed.period}`,
                block_type: 'class',
                dayOfWeek: selectedDay,
                period: parsed.period,
                startTime: st.trim(),
                endTime: et.trim(),
                shift: selectedShift,
                gradeId: grade.id,
                gradeName: grade.fullName,
                subject: 'Clase',
                teacherId: 'unassigned',
                teacherName: 'Sin Asignar',
                classroomId: resolvedClassroom,
                classroomName: resolvedClassroom,
                status: 'regular',
                updatedAt: new Date().toISOString(),
              });
            }
          }
        }
      });

      return batchBlocks;
    },
    [timeBlocks, selectedShift, isMeetingDay, isEventDay, activeScheduleType, selectedDay, grades]
  );

  // Micro-interacción de Papelera en Celda: Dispara modal individual o por lote
  const handleTrashCellClick = useCallback(
    (block: TimeBlockEntity, slotId: string) => {
      const allSelected = new Set([...selectedCells, ...Array.from(selectedCellIds)]);
      if ((allSelected.has(slotId) || allSelected.has(block.id)) && allSelected.size > 1) {
        const batchBlocks = resolveBlocksForIds(allSelected);
        setNoveltyPendingBlock(block);
        setNoveltySelectedBlocks(batchBlocks.length > 0 ? batchBlocks : [block]);
        setIsNoveltyModalOpen(true);
      } else {
        setNoveltyPendingBlock(block);
        setNoveltySelectedBlocks([block]);
        setIsNoveltyModalOpen(true);
      }
    },
    [selectedCells, selectedCellIds, resolveBlocksForIds]
  );

  // Acción de Borrado en Lote desde el Botón 'Eliminar' de la barra superior (Vía Clic o Drop)
  const handleBatchDeleteAction = useCallback(() => {
    const allSelected = new Set([...selectedCells, ...Array.from(selectedCellIds)]);
    if (allSelected.size === 0) return;
    const batchBlocks = resolveBlocksForIds(allSelected);
    if (batchBlocks.length > 0) {
      setNoveltyPendingBlock(batchBlocks[0]);
      setNoveltySelectedBlocks(batchBlocks);
      setIsNoveltyModalOpen(true);
    }
  }, [selectedCells, selectedCellIds, resolveBlocksForIds]);

  // Listener para el Botón de Eliminar y evento trigger_batch_delete
  useEffect(() => {
    setOnBatchDelete(handleBatchDeleteAction);

    const handleBatchDeleteEvent = (e: any) => {
      const items = e.detail?.items || [];
      const allSelected = new Set([...items, ...selectedCells, ...Array.from(selectedCellIds)]);
      if (allSelected.size === 0) return;
      const batchBlocks = resolveBlocksForIds(allSelected);
      if (batchBlocks.length > 0) {
        setNoveltyPendingBlock(batchBlocks[0]);
        setNoveltySelectedBlocks(batchBlocks);
        setIsNoveltyModalOpen(true);
      }
    };

    window.addEventListener('trigger_batch_delete', handleBatchDeleteEvent);
    return () => {
      window.removeEventListener('trigger_batch_delete', handleBatchDeleteEvent);
    };
  }, [setOnBatchDelete, handleBatchDeleteAction, selectedCells, selectedCellIds, resolveBlocksForIds]);

  // Alternar selección de celda (Selector circular o atajos)
  const handleToggleSelectCell = useCallback(
    (cellId: string, blockId?: string) => {
      setSelectedCellIds((prev) => {
        const next = new Set(prev);
        const isCurrentlySelected =
          next.has(cellId) || Boolean(blockId && next.has(blockId));
        if (isCurrentlySelected) {
          next.delete(cellId);
          if (blockId) next.delete(blockId);
        } else {
          next.add(cellId);
        }
        return next;
      });
    },
    []
  );

  const handleClearBatchSelection = useCallback(() => {
    setSelectedCellIds(new Set());
    clearSelectedCells();
  }, [clearSelectedCells]);

  // Objetivos deduplicados de selección en lote para el día y jornada activos
  const batchSelectedTargets = useMemo(() => {
    const combinedIds = new Set([...selectedCells, ...Array.from(selectedCellIds)]);
    if (combinedIds.size === 0) return [];
    const { periods: allPeriods } = generateMatrixSchedule(
      selectedShift,
      isMeetingDay,
      isEventDay,
      activeScheduleType
    );
    return resolveSelectedCellTargets({
      selectedIds: combinedIds,
      timeBlocks,
      grades: filteredGrades.length > 0 ? filteredGrades : grades,
      dayOfWeek: selectedDay,
      shift: selectedShift,
      periods: allPeriods,
      isMeetingDay,
    });
  }, [
    selectedCells,
    selectedCellIds,
    selectedShift,
    isMeetingDay,
    isEventDay,
    activeScheduleType,
    timeBlocks,
    filteredGrades,
    grades,
    selectedDay,
  ]);

  const handleBatchAssignTeacher = useCallback(
    async (
      teacher: UserEntity,
      subjectOverride?: string | null,
      overwriteSubject: boolean = true
    ) => {
      if (batchSelectedTargets.length === 0) return;

      pushSnapshot();

      const { nextBlocks, updatedBlocks } = applyBatchCellAssignment({
        targets: batchSelectedTargets,
        timeBlocks,
        dayOfWeek: selectedDay,
        shift: selectedShift,
        teacher,
        subject: subjectOverride || null,
        preserveExistingSubjectWhenTeacherOnly: !overwriteSubject,
      });

      if (updatedBlocks.length === 0) return;

      setTimeBlocks(nextBlocks);
      handleClearBatchSelection();

      try {
        localStorage.removeItem('ievf_blank_matrix_mode');
        localStorage.setItem('villaFloraMatrix', JSON.stringify(nextBlocks));
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(nextBlocks));
        savePublicScheduleSnapshot(
          nextBlocks,
          teachers,
          currentPeriod || '3° Periodo',
          currentAcademicWeek || 8,
          {
            meetingDays,
            eventDays,
            customHolidays,
            scheduleTypes,
          }
        );
        await timeBlockRepo.updateBatch(
          updatedBlocks.map((b) => ({ id: b.id, data: b }))
        );
        window.dispatchEvent(new Event('schedule_matrix_updated'));
      } catch (err) {
        console.error('[handleBatchAssignTeacher] Error persistiendo asignación en lote:', err);
      }
    },
    [
      batchSelectedTargets,
      timeBlocks,
      selectedDay,
      selectedShift,
      pushSnapshot,
      handleClearBatchSelection,
      teachers,
      currentPeriod,
      currentAcademicWeek,
      meetingDays,
      eventDays,
      customHolidays,
      scheduleTypes,
      timeBlockRepo,
    ]
  );

  const handleBatchAssignSubject = useCallback(
    async (subject: string) => {
      if (batchSelectedTargets.length === 0 || !subject.trim()) return;

      pushSnapshot();

      const { nextBlocks, updatedBlocks } = applyBatchCellAssignment({
        targets: batchSelectedTargets,
        timeBlocks,
        dayOfWeek: selectedDay,
        shift: selectedShift,
        subject,
      });

      if (updatedBlocks.length === 0) return;

      setTimeBlocks(nextBlocks);
      handleClearBatchSelection();

      try {
        localStorage.removeItem('ievf_blank_matrix_mode');
        localStorage.setItem('villaFloraMatrix', JSON.stringify(nextBlocks));
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(nextBlocks));
        savePublicScheduleSnapshot(
          nextBlocks,
          teachers,
          currentPeriod || '3° Periodo',
          currentAcademicWeek || 8,
          {
            meetingDays,
            eventDays,
            customHolidays,
            scheduleTypes,
          }
        );
        await timeBlockRepo.updateBatch(
          updatedBlocks.map((b) => ({ id: b.id, data: b }))
        );
        window.dispatchEvent(new Event('schedule_matrix_updated'));
      } catch (err) {
        console.error('[handleBatchAssignSubject] Error persistiendo asignatura en lote:', err);
      }
    },
    [
      batchSelectedTargets,
      timeBlocks,
      selectedDay,
      selectedShift,
      pushSnapshot,
      handleClearBatchSelection,
      teachers,
      currentPeriod,
      currentAcademicWeek,
      meetingDays,
      eventDays,
      customHolidays,
      scheduleTypes,
      timeBlockRepo,
    ]
  );

  // Mutación de Objeto (State Override & Procesamiento en Lote):
  // Soporta opción 'Sin asignación académica' (borrado real devolviendo la celda a estado disponible)
  // o mutación a tipo Novedad ('Novedad docente', 'Actividad sindical', 'Acto cívico', 'Personalizada')
  const handleConfirmNovelty = async (reason: string) => {
    const targetBlocks =
      noveltySelectedBlocks.length > 0
        ? noveltySelectedBlocks
        : noveltyPendingBlock
        ? [noveltyPendingBlock]
        : [];

    if (targetBlocks.length === 0) return;

    // Snapshotting previo a la mutación para el historial de Undo
    pushSnapshot();

    const isResetToEmpty = reason === 'Sin asignación académica';

    if (isResetToEmpty) {
      // Opción de Reseteo (Borrado Real): mutar a celda vacía 'Sin asignación académica'
      const targetIds = new Set(targetBlocks.map((b) => b.id));
      const updatedList = timeBlocks.map((b) => {
        if (targetIds.has(b.id)) {
          return {
            ...b,
            block_type: 'exit' as const,
            subject: 'Sin asignación académica',
            teacherId: 'unassigned',
            teacherName: 'Sin Asignar',
            status: 'regular' as const,
            motivo_novedad: null,
            notes: null,
            updatedAt: new Date().toISOString(),
          };
        }
        return b;
      });

      for (const tb of targetBlocks) {
        if (!timeBlocks.some((b) => b.id === tb.id)) {
          updatedList.push({
            ...tb,
            block_type: 'exit',
            subject: 'Sin asignación académica',
            teacherId: 'unassigned',
            teacherName: 'Sin Asignar',
            status: 'regular',
            motivo_novedad: null,
            notes: null,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      setTimeBlocks(updatedList);
      setIsNoveltyModalOpen(false);
      setNoveltyPendingBlock(null);
      setNoveltySelectedBlocks([]);
      setSelectedCellIds(new Set());
      clearSelectedCells();

      try {
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(updatedList));
        localStorage.setItem('villaFloraMatrix', JSON.stringify(updatedList));
        window.dispatchEvent(new Event('schedule_matrix_updated'));
        savePublicScheduleSnapshot(
          updatedList,
          teachers,
          currentPeriod,
          currentAcademicWeek
        );
        await timeBlockRepo.updateBatch(
          targetBlocks.map((b) => ({
            id: b.id,
            data: {
              block_type: 'exit',
              subject: 'Sin asignación académica',
              teacherId: 'unassigned',
              teacherName: 'Sin Asignar',
              status: 'regular',
              motivo_novedad: null,
              notes: null,
              updatedAt: new Date().toISOString(),
            },
          }))
        );
      } catch (err) {
        console.error('[handleConfirmNovelty] Error persistiendo borrado de celdas:', err);
      }
    } else {
      // Mutación a Novedad Institucional
      const targetIds = new Set(targetBlocks.map((b) => b.id));
      const updatedList = timeBlocks.map((b) => {
        if (targetIds.has(b.id)) {
          return {
            ...b,
            block_type: 'novelty' as const,
            motivo_novedad: reason,
            notes: `Novedad: ${reason}`,
            updatedAt: new Date().toISOString(),
          };
        }
        return b;
      });

      for (const tb of targetBlocks) {
        if (!timeBlocks.some((b) => b.id === tb.id)) {
          updatedList.push({
            ...tb,
            block_type: 'novelty',
            motivo_novedad: reason,
            notes: `Novedad: ${reason}`,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      setTimeBlocks(updatedList);
      setIsNoveltyModalOpen(false);
      setNoveltyPendingBlock(null);
      setNoveltySelectedBlocks([]);
      setSelectedCellIds(new Set());
      clearSelectedCells();

      try {
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(updatedList));
        localStorage.setItem('villaFloraMatrix', JSON.stringify(updatedList));
        window.dispatchEvent(new Event('schedule_matrix_updated'));
        savePublicScheduleSnapshot(
          updatedList,
          teachers,
          currentPeriod,
          currentAcademicWeek
        );
        await timeBlockRepo.updateBatch(
          targetBlocks.map((b) => ({
            id: b.id,
            data: {
              block_type: 'novelty',
              motivo_novedad: reason,
              notes: `Novedad: ${reason}`,
              updatedAt: new Date().toISOString(),
            },
          }))
        );
      } catch (err) {
        console.error('[handleConfirmNovelty] Error persistiendo novedad:', err);
      }
    }
  };

  // Flujo de Asignación Inversa: Clic en celda vacía abre modal ágil de asignación rápida
  const handleEmptyClick = useCallback(
    (grade: GradeEntity, period: number, block: TimeBlockEntity | null, _slotId: string) => {
      const { periods: periodDefs } = generateMatrixSchedule(selectedShift, isMeetingDay, isEventDay, activeScheduleType);
      const periodInfo = periodDefs.find((p) => p.period === period);
      const isT2 = grade.id === 'g-trans-2' || grade.fullName === 'Transición 2';
      const [startTime, endTime] = (
        (isT2 && periodInfo?.secondaryTime ? periodInfo.secondaryTime : periodInfo?.time) ||
        (selectedShift === 'morning' ? '06:10 - 07:05' : isT2 ? '12:30 - 13:20' : '12:30 - 13:25')
      ).split(' - ');

      setQuickAssignTarget({
        grade,
        period,
        block,
        startTime: startTime.trim(),
        endTime: endTime.trim(),
      });
    },
    [selectedShift, isMeetingDay, isEventDay, activeScheduleType]
  );

  const handleQuickAssignConfirm = async (data: {
    teacher: UserEntity;
    subject: string;
    grade: GradeEntity;
    period: number;
    startTime: string;
    endTime: string;
    classroomName?: string;
  }) => {
    // Snapshotting previo para Undo
    pushSnapshot();

    const blockId =
      quickAssignTarget?.block?.id || `tb-${data.grade.id}-${selectedDay}-p${data.period}`;
    const teacherName =
      data.teacher.displayName || (data.teacher as any).fullName || data.teacher.id;

    const existingCustomClassroom =
      quickAssignTarget?.block?.classroomName &&
      quickAssignTarget.block.classroomName !== 'Aula (ROTACIÓN)'
        ? quickAssignTarget.block.classroomName
        : undefined;

    const resolvedQuickClassroom = resolveEffectiveClassroomForBlock({
      gradeId: data.grade.id,
      gradeName: data.grade.fullName,
      period: data.period,
      subject: data.subject,
      classroomName:
        data.classroomName ||
        existingCustomClassroom ||
        data.grade.defaultClassroomId ||
        'Aula Base',
    });

    const newBlock: TimeBlockEntity = {
      id: blockId,
      block_type: 'class',
      dayOfWeek: selectedDay,
      period: data.period,
      startTime: data.startTime,
      endTime: data.endTime,
      shift: data.grade.shift || selectedShift,
      gradeId: data.grade.id,
      gradeName: data.grade.fullName,
      subject: data.subject,
      teacherId: data.teacher.id,
      teacherName: teacherName,
      classroomId: resolvedQuickClassroom,
      classroomName: resolvedQuickClassroom,
      status: 'regular',
      motivo_novedad: null,
      notes: null,
      updatedAt: new Date().toISOString(),
    };

    const nextBlocks = (() => {
      const filtered = timeBlocks.filter(
        (b) =>
          b.id !== blockId &&
          !(
            b.dayOfWeek === selectedDay &&
            b.gradeId === data.grade.id &&
            b.period === data.period
          )
      );
      return [...filtered, newBlock];
    })();

    setTimeBlocks(nextBlocks);
    setQuickAssignTarget(null);

    try {
      localStorage.removeItem('ievf_blank_matrix_mode');
      localStorage.setItem('villaFloraMatrix', JSON.stringify(nextBlocks));
      localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(nextBlocks));
      savePublicScheduleSnapshot(
        nextBlocks,
        teachers,
        currentPeriod || '3° Periodo',
        currentAcademicWeek || 8,
        {
          meetingDays,
          eventDays,
          customHolidays,
          scheduleTypes,
        }
      );
      await timeBlockRepo.update(blockId, newBlock);
      window.dispatchEvent(new Event('schedule_matrix_updated'));
    } catch (err) {
      console.error('[handleQuickAssignConfirm] Error guardando asignación rápida:', err);
    }
  };

  const handleAssignInstitutionalEvent = async (data: {
    eventName: string;
    grade: GradeEntity;
    period: number;
    startTime: string;
    endTime: string;
  }) => {
    if (isSupportPlanDay) return;
    pushSnapshot();

    const blockId =
      quickAssignTarget?.block?.id || `tb-${data.grade.id}-${selectedDay}-p${data.period}`;
    const resolvedClassroom = resolveEffectiveClassroomForBlock({
      gradeId: data.grade.id,
      gradeName: data.grade.fullName,
      period: data.period,
      subject: data.eventName,
      classroomName: data.grade.defaultClassroomId || 'Aula Base',
    });

    const newBlock: TimeBlockEntity = {
      id: blockId,
      block_type: 'novelty',
      dayOfWeek: selectedDay,
      period: data.period,
      startTime: data.startTime,
      endTime: data.endTime,
      shift: data.grade.shift || selectedShift,
      gradeId: data.grade.id,
      gradeName: data.grade.fullName,
      subject: data.eventName,
      teacherId: 'evento-institucional',
      teacherName: data.eventName,
      classroomId: resolvedClassroom,
      classroomName: resolvedClassroom,
      status: 'regular',
      motivo_novedad: data.eventName,
      notes: `Evento institucional programado: ${data.eventName}`,
      updatedAt: new Date().toISOString(),
    };

    setTimeBlocks((prev) => upsertSingleTimeBlock(prev, newBlock));
    setQuickAssignTarget(null);

    try {
      await timeBlockRepo.update(blockId, newBlock);
    } catch (err) {
      console.error('[handleAssignInstitutionalEvent] Error guardando evento institucional:', err);
    }
  };

  // Función de Reversión (Undo Action)
  const handleUndo = useCallback(async () => {
    if (currentSection !== 'Inicio') return;

    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const nextHistory = [...prev];
      const lastState = nextHistory.pop()!;

      // 1. Establece el estado actual de la matriz con la instantánea previa
      setTimeBlocks(lastState);

      // 2. Persistencia atómica de la instantánea restaurada en LocalStorage y Firestore
      try {
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(lastState));
        window.dispatchEvent(new Event('schedule_matrix_updated'));
        timeBlockRepo.updateBatch(lastState.map((b) => ({ id: b.id, data: b })));
      } catch (err) {
        console.warn('[handleUndo] Error sincronizando estado restaurado:', err);
      }

      return nextHistory;
    });
  }, [timeBlockRepo, currentSection]);

  // Inyección de Atajo de Teclado Global: Ctrl+Z / Cmd+Z (Protegido por Contexto de Sección)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cláusula de guarda: Si el usuario no está en 'Inicio', no procesar Ctrl+Z
      if (currentSection !== 'Inicio') return;

      const target = e.target as HTMLElement;
      // Prevenir captura si el usuario está editando un campo de texto o modal
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleUndo, currentSection]);

  // Conexión del botón de Deshacer en el Navbar
  useEffect(() => {
    setOnUndo(handleUndo);
  }, [setOnUndo, handleUndo]);

  // Conexión reactiva con la Papelera (TrashDropzone) del Navbar
  useEffect(() => {
    setOnRequestNoveltyModal((block) => {
      setNoveltyPendingBlock(block);
      setNoveltySelectedBlocks([block]);
      setIsNoveltyModalOpen(true);
    });

    const handleWindowNoveltyTrigger = (e: any) => {
      const block = e.detail?.block;
      if (block) {
        setNoveltyPendingBlock(block);
        setNoveltySelectedBlocks([block]);
        setIsNoveltyModalOpen(true);
      }
    };
    window.addEventListener('trigger_novelty_modal', handleWindowNoveltyTrigger);
    return () => {
      window.removeEventListener('trigger_novelty_modal', handleWindowNoveltyTrigger);
    };
  }, [setOnRequestNoveltyModal]);

  // Recarga Segura y No Destructiva de la Matriz (Re-hidratación de datos sin borrar ni resetear la memoria)
  const handleReloadMatrix = useCallback(async () => {
    setIsLoading(true);
    try {
      const isBlankMode = localStorage.getItem('ievf_blank_matrix_mode') === '1';
      // 1. Re-leer desde el almacenamiento persistido localmente
      const saved = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && (parsed.length > 0 || isBlankMode)) {
          setTimeBlocks(parsed);
        }
      }

      // 2. Sincronizar catálogos y bloques de Firestore/API sin borrar cambios locales
      const [t, c, g, b] = await Promise.all([
        userRepo.getTeachers(),
        classroomRepo.getAll(),
        gradeRepo.getAll(),
        timeBlockRepo.getAll(),
      ]);

      if (t && t.length > 0) setTeachers(t);
      if (c && c.length > 0) setClassrooms(c);
      if (g && g.length > 0) setGrades(g);
      if (b && (b.length > 0 || isBlankMode)) setTimeBlocks(b);
    } catch (err) {
      console.warn('[CoordinatorMatrix] Error al recargar datos de la matriz:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userRepo, classroomRepo, gradeRepo, timeBlockRepo, setTeachers]);

  useEffect(() => {
    setOnReload(handleReloadMatrix);
  }, [setOnReload, handleReloadMatrix]);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="p-3 sm:p-4 space-y-2 text-villa-dark antialiased">
        {/* Day Selector Ribbon & Unified Header Toolbar: Celda 1 (Filtro Grados + Buscador) + Celdas Días */}
        <div className="bg-white border border-slate-200 py-1.5 px-3 rounded-2xl shadow-xs flex items-center justify-between gap-3">
          {/* Celda 1: Fija / Esquina Izquierda: Selector de Grados + Input de Búsqueda */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Grade Selector Dropdown (Unificado con diseño de Modalidades) */}
            <div ref={gradeMenuRef} className="relative w-44">
              <button
                type="button"
                onClick={() => setIsGradeMenuOpen((prev) => !prev)}
                className={`h-8 w-full flex items-center justify-between gap-2 px-3 rounded-xl border transition-all text-xs font-semibold cursor-pointer select-none shadow-2xs ${
                  selectedGrade !== 'all'
                    ? 'bg-sky-50 border-sky-300 text-sky-950 ring-1 ring-sky-300/60'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
                title="Filtrar por Grado"
              >
                <span className="flex items-center gap-2 truncate">
                  <Layers className="w-3.5 h-3.5 text-villa-blue-light shrink-0" />
                  <span className="font-bold truncate">
                    {selectedGrade === 'all'
                      ? 'Todos los Grados'
                      : selectedGrade.startsWith('Transición')
                      ? selectedGrade
                      : `Grado ${selectedGrade}`}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {selectedGrade !== 'all' && (
                    <span
                      className="w-2 h-2 rounded-full bg-villa-blue-light"
                      title="Filtro de grado activo"
                    />
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${
                      isGradeMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </span>
              </button>

              {isGradeMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-full bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 select-none">
                  {(selectedShift === 'morning'
                    ? BACHILLERATO_GRADE_LEVELS
                    : selectedShift === 'afternoon'
                    ? PRIMARIA_GRADE_LEVELS
                    : TRANSICION_GRADE_LEVELS
                  ).map((grade) => {
                    const isSelected = selectedGrade === grade;
                    const label =
                      grade === 'all'
                        ? 'Todos los Grados'
                        : grade.startsWith('Transición')
                        ? grade
                        : `Grado ${grade}`;
                    return (
                      <button
                        key={grade}
                        type="button"
                        onClick={() => {
                          setSelectedGrade(grade);
                          setIsGradeMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors whitespace-nowrap text-left"
                      >
                        <span
                          className={`text-xs font-semibold ${
                            isSelected ? 'text-villa-blue-dark font-bold' : 'text-slate-700'
                          }`}
                        >
                          {label}
                        </span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-villa-blue-light shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Clearable Controlled Search Input with Adaptive Width */}
            <div className="relative flex items-center shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar..."
                className="w-32 focus:w-48 h-8 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-villa-blue-light focus:ring-1 focus:ring-villa-blue-light rounded-xl pl-8 pr-7 text-xs text-villa-dark placeholder-slate-400 transition-all font-medium shadow-2xs outline-none"
              />
              {searchTerm.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition p-0.5 rounded cursor-pointer"
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Active Status Filter Badge (if applicable) */}
            {statusFilter !== 'all' && (
              <div className="hidden xl:flex items-center gap-1 text-xs shrink-0 pl-1">
                <span
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                    statusFilter === 'uncovered'
                      ? 'bg-red-50 text-villa-magenta border border-red-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {statusFilter === 'uncovered' ? 'Sin Cobertura' : 'Cubiertos'}
                </span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="text-[10px] text-slate-400 hover:text-slate-700 underline cursor-pointer"
                >
                  Quitar
                </button>
              </div>
            )}
          </div>

          {/* Selector Rápido de 2 Semanas + Selector Desplegable de Día y Menú de Modalidades */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Selector Rápido de 2 Semanas (Semana Actual vs. Próxima Semana con Corte Viernes 12:10 PM) */}
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs h-8 shrink-0">
              <button
                type="button"
                onClick={() => setActiveWeekSlot('current')}
                className={`h-full px-2.5 rounded-lg text-[11px] transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  activeWeekSlot === 'current'
                    ? 'bg-villa-blue text-white font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 font-semibold'
                }`}
                title="Ver y editar la Semana Actual en curso"
              >
                <span>Semana Actual</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveWeekSlot('next')}
                className={`h-full px-2.5 rounded-lg text-[11px] transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeWeekSlot === 'next'
                    ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 font-semibold'
                }`}
                title={
                  isAutoNextWeekCutoff
                    ? 'Próxima Semana (Activada automáticamente por corte de viernes 12:10 PM)'
                    : 'Adelantar o editar el horario de la Próxima Semana'
                }
              >
                <span>Próxima Semana</span>
                {isAutoNextWeekCutoff && (
                  <span
                    className={`px-1 py-0.2 rounded text-[9px] font-extrabold uppercase leading-none ${
                      activeWeekSlot === 'next'
                        ? 'bg-amber-300 text-slate-950'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    12:10+
                  </span>
                )}
              </button>
            </div>

            {activeWeekSlot === 'next' && (
              <button
                type="button"
                onClick={() => {
                  cloneCurrentWeekToNextWeek();
                  showToast('Horario base copiado desde la Semana Actual a la Próxima Semana');
                }}
                className="h-8 px-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs"
                title="Copiar las asignaciones de la Semana Actual como punto de partida para la Próxima Semana"
              >
                Copiar de Actual
              </button>
            )}

            <div ref={dayMenuRef} className="relative w-auto flex items-center gap-1">
              {(() => {
                const isCurrentDayToday =
                  activeWeekSlot === 'current' &&
                  !isAutoNextWeekCutoff &&
                  selectedDay === getTodayDayOfWeek(new Date(), 'current');
                const dayOrder: DayOfWeek[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
                const currentDayIndex = Math.max(0, dayOrder.indexOf(selectedDay));
                const prevDayKey = dayOrder[(currentDayIndex - 1 + dayOrder.length) % dayOrder.length];
                const nextDayKey = dayOrder[(currentDayIndex + 1) % dayOrder.length];
                const prevDayLabel = weekHeaders.find((w) => w.id === prevDayKey)?.label || prevDayKey;
                const nextDayLabel = weekHeaders.find((w) => w.id === nextDayKey)?.label || nextDayKey;

                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDay(prevDayKey);
                        setIsDayMenuOpen(false);
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-600 hover:text-villa-blue-dark transition-all cursor-pointer select-none shadow-2xs shrink-0"
                      title={`Día anterior: ${prevDayLabel}`}
                      aria-label={`Día anterior: ${prevDayLabel}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsDayMenuOpen((prev) => !prev)}
                      className={`h-8 w-auto flex items-center justify-between gap-2.5 px-3.5 rounded-xl border transition-all text-xs font-semibold cursor-pointer select-none shadow-2xs whitespace-nowrap ${
                        activeDayHeader?.isHoliday
                          ? 'bg-red-50 border-red-300 text-red-900 ring-1 ring-red-300/60'
                          : activeWeekSlot === 'next'
                          ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 ring-1 ring-indigo-300/50'
                          : isCurrentDayToday
                          ? 'bg-brand-50 border-villa-blue-light/60 text-villa-blue-dark ring-1 ring-villa-blue-light/40'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                      title={
                        activeDayHeader?.isHoliday
                          ? `${activeDayHeader.label} (${activeDayHeader.holidayName || 'Día Festivo / Bloqueado'})`
                          : activeWeekSlot === 'next'
                          ? `${activeDayHeader?.label || selectedDay} • Próxima Semana`
                          : isCurrentDayToday
                          ? `${activeDayHeader?.label || selectedDay} • Día actual en curso`
                          : 'Seleccionar día de la semana para visualizar o editar la grilla'
                      }
                    >
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Calendar
                          className={`w-3.5 h-3.5 shrink-0 ${
                            activeDayHeader?.isHoliday
                              ? 'text-red-600'
                              : activeWeekSlot === 'next'
                              ? 'text-indigo-600'
                              : isCurrentDayToday
                              ? 'text-villa-blue'
                              : 'text-villa-blue-light'
                          }`}
                        />
                        <span className="font-bold whitespace-nowrap">
                          {activeDayHeader?.label || selectedDay}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {isCurrentDayToday && !activeDayHeader?.isHoliday && (
                          <span
                            className="px-1.5 py-0.5 rounded-md bg-villa-blue text-white text-[10px] font-extrabold uppercase tracking-wider leading-none shadow-2xs"
                            title="Día actual en curso"
                          >
                            Hoy
                          </span>
                        )}
                        {activeWeekSlot === 'next' && !activeDayHeader?.isHoliday && (
                          <span
                            className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-extrabold uppercase tracking-wider leading-none shadow-2xs"
                            title="Editando Próxima Semana"
                          >
                            Próxima
                          </span>
                        )}
                        {activeDayHeader?.isHoliday && (
                          <span
                            className="px-1.5 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-extrabold uppercase tracking-wider leading-none"
                            title="Día festivo"
                          >
                            Festivo
                          </span>
                        )}
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${
                            isDayMenuOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDay(nextDayKey);
                        setIsDayMenuOpen(false);
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-600 hover:text-villa-blue-dark transition-all cursor-pointer select-none shadow-2xs shrink-0"
                      title={`Día siguiente: ${nextDayLabel}`}
                      aria-label={`Día siguiente: ${nextDayLabel}`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                );
              })()}

              {isDayMenuOpen && (
                <div className="absolute left-9 top-full mt-1.5 min-w-[200px] w-max bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 select-none">
                  {weekHeaders.map((day) => {
                    const isToday =
                      activeWeekSlot === 'current' &&
                      !isAutoNextWeekCutoff &&
                      day.id === getTodayDayOfWeek(new Date(), 'current');
                    const isHoliday = Boolean(day.isHoliday);
                    const isSelected = selectedDay === day.id;
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => {
                          setSelectedDay(day.id as DayOfWeek);
                          setIsDayMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2 cursor-pointer transition-colors whitespace-nowrap text-left ${
                          isSelected
                            ? 'bg-brand-100/70 hover:bg-brand-100'
                            : isToday
                            ? 'bg-brand-50/80 hover:bg-brand-100/50'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`text-xs whitespace-nowrap ${
                            isHoliday
                              ? 'text-red-600 font-bold'
                              : isSelected
                              ? 'text-villa-blue-dark font-extrabold'
                              : isToday
                              ? 'text-villa-blue font-bold'
                              : 'text-slate-700 font-semibold'
                          }`}
                        >
                          {day.label}
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {isToday && (
                            <span
                              className="px-1.5 py-0.5 rounded-md bg-villa-blue text-white text-[10px] font-extrabold uppercase tracking-wider leading-none"
                              title="Día actual"
                            >
                              Hoy
                            </span>
                          )}
                          {isHoliday && (
                            <span
                              className="w-2 h-2 rounded-full bg-red-600"
                              title="Día festivo"
                            />
                          )}
                          {isSelected && (
                            <span
                              className="w-2 h-2 rounded-full bg-villa-blue-light"
                              title="Día activo seleccionado"
                            />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              ref={modeMenuRef}
              className="relative w-44"
            >
              <button
                type="button"
                onClick={() => setIsModeMenuOpen((prev) => !prev)}
                className={`h-8 w-full flex items-center justify-between gap-2 px-3 rounded-xl border transition-all text-xs font-semibold cursor-pointer select-none shadow-2xs ${
                  activeDayHeader?.isHoliday
                    ? 'bg-red-50 border-red-300 text-red-900 ring-1 ring-red-300/60'
                    : isMeetingDay || isSupportPlanDay
                    ? 'bg-amber-50 border-amber-300 text-amber-950 ring-1 ring-amber-300/60'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
                title="Configurar modalidades del día"
              >
                <span className="flex items-center gap-2 truncate">
                  <Clock className="w-3.5 h-3.5 text-villa-blue-light shrink-0" />
                  <span className="font-bold truncate">Modalidades</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {activeDayHeader?.isHoliday && (
                    <span
                      className="w-2 h-2 rounded-full bg-red-600"
                      title="Día festivo activo"
                    />
                  )}
                  {isMeetingDay && (
                    <span
                      className="w-2 h-2 rounded-full bg-villa-magenta"
                      title="Atención a padres activa"
                    />
                  )}
                  {isSupportPlanDay && (
                    <span
                      className="w-2 h-2 rounded-full bg-amber-500"
                      title={`${supportPlanModalityLabel} (Horario D) activo`}
                    />
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${
                      isModeMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </span>
              </button>

              {isModeMenuOpen && (
                <div className="absolute left-0 mt-1.5 min-w-full w-max bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150 select-none">
                  {/* Opción 1: Día festivo */}
                  <label className="flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold ${
                        activeDayHeader?.isHoliday ? 'text-red-600 font-bold' : 'text-slate-700'
                      }`}
                    >
                      Día festivo
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(activeDayHeader?.isHoliday)}
                      onChange={() => {
                        if (activeDayHeader) {
                          toggleHoliday(activeDayHeader.dateString);
                        }
                      }}
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-600 accent-red-600 cursor-pointer shrink-0"
                    />
                  </label>

                  {/* Opción 2: Atención a padres */}
                  <label className="flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold ${
                        isMeetingDay ? 'text-villa-magenta font-bold' : 'text-slate-700'
                      }`}
                    >
                      Atención a padres
                    </span>
                    <input
                      type="checkbox"
                      checked={isMeetingDay}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setMeetingDay(selectedDay, checked, selectedShift);
                        if (selectedShift === 'morning') {
                          setScheduleType(selectedDay, checked ? 'B' : 'A', 'morning');
                        }
                      }}
                      className="w-4 h-4 rounded text-villa-magenta focus:ring-villa-magenta accent-villa-magenta cursor-pointer shrink-0"
                    />
                  </label>

                  {/* Opción 3 (Exclusiva Bachillerato): Planes de apoyo XX periodo / Planes de apoyo anuales (Horario D) */}
                  {selectedShift === 'morning' && (
                    <label className="flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          isSupportPlanDay ? 'text-amber-700 font-bold' : 'text-slate-700'
                        }`}
                      >
                        Planes de apoyo
                      </span>
                      <input
                        type="checkbox"
                        checked={isSupportPlanDay}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            setMeetingDay(selectedDay, false, 'morning');
                            setScheduleType(selectedDay, 'D', 'morning');
                          } else {
                            setScheduleType(selectedDay, 'A', 'morning');
                          }
                        }}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-600 accent-amber-600 cursor-pointer shrink-0"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Extremo Derecho: Controles de Escala / Zoom */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <MatrixZoomControls
              zoomLevel={zoomLevel}
              onZoomChange={setZoomLevel}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onResetZoom={resetZoom}
              className="shadow-2xs h-8 flex items-center py-0"
            />
          </div>
        </div>

        {/* WORKSPACE PRINCIPAL: CUADRÍCULA */}
        <div className="w-full min-w-0">
          {/* THE DESKTOP MATRIX GRID - EXCEL LAYOUT (Eje X: Grados, Eje Y: Horas, Sticky Anchored Axes) */}
          <DesktopMatrixGrid
            grades={filteredGrades}
            shift={selectedShift}
            timeBlocks={currentFilteredBlocks}
            pendingRequests={pendingRequests}
            officialSubjects={officialSubjects}
            zoomLevel={zoomLevel}
            isMeetingDay={isMeetingDay}
            isEventDay={isEventDay}
            isHoliday={Boolean(activeDayHeader?.isHoliday)}
            scheduleType={activeScheduleType}
            supportPlanLabel={supportPlanModalityLabel}
            dayHeaderLabel={activeDayHeader?.label}
            selectedCellIds={selectedCellIds}
            selectedCells={selectedCells}
            onSelectSlot={handleSlotSelect}
            onDropBlock={handleHtml5Drop}
            onCellClick={handleCellClick}
            onTrashClick={handleTrashCellClick}
            onEmptyClick={handleEmptyClick}
            onToggleSelect={handleToggleSelectCell}
            onQuickChangeClassroom={handleQuickChangeClassroom}
          />
        </div>

        {/* Menú de Acceso Rápido para Acciones en Lote (Asignar Docente o Materia a Múltiples Casillas) */}
        <BatchActionQuickMenu
          selectedCount={batchSelectedTargets.length}
          teachers={teachers}
          allBlocks={timeBlocks}
          getTeacherColor={getTeacherColor}
          onAssignTeacher={handleBatchAssignTeacher}
          onAssignSubject={handleBatchAssignSubject}
          onOpenBatchNovelty={handleBatchDeleteAction}
          onClearSelection={handleClearBatchSelection}
        />

        {/* Panel Lateral Flotante: Docentes Disponibles para Arrastrar (Right Drawer) */}
        <TeacherPoolSidebar
          teachers={teachers}
          timeBlocks={timeBlocks}
          getTeacherColor={getTeacherColor}
          isOpen={isDrawerOpen}
          onToggle={() => setIsDrawerOpen((prev) => !prev)}
          onClose={() => setIsDrawerOpen(false)}
        />

      {/* Slot Edit Modal with live Constraint Solver feedback */}
      <SlotEditModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedSlot(null);
        }}
        block={selectedSlot}
        allBlocks={timeBlocks}
        teachers={teachers}
        classrooms={classrooms}
        onSave={handleSaveSlot}
      />

      {/* Conflict Alert Modal (Uses villa-magenta strictly for collision alerts) */}
      <ConflictAlertModal
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
      />

      {/* Maker-Checker Slide-over Review Drawer */}
      <AbsenceReviewPanel
        isOpen={isReviewDrawerOpen}
        onClose={() => setIsReviewDrawerOpen(false)}
        requests={absenceRequests}
        teachers={teachers}
        allBlocks={timeBlocks}
        onReview={handleReviewAbsence}
      />

      {/* Modal de Transición para Mutación de Entidades a Novedades */}
      <NoveltyTransitionModal
        isOpen={isNoveltyModalOpen}
        block={noveltyPendingBlock}
        selectedBlocks={noveltySelectedBlocks}
        onClose={() => {
          setIsNoveltyModalOpen(false);
          setNoveltyPendingBlock(null);
          setNoveltySelectedBlocks([]);
          setSelectedCellIds(new Set());
          clearSelectedCells();
        }}
        onConfirm={handleConfirmNovelty}
      />

      {/* Modal de Asignación Inversa de Clase para Celdas Vacías */}
      <QuickAssignModal
        isOpen={Boolean(quickAssignTarget)}
        onClose={() => setQuickAssignTarget(null)}
        grade={quickAssignTarget?.grade || null}
        period={quickAssignTarget?.period ?? null}
        dayOfWeek={selectedDay}
        shift={selectedShift}
        startTime={quickAssignTarget?.startTime || ''}
        endTime={quickAssignTarget?.endTime || ''}
        allBlocks={timeBlocks}
        teachers={teachers}
        officialSubjects={officialSubjects}
        disableInstitutionalEvents={isSupportPlanDay}
        onAssign={handleQuickAssignConfirm}
        onAssignInstitutionalEvent={handleAssignInstitutionalEvent}
      />

      {/* Toast Alert: Feedback Visual de Rechazo (Specialty Incompatibility Alert) */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-red-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-red-700 animate-in slide-in-from-bottom-5 duration-200 select-none">
          <AlertTriangle className="w-5 h-5 text-white shrink-0" />
          <span className="text-xs sm:text-sm font-semibold tracking-tight">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      </div>
    </DragDropContext>
  );
};
