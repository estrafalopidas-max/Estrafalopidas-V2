import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Loader2, ChevronDown, RotateCcw, Zap } from 'lucide-react';
import { UserEntity } from '../../../domain/entities/user.entity';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { ShiftType } from '../../../domain/entities/grade.entity';
import { isTeacherPresentAtSlot, getTeacherEntrySchedule } from '../../../domain/services/teacher-visual-identity.service';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface SidebarScheduleAgentProps {
  isSidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  selectedShift: ShiftType;
  academicPeriod: string;
  academicWeek: number;
  teachers: UserEntity[];
  getTimeBlocks: () => TimeBlockEntity[];
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'model',
  text: '¡Hola! Soy tu asistente experto en horarios (Decreto 1850). Aquí estoy para lo que necesites.',
};

const QUICK_PROMPTS = [
  '¿Quién tiene menos horas?',
  '¿Hay ausencias sin cubrir?',
];

export const SidebarScheduleAgent: React.FC<SidebarScheduleAgentProps> = ({
  isSidebarCollapsed,
  onExpandSidebar,
  selectedShift,
  academicPeriod,
  academicWeek,
  teachers,
  getTimeBlocks,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatMode, setChatMode] = useState<'general' | 'fast'>('general');
  const [isChatBodyExpanded, setIsChatBodyExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ievf_schedule_agent_open') === 'true';
    } catch {
      return false;
    }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateChatBodyExpanded = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setIsChatBodyExpanded((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem('ievf_schedule_agent_open', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isSidebarCollapsed && isChatBodyExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isSidebarCollapsed, isChatBodyExpanded]);

  const buildLiveScheduleContext = useCallback(() => {
    const allBlocks = getTimeBlocks() || [];
    const classBlocks = allBlocks.filter(
      (b) =>
        b.block_type === 'class' &&
        b.teacherName &&
        !b.teacherName.toUpperCase().includes('DESCANSO') &&
        !b.teacherName.toUpperCase().includes('SALIDA')
    );

    const hoursByTeacher = new Map<string, number>();
    classBlocks.forEach((b) => {
      const name = (b.teacherName || '').trim();
      if (!name) return;
      hoursByTeacher.set(name, (hoursByTeacher.get(name) || 0) + 1);
      if (b.teacherId) {
        hoursByTeacher.set(b.teacherId, (hoursByTeacher.get(b.teacherId) || 0) + 1);
      }
    });

    const teachersSummary = teachers.length > 0
      ? teachers.map((t) => ({
          name: t.displayName,
          level: t.academicLevel || 'general',
          subjects: t.subjects?.length ? t.subjects : t.allowedSubjects || [],
          weeklyAssignedHours: hoursByTeacher.get(t.id) || hoursByTeacher.get(t.displayName) || 0,
          maxWeeklyHours: !t.maxWeeklyHours || t.maxWeeklyHours === 22 || t.maxWeeklyHours === 25 ? 24 : t.maxWeeklyHours,
          entrySchedule: t.entrySchedule?.label || getTeacherEntrySchedule(t.id, t.displayName)?.label,
        }))
      : Array.from(hoursByTeacher.entries()).map(([name, count]) => ({
          name,
          level: 'general',
          subjects: [],
          weeklyAssignedHours: count,
          maxWeeklyHours: 24,
        }));

    const shiftBlocks = classBlocks.filter((b) => {
      if (selectedShift === 'transicion-1') {
        return (
          b.shift === 'transicion-1' ||
          b.gradeName?.toLowerCase().includes('transici') ||
          b.gradeId?.includes('trans')
        );
      }
      return b.shift === selectedShift && !b.gradeName?.toLowerCase().includes('transici');
    });

    const uncovered = shiftBlocks.filter((b) => b.status === 'absent');
    const uncoveredSlotsSummary =
      uncovered.length > 0
        ? uncovered
            .slice(0, 12)
            .map(
              (b) =>
                `• ${b.dayOfWeek.toUpperCase()} ${b.period}ª hora - Grado ${b.gradeName} (${b.subject}, titular: ${b.teacherName})`
            )
            .join('\n')
        : 'Sin ausencias pendientes por cubrir en la jornada seleccionada.';

    const allShiftTeacherNames = Array.from(
      new Set(shiftBlocks.map((b) => (b.teacherName || '').trim()).filter(Boolean))
    );

    const days: ('lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes')[] = [
      'lunes',
      'martes',
      'miercoles',
      'jueves',
      'viernes',
    ];
    const maxPeriod = selectedShift === 'morning' ? 6 : 5;
    const availabilityLines: string[] = [];

    for (const day of days) {
      const daySlots: string[] = [];
      for (let p = 1; p <= maxPeriod; p++) {
        const busyInSlot = new Set(
          shiftBlocks
            .filter((b) => b.dayOfWeek === day && b.period === p)
            .map((b) => (b.teacherName || '').trim())
        );
        const freeInSlot = allShiftTeacherNames.filter(
          (name) =>
            !busyInSlot.has(name) &&
            isTeacherPresentAtSlot(name, name, day, p, selectedShift).isPresent
        );
        if (freeInSlot.length > 0) {
          daySlots.push(`${p}ªh: [${freeInSlot.slice(0, 5).join(', ')}]`);
        }
      }
      if (daySlots.length > 0) {
        availabilityLines.push(`${day.toUpperCase()}: ${daySlots.join(' | ')}`);
      }
    }

    return {
      selectedShift,
      academicPeriod,
      academicWeek,
      teachersSummary: teachersSummary.slice(0, 45),
      uncoveredSlotsSummary,
      daySchedulesSummary: availabilityLines.join('\n'),
    };
  }, [getTimeBlocks, teachers, selectedShift, academicPeriod, academicWeek]);

  const sendMessage = async (textToSend?: string) => {
    const trimmed = (textToSend ?? input).trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const previousHistory = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.text }));

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!textToSend) setInput('');
    setIsLoading(true);

    try {
      const context = buildLiveScheduleContext();
      const response = await fetch('/api/schedule-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          mode: chatMode,
          history: previousHistory,
          context,
        }),
      });

      const data = await response.json().catch(() => null);
      const replyText =
        data?.reply ||
        'No pude procesar la consulta en este momento. Intenta preguntando por un día, hora o docente específico.';

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: replyText,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'model',
          text: 'Error de conexión al consultar el agente. Verifica tu red e inténtalo de nuevo.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (isSidebarCollapsed) {
    return (
      <div className="px-1.5 py-2 border-t border-slate-100 shrink-0 flex justify-center">
        <button
          type="button"
          onClick={() => {
            onExpandSidebar();
            updateChatBodyExpanded(true);
            setTimeout(() => inputRef.current?.focus(), 150);
          }}
          className="w-10 h-10 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
          title="Agente experto en asignación horaria"
          aria-label="Abrir agente experto en asignación horaria"
        >
          <Bot className="w-4 h-4 shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2 rounded-xl border border-slate-200 bg-slate-50/90 shadow-2xs flex flex-col overflow-hidden shrink-0">
      {/* Cabecera compacta del agente incrustado */}
      <div
        onClick={() => updateChatBodyExpanded((prev) => !prev)}
        className="px-2.5 py-2 bg-slate-900 text-white flex items-center justify-between cursor-pointer select-none"
        title={isChatBodyExpanded ? 'Minimizar chat del agente' : 'Desplegar chat del agente'}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
            <Bot className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold leading-none truncate">Agente de Horarios</p>
            <p className="text-[9px] text-slate-300 leading-tight truncate mt-0.5">Asistente experto</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setChatMode((prev) => (prev === 'general' ? 'fast' : 'general'));
            }}
            className={`p-1 rounded flex items-center justify-center transition-colors cursor-pointer ${
              chatMode === 'fast'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
            title={
              chatMode === 'fast'
                ? 'Modo rápido activo (Gemini Flash Lite). Clic para modo general.'
                : 'Modo general activo (Gemini Flash). Clic para respuestas rápidas.'
            }
            aria-label={chatMode === 'fast' ? 'Modo rápido activo' : 'Modo general activo'}
          >
            <Zap className="w-3 h-3" />
          </button>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMessages([INITIAL_MESSAGE]);
              }}
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Reiniciar conversación"
              aria-label="Reiniciar conversación"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <span className="p-0.5 text-slate-300">
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isChatBodyExpanded ? 'rotate-0' : 'rotate-180'
              }`}
            />
          </span>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isChatBodyExpanded
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden flex flex-col">
          {/* Historial de mensajes compacto */}
          <div className="p-2 space-y-1.5 max-h-44 overflow-y-auto text-[11px] leading-snug bg-white">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg px-2 py-1.5 whitespace-pre-line break-words ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white ml-3 font-medium'
                    : 'bg-slate-100 text-slate-800 mr-1 border border-slate-200/70'
                }`}
              >
                {msg.text}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 px-2 py-1">
                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                <span>Analizando parrilla...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Sugerencias rápidas cuando hay pocos mensajes */}
          {messages.length <= 2 && !isLoading && (
            <div className="px-2 py-1 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-1">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="text-[9.5px] font-medium bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 rounded-md px-1.5 py-0.5 transition-colors truncate max-w-full cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Barra de entrada */}
          <div className="p-1.5 bg-slate-50 border-t border-slate-200 flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Consultar disponibilidad..."
              disabled={isLoading}
              className="flex-1 min-w-0 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="w-6 h-6 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Enviar consulta"
              aria-label="Enviar consulta"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
