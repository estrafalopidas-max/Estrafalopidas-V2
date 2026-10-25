import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { GradeEntity, ShiftType } from '../../../domain/entities/grade.entity';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { AbsenceRequestEntity } from '../../../domain/entities/absence-request.entity';
import { MatrixSlotCard } from './MatrixSlotCard';
import { MatrixCell, setGlobalActiveDraggedBlock, CellCoordData } from './MatrixCell';
import { Clock, Users } from 'lucide-react';
import { createSlotDroppableId } from '../../../domain/services/dnd-slot.helper';

export interface MatrixPeriodConfig {
  period: number;
  ordinal: string;
  time: string;
  secondaryTime?: string;
  label?: string;
  isSupportPlan?: boolean;
}

export const BACHILLERATO_PERIODS: MatrixPeriodConfig[] = [
  { period: 1, ordinal: '1ª Hora', time: '06:10 - 07:05', label: '1ª Hora' },
  { period: 2, ordinal: '2ª Hora', time: '07:05 - 08:00', label: '2ª Hora' },
  { period: 3, ordinal: '3ª Hora', time: '08:00 - 08:55', label: '3ª Hora' },
  { period: 4, ordinal: '4ª Hora', time: '09:25 - 10:20', label: '4ª Hora' },
  { period: 5, ordinal: '5ª Hora', time: '10:20 - 11:15', label: '5ª Hora' },
  { period: 6, ordinal: '6ª Hora', time: '11:15 - 12:10', label: '6ª Hora' },
  { period: 7, ordinal: '7ª Hora', time: '12:40 - 13:35', label: '7ª Hora' },
  { period: 8, ordinal: '8ª Hora', time: '13:35 - 14:30', label: '8ª Hora' },
  { period: 9, ordinal: '9ª Hora', time: '14:30 - 15:25', label: '9ª Hora' },
  { period: 10, ordinal: '10ª Hora', time: '15:45 - 16:40', label: '10ª Hora' },
  { period: 11, ordinal: '11ª Hora', time: '16:40 - 17:35', label: '11ª Hora' },
];

export const PRIMARIA_PERIODS: MatrixPeriodConfig[] = [
  { period: 1, ordinal: '1ª Hora', time: '12:30 - 13:25', label: '1ª Hora' },
  { period: 2, ordinal: '2ª Hora', time: '13:25 - 14:20', label: '2ª Hora' },
  { period: 3, ordinal: '3ª Hora', time: '14:20 - 15:15', label: '3ª Hora' },
  { period: 4, ordinal: '4ª Hora', time: '15:45 - 16:40', label: '4ª Hora' },
  { period: 5, ordinal: '5ª Hora', time: '16:40 - 17:35', label: '5ª Hora' },
];

function formatMinutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export interface PreJornadaConfig {
  time: string;
  secondaryTime?: string;
  label: string; // 'ATENCIÓN A PADRES'
  description: string;
}

export interface MatrixScheduleConfig {
  periods: MatrixPeriodConfig[];
  breakTime: string;
  secondaryBreakTime?: string;
  breakLabel: string;
  preJornada?: PreJornadaConfig | null;
}

