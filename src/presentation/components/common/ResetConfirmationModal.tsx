import React, { useState, useEffect } from 'react';
import { TriangleAlert, X, Trash2 } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';

interface ResetConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * ResetConfirmationModal - Arquitectura de Validación de Intención Positiva (Hard-Confirm Modal)
 * 
 * Intercepta comandos destructivos de reseteo de fábrica exigiendo al usuario
 * escribir exactamente la palabra 'CONFIRMAR' antes de habilitar el botón rojo de purga.
 */
export const ResetConfirmationModal: React.FC<ResetConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [confirmText, setConfirmText] = useState<string>('');

  // Bloqueo de Scroll y Prevención de Layout Shift
  useScrollLock(isOpen);

  // Limpiar el estado de verificación cada vez que el modal cambia de visibilidad
  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim().toUpperCase() === 'CONFIRMAR';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isConfirmed) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-white border-2 border-red-500 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-modal-title"
      >
        {/* Cabecera Estructural Fija (Sticky Header) con Danger UI */}
        <div className="bg-red-50/90 px-6 py-4 border-b border-red-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 border border-red-300 flex items-center justify-center text-red-600 shadow-2xs shrink-0">
              <TriangleAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 id="reset-modal-title" className="text-base font-bold text-red-700 tracking-tight">
                Peligro: Reset de Fábrica
              </h3>
              <p className="text-xs text-red-600/80 font-medium">
                Acción crítica de restablecimiento institucional
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-red-100/60 transition cursor-pointer"
            title="Cancelar y cerrar"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal con Scroll Seguro Delegado */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 text-xs">
            {/* Mensaje Explícito de Destrucción de Datos */}
            <div className="p-3.5 bg-red-50 border border-red-200/90 rounded-2xl text-red-800 space-y-1">
              <p className="font-semibold text-xs leading-relaxed">
                Esta acción ejecutará un restablecimiento total (localStorage.clear()). Borrará irreversiblemente los cambios locales, horarios editados y novedades. No se puede deshacer.
              </p>
            </div>

            <p className="text-slate-600 leading-normal">
              Se eliminará toda la memoria local y se restaurará la grilla base definitiva consolidada 2026 de la Institución Educativa Villa Flora.
            </p>

            {/* Input de Verificación (State Match) */}
            <div className="space-y-1.5 pt-1">
              <label htmlFor="confirm-input" className="block text-xs font-bold text-slate-800">
                Escribe exactamente la palabra <span className="font-mono text-red-600 font-extrabold select-all">CONFIRMAR</span> para habilitar la purga:
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
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-300 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none text-sm font-mono font-bold text-slate-900 transition bg-slate-50/50 uppercase placeholder:text-slate-400 placeholder:normal-case"
              />
            </div>
          </div>

          {/* Pie de Página Fijo (Sticky Footer) con Botón Condicional */}
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
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:hover:bg-gray-200 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:shadow-none"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Purga y Reset de Fábrica</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
