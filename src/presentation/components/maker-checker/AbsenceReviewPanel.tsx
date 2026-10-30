import React, { useState } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { AbsenceRequestEntity } from '../../../domain/entities/absence-request.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { setGlobalActiveDraggedBlock } from '../matrix/MatrixCell';
import { getTeacherExcelIdentity } from '../../../domain/services/teacher-normalization.service';
import { CustomSelectDropdown } from '../common/CustomSelectDropdown';
import {
  X,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  UserCheck,
  History,
  CheckCheck,
  GripVertical,
} from 'lucide-react';

interface AbsenceReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  requests: AbsenceRequestEntity[];
  teachers: UserEntity[];
  allBlocks: TimeBlockEntity[];
  onReview: (params: {
    requestId: string;
    decision: 'approved' | 'rejected';
    replacementTeacherId?: string | null;
    replacementTeacherName?: string | null;
    reviewNotes?: string;
  }) => Promise<void>;
}

export const AbsenceReviewPanel: React.FC<AbsenceReviewPanelProps> = ({
  isOpen,
  onClose,
  requests,
  teachers,
  onReview,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [selectedReplacementMap, setSelectedReplacementMap] = useState<Record<string, string>>({});
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const historyRequests = requests.filter((r) => r.status !== 'pending');

  const handleApprove = async (req: AbsenceRequestEntity, withReplacement: boolean) => {
    try {
      setProcessingId(req.id);
      const repId = withReplacement ? selectedReplacementMap[req.id] : null;
      const repTeacher = teachers.find((t) => t.id === repId);

      await onReview({
        requestId: req.id,
        decision: 'approved',
        replacementTeacherId: repId,
        replacementTeacherName: repTeacher ? repTeacher.displayName : null,
        reviewNotes: reviewNotesMap[req.id] || (withReplacement ? `Aprobado con reemplazo de ${repTeacher?.displayName}` : 'Aprobado sin cobertura'),
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (req: AbsenceRequestEntity) => {
    try {
      setProcessingId(req.id);
      await onReview({
        requestId: req.id,
        decision: 'rejected',
        reviewNotes: reviewNotesMap[req.id] || 'Rechazado por motivos operacionales de coordinación',
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs animate-in fade-in flex justify-end">
      <div className="w-full max-w-xl bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full text-slate-800">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
              <CheckCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Bandeja de Novedades y Reemplazos
              </h3>
              <p className="text-xs text-slate-500">
                Aprobación de ausencias docentes y actualización en cascada de time_blocks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 border-b border-slate-200 flex space-x-4 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`pb-2.5 text-xs font-bold transition flex items-center space-x-2 border-b-2 ${
              activeTab === 'pending'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pendientes por Revisar</span>
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold shadow-2xs">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 text-xs font-bold transition flex items-center space-x-2 border-b-2 ${
              activeTab === 'history'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Histórico ({historyRequests.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
          {activeTab === 'pending' ? (
            pendingRequests.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white shadow-xs">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                <h4 className="text-sm font-bold text-slate-800">Bandeja al día</h4>
                <p className="text-xs text-slate-500 mt-1">
                  No hay solicitudes de ausencia pendientes por revisar en la I.E. Villa Flora.
                </p>
              </div>
            ) : (
              <Droppable droppableId="novedades-drawer-tray" type="SLOT" isDropDisabled={true}>
                {(dropProvided) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className="space-y-4"
                  >
                    {pendingRequests.map((req, idx) => {
                      const repValue = selectedReplacementMap[req.id] || '';
                      const isProcessing = processingId === req.id;

                      return (
                        <Draggable key={req.id} draggableId={`novelty-${req.id}`} index={idx}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`bg-white border border-slate-200 rounded-3xl p-5 shadow-xs hover:border-slate-300 transition space-y-3.5 ${
                                dragSnapshot.isDragging ? 'shadow-2xl ring-2 ring-amber-500 scale-102 z-50' : ''
                              }`}
                            >
                              {/* Drag Handle Banner */}
                              <div
                                {...dragProvided.dragHandleProps}
                                draggable={true}
                                onDragStart={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const offsetX = e.clientX - rect.left;
                                  const offsetY = e.clientY - rect.top;
                                  e.dataTransfer.setData(
                                    'text/plain',
                                    JSON.stringify({
                                      item: { ...req, id: `novelty-${req.id}` },
                                      sourceId: `novelty-${req.id}`,
                                      isNovelty: true,
                                      noveltyId: req.id,
                                      offsetX,
                                      offsetY,
                                    })
                                  );
                                  setGlobalActiveDraggedBlock({
                                    id: `novelty-${req.id}`,
                                    block_type: 'class',
                                    dayOfWeek: 'lunes',
                                    period: 0,
                                    startTime: '',
                                    endTime: '',
                                    shift: 'morning',
                                    gradeId: '',
                                    gradeName: '',
                                    subject: req.reason || 'Novedad Docente',
                                    teacherId: req.replacement_teacher_id || req.teacher_id,
                                    teacherName: req.replacement_teacher_name || req.teacher_name || 'Docente',
                                    classroomId: '',
                                    classroomName: '',
                                    status: 'regular',
                                    updatedAt: new Date().toISOString(),
                                  });
                                  e.dataTransfer.effectAllowed = 'move';
                                  document.body.classList.add('is-dragging-matrix-slot');
                                  document.body.style.cursor = 'grabbing';
                                }}
                                onDragEnd={() => {
                                  setGlobalActiveDraggedBlock(null);
                                  document.body.classList.remove('is-dragging-matrix-slot');
                                  document.body.style.cursor = '';
                                }}
                                className="flex items-center justify-between bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 text-xs font-bold text-amber-900 cursor-grab active:cursor-grabbing hover:bg-amber-100 transition shadow-2xs"
                              >
                                <div className="flex items-center space-x-1.5">
                                  <GripVertical className="w-4 h-4 text-amber-700" />
                                  <span>Arrastrar a la cuadrícula de horarios</span>
                                </div>
                                <span className="text-[10px] font-mono font-extrabold uppercase bg-amber-200/80 px-1.5 py-0.5 rounded">
                                  DnD
                                </span>
                              </div>

                              {/* Top Docente Info */}
                              <div className="flex items-start justify-between">
                                <div className="flex items-center space-x-2.5">
                                  <div className="w-9 h-9 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 font-bold text-xs">
                                    <User className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-sm text-slate-900">
                                      {req.teacher_name || req.teacher_id}
                                    </h4>
                                    <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                                      <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                                      <span>Fecha Ausencia: {req.date}</span>
                                    </span>
                                  </div>
                                </div>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  Pendiente Aprobación
                                </span>
                              </div>

                    {/* Reason & Affected periods */}
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">Motivo declarado: </span>
                        <span className="text-slate-800 font-semibold">{req.reason}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        <span>Periodos afectados: </span>
                        <span className="font-mono text-brand-700 font-bold">
                          {req.affected_periods && req.affected_periods.length > 0
                            ? req.affected_periods.map((p) => `Hora ${p}`).join(', ')
                            : 'Jornada Completa'}
                        </span>
                      </div>
                    </div>

                    {/* Replacement Teacher Selector */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700 flex items-center">
                        <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                        Asignar Docente de Reemplazo (Opcional):
                      </label>
                      <CustomSelectDropdown
                        value={repValue}
                        onChange={(val) =>
                          setSelectedReplacementMap((prev) => ({ ...prev, [req.id]: val }))
                        }
                        defaultAllValue=""
                        size="md"
                        icon={<UserCheck className="w-3.5 h-3.5 text-[#0c4da2]" />}
                        title="Seleccionar docente de reemplazo"
                        options={[
                          { value: '', label: 'Sin reemplazo asignado (marcar ausente)' },
                          ...teachers
                            .filter((t) => t.id !== req.teacher_id)
                            .map((t) => {
                              const identity = getTeacherExcelIdentity(t.id, t.displayName);
                              const subLabel =
                                t.subjects?.join(', ') ||
                                t.assignedSubject ||
                                t.specialty?.join(', ') ||
                                'Docente';
                              return {
                                value: t.id,
                                label: `${t.displayName} (${subLabel})`,
                                colorHex: t.color_hex || t.color || identity.color_hex || '#007DC5',
                              };
                            }),
                        ]}
                      />
                    </div>

                    {/* Review Notes */}
                    <div>
                      <input
                        type="text"
                        placeholder="Nota de coordinación (opcional)..."
                        value={reviewNotesMap[req.id] || ''}
                        onChange={(e) =>
                          setReviewNotesMap((prev) => ({ ...prev, [req.id]: e.target.value }))
                        }
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-brand-500 shadow-2xs"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleReject(req)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-villa-magenta/40 text-villa-magenta hover:bg-villa-magenta/10 text-xs font-bold transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rechazar</span>
                      </button>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleApprove(req, false)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
                          title="Aprobar ausencia dejando el bloque marcado como ausente sin cubrir"
                        >
                          Aprobar sin Reemplazo
                        </button>
                        <button
                          type="button"
                          disabled={isProcessing || !repValue}
                          onClick={() => handleApprove(req, true)}
                          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                            repValue && !isProcessing
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Aprobar con Reemplazo</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </Draggable>
            );
          })}
          {dropProvided.placeholder}
        </div>
      )}
    </Droppable>
  )
          ) : (
            /* Historical Tab */
            historyRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-xs shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">{req.teacher_name || req.teacher_id}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      req.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px]">
                  <span>Fecha: {req.date} • Motivo: {req.reason}</span>
                </div>
                {req.reviewed_by && (
                  <div className="pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between font-medium">
                    <span>Revisado por: {req.reviewed_by}</span>
                    {req.replacement_teacher_name && (
                      <span className="text-emerald-700 font-bold">
                        Reemplazo: {req.replacement_teacher_name}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
