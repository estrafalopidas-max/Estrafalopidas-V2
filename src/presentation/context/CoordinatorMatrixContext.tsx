import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ShiftType } from '../../domain/entities/grade.entity';
import { UserEntity } from '../../domain/entities/user.entity';
import { getTeacherVisualIdentity } from '../../domain/services/teacher-visual-identity.service';
import {
  resolveOfficialTeacherEntry,
  sortTeachersWithLowPriorityLast,
} from '../../domain/services/teacher-normalization.service';
import { FirestoreUserRepository } from '../../infrastructure/repositories/firestore-user.repository';
import { ensureSeedDataLoaded, SEED_TEACHERS } from '../../infrastructure/seed/initial-seed';
import { ALL_OFFICIAL_MATERIAS } from '../../domain/constants/subjects';
import {
  generateWeekHeaders,
  getCurrentWeekText,
  DynamicDayHeader,
  getOrdinalSuffix,
  WeekSlotMode,
  CurrentWeekData,
  isPastFridayCutoff,
  getDefaultWeekSlotMode,
  getAnchorDateForWeekSlot,
  getWeekMondayIso,
} from '../../domain/services/ChronologyEngine';

export interface KpiStats {
  total: number;
  uncovered: number;
  covered: number;
  isLoading?: boolean;
}

interface WeekScheduleContainer {
  mondayIso: string;
  timeBlocks: any[];
  meetingDays: Record<string, boolean>;
  scheduleTypes: Record<string, 'A' | 'B' | 'C' | 'D'>;
  updatedAt: number;
}

const WEEK_CONTAINER_PREFIX = 'ievf_week_container_';

function saveCurrentStateToWeekContainer(mondayIso: string): void {
  if (!mondayIso) return;
  try {
    const rawBlocks = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1') || '[]';
    const rawMeeting = localStorage.getItem('ievf_meeting_days') || '{}';
    const rawTypes = localStorage.getItem('ievf_schedule_types') || '{}';
    const container: WeekScheduleContainer = {
      mondayIso,
      timeBlocks: JSON.parse(rawBlocks),
      meetingDays: JSON.parse(rawMeeting),
      scheduleTypes: JSON.parse(rawTypes),
      updatedAt: Date.now(),
    };
    localStorage.setItem(`${WEEK_CONTAINER_PREFIX}${mondayIso}`, JSON.stringify(container));
  } catch {
    // ignore storage quota errors
  }
}

