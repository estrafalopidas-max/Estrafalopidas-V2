import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, Eraser, Wand2, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';

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
      'Limpia todas las casillas pero conserva registrados a los profesores y las asignaturas para empezar a armar.',
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
      'A partir de la asignación académica (qué dicta cada profe y en qué grados), el sistema genera automáticamente una propuesta de horario semanal sin cruces ni choques de docentes, lista para solo ajustar detalles.',
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
      'Vuelve al horario base guardado como referencia institucional.',
    badge: 'Referencia 2026',
    icon: <RotateCcw className="w-4 h-4 shrink-0" />,
    accentBorder: 'border-emerald-600',
    accentBg: 'bg-emerald-50/80',
    accentText: 'text-emerald-900',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-700',
    buttonLabel: 'Restaurar plantilla base',
  },
];

export const ResetConfirmationModal: React.FC<ResetConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selectedMode, setSelectedMode] = useState<SchoolYearResetMode>('auto');
  const [confirmText, setConfirmText] = useState<string>('');

  useScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
      setSelectedMode('auto');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim().toUpperCase() === 'CONFIRMAR';
  const activeOption = SCHOOL_YEAR_OPTIONS.find((opt) => opt.id === selectedMode) || SCHOOL_YEAR_OPTIONS[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isConfirmed) {
      onConfirm(selectedMode);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-white border-2 border-slate-300 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-900 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-modal-title"
      >
        {/* Cabecera Estructural Fija con Protección de Seguridad */}
        <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 text-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-2xs shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 id="reset-modal-title" className="text-base font-bold text-white tracking-tight">
                Configuración de Inicio de Año Escolar
              </h3>
              <p className="text-xs text-slate-300 font-medium">
                Acción protegida con confirmación de seguridad institucional
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Cancelar y cerrar"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 space-y-3.5 overflow-y-auto flex-1 min-h-0 text-xs">
            <p className="text-slate-600 font-medium leading-relaxed">
              Selecciona la modalidad con la que deseas estructurar la parrilla horaria para el periodo o inicio de año escolar:
            </p>

            {/* Selector de las 3 Opciones */}
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
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600'
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
                            isSelected
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600'
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
                          isSelected ? 'text-slate-900 opacity-100' : 'opacity-0'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Confirmación de Seguridad */}
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <label htmlFor="confirm-input" className="block text-xs font-bold text-slate-800">
                Confirmación de seguridad: escribe <span className="font-mono text-red-600 font-extrabold select-all">CONFIRMAR</span> para autorizar esta operación:
              </label>
              <input
                id="confirm-input"
                type="text"
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRMAR"
                autoComplete="off"
                spellCheck="false"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-300 focus:border-slate-900 focus:ring-2 focus:ring-slate-300 outline-none text-sm font-mono font-bold text-slate-900 transition bg-slate-50/50 uppercase placeholder:text-slate-400 placeholder:normal-case"
              />
            </div>
          </div>

          {/* Pie de Página Fijo */}
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
      </div>
    </div>
  );
};
