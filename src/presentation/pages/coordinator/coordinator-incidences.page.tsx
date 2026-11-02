import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Sparkles,
  Trash2,
  Edit3,
  Upload,
  Eye,
  ArrowRight,
  ChevronDown,
  X,
  Loader2,
  Info,
  FileText,
} from 'lucide-react';
import { FirestoreIncidenceRepository } from '../../../infrastructure/repositories/firestore-incidence.repository';
import { IncidenceEntity } from '../../../domain/entities/incidence.entity';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';
import { RegisterIncidenceModal } from '../../components/incidences/RegisterIncidenceModal';
import {
  InstitutionalCalendarEvent,
  InstitutionalEventModality,
  getCalendarConfigForYear,
  getWeekMondayIso,
} from '../../../domain/services/ChronologyEngine';

const MODALITY_OPTIONS: Array<{
  value: InstitutionalEventModality;
  label: string;
  badgeClass: string;
}> = [
  {
    value: 'A',
    label: 'Horario Regular (A) + Insignia informativa',
    badgeClass: 'bg-sky-50 text-sky-900 border-sky-200',
  },
  {
    value: 'D',
    label: 'Horario Especial Planes de Apoyo (D)',
    badgeClass: 'bg-purple-50 text-purple-900 border-purple-200',
  },
  {
    value: 'B',
    label: 'Atención a Padres / Entrega de Notas (B)',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  {
    value: 'novelty',
    label: 'Acto Especial / Ceremonia / Jornada Institucional',
    badgeClass: 'bg-indigo-50 text-indigo-900 border-indigo-200',
  },
  {
    value: 'holiday',
    label: 'Día sin actividad académica (Receso / Festivo)',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
  },
];

function formatHumanDateRange(startIso: string, endIso?: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
    });
    const d1 = new Date(`${startIso}T00:00:00`);
    if (isNaN(d1.getTime())) return startIso;
    const s1 = fmt.format(d1).replace(/\./g, '').trim();
    if (!endIso || endIso === startIso) {
      return s1;
    }
    const d2 = new Date(`${endIso}T00:00:00`);
    if (isNaN(d2.getTime())) return `${s1} → ${endIso}`;
    const s2 = fmt.format(d2).replace(/\./g, '').trim();
    return `Del ${s1} al ${s2}`;
  } catch {
    return endIso && endIso !== startIso ? `${startIso} al ${endIso}` : startIso;
  }
}

