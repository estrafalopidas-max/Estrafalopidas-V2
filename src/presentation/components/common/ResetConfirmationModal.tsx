import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldAlert,
  X,
  Eraser,
  Wand2,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Sparkles,
  Upload,
  Plus,
  Trash2,
  ArrowRight,
  Flag,
  Clock,
  FileText,
  Save,
  Loader2,
  Check,
  ChevronDown,
  Eye,
} from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';
import {
  AcademicYearCalendarConfig,
  AcademicPeriod,
  AcademicRecess,
  HolidayEntry,
  InstitutionalCalendarEvent,
  InstitutionalEventModality,
  computeColombianHolidaysForYear,
  generateAcademicYearWeeksTimeline,
  getOrdinalSuffix,
  getAnchorDateForWeekSlot,
  getWeekMondayIso,
  DEFAULT_CALENDAR_2026,
  DEFAULT_CALENDAR_2027,
} from '../../../domain/services/ChronologyEngine';

export type SchoolYearResetMode = 'blank' | 'auto' | 'template';

interface ResetConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: SchoolYearResetMode) => void;
}

interface OptionConfig {
  id: SchoolYearResetMode;
  title: string;
  description: string;
  badge: string;
  icon: React.ReactNode;
  accentBorder: string;
  accentBg: string;
  accentText: string;
  buttonBg: string;
  buttonLabel: string;
}

const SCHOOL_YEAR_OPTIONS: OptionConfig[] = [
  {
    id: 'blank',
    title: 'Reiniciar desde cero (Parrilla en blanco)',
    description:
      'Limpia las casillas desde la semana activa en adelante (conservando el historial de semanas finalizadas), manteniendo registrados a los profesores y asignaturas.',
    badge: 'Lienzo limpio',
    icon: <Eraser className="w-4 h-4 shrink-0" />,
    accentBorder: 'border-amber-500',
    accentBg: 'bg-amber-50/80',
    accentText: 'text-amber-900',
    buttonBg: 'bg-amber-600 hover:bg-amber-700',
    buttonLabel: 'Reiniciar parrilla en blanco',
  },
  {
    id: 'auto',
    title: 'Proponer distribución automática',
    description:
      'A partir de la asignación académica, genera automáticamente una propuesta de horario sin cruces para la semana activa y siguientes, protegiendo las semanas anteriores ya cerradas.',
    badge: 'Motor inteligente',
    icon: <Wand2 className="w-4 h-4 shrink-0" />,
    accentBorder: 'border-blue-600',
    accentBg: 'bg-blue-50/80',
    accentText: 'text-blue-900',
    buttonBg: 'bg-blue-600 hover:bg-blue-700',
    buttonLabel: 'Generar distribución automática',
  },
  {
    id: 'template',
    title: 'Restaurar plantilla base',
    description:
      'Restaura el horario base institucional desde la semana activa en adelante, conservando intacto el registro de las semanas que ya finalizaron.',
    badge: 'Referencia 2026',
    icon: <RotateCcw className="w-4 h-4 shrink-0" />,
    accentBorder: 'border-emerald-600',
    accentBg: 'bg-emerald-50/80',
    accentText: 'text-emerald-900',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-700',
    buttonLabel: 'Restaurar plantilla base',
  },
];

