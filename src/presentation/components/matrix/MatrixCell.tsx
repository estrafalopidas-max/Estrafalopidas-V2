import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { GradeEntity } from '../../../domain/entities/grade.entity';
import { AbsenceRequestEntity } from '../../../domain/entities/absence-request.entity';
import { MatrixSlotCard } from './MatrixSlotCard';
import { Trash2 } from 'lucide-react';

// Global drag tracker to allow cross-component validation during HTML5 dragover/dragenter
let globalActiveDraggedBlock: TimeBlockEntity | null = null;

export function setGlobalActiveDraggedBlock(block: TimeBlockEntity | null) {
  globalActiveDraggedBlock = block;
}

export function getGlobalActiveDraggedBlock(): TimeBlockEntity | null {
  return globalActiveDraggedBlock;
}

export interface CellCoordData {
  grade: GradeEntity;
  period: number;
  gradeIndex: number;
  periodIndex: number;
  slotId: string;
  block: TimeBlockEntity | null;
}

export interface MatrixCellProps {
  grade: GradeEntity;
  period: number;
  block: TimeBlockEntity | null;
  pending: AbsenceRequestEntity | null;
  officialSubjects?: string[];
  allTimeBlocks: TimeBlockEntity[];
  draggedBlock: TimeBlockEntity | null;
  droppableId: string;
  isThisBlockDragging: boolean;
  isBlocked?: boolean;
  isHoliday?: boolean;
  isSelected?: boolean;
  gradeIndex?: number;
  periodIndex?: number;
  onSelectSlot: (block: TimeBlockEntity) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, slotId: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, block: TimeBlockEntity, slotId: string) => void;
  onDrag: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  updateGhostPosition?: (clientX: number, clientY: number) => void;
  onCellClick?: (e: React.MouseEvent, data: CellCoordData) => void;
  onTrashClick?: (block: TimeBlockEntity, slotId: string) => void;
  onEmptyClick?: (grade: GradeEntity, period: number, block: TimeBlockEntity | null, slotId: string) => void;
  onToggleSelect?: (cellId: string, blockId?: string) => void;
  onQuickChangeClassroom?: (block: TimeBlockEntity, newClassroom: string) => void;
}

