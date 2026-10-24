import React, { useEffect } from 'react';
import { AlertOctagon, X, UserX, Home } from 'lucide-react';
import { CollisionValidationResult } from '../../../domain/services/constraint-solver.service';

interface ConflictAlertModalProps {
  conflict: CollisionValidationResult | null;
  onClose: () => void;
}

export const ConflictAlertModal: React.FC<ConflictAlertModalProps> = ({ conflict, onClose }) => {
  const isOpen = Boolean(conflict && !conflict.isValid);

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

  if (!isOpen || !conflict) return null;

  const isClassroom = conflict.conflictType === 'classroom';
  const conflicting = conflict.conflictingBlock;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white border-2 border-villa-magenta/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-villa-dark animate-in zoom-in-95 duration-150">
        {/* Header Ribbon - Strict villa-magenta alert */}
        <div className="bg-white px-6 py-4 border-b border-villa-magenta/20 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white border-2 border-villa-magenta flex items-center justify-center text-villa-magenta shadow-xs shrink-0">
              <AlertOctagon className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-villa-magenta tracking-tight">
                Operación Bloqueada por Constraint Solver
              </h3>
              <p className="text-xs text-villa-gray font-medium">
                Regla de integridad y prevención de colisiones escolares violada
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-villa-gray hover:text-villa-dark hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body con Scroll Seguro Delegado */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-start space-x-3 bg-white p-4 rounded-2xl border-2 border-villa-magenta/30 shadow-2xs">
            {isClassroom ? (
              <Home className="w-5 h-5 text-villa-magenta shrink-0 mt-0.5" />
            ) : (
              <UserX className="w-5 h-5 text-villa-magenta shrink-0 mt-0.5" />
            )}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-villa-magenta block mb-1">
                {isClassroom ? 'Conflicto de Aula (Aforo / Espacio)' : 'Conflicto de Docente (Double-booking)'}
              </span>
              <p className="text-xs text-villa-dark leading-relaxed font-medium">
                {conflict.message}
              </p>
            </div>
          </div>

          {conflicting && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <span className="font-bold text-villa-dark block uppercase tracking-wider text-[10px]">
                Detalles del Bloque Existente en Conflicto:
              </span>
              <div className="grid grid-cols-2 gap-2 text-villa-dark font-medium">
                <div><span className="text-villa-gray font-normal">Grupo:</span> {conflicting.gradeName}</div>
                <div><span className="text-villa-gray font-normal">Materia:</span> {conflicting.subject}</div>
                <div><span className="text-villa-gray font-normal">Docente:</span> {conflicting.teacherName}</div>
                <div><span className="text-villa-gray font-normal">Aula:</span> {conflicting.classroomName}</div>
                <div><span className="text-villa-gray font-normal">Periodo:</span> Hora {conflicting.period}</div>
                <div><span className="text-villa-gray font-normal">Horario:</span> {conflicting.startTime} - {conflicting.endTime}</div>
              </div>
            </div>
          )}

          <div className="text-[11px] text-villa-gray italic">
            El sistema ha rechazado la escritura en Firestore para garantizar la consistencia institucional. Modifica los parámetros para resolver la colisión.
          </div>
        </div>

        {/* Footer Fijo Estructural */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-villa-blue-dark hover:bg-villa-blue-light text-white text-xs font-semibold transition shadow-xs cursor-pointer"
          >
            Entendido y Corregir
          </button>
        </div>
      </div>
    </div>
  );
};