export const CoordinatorIncidencesPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    teachers,
    academicCalendarsStore,
    updateAcademicCalendarsStore,
    setCustomWeekMondayIso,
  } = useCoordinatorMatrix();

  const [activeTab, setActiveTab] = useState<'special-days' | 'absences'>('special-days');
  const [selectedYear, setSelectedYear] = useState<number>(
    academicCalendarsStore.activePlannerYear || 2026
  );
  const [isYearMenuOpen, setIsYearMenuOpen] = useState(false);
  const yearMenuRef = useRef<HTMLDivElement>(null);

  // Estado del formulario de Día de Trabajo Especial
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [badgeLabel, setBadgeLabel] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [modality, setModality] = useState<InstitutionalEventModality>('A');
  const [isModalityMenuOpen, setIsModalityMenuOpen] = useState(false);
  const modalityMenuRef = useRef<HTMLDivElement>(null);

  const [showProjectionImage, setShowProjectionImage] = useState<boolean>(false);
  const [isParsingImage, setIsParsingImage] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado de Ausencias Docentes (Pestaña 2)
  const [incidences, setIncidences] = useState<IncidenceEntity[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const availableYears = useMemo(() => {
    const yrs = Object.keys(academicCalendarsStore.years || {})
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    return yrs.length > 0 ? yrs : [2026, 2027];
  }, [academicCalendarsStore.years]);

  const activeYearConfig = useMemo(() => {
    return (
      academicCalendarsStore.years[selectedYear] || getCalendarConfigForYear(selectedYear)
    );
  }, [academicCalendarsStore.years, selectedYear]);

  const specialEvents = useMemo(() => {
    return [...(activeYearConfig.institutionalEvents || [])].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [activeYearConfig.institutionalEvents]);

  const loadIncidences = async () => {
    const repo = new FirestoreIncidenceRepository();
    const list = await repo.getAll();
    setIncidences(list);
  };

  useEffect(() => {
    void loadIncidences();
  }, []);

  useEffect(() => {
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
  }, []);

  const handleCreateIncidence = async (data: Omit<IncidenceEntity, 'id'>) => {
    const repo = new FirestoreIncidenceRepository();
    await repo.create(data);
    await loadIncidences();
    setIsModalOpen(false);
  };

  const resetSpecialDayForm = () => {
    setEditingEventId(null);
    setStartDate('');
    setEndDate('');
    setTitle('');
    setBadgeLabel('');
    setDescription('');
    setModality('A');
  };

  const handleSaveSpecialDay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !title.trim()) return;

    const cleanTitle = title.trim();
    const cleanBadge =
      badgeLabel.trim() ||
      (cleanTitle.length <= 18 ? cleanTitle : `${cleanTitle.slice(0, 16).trim()}…`);
    const cleanDesc =
      description.trim() ||
      `${formatHumanDateRange(startDate, endDate || undefined)}: ${cleanTitle}`;
    const cleanEnd = endDate && endDate >= startDate ? endDate : undefined;

    const currentEvents = [...(activeYearConfig.institutionalEvents || [])];
    let updatedEvents: InstitutionalCalendarEvent[];

    if (editingEventId) {
      updatedEvents = currentEvents.map((ev) =>
        ev.id === editingEventId
          ? {
              ...ev,
              date: startDate,
              endDate: cleanEnd,
              title: cleanTitle,
              badgeLabel: cleanBadge,
              description: cleanDesc,
              modality,
            }
          : ev
      );
    } else {
      const newEv: InstitutionalCalendarEvent = {
        id: `spec-${selectedYear}-${Date.now()}`,
        date: startDate,
        endDate: cleanEnd,
        title: cleanTitle,
        badgeLabel: cleanBadge,
        description: cleanDesc,
        modality,
      };
      updatedEvents = [...currentEvents, newEv];
    }

    updatedEvents.sort((a, b) => a.date.localeCompare(b.date));

    const nextStore = {
      ...academicCalendarsStore,
      activePlannerYear: selectedYear,
      years: {
        ...academicCalendarsStore.years,
        [selectedYear]: {
          ...activeYearConfig,
          institutionalEvents: updatedEvents,
          updatedAt: Date.now(),
        },
      },
      updatedAtMs: Date.now(),
    };

    updateAcademicCalendarsStore(nextStore);
    window.dispatchEvent(new Event('public_schedule_snapshot_updated'));
    setFeedbackBanner({
      type: 'success',
      message: editingEventId
        ? `Día especial "${cleanTitle}" actualizado correctamente.`
        : `Día especial "${cleanTitle}" agregado con su insignia para el HTML público.`,
    });
    resetSpecialDayForm();
  };

  const handleEditSpecialDay = (ev: InstitutionalCalendarEvent) => {
    setEditingEventId(ev.id);
    setStartDate(ev.date);
    setEndDate(ev.endDate || '');
    setTitle(ev.title);
    setBadgeLabel(ev.badgeLabel || '');
    setDescription(ev.description || ev.notes || '');
    setModality(ev.modality || 'A');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSpecialDay = (eventId: string) => {
    const updatedEvents = (activeYearConfig.institutionalEvents || []).filter(
      (ev) => ev.id !== eventId
    );
    const nextStore = {
      ...academicCalendarsStore,
      years: {
        ...academicCalendarsStore.years,
        [selectedYear]: {
          ...activeYearConfig,
          institutionalEvents: updatedEvents,
          updatedAt: Date.now(),
        },
      },
      updatedAtMs: Date.now(),
    };
    updateAcademicCalendarsStore(nextStore);
    window.dispatchEvent(new Event('public_schedule_snapshot_updated'));
    if (editingEventId === eventId) {
      resetSpecialDayForm();
    }
  };

  const handleJumpToWeekInMatrix = (isoDate: string) => {
    const mondayIso = getWeekMondayIso(isoDate);
    setCustomWeekMondayIso(mondayIso);
    navigate('/');
  };

  const handleUploadCircularImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingImage(true);
    setFeedbackBanner(null);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
        reader.readAsDataURL(file);
      });

      const token =
        localStorage.getItem('ievf_session_token') ||
        localStorage.getItem('ievf_session_token_v1') ||
        '';
      const response = await fetch('/api/academic-calendar/parse-special-days', {
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
      if (!response.ok || !Array.isArray(data?.events)) {
        throw new Error(data?.error || 'No se pudieron extraer las fechas de la imagen.');
      }

      const extractedList: InstitutionalCalendarEvent[] = data.events
        .filter((item: any) => item && item.date && item.title)
        .map((item: any, idx: number) => ({
          id: `ai-spec-${selectedYear}-${Date.now()}-${idx}`,
          date: String(item.date).trim(),
          endDate:
            item.endDate && String(item.endDate).trim() >= String(item.date).trim()
              ? String(item.endDate).trim()
              : undefined,
          title: String(item.title).trim(),
          badgeLabel: String(item.badgeLabel || item.title)
            .trim()
            .slice(0, 20),
          description: String(item.description || item.title).trim(),
          modality: (['A', 'B', 'D', 'holiday', 'novelty'].includes(item.modality)
            ? item.modality
            : 'A') as InstitutionalEventModality,
        }));

      if (extractedList.length === 0) {
        throw new Error('No se detectaron fechas válidas en la imagen subida.');
      }

      const mergedEvents = [
        ...(activeYearConfig.institutionalEvents || []),
        ...extractedList,
      ].sort((a, b) => a.date.localeCompare(b.date));

      updateAcademicCalendarsStore({
        ...academicCalendarsStore,
        years: {
          ...academicCalendarsStore.years,
          [selectedYear]: {
            ...activeYearConfig,
            institutionalEvents: mergedEvents,
            updatedAt: Date.now(),
          },
        },
        updatedAtMs: Date.now(),
      });

      setFeedbackBanner({
        type: 'success',
        message: `Se importaron ${extractedList.length} actividades especiales para ${selectedYear} con sus insignias interactivas.`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err?.message || 'Error al procesar la imagen del cronograma.',
      });
    } finally {
      setIsParsingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const selectedModalityOption =
    MODALITY_OPTIONS.find((m) => m.value === modality) || MODALITY_OPTIONS[0];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      {/* Cabecera Institucional de Novedades */}
      <div className="bg-gradient-to-r from-villa-blue-dark via-villa-blue to-villa-blue-light text-white p-5 sm:p-6 rounded-3xl border-b-4 border-amber-400 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-amber-300 shrink-0 shadow-inner">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
              Novedades y Días de Trabajo Especiales
            </h1>
            <p className="text-xs sm:text-sm text-sky-100/90 font-medium mt-0.5">
              Asigna jornadas especiales, comisiones, pruebas o ceremonias con insignia interactiva y descripción en el HTML público
            </p>
          </div>
        </div>

        {/* Selector de Pestaña Principal */}
        <div className="inline-flex items-center bg-black/15 p-1 rounded-2xl border border-white/20 self-start lg:self-center shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('special-days')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'special-days'
                ? 'bg-white text-villa-blue-dark shadow-xs'
                : 'text-sky-100 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Días de Trabajo Especiales ({specialEvents.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('absences')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'absences'
                ? 'bg-white text-villa-blue-dark shadow-xs'
                : 'text-sky-100 hover:text-white hover:bg-white/10'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Ausencias Docentes ({incidences.length})</span>
          </button>
        </div>
      </div>

      {activeTab === 'special-days' ? (
        <div className="space-y-5">
          {/* Barra de Año Escolar + Acciones de Imagen/Circular */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                Año Escolar:
              </span>
              <div ref={yearMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsYearMenuOpen((prev) => !prev)}
                  className="h-9 flex items-center justify-between gap-2.5 px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-slate-800 text-xs font-bold cursor-pointer select-none shadow-2xs"
                >
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-villa-blue" />
                    <span>Calendario {selectedYear}</span>
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                      isYearMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isYearMenuOpen && (
                  <div className="absolute left-0 mt-1.5 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 select-none">
                    {availableYears.map((yr) => {
                      const isSel = yr === selectedYear;
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => {
                            setSelectedYear(yr);
                            setIsYearMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-50 cursor-pointer text-left"
                        >
                          <span
                            className={`text-xs ${
                              isSel ? 'text-villa-blue-dark font-bold' : 'text-slate-700 font-semibold'
                            }`}
                          >
                            Año Escolar {yr}
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

              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-sky-50/80 border border-sky-200/80 px-3 py-1.5 rounded-xl">
                <Info className="w-3.5 h-3.5 text-villa-blue shrink-0" />
                <span>
                  Cada día programado aquí muestra una <strong>insignia interactiva</strong> en el botón del día del HTML público con su descripción al pasar el cursor.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedYear === 2026 && (
                <button
                  type="button"
                  onClick={() => setShowProjectionImage((prev) => !prev)}
                  className="h-9 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Eye className="w-3.5 h-3.5 text-villa-blue" />
                  <span>
                    {showProjectionImage
                      ? 'Ocultar proyección adjunta'
                      : 'Ver Proyección Finalización 2026'}
                  </span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleUploadCircularImage}
              />
              <button
                type="button"
                disabled={isParsingImage}
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3.5 rounded-xl bg-villa-blue hover:bg-villa-blue-dark text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                title="Subir imagen de circular o cronograma para extraer fechas automáticamente"
              >
                {isParsingImage ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>Importar desde imagen (IA)</span>
              </button>
            </div>
          </div>

          {showProjectionImage && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-villa-blue" />
                  <span>Proyección de Calendario de Finalización (Pre-cargada en 2026)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowProjectionImage(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                <img
                  src="/assets/aistudio/image_f1b1d1e0.png"
                  alt="Proyección de Calendario de Finalización"
                  className="max-h-72 w-auto rounded-lg border border-slate-200 shadow-2xs object-contain"
                />
              </div>
            </div>
          )}

          {feedbackBanner && (
            <div
              className={`px-4 py-3 rounded-2xl border text-xs font-bold flex items-center justify-between ${
                feedbackBanner.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-red-50 text-red-900 border-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{feedbackBanner.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackBanner(null)}
                className="p-0.5 hover:opacity-75 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Columna Izquierda (5 cols): Formulario de Creación / Edición */}
            <form
              onSubmit={handleSaveSpecialDay}
              className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4 sticky top-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    {editingEventId
                      ? 'Editar Día de Trabajo Especial'
                      : 'Asignar Día o Semana de Trabajo Especial'}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Configura la fecha, la insignia del día y la descripción emergente para el HTML público
                  </p>
                </div>
                {editingEventId && (
                  <button
                    type="button"
                    onClick={resetSpecialDayForm}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg bg-slate-100 cursor-pointer"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Fecha inicio (o día único) *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-villa-blue text-xs font-semibold text-slate-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Fecha fin (opcional si es rango)
                  </label>
                  <input
                    type="date"
                    min={startDate || undefined}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-villa-blue text-xs font-semibold text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Título de la actividad o jornada especial *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Aplicación de pruebas de periodo / Acto de graduación"
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-villa-blue text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Texto corto en la insignia
                  </label>
                  <input
                    type="text"
                    maxLength={22}
                    value={badgeLabel}
                    onChange={(e) => setBadgeLabel(e.target.value)}
                    placeholder="Ej. Pruebas Periodo / Graduación"
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-villa-blue text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none"
                  />
                </div>

                <div ref={modalityMenuRef} className="relative">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Modalidad en la parrilla
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsModalityMenuOpen((prev) => !prev)}
                    className="h-9 w-full flex items-center justify-between gap-1.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <span className="truncate">{selectedModalityOption.label}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>

                  {isModalityMenuOpen && (
                    <div className="absolute left-0 mt-1 w-full bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 select-none">
                      {MODALITY_OPTIONS.map((opt) => {
                        const isSel = modality === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setModality(opt.value);
                              setIsModalityMenuOpen(false);
                            }}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-left"
                          >
                            <span
                              className={`text-xs ${
                                isSel ? 'text-villa-blue-dark font-bold' : 'text-slate-700 font-semibold'
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

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Descripción detallada (aparece al pasar el cursor por la insignia en el HTML público)
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej. 10 de diciembre: Acto de graduación • Hora: 2:00 p. m. • Lugar: ESUMER • Entrega de togas: 12:30 p. m."
                  className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-villa-blue text-xs font-medium text-slate-800 placeholder-slate-400 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full h-10 rounded-xl bg-villa-blue hover:bg-villa-blue-dark text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {editingEventId ? 'Guardar cambios del día especial' : 'Guardar Día Especial e Insignia'}
                </span>
              </button>
            </form>

            {/* Columna Derecha (7 cols): Cronograma de Días de Trabajo Especiales con Vista Previa de Insignia */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Días de Trabajo Especiales Programados ({selectedYear})
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Pasa el cursor sobre cualquier insignia dorada para previsualizar el globo descriptivo tal como se ve en el HTML público
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-sky-50 text-villa-blue-dark border border-sky-200 text-xs font-bold">
                  {specialEvents.length} registros
                </span>
              </div>

              {specialEvents.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <Calendar className="w-9 h-9 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">
                    No hay días de trabajo especiales registrados para {selectedYear}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Usa el formulario izquierdo o sube una imagen de circular para pre-cargarlos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {specialEvents.map((ev) => {
                    const modOption =
                      MODALITY_OPTIONS.find((m) => m.value === ev.modality) ||
                      MODALITY_OPTIONS[0];
                    const effectiveBadge = ev.badgeLabel || ev.title.slice(0, 18);
                    const effectiveDesc =
                      ev.description ||
                      ev.notes ||
                      `${formatHumanDateRange(ev.date, ev.endDate)}: ${ev.title}`;

                    return (
                      <div
                        key={ev.id}
                        className="p-3.5 rounded-2xl border border-slate-200 hover:border-sky-200 bg-slate-50/50 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-slate-200/80 text-slate-800 font-mono text-[11px] font-bold">
                              {formatHumanDateRange(ev.date, ev.endDate)}
                            </span>

                            {/* Insignia Interactiva con Tooltip idéntica al HTML Público */}
                            <div className="relative group inline-flex items-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-[11px] font-extrabold shadow-2xs cursor-help">
                                <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>{effectiveBadge}</span>
                              </span>

                              {/* Globo Descriptivo (Hover Popover) */}
                              <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-0 mb-2 w-72 sm:w-80 p-3 rounded-2xl bg-slate-900 text-white shadow-xl border border-amber-400/50 z-50 text-left">
                                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-300 mb-1">
                                  <Sparkles className="w-3 h-3 shrink-0" />
                                  <span>Día de trabajo especial • {formatHumanDateRange(ev.date, ev.endDate)}</span>
                                </div>
                                <p className="text-xs font-bold text-white leading-snug">
                                  {ev.title}
                                </p>
                                <p className="text-[11px] text-slate-200 leading-relaxed mt-1 font-normal">
                                  {effectiveDesc}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${modOption.badgeClass}`}
                            >
                              {modOption.label}
                            </span>
                          </div>

                          <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                            {ev.title}
                          </h3>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {effectiveDesc}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => handleJumpToWeekInMatrix(ev.date)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-villa-blue text-villa-blue-dark hover:text-white border border-sky-200 text-[11px] font-bold transition cursor-pointer"
                            title="Abrir esta semana en la parrilla académica"
                          >
                            <span>Ver semana</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSpecialDay(ev)}
                            className="p-1.5 rounded-xl text-slate-500 hover:text-villa-blue hover:bg-sky-50 transition cursor-pointer"
                            title="Editar actividad"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSpecialDay(ev.id)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Eliminar actividad"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Pestaña 2: Gestión de Ausencias y Reemplazos Docentes */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                <span>Registro de Ausencias, Incapacidades y Permisos Docentes</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Control puntual de ausencias de docentes y asignación de reemplazos
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-villa-blue hover:bg-villa-blue-dark text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Ausencia Docente</span>
            </button>
          </div>

          {incidences.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">Sin ausencias docentes activas</h3>
              <p className="text-xs text-slate-500">
                Todas las sesiones docentes se encuentran operando con normalidad.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {incidences.map((inc) => (
                <div
                  key={inc.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        {inc.type}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">
                        {inc.title || inc.targetTeacherName || inc.target}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600">{inc.description || 'Novedad reportada'}</p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        Desde: {inc.date} — Vigencia: {inc.expirationDate}
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Activa
                  </span>
                </div>
              ))}
            </div>
          )}

          <RegisterIncidenceModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            teachers={teachers}
            onSubmit={handleCreateIncidence}
          />
        </div>
      )}
    </div>
  );
};
