import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import {
  AlertTriangle,
  X,
  CheckCircle2,
  FileText,
  Users,
  Flag,
  Edit3,
  Calendar,
  Clock,
  BookOpen,
  MapPin,
  Trash2,
  Layers,
} from 'lucide-react';

export type NoveltyPresetOption =
  | 'Sin asignación académica'
  | 'Novedad docente'
  | 'Actividad sindical'
  | 'Acto cívico'
  | 'Personalizada';

interface NoveltyTransitionModalProps {
  isOpen: boolean;
  block: TimeBlockEntity | null;
  selectedBlocks?: TimeBlockEntity[];
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const PRESET_OPTIONS: {
  id: NoveltyPresetOption;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    id: 'Sin asignación académica',
    label: 'Sin asignación académica',
    description: 'Liberar la franja y devolver la celda a estado disponible (borrado real).',
    icon: Trash2,
  },
  {
    id: 'Novedad docente',
    label: 'Novedad docente',
    description: 'Incapacidad médica, permiso justificado o calamidad del profesor titular.',
    icon: Users,
  },
  {
    id: 'Actividad sindical',
    label: 'Actividad sindical',
    description: 'Asamblea gremial, jornada pedagógica o convocatoria sindical.',
    icon: Flag,
  },
  {
    id: 'Acto cívico',
    label: 'Acto cívico',
    description: 'Izada de bandera, conmemoración cultural o evento protocolario.',
    icon: FileText,
  },
  {
    id: 'Personalizada',
    label: 'Personalizada',
    description: 'Especificar un motivo particular institucional para esta franja horaria.',
    icon: Edit3,
  },
];

/**
 * Modal de Transición para Mutación de Entidades a Novedades:
 * Intercepta el evento de descarte y solicita el motivo oficial.
 * Exige estrictamente un texto cuando se selecciona 'Personalizada'.
 */
export const NoveltyTransitionModal: React.FC<NoveltyTransitionModalProps> = ({
  isOpen,
  block,
  selectedBlocks,
  onClose,
  onConfirm,
}) => {
  const [selectedOption, setSelectedOption] = useState<NoveltyPresetOption>('Novedad docente');
  const [customReason, setCustomReason] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveBlocks = useMemo(() => {
    if (selectedBlocks && selectedBlocks.length > 0) return selectedBlocks;
    return block ? [block] : [];
  }, [selectedBlocks, block]);

  const isBatch = effectiveBlocks.length > 1;

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

  useEffect(() => {
    if (isOpen) {
      setSelectedOption('Novedad docente');
      setCustomReason('');
    }
  }, [isOpen, block, selectedBlocks]);

  useEffect(() => {
    if (selectedOption === 'Personalizada') {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [selectedOption]);

  if (!isOpen || effectiveBlocks.length === 0) return null;

  const displayBlock = block || effectiveBlocks[0];

  // Validación estricta: Bloquear confirmación si es personalizada y el campo está vacío
  const isCustom = selectedOption === 'Personalizada';
  const isCustomValid = customReason.trim().length > 0;
  const isConfirmDisabled = isCustom && !isCustomValid;

  const handleConfirm = () => {
    if (isConfirmDisabled) return;

    const finalReason = isCustom ? customReason.trim() : selectedOption;
    onConfirm(finalReason);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !isConfirmDisabled) {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado del Modal con tono de Advertencia Institucional */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-4 text-white flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">
                {isBatch
                  ? `Operación en Lote (${effectiveBlocks.length} Celdas)`
                  : 'Registro de Novedad Institucional'}
              </h3>
              <p className="text-xs text-amber-100 font-medium">
                {isBatch
                  ? 'Mutación simultánea de celdas seleccionadas'
                  : 'Mutación de franja horaria a estado de excepción'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen de la Franja a Mutar / Lote */}
        <div className="px-5 py-3.5 bg-amber-50/70 border-b border-amber-200/80 flex flex-col gap-2 shrink-0">
          {isBatch ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-xs font-bold text-amber-950">
                    Lote de {effectiveBlocks.length} materias seleccionadas
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900 border border-amber-300">
                  Multiselección
                </span>
              </div>
              <p className="text-[11px] text-amber-900/80 font-medium">
                La acción seleccionada se aplicará simultáneamente a todas las {effectiveBlocks.length} materias seleccionadas en la matriz.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-xs font-bold text-amber-950 truncate max-w-xs" title={displayBlock.subject}>
                    {displayBlock.subject}
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900 border border-amber-300">
                  {displayBlock.gradeName}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-amber-900/90 font-medium pt-1 border-t border-amber-200/60">
                <div className="flex items-center gap-1.5 truncate">
                  <Users className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span className="truncate">{displayBlock.teacherName || 'Sin Asignar'}</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span className="truncate">{displayBlock.classroomName || 'Aula Base'}</span>
                </div>
                <div className="flex items-center gap-1.5 capitalize truncate">
                  <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span className="truncate">{displayBlock.dayOfWeek} (Hora {displayBlock.period})</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0 font-mono" />
                  <span className="font-mono text-[10px]">{displayBlock.startTime} - {displayBlock.endTime}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Selector Estricto de Motivo */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Selecciona el motivo de la novedad:
          </label>

          <div className="space-y-2">
            {PRESET_OPTIONS.map((opt) => {
              const isSelected = selectedOption === opt.id;
              const Icon = opt.icon;

              return (
                <div
                  key={opt.id}
                  onClick={() => setSelectedOption(opt.id)}
                  className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 select-none ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/80 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isSelected
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${
                          isSelected ? 'text-amber-950' : 'text-slate-800'
                        }`}
                      >
                        {opt.label}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {opt.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Captura de Texto Condicional para 'Personalizada' */}
          {isCustom && (
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
              <label
                htmlFor="custom-novelty-input"
                className="block text-xs font-bold text-slate-800 flex items-center justify-between"
              >
                <span>Motivo personalizado <span className="text-red-500">*</span></span>
                <span className="text-[10px] text-slate-400 font-normal">Requerido</span>
              </label>

              <input
                id="custom-novelty-input"
                ref={inputRef}
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Ej. Simulacro de evacuación, Mantenimiento institucional..."
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs text-slate-900 transition outline-none font-medium shadow-2xs ${
                  !isCustomValid && customReason !== ''
                    ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-400 bg-red-50/20'
                    : 'border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 bg-white'
                }`}
              />

              {!isCustomValid && (
                <p className="text-[10px] text-amber-700 font-semibold">
                  Debes ingresar un motivo para habilitar la confirmación.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Acciones del Modal */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 ${
              isConfirmDisabled
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                : 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-amber-600/20 cursor-pointer'
            }`}
          >
            <span>Confirmar Novedad</span>
          </button>
        </div>
      </div>
    </div>
  );
};