export function generateMatrixSchedule(
  shift: ShiftType,
  isMeetingDay: boolean = false,
  isEventDay: boolean = false,
  scheduleType: 'A' | 'B' | 'C' | 'D' = 'A'
): MatrixScheduleConfig {
  if (shift === 'transicion-1') {
    // Transición Unificada: T1 (07:00 a 12:00) y T2 (12:30 a 17:30)
    const preJornada: PreJornadaConfig | null = isMeetingDay
      ? {
          time: '06:10 - 07:00',
          secondaryTime: '11:30 - 12:10',
          label: 'ATENCIÓN A PADRES',
          description: 'Franja institucional previa a la jornada lectiva • T1 (06:10 a 07:00) y T2 (11:30 a 12:10)',
        }
      : null;

    const periods: MatrixPeriodConfig[] = [
      { period: 1, ordinal: '1ª Hora', time: '07:00 - 07:50', secondaryTime: '12:30 - 13:20', label: '1ª Hora' },
      { period: 2, ordinal: '2ª Hora', time: '07:50 - 08:40', secondaryTime: '13:20 - 14:10', label: '2ª Hora' },
      { period: 3, ordinal: '3ª Hora', time: '08:40 - 09:30', secondaryTime: '14:10 - 15:00', label: '3ª Hora' },
      { period: 4, ordinal: '4ª Hora', time: '10:20 - 11:10', secondaryTime: '15:50 - 16:40', label: '4ª Hora' },
      { period: 5, ordinal: '5ª Hora', time: '11:10 - 12:00', secondaryTime: '16:40 - 17:30', label: '5ª Hora' },
    ];

    const breakTime = '09:30 - 10:20';
    const secondaryBreakTime = '15:00 - 15:50';

    return {
      periods,
      breakTime,
      secondaryBreakTime,
      breakLabel: 'Descanso Pedagógico y Alimentación Escolar • T1 (09:30 a 10:20) / T2 (15:00 a 15:50)',
      preJornada,
    };
  }

  if (shift === 'afternoon') {
    // Primaria (1° a 5°)
    const preJornada: PreJornadaConfig | null = isMeetingDay
      ? {
          time: '11:30 - 12:10',
          label: 'ATENCIÓN A PADRES',
          description: 'Franja institucional previa a la jornada lectiva (11:30 a 12:10) • Primaria',
        }
      : null;

    // Ciclo estricto de las 5 horas lectivas (no se modifica por la reunión)
    const startMinutes = isEventDay ? 13 * 60 : 12 * 60 + 30; // 13:00 (1:00 PM) o 12:30 (12:30 PM)
    let currentMinute = startMinutes;
    const periods: MatrixPeriodConfig[] = [];

    // Bloques 1 a 3 (55 minutos cada uno)
    for (let p = 1; p <= 3; p++) {
      const start = currentMinute;
      const end = start + 55;
      periods.push({
        period: p,
        ordinal: `${p}ª Hora`,
        time: `${formatMinutesToTimeString(start)} - ${formatMinutesToTimeString(end)}`,
        label: `${p}ª Hora`,
      });
      currentMinute = end;
    }

    // Descanso Pedagógico (30 minutos)
    const breakStart = currentMinute;
    const breakEnd = breakStart + 30;
    const breakTime = `${formatMinutesToTimeString(breakStart)} - ${formatMinutesToTimeString(breakEnd)}`;
    currentMinute = breakEnd;

    // Bloques 4 y 5 (Tope de iteración en la 5ta hora - estrictamente 5 bloques)
    for (let p = 4; p <= 5; p++) {
      const start = currentMinute;
      const end = start + 55;
      periods.push({
        period: p,
        ordinal: `${p}ª Hora`,
        time: `${formatMinutesToTimeString(start)} - ${formatMinutesToTimeString(end)}`,
        label: `${p}ª Hora`,
      });
      currentMinute = end;
    }

    return {
      periods,
      breakTime,
      breakLabel: isEventDay
        ? `Descanso Pedagógico (Horario Especial Evento • de ${breakTime.replace(' - ', ' a ')})`
        : `Descanso Pedagógico y Alimentación Escolar (de ${breakTime.replace(' - ', ' a ')})`,
      preJornada,
    };
  }

  // Morning shift (Bachillerato)
  const periods: MatrixPeriodConfig[] = [];
  let currentMinute = 6 * 60 + 10; // 06:10 = 370 min

  if (scheduleType === 'D' && !isMeetingDay) {
    // Horario D (Planes de apoyo XX periodo / Planes de apoyo anuales)
    const supportPlanTimes = [
      '06:10 - 06:40',
      '06:40 - 07:10',
      '07:10 - 07:40',
      '07:40 - 08:10',
    ];
    supportPlanTimes.forEach((timeStr, idx) => {
      periods.push({
        period: 101 + idx,
        ordinal: 'Plan de apoyo',
        time: timeStr,
        label: 'Plan de apoyo',
        isSupportPlan: true,
      });
    });

    const firstHalfClasses = [
      '08:10 - 08:45',
      '08:45 - 09:20',
      '09:20 - 09:55',
    ];
    for (let p = 1; p <= 3; p++) {
      periods.push({
        period: p,
        ordinal: `${p}ª Hora`,
        time: firstHalfClasses[p - 1],
        label: `${p}ª Hora`,
      });
    }

    const breakTime = '09:55 - 10:25';

    const secondHalfClasses = [
      '10:25 - 11:00',
      '11:00 - 11:35',
      '11:35 - 12:10',
    ];
    for (let p = 4; p <= 6; p++) {
      periods.push({
        period: p,
        ordinal: `${p}ª Hora`,
        time: secondHalfClasses[p - 4],
        label: `${p}ª Hora`,
      });
    }

    // Media Técnica (Bloques 7 a 11)
    const mediaTecnicaTimes = [
      '12:40 - 13:35',
      '13:35 - 14:30',
      '14:30 - 15:25',
      '15:45 - 16:40',
      '16:40 - 17:35',
    ];
    for (let p = 7; p <= 11; p++) {
      periods.push({
        period: p,
        ordinal: `${p}ª Hora`,
        time: mediaTecnicaTimes[p - 7],
        label: `${p}ª Hora`,
      });
    }

    return {
      periods,
      breakTime,
      breakLabel: `Descanso Pedagógico y Alimentación Escolar (de ${breakTime.replace(' - ', ' a ')})`,
      preJornada: null,
    };
  }

  if (!isMeetingDay) {
    // Modo Estándar: Franjas estrictas de 55 minutos
    for (let p = 1; p <= 3; p++) {
      const start = currentMinute;
      const end = start + 55;
      periods.push({
        period: p,
        ordinal: `${p}ª Hora`,
        time: `${formatMinutesToTimeString(start)} - ${formatMinutesToTimeString(end)}`,
        label: `${p}ª Hora`,
      });
      currentMinute = end; // At p=3: 08:55 (535 min)
    }

    const breakStart = currentMinute; // 08:55 (535)
    const breakEnd = breakStart + 30; // 09:25 (565)
    const breakTime = `${formatMinutesToTimeString(breakStart)} - ${formatMinutesToTimeString(breakEnd)}`;
    currentMinute = breakEnd;

    for (let p = 4; p <= 6; p++) {
      const start = currentMinute;
      const end = start + 55;
      periods.push({
        period: p,
        ordinal: `${p}ª Hora`,
        time: `${formatMinutesToTimeString(start)} - ${formatMinutesToTimeString(end)}`,
        label: `${p}ª Hora`,
      });
      currentMinute = end; // At p=6: 730 min = 12:10 PM
    }

    // Media Técnica (Bloques 7 a 11)
    const mediaTecnicaTimes = [
      '12:40 - 13:35',
      '13:35 - 14:30',
      '14:30 - 15:25',
      '15:45 - 16:40',
      '16:40 - 17:35',
    ];
    for (let p = 7; p <= 11; p++) {
      periods.push({
        period: p,
        ordinal: `${p}ª Hora`,
        time: mediaTecnicaTimes[p - 7],
        label: `${p}ª Hora`,
      });
    }

    return {
      periods,
      breakTime,
      breakLabel: `Descanso Pedagógico y Alimentación Escolar (de ${breakTime.replace(' - ', ' a ')})`,
      preJornada: null,
    };
  } else {
    // Modo Reunión Bachillerato:
    // Bloque 1 (Fila 1) rígidamente 50 minutos: 06:10 a 07:00 (ATENCIÓN A PADRES)
    const b1Start = currentMinute; // 370 min (06:10)
    const b1End = b1Start + 50; // 420 min (07:00)
    periods.push({
      period: 1,
      ordinal: 'Horario',
      time: `${formatMinutesToTimeString(b1Start)} - ${formatMinutesToTimeString(b1End)}`,
      label: 'Horario',
    });
    currentMinute = b1End; // 07:00

    // Del Bloque 2 (07:00) al Bloque 4 (09:45): 1ª, 2ª y 3ª Hora (55 min cada una antes del receso)
    // Bloque 2: 07:00 - 07:55 (1ª Hora)
    // Bloque 3: 07:55 - 08:50 (2ª Hora)
    // Bloque 4: 08:50 - 09:45 (3ª Hora)
    for (let p = 2; p <= 4; p++) {
      const start = currentMinute;
      const end = start + 55;
      periods.push({
        period: p,
        ordinal: `${p - 1}ª Hora`,
        time: `${formatMinutesToTimeString(start)} - ${formatMinutesToTimeString(end)}`,
        label: `${p - 1}ª Hora`,
      });
      currentMinute = end; // At p=4: 09:45 (585 min)
    }

    // Receso siempre después de la 3ª Hora: 09:45 a 10:15 (30 min)
    const breakStart = currentMinute; // 09:45 (585 min)
    const breakEnd = breakStart + 30; // 10:15 (615 min)
    const breakTime = `${formatMinutesToTimeString(breakStart)} - ${formatMinutesToTimeString(breakEnd)}`;
    currentMinute = breakEnd; // 10:15

    // Bloques 5 y 6 (55 min cada uno después del receso -> 4ª y 5ª Hora)
    // Bloque 5: 10:15 - 11:10 (4ª Hora)
    // Bloque 6: 11:10 - 12:05 (5ª Hora)
    for (let p = 5; p <= 6; p++) {
      const start = currentMinute;
      const end = start + 55;
      periods.push({
        period: p,
        ordinal: `${p - 1}ª Hora`,
        time: `${formatMinutesToTimeString(start)} - ${formatMinutesToTimeString(end)}`,
        label: `${p - 1}ª Hora`,
      });
      currentMinute = end; // At p=6: 12:05 PM
    }

    // Media Técnica (Bloques 7 a 11 -> 6ª a 10ª Hora)
    const mediaTecnicaTimes = [
      '12:40 - 13:35',
      '13:35 - 14:30',
      '14:30 - 15:25',
      '15:45 - 16:40',
      '16:40 - 17:35',
    ];
    for (let p = 7; p <= 11; p++) {
      periods.push({
        period: p,
        ordinal: `${p - 1}ª Hora`,
        time: mediaTecnicaTimes[p - 7],
        label: `${p - 1}ª Hora`,
      });
    }

    return {
      periods,
      breakTime,
      breakLabel: `Descanso Pedagógico y Alimentación Escolar (de ${breakTime.replace(' - ', ' a ')})`,
      preJornada: null,
    };
  }
}

