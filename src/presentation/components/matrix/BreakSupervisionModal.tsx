import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Shield,
  Search,
  User,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  Edit3,
  Sparkles,
  Sun,
  Moon,
  MapPin,
} from 'lucide-react';
import { DayOfWeek } from '../../../domain/entities/time-block.entity';
import { ShiftType } from '../../../domain/entities/grade.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import {
  BreakSupervisionScheduleMap,
  BreakSupervisionZoneRow,
  DEFAULT_BACHILLERATO_BREAK_ZONES,
  doesTeacherMatchSupervisionCell,
  loadBreakSupervisionSchedule,
  normalizeBreakSupervisionSchedule,
  resolveSupervisionCellTeachers,
  saveBreakSupervisionSchedule,
} from '../../../domain/services/break-supervision.service';
import { getShortTeacherName, getFullTeacherName } from '../../../domain/services/teacher-visual-identity.service';
import { getTeacherExcelIdentity } from '../../../domain/services/teacher-normalization.service';
import { CustomSelectDropdown } from '../common/CustomSelectDropdown';

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
];

const SHIFT_NAMES: Record<ShiftType, string> = {
  morning: 'Bachillerato (Mañana)',
  afternoon: 'Primaria (Tarde)',
  'transicion-1': 'Transición',
};

export interface BreakSupervisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editable?: boolean;
  initialShift?: ShiftType;
  activeDay?: DayOfWeek;
  initialTeacherFilter?: string;
  teachers?: Array<UserEntity | { id: string; displayName: string; color?: string; color_hex?: string }>;
  scheduleData?: BreakSupervisionScheduleMap;
  onSave?: (updated: BreakSupervisionScheduleMap) => void;
}