const EVENT_MODALITY_OPTIONS: { value: InstitutionalEventModality; label: string; badgeClass: string }[] = [
  {
    value: 'B',
    label: 'Atención a padres (Horario B)',
    badgeClass: 'bg-pink-50 text-villa-magenta border-pink-200',
  },
  {
    value: 'D',
    label: 'Planes de apoyo (Horario D)',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    value: 'holiday',
    label: 'Jornada pedagógica / Sin clase',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
  },
  {
    value: 'novelty',
    label: 'Acto cívico / Actividad institucional',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  {
    value: 'A',
    label: 'Horario normal (Informativo)',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
];

export const ResetConfirmationModal: React.FC<ResetConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const {
    academicCalendarsStore,
    updateAcademicCalendarsStore,
    activeMondayIso,
    setCustomWeekMondayIso,
  } = useCoordinatorMatrix();

  const currentActiveYear = useMemo(() => {
    const parsed = activeMondayIso ? Number(activeMondayIso.slice(0, 4)) : NaN;
    return !isNaN(parsed) && parsed >= 2025 ? parsed : new Date().getFullYear();
  }, [activeMondayIso]);

  const [mainTab, setMainTab] = useState<'planner' | 'reset'>('planner');
  const [plannerSubTab, setPlannerSubTab] = useState<'weeks' | 'resolution' | 'holidays'>('weeks');
  const [selectedYear, setSelectedYear] = useState<number>(currentActiveYear);
  const [filterPeriod, setFilterPeriod] = useState<number | 'all'>('all');
  const [showPastWeeks, setShowPastWeeks] = useState<boolean>(false);
  const [isYearMenuOpen, setIsYearMenuOpen] = useState(false);
  const yearMenuRef = useRef<HTMLDivElement>(null);
  const [isModalityMenuOpen, setIsModalityMenuOpen] = useState(false);
  const modalityMenuRef = useRef<HTMLDivElement>(null);

  // Estado para crear un nuevo año escolar (ej. 2028)
  const [isAddingYear, setIsAddingYear] = useState(false);
  const [newYearInput, setNewYearInput] = useState<string>('2028');

  // Estado para carga y extracción IA de imagen/PDF de Resolución
  const [isParsingResolution, setIsParsingResolution] = useState(false);
  const [resolutionFeedback, setResolutionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showResolutionImagePreview, setShowResolutionImagePreview] = useState(false);
  const resolutionFileInputRef = useRef<HTMLInputElement>(null);

  // Formulario de nuevo evento institucional o festivo personalizado
  const [newEventDate, setNewEventDate] = useState<string>('');
  const [newEventTitle, setNewEventTitle] = useState<string>('');
  const [newEventModality, setNewEventModality] = useState<InstitutionalEventModality>('B');

  // Estado para el reinicio protegido
  const [selectedMode, setSelectedMode] = useState<SchoolYearResetMode>('auto');
  const [confirmText, setConfirmText] = useState<string>('');

  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setSelectedYear(currentActiveYear);
      setShowPastWeeks(false);
      setFilterPeriod('all');
    } else {
      setConfirmText('');
      setSelectedMode('auto');
      setResolutionFeedback(null);
      setIsYearMenuOpen(false);
      setIsModalityMenuOpen(false);
    }
  }, [isOpen, currentActiveYear]);

  useEffect(() => {
    if (!isYearMenuOpen && !isModalityMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (yearMenuRef.current && !yearMenuRef.current.contains(target)) {
        setIsYearMenuOpen(false);
      }
      if (modalityMenuRef.current && !modalityMenuRef.current.contains(target)) {
        setIsModalityMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isYearMenuOpen, isModalityMenuOpen]);

  const availableYears = useMemo(() => {
    const years = Object.keys(academicCalendarsStore.years || {})
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    return years.length > 0 ? years : [2026, 2027];
  }, [academicCalendarsStore.years]);

  const activeYearConfig: AcademicYearCalendarConfig = useMemo(() => {
    return (
      academicCalendarsStore.years?.[selectedYear] ||
      (selectedYear === 2027 ? DEFAULT_CALENDAR_2027 : DEFAULT_CALENDAR_2026)
    );
  }, [academicCalendarsStore.years, selectedYear]);

  const weeksTimeline = useMemo(
    () => generateAcademicYearWeeksTimeline(selectedYear),
    [selectedYear, academicCalendarsStore]
  );

  const filteredTimeline = useMemo(() => {
    if (filterPeriod === 'all') return weeksTimeline;
    return weeksTimeline.filter((w) => w.periodNumber === filterPeriod);
  }, [weeksTimeline, filterPeriod]);

  const { currentSlotMondayIso, nextSlotMondayIso } = useMemo(() => {
    const now = new Date();
    return {
      currentSlotMondayIso: getWeekMondayIso(getAnchorDateForWeekSlot('current', now)),
      nextSlotMondayIso: getWeekMondayIso(getAnchorDateForWeekSlot('next', now)),
    };
  }, [isOpen]);

  const { pastWeeks, upcomingWeeks } = useMemo(() => {
    const past: typeof filteredTimeline = [];
    const upcoming: typeof filteredTimeline = [];
    filteredTimeline.forEach((w) => {
      if (w.mondayIso < currentSlotMondayIso) {
        past.push(w);
      } else {
        upcoming.push(w);
      }
    });
    return { pastWeeks: past, upcomingWeeks: upcoming };
  }, [filteredTimeline, currentSlotMondayIso]);

  if (!isOpen) return null;

  const updateYearConfig = (updater: (prev: AcademicYearCalendarConfig) => AcademicYearCalendarConfig) => {
    const nextConfig = updater(activeYearConfig);
    updateAcademicCalendarsStore({
      ...academicCalendarsStore,
      activePlannerYear: selectedYear,
      years: {
        ...academicCalendarsStore.years,
        [selectedYear]: {
          ...nextConfig,
          updatedAt: Date.now(),
        },
      },
      updatedAtMs: Date.now(),
    });
  };

  const handleCreateNewYear = () => {
    const yr = parseInt(newYearInput.trim(), 10);
    if (isNaN(yr) || yr < 2025 || yr > 2040) return;
    if (!academicCalendarsStore.years[yr]) {
      const generated: AcademicYearCalendarConfig = {
        year: yr,
        resolutionTitle: `Calendario Académico General (A) Año Escolar ${yr} - Distrito de Medellín`,
        totalWeeks: 40,
        periods: [
          { period: 1, start: `${yr}-01-18`, end: `${yr}-04-25`, totalWeeks: 13, label: '1er Periodo' },
          { period: 2, start: `${yr}-04-26`, end: `${yr}-08-15`, totalWeeks: 13, label: '2do Periodo' },
          { period: 3, start: `${yr}-08-16`, end: `${yr}-11-28`, totalWeeks: 14, label: '3er Periodo' },
        ],
        institutionalDevelopmentWeeks: [
          {
            start: `${yr}-01-11`,
            end: `${yr}-01-17`,
            name: 'Desarrollo Institucional • Inicio de Año',
            type: 'institutional_development',
            weeks: 1,
          },
          {
            start: `${yr}-03-22`,
            end: `${yr}-03-28`,
            name: 'Desarrollo Institucional • Semana Santa',
            type: 'institutional_development',
            weeks: 1,
          },
          {
            start: `${yr}-06-28`,
            end: `${yr}-07-04`,
            name: 'Desarrollo Institucional • Mitad de Año',
            type: 'institutional_development',
            weeks: 1,
          },
          {
            start: `${yr}-10-11`,
            end: `${yr}-10-17`,
            name: 'Desarrollo Institucional • Receso de Octubre',
            type: 'institutional_development',
            weeks: 1,
          },
          {
            start: `${yr}-11-29`,
            end: `${yr}-12-05`,
            name: 'Desarrollo Institucional • Cierre Lectivo',
            type: 'institutional_development',
            weeks: 1,
          },
        ],
        teacherVacations: [
          {
            start: `${yr - 1}-12-28`,
            end: `${yr}-01-10`,
            name: 'Vacaciones de Docentes • Inicio de Año',
            type: 'vacation',
            weeks: 2,
          },
          {
            start: `${yr}-06-14`,
            end: `${yr}-06-27`,
            name: 'Vacaciones de Docentes • Mitad de Año',
            type: 'vacation',
            weeks: 2,
          },
          {
            start: `${yr}-12-06`,
            end: `${yr}-12-26`,
            name: 'Vacaciones de Docentes • Fin de Año',
            type: 'vacation',
            weeks: 3,
          },
        ],
        holidays: computeColombianHolidaysForYear(yr),
        institutionalEvents: [],
        updatedAt: Date.now(),
      };
      updateAcademicCalendarsStore({
        ...academicCalendarsStore,
        activePlannerYear: yr,
        years: {
          ...academicCalendarsStore.years,
          [yr]: generated,
        },
        updatedAtMs: Date.now(),
      });
    }
    setSelectedYear(yr);
    setIsAddingYear(false);
    setResolutionFeedback({
      type: 'success',
      message: `Año escolar ${yr} creado con los 18 festivos oficiales de Colombia pre-cargados. Puedes subir la imagen de la resolución para ajustar las fechas exactas.`,
    });
  };

  const applyExtractedResolutionData = (extracted: any) => {
    const targetYr =
      typeof extracted.year === 'number' && extracted.year >= 2025 && extracted.year <= 2040
        ? extracted.year
        : selectedYear;

    const periods: AcademicPeriod[] =
      Array.isArray(extracted.periods) && extracted.periods.length > 0
        ? extracted.periods.map((p: any, idx: number) => ({
            period: Number(p.period || idx + 1),
            start: String(p.start || ''),
            end: String(p.end || ''),
            totalWeeks: Number(p.totalWeeks || (idx === 2 ? 14 : 13)),
            label: p.label || `${idx + 1}${getOrdinalSuffix(idx + 1)} Periodo`,
          }))
        : activeYearConfig.periods;

    const institutionalDevelopmentWeeks: AcademicRecess[] = Array.isArray(
      extracted.institutionalDevelopmentWeeks
    )
      ? extracted.institutionalDevelopmentWeeks.map((r: any) => ({
          start: String(r.start || ''),
          end: String(r.end || ''),
          name: String(r.name || 'Desarrollo Institucional'),
          type: 'institutional_development' as const,
          weeks: Number(r.weeks || 1),
        }))
      : activeYearConfig.institutionalDevelopmentWeeks;

    const teacherVacations: AcademicRecess[] = Array.isArray(extracted.teacherVacations)
      ? extracted.teacherVacations.map((r: any) => ({
          start: String(r.start || ''),
          end: String(r.end || ''),
          name: String(r.name || 'Vacaciones de Docentes'),
          type: 'vacation' as const,
          weeks: Number(r.weeks || 2),
        }))
      : activeYearConfig.teacherVacations;

    const studentRecesses: AcademicRecess[] = Array.isArray(extracted.studentRecesses)
      ? extracted.studentRecesses.map((r: any) => ({
          start: String(r.start || ''),
          end: String(r.end || ''),
          name: String(r.name || 'Receso Estudiantil'),
          type: 'student_recess' as const,
          weeks: Number(r.weeks || 1),
        }))
      : activeYearConfig.studentRecesses || [];

    const lectureBlocks = Array.isArray(extracted.lectureBlocks)
      ? extracted.lectureBlocks.map((b: any, i: number) => ({
          id: `${targetYr}-b${i + 1}`,
          start: String(b.start || ''),
          end: String(b.end || ''),
          weeks: Number(b.weeks || 10),
          label: String(b.label || `Bloque Lectivo ${i + 1}`),
        }))
      : activeYearConfig.lectureBlocks || [];

    const updatedYearConfig: AcademicYearCalendarConfig = {
      ...(academicCalendarsStore.years[targetYr] || activeYearConfig),
      year: targetYr,
      resolutionTitle:
        extracted.resolutionTitle ||
        `Resolución Calendario Académico General (A) Año Escolar ${targetYr}`,
      totalWeeks: 40,
      periods,
      lectureBlocks,
      institutionalDevelopmentWeeks,
      teacherVacations,
      studentRecesses,
      holidays: computeColombianHolidaysForYear(targetYr),
      updatedAt: Date.now(),
    };

    updateAcademicCalendarsStore({
      ...academicCalendarsStore,
      activePlannerYear: targetYr,
      years: {
        ...academicCalendarsStore.years,
        [targetYr]: updatedYearConfig,
      },
      updatedAtMs: Date.now(),
    });
    setSelectedYear(targetYr);
  };

  const handleUploadResolutionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsParsingResolution(true);
    setResolutionFeedback(null);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
        reader.readAsDataURL(file);
      });

      const token =
        localStorage.getItem('ievf_session_token') ||
        localStorage.getItem('ievf_session_token_v1') ||
        '';
      const response = await fetch('/api/academic-calendar/parse-resolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-ievf-session-token': token } : {}),
        },
        body: JSON.stringify({
          base64Data,
          mimeType: file.type || 'image/png',
          year: selectedYear,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.extracted) {
        throw new Error(data?.error || 'No se pudo procesar la resolución.');
      }

      applyExtractedResolutionData(data.extracted);
      setResolutionFeedback({
        type: 'success',
        message: `Fechas del calendario académico extraídas e implementadas correctamente en la base de datos.`,
      });
    } catch (err: any) {
      setResolutionFeedback({
        type: 'error',
        message: err?.message || 'Error al analizar la imagen de la resolución.',
      });
    } finally {
      setIsParsingResolution(false);
    }
  };

  const handleUpdatePeriodField = (
    periodNum: number,
    field: 'start' | 'end' | 'totalWeeks',
    value: string | number
  ) => {
    updateYearConfig((prev) => ({
      ...prev,
      periods: prev.periods.map((p) =>
        p.period === periodNum
          ? {
              ...p,
              [field]: field === 'totalWeeks' ? Math.max(1, Number(value) || 1) : String(value),
            }
          : p
      ),
    }));
  };

  const handleAddInstitutionalEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventDate || !newEventTitle.trim()) return;
    const eventYear = Number(newEventDate.slice(0, 4)) || selectedYear;
    const newEv: InstitutionalCalendarEvent = {
      id: `ev-${Date.now()}`,
      date: newEventDate,
      title: newEventTitle.trim(),
      modality: newEventModality,
    };

    const targetConfig =
      academicCalendarsStore.years[eventYear] ||
      (eventYear === 2027 ? DEFAULT_CALENDAR_2027 : DEFAULT_CALENDAR_2026);

    const nextEvents = [...(targetConfig.institutionalEvents || []), newEv].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    updateAcademicCalendarsStore({
      ...academicCalendarsStore,
      years: {
        ...academicCalendarsStore.years,
        [eventYear]: {
          ...targetConfig,
          institutionalEvents: nextEvents,
          updatedAt: Date.now(),
        },
      },
      updatedAtMs: Date.now(),
    });

    setNewEventDate('');
    setNewEventTitle('');
    setResolutionFeedback({
      type: 'success',
      message: `Evento "${newEv.title}" guardado para el ${newEv.date}. Se aplicará automáticamente en la parrilla de esa semana.`,
    });
  };

  const handleRemoveInstitutionalEvent = (id: string) => {
    updateYearConfig((prev) => ({
      ...prev,
      institutionalEvents: (prev.institutionalEvents || []).filter((ev) => ev.id !== id),
    }));
  };

  const handleJumpToWeekInMatrix = (mondayIso: string) => {
    setCustomWeekMondayIso(mondayIso);
    onClose();
  };

  const isConfirmed = confirmText.trim().toUpperCase() === 'CONFIRMAR';
  const activeOption =
    SCHOOL_YEAR_OPTIONS.find((opt) => opt.id === selectedMode) || SCHOOL_YEAR_OPTIONS[0];
  const selectedModalityOption =
    EVENT_MODALITY_OPTIONS.find((m) => m.value === newEventModality) || EVENT_MODALITY_OPTIONS[0];

  const handleSubmitReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (isConfirmed) {
      onConfirm(selectedMode);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-modal-title"
      >
        {/* Cabecera Estructural Fija con el azul institucional de Villa Flora */}
        <div className="bg-gradient-to-r from-villa-blue-dark via-villa-blue to-villa-blue-light px-6 py-4 border-b-2 border-amber-400 flex items-center justify-between shrink-0 text-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-amber-300 shadow-inner shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 id="reset-modal-title" className="text-base font-bold text-white tracking-tight">
                Planificador de Año Escolar e Inicio Lectivo
              </h3>
              <p className="text-xs text-sky-100/90 font-medium">
                Gestión anticipada de periodos, festivos, resoluciones oficiales (2026 – 2027+) y parrilla base
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pestañas Principales del Modal */}
            <div className="inline-flex items-center bg-black/15 p-1 rounded-xl border border-white/20">
              <button
                type="button"
                onClick={() => setMainTab('planner')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  mainTab === 'planner'
                    ? 'bg-white text-villa-blue-dark shadow-2xs'
                    : 'text-sky-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Planificador Anual</span>
              </button>
              <button
                type="button"
                onClick={() => setMainTab('reset')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  mainTab === 'reset'
                    ? 'bg-amber-400 text-slate-950 shadow-2xs'
                    : 'text-sky-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Reiniciar Parrilla</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition cursor-pointer"
              title="Cerrar ventana"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {mainTab === 'planner' ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Barra de Control del Planificador: Selector de Año + Sub-pestañas + Carga de Resolución IA */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Menú Desplegable de Año Escolar con el diseño unificado del proyecto */}
                <div ref={yearMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsYearMenuOpen((prev) => !prev)}
                    className="h-8 flex items-center justify-between gap-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer select-none shadow-2xs"
                    title="Seleccionar año escolar"
                  >
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-villa-blue-light shrink-0" />
                      <span>Año Escolar {selectedYear}</span>
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${
                        isYearMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isYearMenuOpen && (
                    <div className="absolute left-0 mt-1.5 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 select-none">
                      {availableYears.map((yr) => {
                        const isSelected = selectedYear === yr;
                        return (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => {
                              setSelectedYear(yr);
                              setIsYearMenuOpen(false);
                            }}
                            className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors text-left"
                          >
                            <span
                              className={`text-xs ${
                                isSelected
                                  ? 'text-villa-blue-dark font-bold'
                                  : 'text-slate-700 font-semibold'
                              }`}
                            >
                              Año Escolar {yr}
                            </span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-villa-blue-light shrink-0" />
                            )}
                          </button>
                        );
                      })}
                      <div className="border-t border-slate-100 mt-1 pt-1 px-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsYearMenuOpen(false);
                            setNewYearInput(String(Math.max(...availableYears) + 1));
                            setIsAddingYear(true);
                          }}
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold text-villa-blue hover:bg-sky-50 transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Crear nuevo año...</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {isAddingYear && (
                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-sky-300 shadow-2xs">
                    <input
                      type="number"
                      min={2025}
                      max={2040}
                      value={newYearInput}
                      onChange={(e) => setNewYearInput(e.target.value)}
                      className="w-16 text-xs font-bold text-slate-900 outline-none"
                      placeholder="2028"
                    />
                    <button
                      type="button"
                      onClick={handleCreateNewYear}
                      className="px-2 py-0.5 rounded-lg bg-villa-blue text-white text-[11px] font-bold hover:bg-villa-blue-dark cursor-pointer"
                    >
                      Crear
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingYear(false)}
                      className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Sub-pestañas del Planificador */}
                <div className="inline-flex items-center bg-slate-200/70 p-0.5 rounded-xl border border-slate-200 h-8">
                  <button
                    type="button"
                    onClick={() => setPlannerSubTab('weeks')}
                    className={`h-full px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      plannerSubTab === 'weeks'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    40 Semanas Lectivas
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlannerSubTab('resolution')}
                    className={`h-full px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      plannerSubTab === 'resolution'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Periodos y Resolución ({selectedYear})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlannerSubTab('holidays')}
                    className={`h-full px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      plannerSubTab === 'holidays'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Festivos y Eventos ({activeYearConfig.holidays?.length || 18})
                  </button>
                </div>
              </div>

              {/* Botón de Carga de Imagen/PDF de Resolución Oficial */}
              <div className="flex items-center gap-2">
                <input
                  ref={resolutionFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleUploadResolutionFile}
                />
                <button
                  type="button"
                  disabled={isParsingResolution}
                  onClick={() => resolutionFileInputRef.current?.click()}
                  className="h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                  title="Cargar imagen o PDF de la resolución oficial para extraer fechas automáticamente"
                >
                  {isParsingResolution ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>Cargar resolución ({selectedYear})</span>
                </button>
              </div>
            </div>

            {resolutionFeedback && (
              <div
                className={`px-6 py-2 text-xs font-semibold flex items-center justify-between border-b ${
                  resolutionFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-red-50 text-red-900 border-red-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{resolutionFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setResolutionFeedback(null)}
                  className="p-0.5 hover:opacity-75 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Cuerpo Dinámico del Planificador */}
            <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-4 text-xs">
              {plannerSubTab === 'weeks' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        {activeYearConfig.resolutionTitle}
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Selecciona cualquier semana de {selectedYear} para abrir su parrilla y pre-cargar asignaciones o modalidades de manera anticipada.
                      </p>
                    </div>

                    {/* Filtro Rápido por Periodo */}
                    <div className="inline-flex items-center bg-white p-0.5 rounded-xl border border-slate-200 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setFilterPeriod('all')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                          filterPeriod === 'all'
                            ? 'bg-villa-blue text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Todas
                      </button>
                      {activeYearConfig.periods.map((p) => (
                        <button
                          key={p.period}
                          type="button"
                          onClick={() => setFilterPeriod(p.period)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                            filterPeriod === p.period
                              ? 'bg-villa-blue text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {p.period}
                          {getOrdinalSuffix(p.period)} Per. ({p.totalWeeks} sem)
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Desplegable de Semanas Finalizadas / Transcurridas */}
                  {pastWeeks.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowPastWeeks((prev) => !prev)}
                        className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-100/80 transition cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-200/80 text-slate-600">
                            <Clock className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            Semanas finalizadas ({pastWeeks.length}{' '}
                            {pastWeeks.length === 1 ? 'semana anterior' : 'semanas anteriores'})
                          </span>
                          {pastWeeks.some((w) => w.mondayIso === activeMondayIso) && (
                            <span className="px-2 py-0.5 rounded-md bg-sky-100 text-villa-blue-dark border border-sky-200 text-[10px] font-bold">
                              Semana abierta en parrilla
                            </span>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-villa-blue">
                          <span>{showPastWeeks ? 'Ocultar historial' : 'Mostrar semanas pasadas'}</span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${
                              showPastWeeks ? 'rotate-180' : ''
                            }`}
                          />
                        </span>
                      </button>

                      {showPastWeeks && (
                        <div className="p-3 pt-2 border-t border-slate-200/80 bg-slate-100/40">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {pastWeeks.map((week) => {
                              const isActiveInMatrix = week.mondayIso === activeMondayIso;
                              return (
                                <div
                                  key={week.mondayIso}
                                  className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                                    isActiveInMatrix
                                      ? 'border-villa-blue bg-sky-50/70 ring-1 ring-villa-blue/40'
                                      : week.isRecess
                                      ? 'border-amber-200/80 bg-amber-50/30 opacity-85 hover:opacity-100'
                                      : 'border-slate-200 bg-white/80 opacity-85 hover:opacity-100 hover:border-sky-200'
                                  }`}
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-1.5">
                                      {week.isRecess ? (
                                        <span className="px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-800 border border-amber-200/80 font-bold text-[10px]">
                                          Receso / Desarrollo Inst.
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[10px]">
                                          {week.periodNumber}
                                          {getOrdinalSuffix(week.periodNumber || 1)} Periodo • Sem.{' '}
                                          {week.weekInPeriod} de {week.totalWeeksInPeriod}
                                        </span>
                                      )}

                                      {week.globalWeekNumber && (
                                        <span className="text-[10px] font-bold text-slate-400">
                                          Lectiva #{week.globalWeekNumber}/40
                                        </span>
                                      )}
                                    </div>

                                    <p className="text-xs font-bold text-slate-800">
                                      Del {week.lunesFormat} al {week.viernesFormat} de {selectedYear}
                                    </p>

                                    {week.isRecess && week.recessName && (
                                      <p className="text-[11px] font-semibold text-amber-800">
                                        {week.recessName}
                                      </p>
                                    )}

                                    {(week.holidays.length > 0 || week.events.length > 0) && (
                                      <div className="flex flex-wrap gap-1 pt-1">
                                        {week.holidays.map((h) => (
                                          <span
                                            key={h.date}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-semibold"
                                            title={`Festivo: ${h.date}`}
                                          >
                                            <Flag className="w-2.5 h-2.5 shrink-0" />
                                            <span className="truncate max-w-[160px]">{h.name}</span>
                                          </span>
                                        ))}
                                        {week.events.map((ev) => (
                                          <span
                                            key={ev.id}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-semibold"
                                            title={`${ev.date}: ${ev.title}`}
                                          >
                                            <Clock className="w-2.5 h-2.5 shrink-0" />
                                            <span className="truncate max-w-[160px]">{ev.title}</span>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                                    <span className="text-[10px] font-mono text-slate-400">
                                      Lunes {week.mondayIso}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleJumpToWeekInMatrix(week.mondayIso)}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                        isActiveInMatrix
                                          ? 'bg-villa-blue text-white'
                                          : 'bg-slate-100 hover:bg-villa-blue hover:text-white text-slate-800'
                                      }`}
                                    >
                                      <span>{isActiveInMatrix ? 'Semana abierta' : 'Abrir en parrilla'}</span>
                                      <ArrowRight className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cuadrícula de Semanas Actuales y Próximas */}
                  {upcomingWeeks.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {upcomingWeeks.map((week) => {
                        const isActiveInMatrix = week.mondayIso === activeMondayIso;
                        const isCurrentSlotWeek = week.mondayIso === currentSlotMondayIso;
                        const isNextSlotWeek = week.mondayIso === nextSlotMondayIso;
                        return (
                          <div
                            key={week.mondayIso}
                            className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                              isActiveInMatrix
                                ? 'border-villa-blue bg-sky-50/70 ring-1 ring-villa-blue/40'
                                : week.isRecess
                                ? 'border-amber-200 bg-amber-50/40'
                                : 'border-slate-200 bg-white hover:border-sky-200'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-1.5">
                                {week.isRecess ? (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-800 border border-amber-200/80 font-bold text-[10px]">
                                    Receso / Desarrollo Inst.
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md bg-sky-50 text-villa-blue-dark border border-sky-200/80 font-bold text-[10px]">
                                    {week.periodNumber}
                                    {getOrdinalSuffix(week.periodNumber || 1)} Periodo • Sem.{' '}
                                    {week.weekInPeriod} de {week.totalWeeksInPeriod}
                                  </span>
                                )}

                                <div className="flex items-center gap-1">
                                  {isCurrentSlotWeek && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9.5px] font-extrabold uppercase">
                                      Semana actual
                                    </span>
                                  )}
                                  {isNextSlotWeek && (
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9.5px] font-extrabold uppercase">
                                      Próxima semana
                                    </span>
                                  )}
                                  {week.globalWeekNumber && (
                                    <span className="text-[10px] font-bold text-slate-400">
                                      Lectiva #{week.globalWeekNumber}/40
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p className="text-xs font-bold text-slate-900">
                                Del {week.lunesFormat} al {week.viernesFormat} de {selectedYear}
                              </p>

                              {week.isRecess && week.recessName && (
                                <p className="text-[11px] font-semibold text-amber-800">
                                  {week.recessName}
                                </p>
                              )}

                              {/* Festivos y Eventos en esta semana */}
                              {(week.holidays.length > 0 || week.events.length > 0) && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {week.holidays.map((h) => (
                                    <span
                                      key={h.date}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-semibold"
                                      title={`Festivo: ${h.date}`}
                                    >
                                      <Flag className="w-2.5 h-2.5 shrink-0" />
                                      <span className="truncate max-w-[160px]">{h.name}</span>
                                    </span>
                                  ))}
                                  {week.events.map((ev) => (
                                    <span
                                      key={ev.id}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-semibold"
                                      title={`${ev.date}: ${ev.title}`}
                                    >
                                      <Clock className="w-2.5 h-2.5 shrink-0" />
                                      <span className="truncate max-w-[160px]">{ev.title}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-[10px] font-mono text-slate-400">
                                Lunes {week.mondayIso}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleJumpToWeekInMatrix(week.mondayIso)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                  isActiveInMatrix
                                    ? 'bg-villa-blue text-white'
                                    : 'bg-slate-100 hover:bg-villa-blue hover:text-white text-slate-800'
                                }`}
                              >
                                <span>{isActiveInMatrix ? 'Semana abierta' : 'Abrir en parrilla'}</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {plannerSubTab === 'resolution' && (
                <div className="space-y-4">
                  {/* Banner de Resolución Oficial 2027 adjunta */}
                  {selectedYear === 2027 && activeYearConfig.resolutionImageUrl && (
                    <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-indigo-950">
                            Resolución Oficial Calendario Académico 2027 (Medellín) vinculada
                          </p>
                          <p className="text-[11px] text-indigo-800">
                            40 semanas lectivas (Art. 2), 5 sem. Desarrollo Institucional (Art. 3), 7 sem. Vacaciones Docentes (Art. 4) y 12 sem. Receso Estudiantil (Art. 5).
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowResolutionImagePreview((prev) => !prev)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          {showResolutionImagePreview ? 'Ocultar documento' : 'Ver resolución 2027'}
                        </span>
                      </button>
                    </div>
                  )}

                  {showResolutionImagePreview && activeYearConfig.resolutionImageUrl && (
                    <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50 flex justify-center">
                      <img
                        src={activeYearConfig.resolutionImageUrl}
                        alt={`Resolución Calendario Académico ${selectedYear}`}
                        className="max-h-96 w-auto rounded-xl border border-slate-300 shadow-sm object-contain"
                      />
                    </div>
                  )}

                  {/* Configuración Editable de los 3 Periodos Académicos */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-900">
                      Distribución de Periodos Académicos ({selectedYear}) — 40 Semanas Lectivas
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {activeYearConfig.periods.map((p) => (
                        <div
                          key={p.period}
                          className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-villa-blue-dark">
                              {p.period}
                              {getOrdinalSuffix(p.period)} Periodo Académico
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 font-bold text-[10px]">
                              {p.totalWeeks} semanas
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                Fecha Inicio
                              </label>
                              <input
                                type="date"
                                value={p.start}
                                onChange={(e) =>
                                  handleUpdatePeriodField(p.period, 'start', e.target.value)
                                }
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                Fecha Fin
                              </label>
                              <input
                                type="date"
                                value={p.end}
                                onChange={(e) =>
                                  handleUpdatePeriodField(p.period, 'end', e.target.value)
                                }
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Semanas lectivas del periodo
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={25}
                              value={p.totalWeeks}
                              onChange={(e) =>
                                handleUpdatePeriodField(p.period, 'totalWeeks', e.target.value)
                              }
                              className="w-24 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bloques Lectivos de la Resolución + Desarrollo Institucional + Vacaciones Docentes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2">
                      <h5 className="text-xs font-bold text-slate-900">
                        Semanas de Desarrollo Institucional (Art. 3)
                      </h5>
                      <div className="space-y-1.5">
                        {(activeYearConfig.institutionalDevelopmentWeeks || []).map((w, idx) => (
                          <div
                            key={`${w.start}-${idx}`}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-amber-50/70 border border-amber-200/80"
                          >
                            <span className="font-semibold text-amber-950 truncate">{w.name}</span>
                            <span className="text-[11px] font-mono font-bold text-amber-800 shrink-0">
                              {w.start} → {w.end}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2">
                      <h5 className="text-xs font-bold text-slate-900">
                        Vacaciones de Docentes y Directivos (Art. 4)
                      </h5>
                      <div className="space-y-1.5">
                        {(activeYearConfig.teacherVacations || []).map((v, idx) => (
                          <div
                            key={`${v.start}-${idx}`}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80"
                          >
                            <span className="font-semibold text-emerald-950 truncate">{v.name}</span>
                            <span className="text-[11px] font-mono font-bold text-emerald-800 shrink-0">
                              {v.start} → {v.end}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {plannerSubTab === 'holidays' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Columna 1: Programar Eventos Institucionales y Modalidades Anticipadas */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Programar Evento Institucional o Modalidad Anticipada ({selectedYear})
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Pre-carga fechas de Atención a padres, Planes de apoyo o Jornadas pedagógicas para que la parrilla las active automáticamente.
                      </p>
                    </div>

                    <form onSubmit={handleAddInstitutionalEvent} className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-1">
                            Fecha del evento
                          </label>
                          <input
                            type="date"
                            required
                            value={newEventDate}
                            onChange={(e) => setNewEventDate(e.target.value)}
                            className="w-full h-8 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                          />
                        </div>

                        {/* Menú desplegable de modalidad con diseño unificado */}
                        <div ref={modalityMenuRef} className="relative">
                          <label className="block text-[10px] font-bold text-slate-700 mb-1">
                            Modalidad en parrilla
                          </label>
                          <button
                            type="button"
                            onClick={() => setIsModalityMenuOpen((prev) => !prev)}
                            className="h-8 w-full flex items-center justify-between gap-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer shadow-2xs"
                          >
                            <span className="truncate font-bold">{selectedModalityOption.label}</span>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          </button>

                          {isModalityMenuOpen && (
                            <div className="absolute left-0 mt-1 w-full bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 select-none">
                              {EVENT_MODALITY_OPTIONS.map((opt) => {
                                const isSel = newEventModality === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      setNewEventModality(opt.value);
                                      setIsModalityMenuOpen(false);
                                    }}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-left"
                                  >
                                    <span
                                      className={`text-xs ${
                                        isSel
                                          ? 'text-villa-blue-dark font-bold'
                                          : 'text-slate-700 font-semibold'
                                      }`}
                                    >
                                      {opt.label}
                                    </span>
                                    {isSel && (
                                      <span className="w-2 h-2 rounded-full bg-villa-blue-light shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          required
                          value={newEventTitle}
                          onChange={(e) => setNewEventTitle(e.target.value)}
                          placeholder="Ej. Entrega de informes 1er periodo / Jornada pedagógica..."
                          className="flex-1 h-8 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 placeholder-slate-400"
                        />
                        <button
                          type="submit"
                          className="h-8 px-3 rounded-xl bg-villa-blue hover:bg-villa-blue-dark text-white text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agendar</span>
                        </button>
                      </div>
                    </form>

                    {/* Lista de Eventos Programados */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-200">
                      <span className="text-[11px] font-bold text-slate-700">
                        Eventos institucionales registrados ({activeYearConfig.institutionalEvents?.length || 0})
                      </span>
                      {(activeYearConfig.institutionalEvents || []).length === 0 ? (
                        <p className="text-[11px] text-slate-500 italic py-2">
                          Aún no hay eventos institucionales adicionales programados para {selectedYear}.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                          {(activeYearConfig.institutionalEvents || []).map((ev) => {
                            const modInfo =
                              EVENT_MODALITY_OPTIONS.find((m) => m.value === ev.modality) ||
                              EVENT_MODALITY_OPTIONS[0];
                            return (
                              <div
                                key={ev.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-slate-200"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-[11px] text-slate-900">
                                      {ev.date}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded border text-[9.5px] font-bold ${modInfo.badgeClass}`}
                                    >
                                      {modInfo.label}
                                    </span>
                                  </div>
                                  <p className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                                    {ev.title}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveInstitutionalEvent(ev.id)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer shrink-0"
                                  title="Eliminar evento"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Columna 2: Festivos Oficiales de Colombia del Año */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Festivos Oficiales de Colombia ({selectedYear})
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Calculados automáticamente bajo la Ley Emiliani y calendario litúrgico.
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
                        {(activeYearConfig.holidays || []).length} festivos
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
                      {(activeYearConfig.holidays || []).map((h) => (
                        <div
                          key={h.date}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-red-50/50 border border-red-100"
                        >
                          <span className="text-[11px] font-semibold text-slate-800 truncate">
                            {h.name}
                          </span>
                          <span className="text-[10.5px] font-mono font-bold text-red-700 shrink-0">
                            {h.date}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pie de Página Fijo del Planificador */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-villa-blue hover:bg-villa-blue-dark text-white text-xs font-bold transition cursor-pointer shadow-2xs"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
          /* Pestaña 2: Reinicio Protegido de Parrilla Base */
          <form onSubmit={handleSubmitReset} className="flex flex-col flex-1 min-h-0">
            <div className="p-5 space-y-3.5 overflow-y-auto flex-1 min-h-0 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 text-[11px] font-medium leading-relaxed">
                Cualquiera de las 3 opciones se aplicará <strong>únicamente desde la semana activa en adelante</strong>. El registro histórico de las semanas ya finalizadas se conserva intacto.
              </div>
              <p className="text-slate-600 font-medium leading-relaxed">
                Selecciona la modalidad con la que deseas estructurar o reiniciar la parrilla horaria base:
              </p>

              <div className="space-y-2.5" role="radiogroup" aria-label="Opciones de inicio de año escolar">
                {SCHOOL_YEAR_OPTIONS.map((option) => {
                  const isSelected = selectedMode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedMode(option.id)}
                      className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                        isSelected
                          ? `${option.accentBorder} ${option.accentBg} shadow-xs`
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-villa-blue text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {option.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-xs font-bold leading-snug ${
                              isSelected ? option.accentText : 'text-slate-800'
                            }`}
                          >
                            {option.title}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${
                              isSelected ? 'bg-sky-100 text-villa-blue-dark border border-sky-200' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {option.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                          {option.description}
                        </p>
                      </div>
                      <div className="mt-1 shrink-0">
                        <CheckCircle2
                          className={`w-4 h-4 transition-opacity ${
                            isSelected ? 'text-villa-blue opacity-100' : 'opacity-0'
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <label htmlFor="confirm-input" className="block text-xs font-bold text-slate-800">
                  Confirmación de seguridad: escribe{' '}
                  <span className="font-mono text-red-600 font-extrabold select-all">CONFIRMAR</span>{' '}
                  para autorizar esta operación:
                </label>
                <input
                  id="confirm-input"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CONFIRMAR"
                  autoComplete="off"
                  spellCheck="false"
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-300 focus:border-villa-blue focus:ring-2 focus:ring-sky-200 outline-none text-sm font-mono font-bold text-slate-800 transition bg-slate-50/50 uppercase placeholder:text-slate-400 placeholder:normal-case"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={!isConfirmed}
                className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white active:scale-95 shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:hover:bg-gray-200 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:shadow-none ${activeOption.buttonBg}`}
              >
                {activeOption.icon}
                <span>{activeOption.buttonLabel}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