export const MatrixCell: React.FC<MatrixCellProps> = ({
  grade,
  period,
  block,
  pending,
  officialSubjects,
  allTimeBlocks,
  draggedBlock,
  droppableId,
  isThisBlockDragging,
  isBlocked = false,
  isHoliday = false,
  isSelected = false,
  gradeIndex = 0,
  periodIndex = 0,
  onSelectSlot,
  onDrop,
  onDragStart,
  onDrag,
  onDragEnd,
  updateGhostPosition,
  onCellClick,
  onTrashClick,
  onEmptyClick,
  onToggleSelect,
  onQuickChangeClassroom,
}) => {
  // Estados de Interacción Local
  const [isOver, setIsOver] = useState<boolean>(false);
  const [isValid, setIsValid] = useState<boolean>(true);

  // Restricción del Evento Hover: Desactivar isOver inmediatamente cuando el arrastre global termina
  useEffect(() => {
    if (!draggedBlock && !getGlobalActiveDraggedBlock()) {
      setIsOver(false);
      setIsValid(true);
    }
  }, [draggedBlock]);

  // Motor de Validación de Colisión:
  // Evalúa el elemento arrastrado contra la celda actual:
  // 1. ¿La celda está bloqueada fuera de la jornada del grado?
  // 2. ¿La celda ya está ocupada por otra materia?
  // 3. ¿El profesor de esta materia ya está asignado a otro grupo en esa misma hora y día (Colisión temporal)?
  const validateCollision = useCallback(
    (activeItem: TimeBlockEntity | null): boolean => {
      if (isBlocked) {
        return false;
      }

      const isTeacherPoolDrag = Boolean(activeItem && activeItem.id.startsWith('teacher-'));

      // Una celda ocupada tiene un bloque de clase activo distinto al que se está arrastrando.
      // Los bloques tipo 'exit' ("Sin asignación académica") representan disponibilidad.
      const isCellOccupied = Boolean(
        block &&
        (!block.block_type || block.block_type === 'class' || block.block_type === 'technical_media' || block.block_type === 'novelty') &&
        block.status !== 'cancelled' &&
        block.teacherId !== 'unassigned' &&
        block.teacherName !== 'Sin Asignar' &&
        block.subject !== 'Sin asignación académica' &&
        (!activeItem || block.id !== activeItem.id)
      );

      if (isCellOccupied && !isTeacherPoolDrag) {
        return false;
      }

      if (!activeItem) {
        return true;
      }

      // Colisión temporal de docente
      const teacherId = activeItem.teacherId;
      const teacherName = activeItem.teacherName;

      if (teacherId && teacherId !== 'unassigned' && teacherName !== 'Sin Asignar') {
        const hasTeacherCollision = allTimeBlocks.some((b) => {
          // Excluir el propio bloque arrastrado o el bloque destino cuando se reemplaza desde el cajón
          if (b.id === activeItem.id) return false;
          if (isTeacherPoolDrag && block && b.id === block.id) return false;
          // Mismo periodo
          if (b.period !== period) return false;
          // Excluir cancelados o ausencias no cubiertas
          if (b.status === 'cancelled' || b.status === 'absent') return false;

          // Mismo profesor asignado directamente o como reemplazo
          const isSameTeacher =
            b.teacherId === teacherId ||
            (b.status === 'covered' && b.replacementTeacherId === teacherId);

          return isSameTeacher;
        });

        if (hasTeacherCollision) {
          return false;
        }
      }

      return true;
    },
    [isBlocked, block, period, allTimeBlocks]
  );

  // Eventos de Detección
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    // Si la celda está bloqueada, omitir preventDefault para bloquear el drop
    if (!isBlocked) {
      e.preventDefault();
    }
    e.stopPropagation();

    if (isBlocked) {
      setIsOver(true);
      setIsValid(false);
      return;
    }

    const activeItem = draggedBlock || getGlobalActiveDraggedBlock();
    const valid = validateCollision(activeItem);

    setIsValid(valid);
    setIsOver(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Anulación Física del Evento Drop:
    // En el estándar HTML5 Drag & Drop, la única forma de habilitar una zona de soltado es ejecutando e.preventDefault().
    // Para hacer que la celda rechace físicamente la materia: if (!isBlocked) { e.preventDefault(); }
    if (!isBlocked) {
      e.preventDefault();
    }
    e.stopPropagation();

    if (isBlocked) {
      e.dataTransfer.dropEffect = 'none';
      if (!isOver) {
        setIsOver(true);
        setIsValid(false);
      }
      return;
    }

    e.dataTransfer.dropEffect = 'move';

    if (!isOver) {
      const activeItem = draggedBlock || getGlobalActiveDraggedBlock();
      const valid = validateCollision(activeItem);
      setIsValid(valid);
      setIsOver(true);
    }

    if (updateGhostPosition && (e.clientX || e.clientY)) {
      updateGhostPosition(e.clientX, e.clientY);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    // Previene salir falso si el cursor pasa por un nodo hijo
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsOver(false);
    setIsValid(true);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (isBlocked) {
      // Bloqueo físico: rechazar el evento para que la tarjeta regrese a su origen
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    setIsOver(false);
    setIsValid(true);

    onDrop(e, droppableId);
  };

  // Inyección de CSS Condicional (Tailwind)
  // Estado Base (Inactivo): border-gray-200 bg-transparent
  // Estado Festivo / Columna Bloqueada: bg-gray-100 cursor-not-allowed pointer-events-none (Feedback inerte estático)
  // Estado Sobrevolado + Válido: border-2 border-green-500 bg-green-50 border-dashed
  // Estado Sobrevolado + Bloqueado / Inválido: bg-red-50 border-2 border-red-500 text-red-700 cursor-not-allowed border-dashed transition-colors duration-200
  const containerClasses = useMemo(() => {
    if (isHoliday) {
      return 'h-full w-full min-h-[125px] rounded-xl flex flex-col justify-center items-center text-center p-2 bg-gray-100 cursor-not-allowed pointer-events-none border border-gray-200 select-none';
    }

    const base = 'h-full w-full min-h-[125px] rounded-xl flex flex-col justify-stretch transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]';

    if (!isOver) {
      return `${base} bg-transparent`;
    }

    if (isBlocked || !isValid) {
      return `${base} bg-red-50 border-2 border-red-500 text-red-700 cursor-not-allowed border-dashed`;
    }

    return `${base} border-2 border-green-500 bg-green-50/90 border-dashed scale-[1.01] shadow-xs`;
  }, [isHoliday, isOver, isBlocked, isValid]);

  // Desactivación de Eventos (Dropzone Lock):
  // Si isHoliday es true, estrictamente prohibido montar onDragOver, onDragEnter y onDrop
  const dropzoneHandlers = isHoliday
    ? {}
    : {
        onDragEnter: handleDragEnter,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
      };

  return (
    <div
      {...dropzoneHandlers}
      className={containerClasses}
    >
      {/* 0. Casilla Inerte por Festivo (Columna bloqueada verticalmente) */}
      {isHoliday ? (
        <div className="flex flex-col items-center justify-center text-center select-none space-y-1">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Festivo
          </span>
          <span className="text-[10px] text-gray-400 font-medium leading-tight">
            Sin actividad académica
          </span>
        </div>
      ) : isBlocked ? (
        <div
          className={`h-full min-h-[120px] p-2 rounded-xl flex items-center justify-center select-none transition-all duration-200 ease-out ${
            isOver
              ? 'text-red-700 font-bold'
              : 'bg-gray-50/60 hover:bg-gray-100/60 border border-dashed border-gray-300'
          }`}
        >
          <span
            className={
              isOver
                ? 'text-xs font-bold text-red-700 uppercase tracking-wide'
                : 'text-xs text-center text-gray-500 whitespace-normal break-words leading-tight'
            }
          >
            No disponible
          </span>
        </div>
      ) : block && block.block_type !== 'exit' ? (
        /* 2. Casilla Activa con Clase Lectiva (incluye Media Técnica homologada) */
        <div
          draggable={Boolean(!block.block_type || block.block_type === 'class' || block.block_type === 'technical_media' || block.block_type === 'novelty')}
          onDragStart={(e) => onDragStart(e, block, droppableId)}
          onDrag={onDrag}
          onDragEnd={onDragEnd}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
              e.stopPropagation();
              onCellClick?.(e, {
                grade,
                period,
                gradeIndex,
                periodIndex,
                slotId: droppableId,
                block,
              });
            } else {
              onCellClick?.(e, {
                grade,
                period,
                gradeIndex,
                periodIndex,
                slotId: droppableId,
                block,
              });
              onSelectSlot(block);
            }
          }}
          className={`h-full w-full select-none transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform relative group rounded-xl ${
            isSelected ? 'ring-2 ring-red-500/80 bg-red-50/20 border-red-300 shadow-xs' : ''
          } ${
            isThisBlockDragging
              ? 'opacity-40 scale-[0.96] ring-2 ring-dashed ring-villa-blue-light rounded-xl cursor-grabbing shadow-inner'
              : 'cursor-grab active:cursor-grabbing hover:shadow-md'
          } ${isOver && !isValid ? 'opacity-70 pointer-events-none' : ''}`}
        >
          {/* Micro-interacción de Papelera en Celda (Anti-Ruido Visual) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTrashClick?.(block, droppableId);
            }}
            className={`absolute top-1 left-1 p-1 text-red-500 bg-white/85 hover:bg-white hover:text-red-700 rounded shadow-sm z-10 transition-opacity duration-150 ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            title="Descartar / Registrar Novedad"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <MatrixSlotCard
            timeBlock={block}
            pendingAbsence={pending}
            officialSubjects={officialSubjects}
            allTimeBlocks={allTimeBlocks}
            onQuickChangeClassroom={onQuickChangeClassroom}
          />

          {/* Inyección de Selector Circular (UI): Bloque inferior 40% en esquina bottom-1 right-1 */}
          <div
            className="absolute bottom-1 right-1 z-10 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              aria-label={`Seleccionar casilla ${grade.fullName} hora ${period}`}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect?.(droppableId, block.id);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded-full text-red-600 border border-gray-300 focus:ring-red-500 cursor-pointer shadow-sm appearance-none checked:bg-red-600 checked:border-transparent transition-all flex items-center justify-center relative bg-white/90"
              title={isSelected ? 'Desmarcar de lote' : 'Seleccionar para lote'}
            />
            {isSelected && (
              <svg
                className="w-2.5 h-2.5 text-white absolute pointer-events-none stroke-current stroke-[3]"
                viewBox="0 0 24 24"
                fill="none"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </div>
      ) : (
        /* 3. Casilla Vacía Disponible en Jornada Regular (Sin asignación académica) */
        <div
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
              e.stopPropagation();
              onCellClick?.(e, {
                grade,
                period,
                gradeIndex,
                periodIndex,
                slotId: droppableId,
                block,
              });
            } else {
              onEmptyClick?.(grade, period, block, droppableId);
            }
          }}
          className={`h-full min-h-[120px] p-2 rounded-xl flex items-center justify-center select-none cursor-pointer transition relative group ${
            isSelected
              ? 'ring-2 ring-red-500/80 bg-red-50/20 border border-red-400 shadow-xs'
              : isOver
              ? isValid
                ? 'text-green-700 font-bold'
                : 'text-red-600 font-bold'
              : 'bg-gray-50/80 hover:bg-gray-100/70 border border-dashed border-gray-300 hover:border-blue-400'
          }`}
          title="Clic para Asignación Rápida de Docente (o marca el círculo para lote)"
        >
          {/* Selector Circular (UI) para celda vacía */}
          <div
            className="absolute bottom-1 right-1 z-10 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              aria-label={`Seleccionar casilla ${grade.fullName} hora ${period}`}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect?.(droppableId, block?.id);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded-full text-red-600 border border-gray-300 focus:ring-red-500 cursor-pointer shadow-sm appearance-none checked:bg-red-600 checked:border-transparent transition-all flex items-center justify-center relative bg-white/90"
              title={isSelected ? 'Desmarcar de lote' : 'Seleccionar para lote'}
            />
            {isSelected && (
              <svg
                className="w-2.5 h-2.5 text-white absolute pointer-events-none stroke-current stroke-[3]"
                viewBox="0 0 24 24"
                fill="none"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>

          {isOver ? (
            isValid ? (
              <span className="text-xs font-bold text-green-700 animate-pulse">Soltar aquí</span>
            ) : (
              <span className="text-xs font-bold text-red-600">No disponible</span>
            )
          ) : (
            <span className="text-xs text-center text-gray-500 whitespace-normal break-words leading-tight">
              Sin asignación académica
            </span>
          )}
        </div>
      )}
    </div>
  );
};