export interface DesktopMatrixGridProps {
  grades: GradeEntity[];
  shift: ShiftType;
  timeBlocks: TimeBlockEntity[];
  pendingRequests: AbsenceRequestEntity[];
  officialSubjects?: string[];
  zoomLevel?: number;
  isMeetingDay?: boolean;
  isEventDay?: boolean;
  isHoliday?: boolean;
  scheduleType?: 'A' | 'B' | 'C' | 'D';
  supportPlanLabel?: string;
  dayHeaderLabel?: string;
  selectedCellIds?: Set<string>;
  selectedCells?: string[];
  onSelectSlot: (block: TimeBlockEntity) => void;
  onDropBlock?: (
    draggedItem: any,
    sourceDroppableId: string,
    targetDroppableId: string
  ) => void;
  onCellClick?: (e: React.MouseEvent, data: CellCoordData) => void;
  onTrashClick?: (block: TimeBlockEntity, slotId: string) => void;
  onEmptyClick?: (grade: GradeEntity, period: number, block: TimeBlockEntity | null, slotId: string) => void;
  onToggleSelect?: (cellId: string) => void;
}

export const DesktopMatrixGrid: React.FC<DesktopMatrixGridProps> = ({
  grades,
  shift,
  timeBlocks,
  pendingRequests,
  officialSubjects,
  zoomLevel = 100,
  isMeetingDay = false,
  isEventDay = false,
  isHoliday = false,
  scheduleType = 'A',
  supportPlanLabel,
  dayHeaderLabel,
  selectedCellIds,
  selectedCells,
  onSelectSlot,
  onDropBlock,
  onCellClick,
  onTrashClick,
  onEmptyClick,
  onToggleSelect,
}) => {
  const isMorning = shift === 'morning';
  const { periods, breakTime, secondaryBreakTime, breakLabel, preJornada } = useMemo(
    () => generateMatrixSchedule(shift, isMeetingDay, isEventDay, scheduleType),
    [shift, isMeetingDay, isEventDay, scheduleType]
  );
  const [breakStart, breakEnd] = breakTime.split(' - ');
  const breakSplitIndex =
    isMorning && scheduleType === 'D' && !isMeetingDay
      ? 7
      : isMorning && isMeetingDay
      ? 4
      : 3;
  const firstHalf = periods.slice(0, breakSplitIndex);
  const secondHalf = periods.slice(breakSplitIndex);

  // Live Tracking: evalúa la hora del sistema (new Date()) cada minuto con el array dinámico
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // 1 minuto
    return () => clearInterval(timer);
  }, []);

  // HTML5 Drag & Drop State with Precision Zoom & Offset Compensation
  const [draggedBlock, setDraggedBlock] = useState<TimeBlockEntity | null>(null);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ offsetX: number; offsetY: number }>({ offsetX: 0, offsetY: 0 });
  const [dragDimensions, setDragDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const floatingPreviewRef = useRef<HTMLDivElement>(null);

  // Limpieza de cursor y estilos globales de arrastre
  const cleanupDragStyles = useCallback(() => {
    document.body.classList.remove('is-dragging-matrix-slot');
    document.body.style.cursor = '';
    document.documentElement.style.cursor = '';
    window.dispatchEvent(new CustomEvent('matrix_drag_end'));
  }, []);

  // Mitigación por Desplazamiento y Zoom (Scroll/Zoom Offset):
  // Al mover el elemento (dragover y drag), resta la posición de scroll actual (window.scrollY y window.scrollX)
  // y compensa el factor de escala o zoom del contenedor (1 / zoomFactor) para que la previsualización se mueva 1:1 con la mano del cursor
  const updateGhostPosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!floatingPreviewRef.current || !gridContainerRef.current) return;
      if (!clientX && !clientY) return;

      const zoomFactor = Math.max(0.2, (zoomLevel || 100) / 100);

      // Posición del contenedor en pantalla
      const containerRect = gridContainerRef.current.getBoundingClientRect();
      const rawX = clientX - containerRect.left;
      const rawY = clientY - containerRect.top;

      // Compensación matemática por factor de zoom (1 / zoomFactor) y offset de agarre
      const compensatedX = (rawX - dragOffset.offsetX) * (1 / zoomFactor);
      const compensatedY = (rawY - dragOffset.offsetY) * (1 / zoomFactor);

      floatingPreviewRef.current.style.transform = `translate3d(${compensatedX}px, ${compensatedY}px, 0)`;
    },
    [zoomLevel, dragOffset]
  );

  // 1. Cálculo del Punto de Agarre (OnDragStart)
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, block: TimeBlockEntity, slotId: string) => {
      if (block.block_type && block.block_type !== 'class') {
        e.preventDefault();
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      // Calcula la posición relativa del clic dentro de la celda
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      setDragOffset({ offsetX, offsetY });
      setDragDimensions({ width: rect.width, height: rect.height });
      setDraggedBlock(block);
      setGlobalActiveDraggedBlock(block);
      setDragSourceId(slotId);
      setIsDragging(true);

      // Secuestro del Payload de Arrastre (Batch Dragging):
      // Si la celda que el usuario empieza a arrastrar pertenece a selectedCells,
      // el e.dataTransfer.setData NO enviará solo la información de esa materia.
      // Debe empaquetar la carga completa: JSON.stringify({ isBatch: true, items: selectedCells }).
      const isPartOfBatch =
        (selectedCells && (selectedCells.includes(block.id) || selectedCells.includes(slotId))) ||
        (selectedCellIds && (selectedCellIds.has(block.id) || selectedCellIds.has(slotId)));

      const activeBatch =
        selectedCells && selectedCells.length > 0
          ? selectedCells
          : selectedCellIds
          ? Array.from(selectedCellIds)
          : [];

      if (isPartOfBatch && activeBatch.length > 0) {
        const batchData = JSON.stringify({
          isBatch: true,
          items: activeBatch,
          item: block,
          sourceId: slotId,
          offsetX,
          offsetY,
        });
        e.dataTransfer.setData('text/plain', batchData);
        e.dataTransfer.setData('application/json', batchData);
      } else {
        const singleData = JSON.stringify({ item: block, sourceId: slotId, offsetX, offsetY });
        e.dataTransfer.setData('text/plain', singleData);
        e.dataTransfer.setData('application/json', singleData);
      }
      e.dataTransfer.effectAllowed = 'move';

      // 2. Implementación de una Previsualización Personalizada (Custom Drag Image)
      // Se clona fuera del contenedor escalado para que no se deforme con el zoom
      const dragPreviewElement = e.currentTarget.cloneNode(true) as HTMLElement;
      dragPreviewElement.id = 'ievf-custom-drag-image';
      dragPreviewElement.style.width = `${rect.width}px`;
      dragPreviewElement.style.height = `${rect.height}px`;
      dragPreviewElement.style.position = 'fixed';
      dragPreviewElement.style.top = '-9999px';
      dragPreviewElement.style.left = '-9999px';
      dragPreviewElement.style.transform = 'none'; // Previene distorsión por zoom heredado
      dragPreviewElement.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.35)';
      dragPreviewElement.style.borderRadius = '0.75rem';
      dragPreviewElement.style.opacity = '0.96';
      dragPreviewElement.style.pointerEvents = 'none';
      dragPreviewElement.style.zIndex = '999999';
      document.body.appendChild(dragPreviewElement);

      // Fuerza al navegador a posicionar el puntero en la posición relativa calculada (offsetX, offsetY)
      // para evitar saltos molestos al empezar el movimiento
      try {
        e.dataTransfer.setDragImage(dragPreviewElement, offsetX, offsetY);
      } catch (err) {
        console.warn('[handleDragStart] Fallback setDragImage:', err);
      }

      // Limpieza del clon temporal una vez que el navegador genera el snapshot
      setTimeout(() => {
        if (document.body.contains(dragPreviewElement)) {
          document.body.removeChild(dragPreviewElement);
        }
      }, 0);

      // 4. Fijación del Tipo de Cursor: grabbing fluido durante el arrastre
      document.body.classList.add('is-dragging-matrix-slot');
      window.dispatchEvent(new CustomEvent('matrix_drag_start', { detail: { block } }));
      document.body.style.cursor = 'grabbing';
      document.documentElement.style.cursor = 'grabbing';
    },
    [selectedCells, selectedCellIds]
  );

  // 3. Mitigación por Desplazamiento y Zoom en drag y dragover
  const handleDrag = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (e.clientX || e.clientY) {
        updateGhostPosition(e.clientX, e.clientY);
      }
    },
    [updateGhostPosition]
  );

  const handleContainerDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (e.clientX || e.clientY) {
        updateGhostPosition(e.clientX, e.clientY);
      }
    },
    [updateGhostPosition]
  );

  const handleSlotDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetSlotId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      cleanupDragStyles();

      let dataItem: any = draggedBlock;
      let sourceId = dragSourceId || '';

      try {
        const rawData =
          e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json');
        if (rawData) {
          const parsed = JSON.parse(rawData);
          if (parsed.item) {
            dataItem = parsed.item;
          } else if (parsed.type === 'TEACHER_POOL' || parsed.isTeacherCard || parsed.teacherId) {
            dataItem = {
              ...parsed,
              isTeacherCard: true,
              id: parsed.id || `teacher-${parsed.teacherId}`,
            };
          } else {
            dataItem = parsed;
          }
          if (parsed.sourceId) sourceId = parsed.sourceId;
        }
      } catch (err) {
        console.warn('[handleSlotDrop] Error parsing drag data:', err);
      }

      if (!dataItem) return;

      if (onDropBlock) {
        onDropBlock(dataItem, sourceId, targetSlotId);
      }

      setDraggedBlock(null);
      setGlobalActiveDraggedBlock(null);
    },
    [draggedBlock, dragSourceId, cleanupDragStyles, onDropBlock]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDraggedBlock(null);
    setGlobalActiveDraggedBlock(null);
    setDragSourceId(null);
    cleanupDragStyles();
  }, [cleanupDragStyles]);

  const isPeriodActive = (timeRangeStr: string): boolean => {
    try {
      const parts = timeRangeStr.split(/\s*(?:-|a)\s*/i);
      if (parts.length < 2) return false;
      const [startH, startM] = parts[0].trim().split(':').map(Number);
      const [endH, endM] = parts[1].trim().split(':').map(Number);

      const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } catch {
      return false;
    }
  };

  const isBreakActive =
    isPeriodActive(breakTime) || (secondaryBreakTime ? isPeriodActive(secondaryBreakTime) : false);

  const currentHourSlotLabel = useMemo(() => {
    if (isMorning && scheduleType === 'D' && !isMeetingDay) return 'Horario D';
    return isMeetingDay ? 'Horario B' : 'Horario A';
  }, [isMorning, isMeetingDay, scheduleType]);

  const SUPPORT_PLAN_GRADE_CLASSROOMS: Record<string, string> = {
    '6°': 'Aula 303',
    '7°': 'Aula 201',
    '8°': 'Aula 103',
    '9°': 'Aula 301',
    '10°': 'Aula 202',
    '11°': 'Aula 102',
  };

  const getGradeLevelKey = (grade: GradeEntity) => {
    if (grade.gradeLevel && SUPPORT_PLAN_GRADE_CLASSROOMS[grade.gradeLevel]) {
      return grade.gradeLevel;
    }
    const match = grade.fullName.match(/^(\d+°?)/);
    if (match) {
      const num = match[1].replace('°', '');
      return `${num}°`;
    }
    return grade.gradeLevel || grade.fullName;
  };

  const isSupportPlanModality =
    scheduleType === 'D' &&
    !isMeetingDay &&
    !isHoliday &&
    shift === 'morning';

  const supportPlanRoomGroups = useMemo(() => {
    if (!isSupportPlanModality) {
      return [];
    }
    const groups: Array<{ level: string; room: string; grades: GradeEntity[] }> = [];
    grades.forEach((g) => {
      const level = getGradeLevelKey(g);
      const rawRoom =
        SUPPORT_PLAN_GRADE_CLASSROOMS[level] ||
        g.defaultClassroomId ||
        'Aula Base';
      const cleanRoom = rawRoom.trim();
      const room = /^aula\b/i.test(cleanRoom)
        ? cleanRoom
        : `Aula ${cleanRoom}`;

      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.level === level) {
        lastGroup.grades.push(g);
      } else {
        groups.push({
          level,
          room,
          grades: [g],
        });
      }
    });
    return groups;
  }, [isSupportPlanModality, grades]);

  const hasSupportPlanRooms = supportPlanRoomGroups.length > 0;
  const isTransicion = shift === 'transicion-1';

  if (grades.length === 0) {
    return (
      <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white shadow-xs">
        <Users className="w-12 h-12 text-villa-gray mx-auto mb-3" />
        <h4 className="text-base font-semibold text-villa-dark">No se encontraron grupos para este filtro</h4>
        <p className="text-xs text-villa-gray mt-1">
          Ajusta los filtros de grado o término de búsqueda para visualizar la matriz en formato Excel.
        </p>
      </div>
    );
  }

  const renderCornerHeaderCell = (isFirstCol: boolean, keySuffix: string) => (
    <div
      key={`corner-header-${keySuffix}`}
      className={`w-36 min-w-[8.5rem] max-w-[8.5rem] sticky ${
        hasSupportPlanRooms ? 'top-9' : 'top-0'
      } ${
        isFirstCol ? 'left-0 z-40' : 'z-20'
      } backdrop-blur-xs border-r border-b shadow-xs flex flex-col justify-center items-center text-center p-2 transition-colors ${
        isHoliday
          ? 'bg-red-600 text-white font-bold border-red-700'
          : hasSupportPlanRooms
          ? 'bg-slate-200/95 border-slate-300'
          : 'bg-slate-200/95 border-gray-300'
      }`}
    >
      <div className="flex items-center space-x-1 max-w-full">
        <Clock className={`w-3.5 h-3.5 shrink-0 ${isHoliday ? 'text-white' : 'text-villa-blue-light'}`} />
        <span className={`font-semibold text-xs leading-tight ${isHoliday ? 'text-white font-bold' : 'text-gray-900'}`}>
          {isHoliday
            ? 'Día Festivo'
            : shift === 'morning'
            ? scheduleType === 'D' && !isMeetingDay
              ? supportPlanLabel || 'Planes de apoyo'
              : isMeetingDay
              ? 'Atención Padres'
              : 'Bachillerato'
            : shift === 'transicion-1'
            ? 'Transición'
            : isMeetingDay
            ? 'Primaria'
            : isEventDay
            ? 'Evento (1:00 PM)'
            : 'Primaria'}
        </span>
      </div>
      {dayHeaderLabel && (
        <span
          className={`text-[10px] leading-tight font-bold mt-0.5 ${
            isHoliday ? 'text-white' : 'text-villa-blue-dark'
          }`}
        >
          {dayHeaderLabel}
        </span>
      )}
      {isHoliday ? (
        <span className="text-[10px] font-extrabold uppercase tracking-wide mt-0.5 bg-red-700 text-white px-2 py-0.5 rounded-full shadow-2xs">
          Bloqueado
        </span>
      ) : (
        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide mt-0.5 truncate max-w-full">
          {currentHourSlotLabel}
        </span>
      )}
    </div>
  );

  const renderGradeHeaderCell = (grade: GradeEntity) => {
    const isT1 = grade.id === 'g-trans-1' || grade.fullName === 'Transición 1';
    const isT2 = grade.id === 'g-trans-2' || grade.fullName === 'Transición 2';
    const baseClassroom = !grade.defaultClassroomId
      ? 'Aula Base'
      : grade.defaultClassroomId.trim().toUpperCase() === 'AULA ROTA' ||
        grade.defaultClassroomId.trim().toUpperCase() === 'ROTA'
      ? 'Aula (ROTACIÓN)'
      : grade.defaultClassroomId;

    if (hasSupportPlanRooms) {
      const level = getGradeLevelKey(grade);
      const rawSupportRoom = SUPPORT_PLAN_GRADE_CLASSROOMS[level] || baseClassroom;
      const cleanSupportRoom = rawSupportRoom.trim();
      const supportClassroom = /^aula\b/i.test(cleanSupportRoom)
        ? cleanSupportRoom
        : `Aula ${cleanSupportRoom}`;

      return (
        <div
          key={grade.id}
          className="py-2.5 px-2 border-r border-b border-slate-300 sticky top-9 z-30 bg-[#b8cce4] backdrop-blur-xs shadow-2xs flex flex-col items-center justify-center text-center"
        >
          <span className="text-lg font-black text-slate-900 tracking-tight leading-tight">
            {grade.fullName}
          </span>
          <span className="text-[11px] text-slate-600 font-semibold mt-0.5 truncate block max-w-full">
            {supportClassroom}
          </span>
        </div>
      );
    }

    return (
      <div
        key={grade.id}
        className="py-2.5 px-2 border-r border-b border-slate-200 sticky top-0 z-30 bg-slate-100/95 backdrop-blur-xs shadow-2xs flex flex-col items-center justify-center text-center"
      >
        <span className="text-lg font-bold text-gray-900 tracking-tight leading-tight">
          {grade.fullName}
        </span>
        <span className="text-xs text-gray-500 font-medium mt-0.5 truncate block max-w-full">
          {isT1
            ? `${baseClassroom} • 07:00 - 12:00`
            : isT2
            ? `${baseClassroom} • 12:30 - 17:30`
            : baseClassroom}
        </span>
      </div>
    );
  };

  const renderGradeCell = (grade: GradeEntity, gradeIdx: number, p: MatrixPeriodConfig, isCurrentSlot: boolean) => {
    const block =
      timeBlocks.find((b) => b.gradeId === grade.id && b.period === p.period) || null;
    const pending = block
      ? pendingRequests.find((r) => r.teacher_id === block.teacherId) || null
      : null;
    const droppableId = createSlotDroppableId(grade, p.period);

    const hasAssignedSubject = Boolean(
      block &&
      block.status !== 'cancelled' &&
      (
        block.block_type === 'novelty' ||
        Boolean(block.motivo_novedad) ||
        (
          block.subject &&
          block.subject.trim() !== '' &&
          block.block_type !== 'exit' &&
          !block.subject.toUpperCase().includes('SALIDA') &&
          !block.subject.toUpperCase().includes('NO DISPONIBLE') &&
          !block.subject.toUpperCase().includes('SIN ASIGNACI')
        )
      )
    );
    const isSeniorHigh =
      grade.fullName.startsWith('10') ||
      grade.fullName.startsWith('11') ||
      grade.gradeLevel === '10°' ||
      grade.gradeLevel === '11°';
    const isBeyondJornada = shift === 'morning' && p.period >= 7 && p.period <= 11 && !isSeniorHigh;
    const isBlocked = !hasAssignedSubject && isBeyondJornada;
    const isThisBlockDragging = Boolean(draggedBlock && block && draggedBlock.id === block.id);

    return (
      <div
        key={grade.id}
        className={`p-1.5 border-r border-b transition-colors min-h-[135px] flex flex-col justify-stretch ${
          isCurrentSlot
            ? 'bg-yellow-50/80 border-b-amber-300/60 shadow-inner'
            : 'bg-white border-slate-200'
        }`}
      >
        <MatrixCell
          grade={grade}
          period={p.period}
          block={block}
          pending={pending}
          officialSubjects={officialSubjects}
          allTimeBlocks={timeBlocks}
          draggedBlock={draggedBlock}
          droppableId={droppableId}
          isThisBlockDragging={isThisBlockDragging}
          isBlocked={isBlocked}
          isHoliday={isHoliday}
          isSelected={Boolean(
            (selectedCellIds && (selectedCellIds.has(droppableId) || (block && selectedCellIds.has(block.id)))) ||
            (selectedCells && (selectedCells.includes(droppableId) || (block && selectedCells.includes(block.id))))
          )}
          gradeIndex={gradeIdx}
          periodIndex={periods.findIndex((item) => item.period === p.period)}
          onSelectSlot={onSelectSlot}
          onDrop={handleSlotDrop}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          updateGhostPosition={updateGhostPosition}
          onCellClick={onCellClick}
          onTrashClick={onTrashClick}
          onEmptyClick={onEmptyClick}
          onToggleSelect={onToggleSelect}
        />
      </div>
    );
  };

  return (
    <div className="w-full overflow-x-auto overflow-y-auto max-h-[calc(100vh-175px)] rounded-2xl border border-slate-200 bg-white shadow-xs touch-pan-x antialiased relative">
      {/* Dynamic Full-Width CSS Grid - Consumes 100% of 24" screens without dead margins */}
      <div
        ref={gridContainerRef}
        onDragOver={handleContainerDragOver}
        className="w-full min-w-full grid text-left border-collapse transition-transform origin-top-left relative"
        style={{
          gridTemplateColumns: isTransicion
            ? grades.map(() => '8.5rem minmax(140px, 1fr)').join(' ')
            : `8.5rem repeat(${grades.length}, minmax(110px, 1fr))`,
          transform: `scale(${zoomLevel / 100})`,
          transformOrigin: 'top left',
          width: zoomLevel < 100 ? `${(100 / (zoomLevel / 100))}%` : '100%',
        }}
      >
        {/* Previsualización Personalizada Flotante Compensada por Zoom (1 / zoomFactor) */}
        {isDragging && draggedBlock && (
          <div
            ref={floatingPreviewRef}
            className="pointer-events-none absolute z-50 transition-none shadow-2xl rounded-xl opacity-95 border-2 border-villa-blue-light ring-4 ring-villa-blue-light/30 bg-white"
            style={{
              width: dragDimensions.width || 120,
              height: dragDimensions.height || 125,
              left: 0,
              top: 0,
              transform: 'translate3d(-9999px, -9999px, 0)',
              willChange: 'transform',
            }}
          >
            <MatrixSlotCard
              timeBlock={draggedBlock}
              officialSubjects={officialSubjects}
            />
          </div>
        )}
        {/* ROW 0: SALONES GROUPED HEADER (Exclusivo Horario D Bachillerato) */}
        {hasSupportPlanRooms && (
          <React.Fragment key="salones-header-row">
            <div className="w-36 min-w-[8.5rem] max-w-[8.5rem] sticky top-0 left-0 z-40 h-9 bg-slate-700 text-white border-r border-b border-slate-500 font-extrabold text-xs flex items-center justify-center uppercase tracking-wider shadow-xs select-none">
              Aulas
            </div>
            {supportPlanRoomGroups.map((grp, idx) => (
              <div
                key={`salones-group-${grp.level}-${idx}`}
                style={{ gridColumn: `span ${grp.grades.length}` }}
                className="h-9 sticky top-0 z-30 border-r border-b border-slate-500 bg-[#7f7f7f] text-white font-extrabold text-sm sm:text-base flex items-center justify-center text-center shadow-xs select-none tracking-wide"
              >
                {grp.room}
              </div>
            ))}
          </React.Fragment>
        )}

        {/* ROW 1: HEADER (Corner Axis + Grade Headers) */}
        {isTransicion ? (
          grades.map((grade, idx) => (
            <React.Fragment key={`header-pair-${grade.id}`}>
              {renderCornerHeaderCell(idx === 0, grade.id)}
              {renderGradeHeaderCell(grade)}
            </React.Fragment>
          ))
        ) : (
          <>
            {renderCornerHeaderCell(true, 'main')}
            {grades.map((grade) => renderGradeHeaderCell(grade))}
          </>
        )}

        {/* PRE-JORNADA CONDITIONAL ROW (Atención a Padres: Primaria o Transición) */}
        {preJornada && (
          isTransicion ? (
            <React.Fragment key="pre-jornada-row-transicion">
              {grades.map((grade, idx) => {
                const isT2 = grade.id === 'g-trans-2' || grade.fullName === 'Transición 2';
                const slotTime = isT2 && preJornada.secondaryTime ? preJornada.secondaryTime : preJornada.time;
                const activeNow = isPeriodActive(slotTime);
                return (
                  <React.Fragment key={`pre-jornada-${grade.id}`}>
                    <div
                      className={`w-36 min-w-[8.5rem] max-w-[8.5rem] ${
                        idx === 0 ? 'sticky left-0 z-30' : ''
                      } border-r border-b shadow-xs flex flex-col justify-center items-center text-center p-2 transition-colors ${
                        activeNow
                          ? 'bg-amber-100 border-l-4 border-l-villa-magenta border-r-amber-400 border-b-amber-400 shadow-inner'
                          : 'bg-amber-50/90 border-r border-b border-amber-300'
                      }`}
                    >
                      <span className="text-sm font-semibold text-gray-900 tracking-tight whitespace-nowrap">
                        {slotTime.replace(' - ', ' a ')}
                      </span>
                      <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide mt-0.5">
                        Pre-Jornada
                      </span>
                      {activeNow && (
                        <span className="inline-flex items-center px-1.5 py-0.2 mt-1 rounded-full text-[9px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                          En curso
                        </span>
                      )}
                    </div>
                    <div
                      className={`border-r border-b min-h-[95px] flex flex-col items-center justify-center p-3 text-center select-none shadow-inner transition-colors ${
                        activeNow
                          ? 'bg-amber-100/90 border-amber-300'
                          : 'bg-amber-50/70 border-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Users className="w-5 h-5 text-amber-800" />
                        <span className="text-base sm:text-lg font-bold text-gray-900 tracking-wider uppercase">
                          {preJornada.label}
                        </span>
                        {activeNow && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                            En curso
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-amber-900/80 max-w-lg">
                        Franja institucional de excepción ({slotTime.replace(' - ', ' a ')}) • Sin asignación de clases ni sustituciones
                      </p>
                    </div>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ) : (
            <React.Fragment key="pre-jornada-row">
              {/* Sticky Left Time Column */}
              <div
                className={`w-36 min-w-[8.5rem] max-w-[8.5rem] sticky left-0 z-30 border-r border-b shadow-xs flex flex-col justify-center items-center text-center p-2 transition-colors ${
                  isPeriodActive(preJornada.time)
                    ? 'bg-amber-100 border-l-4 border-l-villa-magenta border-r-amber-400 border-b-amber-400 shadow-inner'
                    : 'bg-amber-50/90 border-r border-b border-amber-300'
                }`}
              >
                <span className="text-sm font-semibold text-gray-900 tracking-tight whitespace-nowrap">
                  {preJornada.time.replace(' - ', ' a ')}
                </span>
                <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide mt-0.5">
                  Pre-Jornada
                </span>
                {isPeriodActive(preJornada.time) && (
                  <span className="inline-flex items-center px-1.5 py-0.2 mt-1 rounded-full text-[9px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                    En curso
                  </span>
                )}
              </div>

              {/* Fused Transversal Cell Spanning Across All Columns */}
              <div
                style={{ gridColumn: `span ${grades.length}` }}
                className={`border-r border-b min-h-[95px] flex flex-col items-center justify-center p-3 text-center select-none shadow-inner transition-colors ${
                  isPeriodActive(preJornada.time)
                    ? 'bg-amber-100/90 border-amber-300'
                    : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Users className="w-5 h-5 text-amber-800" />
                  <span className="text-base sm:text-lg font-bold text-gray-900 tracking-wider uppercase">
                    {preJornada.label}
                  </span>
                  {isPeriodActive(preJornada.time) && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                      En curso
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-amber-900/80 max-w-lg">
                  {preJornada.description} • Sin asignación de clases ni sustituciones
                </p>
              </div>
            </React.Fragment>
          )
        )}

        {/* PERIODS 1, 2, 3 */}
        {firstHalf.map((p) => {
          if (isTransicion) {
            return (
              <React.Fragment key={p.period}>
                {grades.map((grade, gradeIdx) => {
                  const isT2 = grade.id === 'g-trans-2' || grade.fullName === 'Transición 2';
                  const slotTime = isT2 && p.secondaryTime ? p.secondaryTime : p.time;
                  const [startTime, endTime] = slotTime.split(' - ');
                  const isCurrent = isPeriodActive(slotTime);

                  return (
                    <React.Fragment key={`${p.period}-${grade.id}`}>
                      <div
                        className={`w-36 min-w-[8.5rem] max-w-[8.5rem] ${
                          gradeIdx === 0 ? 'sticky left-0 z-30' : ''
                        } border-r border-b shadow-xs flex flex-col justify-center items-center text-center p-2 transition-colors ${
                          isCurrent
                            ? 'bg-yellow-50 border-l-4 border-l-villa-magenta border-r-amber-300 border-b-amber-300 shadow-inner ring-1 ring-amber-300/40'
                            : 'bg-slate-100 border-gray-300'
                        }`}
                      >
                        <div className="text-base font-bold text-gray-900 leading-tight">
                          {p.ordinal}
                        </div>
                        <div className="text-sm font-medium text-gray-600 whitespace-nowrap mt-0.5">
                          de {startTime} a {endTime}
                        </div>
                        {isCurrent && (
                          <span className="inline-flex items-center px-1.5 py-0.2 mt-1 rounded-full text-[9px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                            En curso
                          </span>
                        )}
                      </div>
                      {renderGradeCell(grade, gradeIdx, p, isCurrent)}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          }

          const [startTime, endTime] = p.time.split(' - ');
          const isCurrent = isPeriodActive(p.time);

          return (
            <React.Fragment key={p.period}>
              {/* Sticky First Column: Period & Hour (z-30) */}
              <div
                className={`w-36 min-w-[8.5rem] max-w-[8.5rem] sticky left-0 z-30 border-r border-b shadow-xs flex flex-col justify-center items-center text-center p-2 transition-colors ${
                  isCurrent
                    ? 'bg-yellow-50 border-l-4 border-l-villa-magenta border-r-amber-300 border-b-amber-300 shadow-inner ring-1 ring-amber-300/40'
                    : p.isSupportPlan
                    ? 'bg-amber-50/90 border-amber-300'
                    : 'bg-slate-100 border-gray-300'
                }`}
              >
                <div
                  className={`${
                    p.isSupportPlan
                      ? 'text-xs font-extrabold text-amber-950'
                      : 'text-base font-bold text-gray-900'
                  } leading-tight`}
                >
                  {p.ordinal}
                </div>
                <div
                  className={`text-sm font-medium ${
                    p.isSupportPlan ? 'text-amber-900 font-semibold' : 'text-gray-600'
                  } whitespace-nowrap mt-0.5`}
                >
                  {isMorning && scheduleType === 'D' && !isMeetingDay
                    ? `${startTime.replace(/^0/, '')} - ${endTime.replace(/^0/, '')}`
                    : `de ${startTime} a ${endTime}`}
                </div>
                {isCurrent && (
                  <span className="inline-flex items-center px-1.5 py-0.2 mt-1 rounded-full text-[9px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                    En curso
                  </span>
                )}
              </div>

              {/* Droppable data cells for each grade OR Fused Transversal Row 1 on Meeting Day */}
              {isMeetingDay && isMorning && p.period === 1 ? (
                <div
                  style={{ gridColumn: `span ${grades.length}` }}
                  className={`border-r border-b min-h-[135px] flex flex-col items-center justify-center p-4 text-center select-none shadow-inner transition-colors ${
                    isCurrent
                      ? 'bg-amber-100/90 border-amber-300'
                      : 'bg-gray-200 border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Users className="w-5 h-5 text-gray-700" />
                    <span className="text-base sm:text-lg font-bold text-gray-900 tracking-wider uppercase">
                      ATENCIÓN A PADRES
                    </span>
                    {isCurrent && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                        En curso
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-gray-600 max-w-xl">
                    Franja institucional reservada para atención personalizada a padres de familia y acudientes (06:10 - 07:00) • Sin asignación de clases.
                  </p>
                </div>
              ) : (
                grades.map((grade, gradeIdx) => renderGradeCell(grade, gradeIdx, p, isCurrent))
              )}
            </React.Fragment>
          );
        })}

        {/* HORIZONTAL PEDAGOGICAL BREAK ROW (Receso Escolar) */}
        {isTransicion ? (
          grades.map((grade, idx) => {
            const isT2 = grade.id === 'g-trans-2' || grade.fullName === 'Transición 2';
            const gradeBreakTime = isT2 && secondaryBreakTime ? secondaryBreakTime : breakTime;
            const [gbStart, gbEnd] = gradeBreakTime.split(' - ');
            const activeBreak = isPeriodActive(gradeBreakTime);

            return (
              <React.Fragment key={`break-${grade.id}`}>
                <div
                  className={`w-36 min-w-[8.5rem] max-w-[8.5rem] ${
                    idx === 0 ? 'sticky left-0 z-30' : ''
                  } border-r border-b shadow-xs flex flex-col justify-center items-center text-center p-2 transition-colors ${
                    activeBreak
                      ? 'bg-amber-100 border-l-4 border-l-villa-magenta border-r-amber-400 border-b-amber-400 shadow-inner'
                      : 'bg-amber-100 border-r border-b border-amber-300'
                  }`}
                >
                  <div className="text-base font-bold text-amber-950 leading-tight">Receso</div>
                  <div className="text-sm font-medium text-amber-800 whitespace-nowrap mt-0.5">
                    de {gbStart} a {gbEnd}
                  </div>
                  {activeBreak && (
                    <span className="inline-flex items-center px-1.5 py-0.2 mt-1 rounded-full text-[9px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                      En curso
                    </span>
                  )}
                </div>
                <div
                  className={`py-2.5 px-4 border-r border-b-2 flex items-center justify-center text-xs font-semibold tracking-wide transition-colors ${
                    activeBreak
                      ? 'bg-yellow-100/90 border-amber-400 text-amber-950 shadow-inner font-bold'
                      : 'bg-amber-50/80 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-3">
                    <span className="w-8 h-px bg-amber-300"></span>
                    <span>{breakLabel}</span>
                    <span className="w-8 h-px bg-amber-300"></span>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        ) : (
          <>
            {/* Sticky Left Corner for Break */}
            <div
              className={`w-36 min-w-[8.5rem] max-w-[8.5rem] sticky left-0 z-30 border-r border-b shadow-xs flex flex-col justify-center items-center text-center p-2 transition-colors ${
                isBreakActive
                  ? 'bg-amber-100 border-l-4 border-l-villa-magenta border-r-amber-400 border-b-amber-400 shadow-inner'
                  : 'bg-amber-100 border-r border-b border-amber-300'
              }`}
            >
              <div className="text-base font-bold text-amber-950 leading-tight">
                {isMorning && scheduleType === 'D' && !isMeetingDay ? 'Descanso' : 'Receso'}
              </div>
              <div className="text-sm font-medium text-amber-800 whitespace-nowrap mt-0.5">
                {isMorning && scheduleType === 'D' && !isMeetingDay
                  ? `${breakStart.replace(/^0/, '')} - ${breakEnd.replace(/^0/, '')}`
                  : `de ${breakStart} a ${breakEnd}`}
              </div>
              {isBreakActive && (
                <span className="inline-flex items-center px-1.5 py-0.2 mt-1 rounded-full text-[9px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                  En curso
                </span>
              )}
            </div>

            {/* Break Description Spanning Across All Columns */}
            <div
              style={{ gridColumn: `span ${grades.length}` }}
              className={`py-2.5 px-4 border-b-2 flex items-center justify-center text-xs font-semibold tracking-wide transition-colors ${
                isBreakActive
                  ? 'bg-yellow-100/90 border-amber-400 text-amber-950 shadow-inner font-bold'
                  : 'bg-amber-50/80 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center justify-center space-x-3">
                <span className="w-12 h-px bg-amber-300"></span>
                <span>{breakLabel}</span>
                <span className="w-12 h-px bg-amber-300"></span>
              </div>
            </div>
          </>
        )}

        {/* PERIODS 4 ONWARDS (Up to 11 for Bachillerato, 5 for Primaria/Transición) */}
        {secondHalf.map((p) => {
          if (isTransicion) {
            return (
              <React.Fragment key={p.period}>
                {grades.map((grade, gradeIdx) => {
                  const isT2 = grade.id === 'g-trans-2' || grade.fullName === 'Transición 2';
                  const slotTime = isT2 && p.secondaryTime ? p.secondaryTime : p.time;
                  const [startTime, endTime] = slotTime.split(' - ');
                  const isCurrent = isPeriodActive(slotTime);

                  return (
                    <React.Fragment key={`${p.period}-${grade.id}`}>
                      <div
                        className={`w-36 min-w-[8.5rem] max-w-[8.5rem] ${
                          gradeIdx === 0 ? 'sticky left-0 z-30' : ''
                        } border-r border-b shadow-xs flex flex-col justify-center items-center text-center p-2 transition-colors ${
                          isCurrent
                            ? 'bg-yellow-50 border-l-4 border-l-villa-magenta border-r-amber-300 border-b-amber-300 shadow-inner ring-1 ring-amber-300/40'
                            : 'bg-slate-100 border-gray-300'
                        }`}
                      >
                        <div className="text-base font-bold text-gray-900 leading-tight">
                          {p.ordinal}
                        </div>
                        <div className="text-sm font-medium text-gray-600 whitespace-nowrap mt-0.5">
                          de {startTime} a {endTime}
                        </div>
                        {isCurrent && (
                          <span className="inline-flex items-center px-1.5 py-0.2 mt-1 rounded-full text-[9px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                            En curso
                          </span>
                        )}
                      </div>
                      {renderGradeCell(grade, gradeIdx, p, isCurrent)}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          }

          const [startTime, endTime] = p.time.split(' - ');
          const isCurrent = isPeriodActive(p.time);

          return (
            <React.Fragment key={p.period}>
              {/* Afternoon Transition Separator for Period 7 in Bachillerato */}
              {isMorning && p.period === 7 && (
                <>
                  <div className="w-36 min-w-[8.5rem] max-w-[8.5rem] sticky left-0 z-30 bg-slate-200 border-r border-b border-slate-300 shadow-xs flex flex-col justify-center items-center text-center p-2">
                    <div className="text-sm font-bold text-slate-900 leading-tight">
                      Tarde
                    </div>
                    <div className="text-xs font-medium text-slate-600 whitespace-nowrap mt-0.5">
                      12:40 - 17:10
                    </div>
                  </div>
                  <div
                    style={{ gridColumn: `span ${grades.length}` }}
                    className="py-2 px-4 bg-slate-100 border-b-2 border-slate-300 flex items-center justify-center text-xs font-semibold text-slate-700 tracking-wide select-none"
                  >
                    <div className="flex items-center justify-center space-x-3">
                      <span className="w-12 h-px bg-slate-300"></span>
                      <span className="uppercase tracking-wider text-[11px] font-bold text-slate-600">Salida general</span>
                      <span className="w-12 h-px bg-slate-300"></span>
                    </div>
                  </div>
                </>
              )}

              {/* Sticky First Column: Period & Hour (z-30) */}
              <div
                className={`w-36 min-w-[8.5rem] max-w-[8.5rem] sticky left-0 z-30 border-r border-b shadow-xs flex flex-col justify-center items-center text-center p-2 transition-colors ${
                  isCurrent
                    ? 'bg-yellow-50 border-l-4 border-l-villa-magenta border-r-amber-300 border-b-amber-300 shadow-inner ring-1 ring-amber-300/40'
                    : 'bg-slate-100 border-gray-300'
                }`}
              >
                <div className="text-base font-bold text-gray-900 leading-tight">
                  {p.ordinal}
                </div>
                <div className="text-sm font-medium text-gray-600 whitespace-nowrap mt-0.5">
                  {isMorning && scheduleType === 'D' && !isMeetingDay && p.period <= 6
                    ? `${startTime.replace(/^0/, '')} - ${endTime.replace(/^0/, '')}`
                    : `de ${startTime} a ${endTime}`}
                </div>
                {isCurrent && (
                  <span className="inline-flex items-center px-1.5 py-0.2 mt-1 rounded-full text-[9px] font-extrabold uppercase bg-villa-magenta text-white shadow-2xs animate-pulse">
                    En curso
                  </span>
                )}
              </div>

              {/* Droppable data cells for each grade */}
              {grades.map((grade, gradeIdx) => renderGradeCell(grade, gradeIdx, p, isCurrent))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
