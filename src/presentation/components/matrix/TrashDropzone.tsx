import React, { useState, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';
import { getGlobalActiveDraggedBlock } from './MatrixCell';

interface TrashDropzoneProps {
  isMatrixActive?: boolean;
}

export const TrashDropzone: React.FC<TrashDropzoneProps> = ({ isMatrixActive = true }) => {
  const { selectedCells, triggerBatchDelete, requestNoveltyModal } = useCoordinatorMatrix();
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      if (!isMatrixActive) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (!isOver) setIsOver(true);
    },
    [isMatrixActive, isOver]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      if (!isMatrixActive) return;
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);

      let item: any = null;
      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) {
          const parsed = JSON.parse(raw);
          item = parsed.item || parsed;
        }
      } catch {
        // fallback
      }

      if (!item) {
        item = getGlobalActiveDraggedBlock();
      }

      if (item) {
        requestNoveltyModal(item);
      }
    },
    [isMatrixActive, requestNoveltyModal]
  );

  const count = selectedCells.length;

  return (
    <button
      type="button"
      disabled={!isMatrixActive}
      aria-label="Eliminar"
      onClick={() => {
        if (count > 0) {
          triggerBatchDelete();
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
        !isMatrixActive
          ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
          : isOver
          ? 'bg-red-600 border-red-700 text-white scale-105 shadow-md'
          : count > 0
          ? 'bg-red-50 hover:bg-red-100 border-red-400 text-red-700 shadow-xs'
          : 'bg-red-50/60 hover:bg-red-50 border-red-200 text-red-600'
      }`}
      title={
        count > 0
          ? `Eliminar o limpiar ${count} casillas seleccionadas`
          : 'Arrastra una casilla aquí o selecciona casillas para eliminar'
      }
    >
      <Trash2 className="w-4 h-4 shrink-0" />
    </button>
  );
};