function loadWeekContainer(mondayIso: string): WeekScheduleContainer | null {
  if (!mondayIso) return null;
  try {
    const raw = localStorage.getItem(`${WEEK_CONTAINER_PREFIX}${mondayIso}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeekScheduleContainer;
    if (parsed && Array.isArray(parsed.timeBlocks)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export interface CoordinatorMatrixContextType {
  selectedShift: ShiftType;
  setSelectedShift: (shift: ShiftType) => void;
  isReviewDrawerOpen: boolean;
  setIsReviewDrawerOpen: (open: boolean) => void;
  pendingRequestsCount: number;
  setPendingRequestsCount: (count: number) => void;
  kpiStats: KpiStats;
  setKpiStats: (stats: KpiStats) => void;
  statusFilter: 'all' | 'uncovered' | 'covered';
  setStatusFilter: (filter: 'all' | 'uncovered' | 'covered') => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  activeTeachers: any[];
  setActiveTeachers: (teachers: any[]) => void;
  officialSubjects: string[];
  setOfficialSubjects: (subjects: string[]) => void;
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  meetingDays: Record<string, boolean>;
  setMeetingDay: (day: string, value: boolean, shift?: ShiftType) => void;
  eventDays: Record<string, boolean>;
  setEventDay: (day: string, value: boolean) => void;
  scheduleTypes: Record<string, 'A' | 'B' | 'C' | 'D'>;
  setScheduleType: (day: string, type: 'A' | 'B' | 'C' | 'D', shift?: ShiftType) => void;
  triggerReload: () => void;
  setOnReload: (fn: (() => void) | null) => void;
  currentAcademicWeek: number;
  setCurrentAcademicWeek: (week: number) => void;
  currentPeriod: string;
  setCurrentPeriod: (period: string) => void;
  activeWeekSlot: WeekSlotMode;
  setActiveWeekSlot: (slot: WeekSlotMode) => void;
  isAutoNextWeekCutoff: boolean;
  activeAnchorDate: Date;
  activeMondayIso: string;
  weekInfo: CurrentWeekData;
  cloneCurrentWeekToNextWeek: () => void;
  teachers: UserEntity[];
  setTeachers: React.Dispatch<React.SetStateAction<UserEntity[]>>;
  getTeacherColor: (teacherId?: string, teacherName?: string) => string;
  isTeacherModalOpen: boolean;
  setIsTeacherModalOpen: (open: boolean) => void;
  selectedTeacherForEdit: UserEntity | null;
  setSelectedTeacherForEdit: (teacher: UserEntity | null) => void;
  openTeacherModal: (teacher?: UserEntity | null, isEditMode?: boolean) => void;
  setOnRequestNoveltyModal: (fn: ((data: any) => void) | null) => void;
  requestNoveltyModal: (data: any) => void;
  canUndo: boolean;
  setCanUndo: (can: boolean) => void;
  setOnUndo: (fn: (() => void) | null) => void;
  triggerUndo: () => void;
  selectedCells: string[];
  setSelectedCells: React.Dispatch<React.SetStateAction<string[]>>;
  toggleSelectedCell: (cellId: string) => void;
  clearSelectedCells: () => void;
  setOnBatchDelete: (fn: (() => void) | null) => void;
  triggerBatchDelete: () => void;
  weekHeaders: DynamicDayHeader[];
  customHolidays: string[];
  toggleHoliday: (dateStr: string) => void;
  currentSection: string;
  setCurrentSection: (section: string) => void;
  isMatrixActive: boolean;
  setIsMatrixActive: (active: boolean) => void;
}

const DEFAULT_SUBJECT_NAMES = ALL_OFFICIAL_MATERIAS.map((m) => m.shortName);
const initialDefaultSlot = getDefaultWeekSlotMode(new Date());
const initialDefaultAnchor = getAnchorDateForWeekSlot(initialDefaultSlot, new Date());

const defaultContext: CoordinatorMatrixContextType = {
  selectedShift: 'morning',
  setSelectedShift: () => {},
  isReviewDrawerOpen: false,
  setIsReviewDrawerOpen: () => {},
  pendingRequestsCount: 0,
  setPendingRequestsCount: () => {},
  kpiStats: { total: 0, uncovered: 0, covered: 0, isLoading: false },
  setKpiStats: () => {},
  statusFilter: 'all',
  setStatusFilter: () => {},
  searchTerm: '',
  setSearchTerm: () => {},
  activeTeachers: [],
  setActiveTeachers: () => {},
  officialSubjects: DEFAULT_SUBJECT_NAMES,
  setOfficialSubjects: () => {},
  zoomLevel: 100,
  setZoomLevel: () => {},
  zoomIn: () => {},
  zoomOut: () => {},
  resetZoom: () => {},
  meetingDays: {},
  setMeetingDay: () => {},
  eventDays: {},
  setEventDay: () => {},
  scheduleTypes: {},
  setScheduleType: () => {},
  triggerReload: () => {},
  setOnReload: () => {},
  currentAcademicWeek: 9,
  setCurrentAcademicWeek: () => {},
  currentPeriod: '3° Periodo',
  setCurrentPeriod: () => {},
  activeWeekSlot: initialDefaultSlot,
  setActiveWeekSlot: () => {},
  isAutoNextWeekCutoff: isPastFridayCutoff(new Date()),
  activeAnchorDate: initialDefaultAnchor,
  activeMondayIso: getWeekMondayIso(initialDefaultAnchor),
  weekInfo: getCurrentWeekText(initialDefaultAnchor),
  cloneCurrentWeekToNextWeek: () => {},
  teachers: [],
  setTeachers: () => {},
  getTeacherColor: (id, name) => getTeacherVisualIdentity(id, name).color_hex,
  isTeacherModalOpen: false,
  setIsTeacherModalOpen: () => {},
  selectedTeacherForEdit: null,
  setSelectedTeacherForEdit: () => {},
  openTeacherModal: () => {},
  setOnRequestNoveltyModal: () => {},
  requestNoveltyModal: () => {},
  canUndo: false,
  setCanUndo: () => {},
  setOnUndo: () => {},
  triggerUndo: () => {},
  selectedCells: [],
  setSelectedCells: () => {},
  toggleSelectedCell: () => {},
  clearSelectedCells: () => {},
  setOnBatchDelete: () => {},
  triggerBatchDelete: () => {},
  weekHeaders: [],
  customHolidays: [],
  toggleHoliday: () => {},
  currentSection: 'Inicio',
  setCurrentSection: () => {},
  isMatrixActive: true,
  setIsMatrixActive: () => {},
};

const CoordinatorMatrixContext = createContext<CoordinatorMatrixContextType>(defaultContext);

export const CoordinatorMatrixProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedShift, setSelectedShift] = useState<ShiftType>('morning');
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [kpiStats, setKpiStats] = useState<KpiStats>({ total: 0, uncovered: 0, covered: 0, isLoading: false });
  const [statusFilter, setStatusFilter] = useState<'all' | 'uncovered' | 'covered'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTeachers, setActiveTeachers] = useState<any[]>([]);
  const [officialSubjects, setOfficialSubjects] = useState<string[]>(DEFAULT_SUBJECT_NAMES);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [meetingDays, setMeetingDays] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ievf_meeting_days');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [eventDays, setEventDays] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ievf_event_days');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [scheduleTypes, setScheduleTypes] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>(() => {
    try {
      const saved = localStorage.getItem('ievf_schedule_types');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [isAutoNextWeekCutoff, setIsAutoNextWeekCutoff] = useState<boolean>(() =>
    isPastFridayCutoff(new Date())
  );
  const [activeWeekSlot, setActiveWeekSlotState] = useState<WeekSlotMode>(() => {
    const defaultMode = getDefaultWeekSlotMode(new Date());
    try {
      const prevSavedIso = localStorage.getItem('ievf_active_monday_iso');
      const anchor = getAnchorDateForWeekSlot(defaultMode, new Date());
      const targetMondayIso = getWeekMondayIso(anchor);
      if (prevSavedIso && prevSavedIso !== targetMondayIso) {
        saveCurrentStateToWeekContainer(prevSavedIso);
      }
      const existingContainer = loadWeekContainer(targetMondayIso);
      if (existingContainer && existingContainer.timeBlocks.length > 0) {
        const blocksStr = JSON.stringify(existingContainer.timeBlocks);
        localStorage.setItem('villaFloraMatrix', blocksStr);
        localStorage.setItem('ievf_time_blocks_v1', blocksStr);
        localStorage.setItem('ievf_meeting_days', JSON.stringify(existingContainer.meetingDays || {}));
        localStorage.setItem('ievf_schedule_types', JSON.stringify(existingContainer.scheduleTypes || {}));
      } else {
        saveCurrentStateToWeekContainer(targetMondayIso);
      }
      localStorage.setItem('ievf_active_week_slot', defaultMode);
      localStorage.setItem('ievf_active_monday_iso', targetMondayIso);
    } catch {
      // ignore
    }
    return defaultMode;
  });

  const activeAnchorDate = useMemo(
    () => getAnchorDateForWeekSlot(activeWeekSlot, new Date()),
    [activeWeekSlot, isAutoNextWeekCutoff]
  );
  const activeMondayIso = useMemo(() => getWeekMondayIso(activeAnchorDate), [activeAnchorDate]);
  const weekInfo = useMemo(() => getCurrentWeekText(activeAnchorDate), [activeAnchorDate]);

  const [currentAcademicWeek, setCurrentAcademicWeek] = useState<number>(weekInfo.weekNumber || 9);
  const [currentPeriod, setCurrentPeriod] = useState<string>(
    `${weekInfo.periodNumber}${getOrdinalSuffix(weekInfo.periodNumber)} Periodo`
  );

  useEffect(() => {
    setCurrentAcademicWeek(weekInfo.weekNumber || 9);
    setCurrentPeriod(`${weekInfo.periodNumber}${getOrdinalSuffix(weekInfo.periodNumber)} Periodo`);
  }, [weekInfo.weekNumber, weekInfo.periodNumber]);

  const [teachers, setTeachers] = useState<UserEntity[]>(() => {
    try {
      ensureSeedDataLoaded();
      const raw = localStorage.getItem('ievf_users_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as UserEntity[];
        const list = parsed.filter((u) => !u.role || u.role === 'teacher');
        if (list.length > 0) return sortTeachersWithLowPriorityLast(list);
      }
    } catch {
      // ignore
    }
    return sortTeachersWithLowPriorityLast(SEED_TEACHERS);
  });
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [selectedTeacherForEdit, setSelectedTeacherForEdit] = useState<UserEntity | null>(null);

  const [canUndo, setCanUndo] = useState(false);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [customHolidays, setCustomHolidays] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ievf_custom_holidays');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currentSection, setCurrentSection] = useState('Inicio');
  const [isMatrixActive, setIsMatrixActive] = useState(true);

  const onReloadRef = useRef<(() => void) | null>(null);
  const onNoveltyModalRef = useRef<((data: any) => void) | null>(null);
  const onUndoRef = useRef<(() => void) | null>(null);
  const onBatchDeleteRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    ensureSeedDataLoaded();
    const repo = new FirestoreUserRepository();
    const refreshTeachers = () => {
      repo.getTeachers().then((list) => {
        if (Array.isArray(list)) {
          setTeachers(list);
        }
      }).catch(() => {});
    };
    refreshTeachers();
    window.addEventListener('users_collection_updated', refreshTeachers);
    window.addEventListener('storage', refreshTeachers);
    return () => {
      window.removeEventListener('users_collection_updated', refreshTeachers);
      window.removeEventListener('storage', refreshTeachers);
    };
  }, []);

  const setOnReload = useCallback((fn: (() => void) | null) => {
    onReloadRef.current = fn;
  }, []);

  const triggerReload = useCallback(() => {
    onReloadRef.current?.();
  }, []);

  const setOnRequestNoveltyModal = useCallback((fn: ((data: any) => void) | null) => {
    onNoveltyModalRef.current = fn;
  }, []);

  const requestNoveltyModal = useCallback((data: any) => {
    onNoveltyModalRef.current?.(data);
  }, []);

  const setOnUndo = useCallback((fn: (() => void) | null) => {
    onUndoRef.current = fn;
  }, []);

  const triggerUndo = useCallback(() => {
    onUndoRef.current?.();
  }, []);

  const setOnBatchDelete = useCallback((fn: (() => void) | null) => {
    onBatchDeleteRef.current = fn;
  }, []);

  const triggerBatchDelete = useCallback(() => {
    onBatchDeleteRef.current?.();
  }, []);

  const zoomIn = useCallback(() => setZoomLevel((z) => Math.min(130, z + 10)), []);
  const zoomOut = useCallback(() => setZoomLevel((z) => Math.max(70, z - 10)), []);
  const resetZoom = useCallback(() => setZoomLevel(100), []);

  const setMeetingDay = useCallback((day: string, value: boolean, shift?: ShiftType) => {
    const key = shift ? `${shift}_${day}` : day;
    setMeetingDays((prev) => {
      const next = shift ? { ...prev, [key]: value } : { ...prev, [day]: value };
      try {
        localStorage.setItem('ievf_meeting_days', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setEventDay = useCallback((day: string, value: boolean) => {
    setEventDays((prev) => {
      const next = { ...prev, [day]: value };
      try {
        localStorage.setItem('ievf_event_days', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setScheduleType = useCallback((day: string, type: 'A' | 'B' | 'C' | 'D', shift?: ShiftType) => {
    const key = shift ? `${shift}_${day}` : day;
    setScheduleTypes((prev) => {
      const next = shift ? { ...prev, [day]: type, [key]: type } : { ...prev, [day]: type };
      try {
        localStorage.setItem('ievf_schedule_types', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const getTeacherColor = useCallback(
    (teacherId?: string, teacherName?: string) => {
      const official = resolveOfficialTeacherEntry(teacherId, teacherName);
      if (official) {
        const foundOfficial = teachers.find(
          (t) =>
            (official.id && t.id === official.id) ||
            t.displayName?.trim().toLowerCase() === official.canonicalName.toLowerCase() ||
            t.shortName?.trim().toLowerCase() === official.shortName.toLowerCase()
        );
        if (foundOfficial?.color_hex) return foundOfficial.color_hex;
        if (foundOfficial?.color) return foundOfficial.color;
        if (official.originalExcelHex) return official.originalExcelHex;
      }
      if (teacherId) {
        const found = teachers.find((t) => t.id === teacherId);
        if (found?.color_hex) return found.color_hex;
        if (found?.color) return found.color;
      }
      if (teacherName) {
        const clean = teacherName.trim().toLowerCase();
        const foundByName = teachers.find(
          (t) =>
            t.displayName?.trim().toLowerCase() === clean ||
            t.shortName?.trim().toLowerCase() === clean
        );
        if (foundByName?.color_hex) return foundByName.color_hex;
        if (foundByName?.color) return foundByName.color;
      }
      return getTeacherVisualIdentity(teacherId, teacherName).color_hex;
    },
    [teachers]
  );

  const openTeacherModal = useCallback((teacher?: UserEntity | null) => {
    setSelectedTeacherForEdit(teacher || null);
    setIsTeacherModalOpen(true);
  }, []);

  const toggleSelectedCell = useCallback((cellId: string) => {
    setSelectedCells((prev) =>
      prev.includes(cellId) ? prev.filter((id) => id !== cellId) : [...prev, cellId]
    );
  }, []);

  const clearSelectedCells = useCallback(() => {
    setSelectedCells([]);
  }, []);

  const toggleHoliday = useCallback((dateStr: string) => {
    setCustomHolidays((prev) => {
      const next = prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr];
      localStorage.setItem('ievf_custom_holidays', JSON.stringify(next));
      return next;
    });
  }, []);

  const setActiveWeekSlot = useCallback(
    (targetSlot: WeekSlotMode) => {
      const now = new Date();
      const prevAnchor = getAnchorDateForWeekSlot(activeWeekSlot, now);
      const prevMondayIso = getWeekMondayIso(prevAnchor);
      const targetAnchor = getAnchorDateForWeekSlot(targetSlot, now);
      const targetMondayIso = getWeekMondayIso(targetAnchor);

      saveCurrentStateToWeekContainer(prevMondayIso);

      const targetContainer = loadWeekContainer(targetMondayIso);
      if (targetContainer) {
        try {
          const blocksStr = JSON.stringify(targetContainer.timeBlocks);
          localStorage.setItem('villaFloraMatrix', blocksStr);
          localStorage.setItem('ievf_time_blocks_v1', blocksStr);
          localStorage.setItem('ievf_meeting_days', JSON.stringify(targetContainer.meetingDays || {}));
          localStorage.setItem('ievf_schedule_types', JSON.stringify(targetContainer.scheduleTypes || {}));
          setMeetingDays(targetContainer.meetingDays || {});
          setScheduleTypes(targetContainer.scheduleTypes || {});
        } catch {
          // ignore
        }
      } else {
        saveCurrentStateToWeekContainer(targetMondayIso);
      }

      try {
        localStorage.setItem('ievf_active_week_slot', targetSlot);
        localStorage.setItem('ievf_active_monday_iso', targetMondayIso);
      } catch {
        // ignore
      }

      setActiveWeekSlotState(targetSlot);
      window.dispatchEvent(new Event('schedule_matrix_updated'));
      window.dispatchEvent(
        new CustomEvent('week_slot_changed', {
          detail: { slot: targetSlot, mondayIso: targetMondayIso },
        })
      );
    },
    [activeWeekSlot]
  );

  const cloneCurrentWeekToNextWeek = useCallback(() => {
    const now = new Date();
    const currentMondayIso = getWeekMondayIso(getAnchorDateForWeekSlot('current', now));
    const nextMondayIso = getWeekMondayIso(getAnchorDateForWeekSlot('next', now));

    if (activeWeekSlot === 'current') {
      saveCurrentStateToWeekContainer(currentMondayIso);
    }

    const sourceContainer = loadWeekContainer(currentMondayIso);
    if (sourceContainer) {
      const cloned: WeekScheduleContainer = {
        ...sourceContainer,
        mondayIso: nextMondayIso,
        updatedAt: Date.now(),
      };
      try {
        localStorage.setItem(`${WEEK_CONTAINER_PREFIX}${nextMondayIso}`, JSON.stringify(cloned));
        if (activeWeekSlot === 'next') {
          const blocksStr = JSON.stringify(cloned.timeBlocks);
          localStorage.setItem('villaFloraMatrix', blocksStr);
          localStorage.setItem('ievf_time_blocks_v1', blocksStr);
          localStorage.setItem('ievf_meeting_days', JSON.stringify(cloned.meetingDays || {}));
          localStorage.setItem('ievf_schedule_types', JSON.stringify(cloned.scheduleTypes || {}));
          setMeetingDays(cloned.meetingDays || {});
          setScheduleTypes(cloned.scheduleTypes || {});
          window.dispatchEvent(new Event('schedule_matrix_updated'));
        }
      } catch {
        // ignore
      }
    } else {
      saveCurrentStateToWeekContainer(nextMondayIso);
    }
  }, [activeWeekSlot]);

  useEffect(() => {
    const handleSyncActiveWeekContainer = () => {
      saveCurrentStateToWeekContainer(activeMondayIso);
    };
    window.addEventListener('schedule_matrix_updated', handleSyncActiveWeekContainer);
    return () => {
      window.removeEventListener('schedule_matrix_updated', handleSyncActiveWeekContainer);
    };
  }, [activeMondayIso]);

  useEffect(() => {
    const checkFridayCutoff = () => {
      const now = new Date();
      const pastCutoff = isPastFridayCutoff(now);
      setIsAutoNextWeekCutoff((prev) => {
        if (!prev && pastCutoff) {
          setActiveWeekSlot('next');
        }
        return pastCutoff;
      });
    };

    const interval = window.setInterval(checkFridayCutoff, 30000);
    return () => window.clearInterval(interval);
  }, [setActiveWeekSlot]);

  const weekHeaders = useMemo(
    () => generateWeekHeaders(activeAnchorDate, customHolidays),
    [activeAnchorDate, customHolidays]
  );

  const value = useMemo<CoordinatorMatrixContextType>(
    () => ({
      selectedShift,
      setSelectedShift,
      isReviewDrawerOpen,
      setIsReviewDrawerOpen,
      pendingRequestsCount,
      setPendingRequestsCount,
      kpiStats,
      setKpiStats,
      statusFilter,
      setStatusFilter,
      searchTerm,
      setSearchTerm,
      activeTeachers,
      setActiveTeachers,
      officialSubjects,
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
      triggerReload,
      setOnReload,
      currentAcademicWeek,
      setCurrentAcademicWeek,
      currentPeriod,
      setCurrentPeriod,
      activeWeekSlot,
      setActiveWeekSlot,
      isAutoNextWeekCutoff,
      activeAnchorDate,
      activeMondayIso,
      weekInfo,
      cloneCurrentWeekToNextWeek,
      teachers,
      setTeachers,
      getTeacherColor,
      isTeacherModalOpen,
      setIsTeacherModalOpen,
      selectedTeacherForEdit,
      setSelectedTeacherForEdit,
      openTeacherModal,
      setOnRequestNoveltyModal,
      requestNoveltyModal,
      canUndo,
      setCanUndo,
      setOnUndo,
      triggerUndo,
      selectedCells,
      setSelectedCells,
      toggleSelectedCell,
      clearSelectedCells,
      setOnBatchDelete,
      triggerBatchDelete,
      weekHeaders,
      customHolidays,
      toggleHoliday,
      currentSection,
      setCurrentSection,
      isMatrixActive,
      setIsMatrixActive,
    }),
    [
      selectedShift,
      isReviewDrawerOpen,
      pendingRequestsCount,
      kpiStats,
      statusFilter,
      searchTerm,
      activeTeachers,
      officialSubjects,
      zoomLevel,
      zoomIn,
      zoomOut,
      resetZoom,
      meetingDays,
      setMeetingDay,
      eventDays,
      setEventDay,
      scheduleTypes,
      setScheduleType,
      triggerReload,
      setOnReload,
      currentAcademicWeek,
      currentPeriod,
      activeWeekSlot,
      setActiveWeekSlot,
      isAutoNextWeekCutoff,
      activeAnchorDate,
      activeMondayIso,
      weekInfo,
      cloneCurrentWeekToNextWeek,
      teachers,
      getTeacherColor,
      isTeacherModalOpen,
      selectedTeacherForEdit,
      openTeacherModal,
      setOnRequestNoveltyModal,
      requestNoveltyModal,
      canUndo,
      setOnUndo,
      triggerUndo,
      selectedCells,
      toggleSelectedCell,
      clearSelectedCells,
      setOnBatchDelete,
      triggerBatchDelete,
      weekHeaders,
      customHolidays,
      toggleHoliday,
      currentSection,
      isMatrixActive,
    ]
  );

  return (
    <CoordinatorMatrixContext.Provider value={value}>
      {children}
    </CoordinatorMatrixContext.Provider>
  );
};

export function useCoordinatorMatrix(): CoordinatorMatrixContextType {
  return useContext(CoordinatorMatrixContext);
}
