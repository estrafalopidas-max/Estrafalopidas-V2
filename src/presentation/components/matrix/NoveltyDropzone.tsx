import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, AlertTriangle, FileWarning } from 'lucide-react';
import { getGlobalActiveDraggedBlock } from './MatrixCell';

interface NoveltyDropzoneProps {
  onDropBlock: (item: any) => void;
  className?: string;
}

/**
 * Zona de Descarte Logística: 'Papelera / Registro de Novedades'
 * Componente fijo en la interfaz configurado como Dropzone HTML5 válido.
 * Al sobrevolarlo con una tarjeta de materia, se ilumina en tono de advertencia
 * (ámbar / rojo) para confirmar la zona de captura antes de abrir el modal de transición.
 */
export const NoveltyDropzone: React.FC<NoveltyDropzoneProps> = ({
  onDropBlock,
  className = '',
}) => {
  const [isOver, setIsOver] = useState<boolean>(false);
  const [isGlobalDragging, setIsGlobalDragging] = useState<boolean>(false);

  // Escucha global de eventos nativos HTML5 dragstart y dragend para reaccionar
  // en tiempo real cuando cualquier tarjeta de la matriz se pone en movimiento
  useEffect(() => {
    const handleDragStart = () => {
      setIsGlobalDragging(true);
    };

    const handleDragEnd = () => {
      setIsGlobalDragging(false);
      setIsOver(false);
    };

    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragend', handleDragEnd);

    return () => {
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('dragend', handleDragEnd);
    };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!isOver) {
      setIsOver(true);
    }
  }, [isOver]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);
      setIsGlobalDragging(false);

      let item: any = null;
      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) {
          const parsed = JSON.parse(raw);
          item = parsed.item || parsed;
        }
      } catch (err) {
        console.warn('[NoveltyDropzone] Fallback parse drop data:', err);
      }

      if (!item) {
        item = getGlobalActiveDraggedBlock();
      }

      if (item && onDropBlock) {
        onDropBlock(item);
      }
    },
    [onDropBlock]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`fixed bottom-5 right-6 z-40 transition-all duration-200 select-none ${className}`}
    >
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border-2 shadow-lg transition-all duration-200 cursor-default ${
          isOver
            ? 'bg-amber-100 border-amber-600 text-amber-950 ring-4 ring-amber-400/50 shadow-2xl scale-105 animate-pulse'
            : isGlobalDragging
            ? 'bg-amber-50/95 border-amber-400 text-amber-900 ring-2 ring-amber-300/60 shadow-xl scale-[1.02]'
            : 'bg-white/95 backdrop-blur-md border-slate-300 text-slate-700 hover:border-amber-400 hover:text-amber-900 shadow-md'
        }`}
      >
        {/* Icono de advertencia / papelera */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            isOver
              ? 'bg-amber-500 text-white shadow-inner animate-bounce'
              : isGlobalDragging
              ? 'bg-amber-200 text-amber-800'
              : 'bg-slate-100 text-slate-500 group-hover:bg-amber-100 group-hover:text-amber-700'
          }`}
        >
          {isOver ? (
            <AlertTriangle className="w-5 h-5 text-white" />
          ) : isGlobalDragging ? (
            <FileWarning className="w-5 h-5 text-amber-700" />
          ) : (
            <Trash2 className="w-4 h-4 text-slate-600" />
          )}
        </div>

        {/* Textos descriptivos */}
        <div className="flex flex-col text-left pr-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs font-bold leading-tight ${
                isOver ? 'text-amber-950 font-black tracking-tight' : 'text-slate-800'
              }`}
            >
              {isOver ? '¡SOLTAR PARA REGISTRAR NOVEDAD!' : 'Papelera / Registro de Novedades'}
            </span>
          </div>
          <span
            className={`text-[10px] leading-tight font-medium ${
              isOver ? 'text-amber-800 font-semibold' : 'text-slate-500'
            }`}
          >
            {isOver
              ? 'Se abrirá el selector de motivo'
              : isGlobalDragging
              ? 'Suelta la materia aquí para mutarla a novedad'
              : 'Arrastra una materia aquí para reportar novedad'}
          </span>
        </div>
      </div>
    </div>
  );
};
