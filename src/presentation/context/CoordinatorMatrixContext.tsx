import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ShiftType } from '../../domain/entities/grade.entity';
import { UserEntity } from '../../domain/entities/user.entity';
import { getTeacherVisualIdentity } from '../../domain/services/teacher-visual-identity.service';
import { resolveOfficialTeacherEntry } from '../../domain/services/teacher-normalization.service';
import { FirestoreUserRepository } from '../../infrastructure/repositories/firestore-user.repository';
import { ensureSeedDataLoaded, SEED_TEACHERS } from '../../infrastructure/seed/initial-seed';
import { ALL_OFFICIAL_MATERIAS } from '../../domain/constants/subjects';
import { generateWeekHeaders, getCurrentWeekText, DynamicDayHeader, getOrdinalSuffix } from '../../domain/services/ChronologyEngine';

export interface KpiStats {
  total: number;
  uncovered: number;
  covered: number;
  isLoading?: boolean;
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
  scheduleTypes: Record<string, 'A' | 'B' | 'C'>;
  setScheduleType: (day: string, type: 'A' | 'B' | 'C', shift?: ShiftType) => void;
  triggerReload: () => void;
  setOnReload: (fn: (() => void) | null) => void;
  currentAcademicWeek: number;
  setCurrentAcademicWeek: (week: number) => void;
  currentPeriod: string;
  setCurrentPeriod: (period: string) => void;
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
  const [scheduleTypes, setScheduleTypes] = useState<Record<string, 'A' | 'B' | 'C'>>(() => {
    try {
      const saved = localStorage.getItem('ievf_schedule_types');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const weekInfo = useMemo(() => getCurrentWeekText(new Date()), []);
  const [currentAcademicWeek, setCurrentAcademicWeek] = useState<number>(weekInfo.weekNumber || 9);
  const [currentPeriod, setCurrentPeriod] = useState<string>(
    `${weekInfo.periodNumber}${getOrdinalSuffix(weekInfo.periodNumber)} Periodo`
  );

  const [teachers, setTeachers] = useState<UserEntity[]>(() => {
    try {
      ensureSeedDataLoaded();
      const raw = localStorage.getItem('ievf_users_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as UserEntity[];
        const list = parsed.filter((u) => !u.role || u.role === 'teacher');
        if (list.length > 0) return list;
      }
    } catch {
      // ignore
    }
    return SEED_TEACHERS;
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
    repo.getTeachers().then((list) => {
      if (list && list.length > 0) {
        setTeachers(list);
      }
    }).catch(() => {});
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

  const setScheduleType = useCallback((day: string, type: 'A' | 'B' | 'C', shift?: ShiftType) => {
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

  const weekHeaders = useMemo(() => generateWeekHeaders(new Date(), customHolidays), [customHolidays]);

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