export const BreakSupervisionModal: React.FC<BreakSupervisionModalProps> = ({
  isOpen,
  onClose,
  editable = false,
  initialShift = 'morning',
  activeDay = 'lunes',
  initialTeacherFilter = 'ALL',
  teachers = [],
  scheduleData,
  onSave,
}) => {
  const [selectedShift, setSelectedShift] = useState<ShiftType>(initialShift);
  const [localSchedule, setLocalSchedule] = useState<BreakSupervisionScheduleMap>(() =>
    scheduleData ? normalizeBreakSupervisionSchedule(scheduleData) : loadBreakSupervisionSchedule()
  );
  const [teacherFilter, setTeacherFilter] = useState<string>(initialTeacherFilter || 'ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditingMode, setIsEditingMode] = useState<boolean>(false);
  const [activeCellPicker, setActiveCellPicker] = useState<{
    zoneId: string;
    day: DayOfWeek;
  } | null>(null);
  const [savedBanner, setSavedBanner] = useState<boolean>(false);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedShift(initialShift);
      setTeacherFilter(initialTeacherFilter || 'ALL');
      setLocalSchedule(
        scheduleData ? normalizeBreakSupervisionSchedule(scheduleData) : loadBreakSupervisionSchedule()
      );
      setActiveCellPicker(null);
      setConfirmReset(false);
    }
  }, [isOpen, initialShift, initialTeacherFilter, scheduleData]);

  const currentZones = useMemo<BreakSupervisionZoneRow[]>(() => {
    return localSchedule[selectedShift] || [];
  }, [localSchedule, selectedShift]);

  const filteredZones = useMemo(() => {
    const q = searchQuery
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    return currentZones.filter((z) => {
      if (teacherFilter !== 'ALL') {
        const matchesAnyDay = DAYS.some((d) =>
          doesTeacherMatchSupervisionCell(z.days[d.key], teacherFilter)
        );
        if (!matchesAnyDay && !isEditingMode) return false;
      }
      if (q) {
        const zoneHaystack = [
          z.zoneName,
          z.subLabel || '',
          z.days.lunes,
          z.days.martes,
          z.days.miercoles,
          z.days.jueves,
          z.days.viernes,
        ]
          .join(' ')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (!zoneHaystack.includes(q)) return false;
      }
      return true;
    });
  }, [currentZones, teacherFilter, searchQuery, isEditingMode]);

  const teacherOptions = useMemo(() => {
    return teachers
      .filter(
        (t) =>
          t.id !== 't-adriana-mier' &&
          !String(t.displayName || '').toLowerCase().includes('adriana mier')
      )
      .map((t) => {
        const identity = getTeacherExcelIdentity(t.id, t.displayName);
        return {
          id: t.id,
          fullName: getFullTeacherName(t.id, t.displayName || ''),
          shortName: getShortTeacherName(t.id, t.displayName || ''),
          colorHex: (t as any).color_hex || (t as any).color || identity.color_hex || '#034EA2',
        };
      });
  }, [teachers]);

  if (!isOpen) return null;

  const handleCellChange = (zoneId: string, day: DayOfWeek, value: string) => {
    setLocalSchedule((prev) => ({
      ...prev,
      [selectedShift]: (prev[selectedShift] || []).map((z) =>
        z.id === zoneId
          ? {
              ...z,
              days: {
                ...z.days,
                [day]: value,
              },
            }
          : z
      ),
    }));
  };

  const handleZoneNameChange = (zoneId: string, newName: string) => {
    setLocalSchedule((prev) => ({
      ...prev,
      [selectedShift]: (prev[selectedShift] || []).map((z) =>
        z.id === zoneId ? { ...z, zoneName: newName } : z
      ),
    }));
  };

  const handleZoneSubLabelChange = (zoneId: string, newSub: string) => {
    setLocalSchedule((prev) => ({
      ...prev,
      [selectedShift]: (prev[selectedShift] || []).map((z) =>
        z.id === zoneId ? { ...z, subLabel: newSub } : z
      ),
    }));
  };

  const handleToggleHighlight = (zoneId: string) => {
    setLocalSchedule((prev) => ({
      ...prev,
      [selectedShift]: (prev[selectedShift] || []).map((z) =>
        z.id === zoneId ? { ...z, isHighlighted: !z.isHighlighted } : z
      ),
    }));
  };

  const handleAddZone = () => {
    const nextNum = (localSchedule[selectedShift] || []).length + 1;
    const newZone: BreakSupervisionZoneRow = {
      id: `zone-custom-${Date.now()}`,
      zoneName: `${nextNum}. Nueva zona de acompañamiento`,
      days: {
        lunes: 'Sin asignar',
        martes: 'Sin asignar',
        miercoles: 'Sin asignar',
        jueves: 'Sin asignar',
        viernes: 'Sin asignar',
      },
    };
    setLocalSchedule((prev) => ({
      ...prev,
      [selectedShift]: [...(prev[selectedShift] || []), newZone],
    }));
    setIsEditingMode(true);
  };

  const handleDeleteZone = (zoneId: string) => {
    setLocalSchedule((prev) => ({
      ...prev,
      [selectedShift]: (prev[selectedShift] || []).filter((z) => z.id !== zoneId),
    }));
  };

  const handleRestoreDefaults = () => {
    const restored: BreakSupervisionScheduleMap = {
      ...localSchedule,
      morning: JSON.parse(JSON.stringify(DEFAULT_BACHILLERATO_BREAK_ZONES)),
    };
    setLocalSchedule(restored);
    saveBreakSupervisionSchedule(restored);
    onSave?.(restored);
    setConfirmReset(false);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleRotateWeekZones = () => {
    setLocalSchedule((prev) => {
      const currentList = [...(prev[selectedShift] || [])];
      if (currentList.length <= 1) return prev;

      const rotatableIndices: number[] = [];
      currentList.forEach((z, idx) => {
        const upperName = (z.zoneName || '').toUpperCase();
        const isFixedZone =
          Boolean(z.isMediaTecnica) ||
          Boolean(z.isHighlighted) ||
          upperName.includes('RESTAURANTE ZONA DE DISTRIBUCI') ||
          upperName.includes('RESTAURANTE MÓVIL') ||
          upperName.includes('RESTAURANTE MOVIL') ||
          upperName.includes('BAÑO DE HOMBRES');
        if (!isFixedZone) {
          rotatableIndices.push(idx);
        }
      });

      const targetIndices =
        rotatableIndices.length > 1
          ? rotatableIndices
          : currentList.map((_, idx) => idx);

      const snapshots = targetIndices.map((idx) => ({ ...currentList[idx].days }));
      targetIndices.forEach((zoneIdx, pos) => {
        const prevPos = (pos - 1 + targetIndices.length) % targetIndices.length;
        currentList[zoneIdx] = {
          ...currentList[zoneIdx],
          days: snapshots[prevPos],
        };
      });

      const updated: BreakSupervisionScheduleMap = {
        ...prev,
        [selectedShift]: currentList,
      };
      saveBreakSupervisionSchedule(updated);
      onSave?.(updated);
      return updated;
    });
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleSaveChanges = () => {
    const normalized = normalizeBreakSupervisionSchedule(localSchedule);
    setLocalSchedule(normalized);
    saveBreakSupervisionSchedule(normalized);
    onSave?.(normalized);
    setIsEditingMode(false);
    setActiveCellPicker(null);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleQuickSelectTeacherForCell = (
    zoneId: string,
    day: DayOfWeek,
    teacherShort: string,
    append: boolean
  ) => {
    const zone = currentZones.find((z) => z.id === zoneId);
    if (!zone) return;
    const currentVal = (zone.days[day] || '').trim();
    let nextVal = teacherShort;
    if (append && currentVal && currentVal.toLowerCase() !== 'sin asignar') {
      const parts = currentVal.split('/').map((p) => p.trim()).filter(Boolean);
      if (!parts.includes(teacherShort)) {
        nextVal = [...parts, teacherShort].join(' / ');
      } else {
        nextVal = currentVal;
      }
    }
    handleCellChange(zoneId, day, nextVal);
    if (!append) {
      setActiveCellPicker(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera Institucional con la paleta oficial del proyecto */}
        <div className="bg-villa-blue text-white px-5 py-4 sm:px-8 sm:py-5 border-b-4 border-amber-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-2xl bg-white/15 border border-white/25 shadow-inner shrink-0">
              <Shield className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white leading-tight">
                Institución Educativa Villa Flora
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-sky-200">
                Ciencia &amp; Libertad • Zonas de acompañamiento
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
            {editable && (
              <>
                <button
                  type="button"
                  onClick={handleRotateWeekZones}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold transition cursor-pointer shadow-sm"
                  title="Rotar docentes una posición hacia abajo entre las zonas de acompañamiento"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rotar semana</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isEditingMode) {
                      handleSaveChanges();
                    } else {
                      setIsEditingMode(true);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-sm ${
                    isEditingMode
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      : 'bg-white/15 hover:bg-white/25 text-white border border-white/30'
                  }`}
                >
                  {isEditingMode ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Guardar edición</span>
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar manualmente</span>
                    </>
                  )}
                </button>

                {isEditingMode && (
                  <button
                    type="button"
                    onClick={handleAddZone}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-villa-blue-light hover:bg-sky-600 text-white text-xs font-extrabold transition cursor-pointer shadow-sm"
                    title="Agregar nueva zona de acompañamiento"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nueva zona</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="Cerrar ventana"
              aria-label="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Controles: Jornada, Filtro Rápido por Docente y Búsqueda */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-slate-700 tracking-wide">
              Asignación semanal:
            </span>
            <div className="inline-flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedShift('morning')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedShift === 'morning'
                    ? 'bg-villa-blue text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Bachillerato</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedShift('afternoon')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedShift === 'afternoon'
                    ? 'bg-villa-blue text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-sky-400" />
                <span>Primaria</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedShift('transicion-1')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedShift === 'transicion-1'
                    ? 'bg-villa-blue text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Transición</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Selector de Docente para resaltar sus turnos (Diseño unificado del proyecto) */}
            <CustomSelectDropdown
              value={teacherFilter}
              onChange={(val) => setTeacherFilter(val)}
              defaultAllValue="ALL"
              icon={<User className="w-3.5 h-3.5 text-[#0c4da2]" />}
              title="Filtrar o resaltar turnos de un docente"
              className="w-64 sm:w-72"
              options={[
                { value: 'ALL', label: 'Todos los docentes (Ver cuadro completo)' },
                ...teacherOptions.map((t) => ({
                  value: t.fullName,
                  label: t.fullName,
                  colorHex: t.colorHex,
                })),
              ]}
            />

            {/* Buscador rápido por zona o nombre */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar zona o docente..."
                className="h-8 pl-8 pr-7 bg-white border border-slate-200 focus:border-villa-blue rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 outline-none w-48 sm:w-56"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notificación de guardado o instrucciones de edición */}
        {savedBanner && (
          <div className="bg-villa-blue text-white px-6 py-2 text-xs font-extrabold flex items-center justify-center gap-2 shrink-0">
            <Check className="w-4 h-4" />
            <span>¡Cuadro de zonas de acompañamiento actualizado y sincronizado correctamente!</span>
          </div>
        )}

        {isEditingMode && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 shrink-0">
            <div className="flex items-center gap-2 font-semibold">
              <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white font-extrabold text-[10px]">
                Modo edición activo
              </span>
              <span>
                Escribe directamente en cualquier casilla o usa el selector rápido de docentes para rotar turnos manualmente.
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold text-[11px] cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar distribución oficial</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                  <span className="text-[11px] font-bold text-red-800">¿Restaurar tabla original?</span>
                  <button
                    type="button"
                    onClick={handleRestoreDefaults}
                    className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-extrabold cursor-pointer"
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-300 text-[10px] font-bold cursor-pointer"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabla Principal de Zonas de Acompañamiento */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-white">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              Asignación semanal • {SHIFT_NAMES[selectedShift]}
            </h3>
            {teacherFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-950 border border-sky-300 text-xs font-extrabold">
                <MapPin className="w-3.5 h-3.5 text-villa-blue" />
                <span>Mostrando turnos de: {teacherFilter}</span>
                <button
                  type="button"
                  onClick={() => setTeacherFilter('ALL')}
                  className="ml-1 hover:text-red-600 cursor-pointer"
                  title="Ver todos"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>

          {filteredZones.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-3">
              <Shield className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                {currentZones.length === 0
                  ? `No hay zonas configuradas para ${SHIFT_NAMES[selectedShift]}`
                  : 'No se encontraron zonas ni turnos para el filtro seleccionado'}
              </div>
              {editable && currentZones.length === 0 && (
                <button
                  type="button"
                  onClick={handleAddZone}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-villa-blue text-white text-xs font-extrabold cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear primera zona de acompañamiento</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-xs">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-300 text-slate-800">
                    <th className="py-3 px-3.5 font-extrabold tracking-wide border-r border-slate-300 w-64 min-w-[210px]">
                      Zona de acompañamiento
                    </th>
                    {DAYS.map((d) => {
                      const isCurrentDay = d.key === activeDay;
                      return (
                        <th
                          key={d.key}
                          className={`py-3 px-3 font-extrabold tracking-wide text-center border-r border-slate-300 last:border-r-0 min-w-[148px] ${
                            isCurrentDay ? 'bg-sky-100/90 text-villa-blue-dark' : ''
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <span>{d.label}</span>
                            {isCurrentDay && (
                              <span className="px-1.5 py-0.2 rounded bg-villa-blue text-white text-[9px] font-extrabold tracking-normal">
                                Día activo
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    {isEditingMode && (
                      <th className="py-3 px-2 font-extrabold text-center w-20">Acción</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {filteredZones.map((zone) => {
                    const isHighlighted = Boolean(zone.isHighlighted);
                    const isMT = Boolean(zone.isMediaTecnica);

                    return (
                      <tr
                        key={zone.id}
                        className={`transition-colors ${
                          isHighlighted
                            ? 'bg-amber-50/95 border-y-2 border-amber-400'
                            : isMT
                            ? 'bg-slate-100/90 font-bold'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Columna Zona */}
                        <td className="p-3 border-r border-slate-300 align-middle">
                          {isEditingMode ? (
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                value={zone.zoneName}
                                onChange={(e) => handleZoneNameChange(zone.id, e.target.value)}
                                className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold bg-white text-slate-900"
                                placeholder="Nombre de la zona"
                              />
                              <input
                                type="text"
                                value={zone.subLabel || ''}
                                onChange={(e) => handleZoneSubLabelChange(zone.id, e.target.value)}
                                className="w-full px-2 py-0.5 rounded border border-slate-200 text-[11px] italic bg-white text-slate-600"
                                placeholder="Subtítulo opcional (ej. Exclusivo masculino)"
                              />
                            </div>
                          ) : (
                            <div>
                              <div
                                className={`font-extrabold leading-snug ${
                                  isHighlighted ? 'text-amber-800 text-xs sm:text-[13px]' : 'text-slate-900 text-xs'
                                }`}
                              >
                                {zone.zoneName}
                              </div>
                              {zone.subLabel && (
                                <div
                                  className={`text-[11px] font-semibold italic mt-0.5 ${
                                    isHighlighted ? 'text-amber-700' : 'text-slate-500'
                                  }`}
                                >
                                  {zone.subLabel}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Columnas Lunes a Viernes */}
                        {DAYS.map((d) => {
                          const cellValue = zone.days[d.key] || '';
                          const isCurrentDay = d.key === activeDay;
                          const isTeacherMatch =
                            teacherFilter !== 'ALL' &&
                            doesTeacherMatchSupervisionCell(cellValue, teacherFilter);
                          const isPickerOpen =
                            activeCellPicker?.zoneId === zone.id && activeCellPicker?.day === d.key;
                          const resolvedBadges = resolveSupervisionCellTeachers(
                            cellValue,
                            teachers as any
                          );

                          return (
                            <td
                              key={`${zone.id}-${d.key}`}
                              onClick={() => {
                                if (editable && !isEditingMode) {
                                  setIsEditingMode(true);
                                }
                              }}
                              className={`p-2 border-r border-slate-300 last:border-r-0 text-center align-middle relative ${
                                isTeacherMatch
                                  ? 'bg-sky-100/90 ring-2 ring-inset ring-villa-blue shadow-inner'
                                  : isHighlighted
                                  ? 'bg-amber-50/90'
                                  : isCurrentDay
                                  ? 'bg-sky-50/45'
                                  : ''
                              } ${editable && !isEditingMode ? 'cursor-pointer hover:bg-sky-50/70' : ''}`}
                              title={
                                editable && !isEditingMode
                                  ? 'Haz clic para editar o rotar este turno manualmente'
                                  : undefined
                              }
                            >
                              {isEditingMode ? (
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    value={cellValue}
                                    onChange={(e) => handleCellChange(zone.id, d.key, e.target.value)}
                                    onFocus={() => setActiveCellPicker({ zoneId: zone.id, day: d.key })}
                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300 focus:border-villa-blue focus:ring-1 focus:ring-villa-blue text-center text-xs font-bold bg-white text-slate-900"
                                  />
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveCellPicker(
                                          isPickerOpen ? null : { zoneId: zone.id, day: d.key }
                                        )
                                      }
                                      className="text-[10px] font-bold text-villa-blue hover:underline cursor-pointer"
                                    >
                                      {isPickerOpen ? 'Cerrar lista' : 'Elegir docente'}
                                    </button>
                                  </div>

                                  {isPickerOpen && (
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-64 max-h-64 overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 z-50 py-1.5 text-left animate-in fade-in zoom-in-95 duration-150 select-none">
                                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 px-3.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                                        <span>Asignar docente:</span>
                                        <button
                                          type="button"
                                          onClick={() => setActiveCellPicker(null)}
                                          className="text-slate-400 hover:text-slate-700 cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      {teacherOptions.map((t) => (
                                        <div
                                          key={t.id}
                                          className="flex items-center justify-between gap-1.5 px-2 py-1 hover:bg-slate-100 rounded-lg text-[11px]"
                                        >
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleQuickSelectTeacherForCell(
                                                zone.id,
                                                d.key,
                                                t.shortName,
                                                false
                                              )
                                            }
                                            className="flex-1 flex items-center gap-1.5 text-left font-bold text-slate-800 truncate cursor-pointer"
                                            title="Reemplazar por este docente"
                                          >
                                            <span
                                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/15"
                                              style={{ backgroundColor: t.colorHex }}
                                            />
                                            <span className="truncate">{t.shortName}</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleQuickSelectTeacherForCell(
                                                zone.id,
                                                d.key,
                                                t.shortName,
                                                true
                                              )
                                            }
                                            className="px-1.5 py-0.5 rounded bg-sky-100 hover:bg-sky-200 text-villa-blue-dark font-extrabold text-[9px] cursor-pointer"
                                            title="Agregar compartido con /"
                                          >
                                            + /
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : resolvedBadges.length > 0 ? (
                                <div className="flex flex-col gap-1 items-stretch justify-center">
                                  {resolvedBadges.map((badge, bIdx) => (
                                    <div
                                      key={`${zone.id}-${d.key}-${bIdx}`}
                                      className="flex items-center rounded-md overflow-hidden shadow-2xs border border-black/10 min-h-[26px]"
                                      style={{ backgroundColor: badge.colorHex }}
                                      title={badge.fullName}
                                    >
                                      <span className="w-6 self-stretch flex items-center justify-center bg-black/20 text-[9px] font-extrabold text-white shrink-0 select-none tracking-tighter">
                                        {badge.initials}
                                      </span>
                                      <span
                                        className="flex-1 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-center truncate"
                                        style={{ color: badge.textColor }}
                                      >
                                        {badge.shortName}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 font-semibold text-xs">—</span>
                              )}
                            </td>
                          );
                        })}

                        {isEditingMode && (
                          <td className="p-2 text-center align-middle">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleToggleHighlight(zone.id)}
                                className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                                  zone.isHighlighted
                                    ? 'bg-amber-100 border-amber-400 text-amber-800'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                                }`}
                                title="Destacar fila en dorado (ej. Exclusivo masculino)"
                              >
                                ★
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteZone(zone.id)}
                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
                                title="Eliminar zona"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pie del Modal */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-villa-blue-light inline-block" />
            <span>
              {editable
                ? 'Haz clic en "Editar manualmente" o sobre cualquier celda para rotar docentes.'
                : 'Selecciona tu nombre en el filtro superior para resaltar tus zonas de acompañamiento de la semana.'}
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {isEditingMode && (
              <button
                type="button"
                onClick={handleSaveChanges}
                className="px-4 py-2 rounded-xl bg-villa-blue hover:bg-villa-blue-dark text-white font-extrabold text-xs cursor-pointer shadow-sm"
              >
                Guardar cambios
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
