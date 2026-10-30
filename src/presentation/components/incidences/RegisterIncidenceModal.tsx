import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  AlertTriangle,
  FileText,
  Clock,
  Info,
  Users,
  User,
  Calendar,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { IncidenceType, IncidenceEntity } from '../../../domain/entities/incidence.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import { getTeacherExcelIdentity } from '../../../domain/services/teacher-normalization.service';
import { CustomSelectDropdown } from '../common/CustomSelectDropdown';

interface RegisterIncidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  teachers: UserEntity[];
  onSubmit: (data: Omit<IncidenceEntity, 'id'>) => Promise<void>;
}

export const RegisterIncidenceModal: React.FC<RegisterIncidenceModalProps> = ({
  isOpen,
  onClose,
  teachers,
  onSubmit,
}) => {
  const getTodayString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDefaultExpiryString = () => {
    const now = new Date();
    now.setDate(now.getDate() + 7); // Default 7 days
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [type, setType] = useState<IncidenceType>('Aviso');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetType, setTargetType] = useState<'Todos' | 'Docente'>('Todos');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [date, setDate] = useState(getTodayString());
  const [expirationDate, setExpirationDate] = useState(getDefaultExpiryString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setType('Aviso');
      setTitle('');
      setDescription('');
      setTargetType('Todos');
      setSelectedTeacherId(teachers.length > 0 ? teachers[0].id : '');
      setDate(getTodayString());
      setExpirationDate(getDefaultExpiryString());
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, teachers]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('El título de la novedad es obligatorio.');
      return;
    }

    if (!description.trim()) {
      setError('La descripción detallada es obligatoria.');
      return;
    }

    if (!date) {
      setError('La fecha de emisión es obligatoria.');
      return;
    }

    if (!expirationDate) {
      setError('La fecha de vencimiento es obligatoria.');
      return;
    }

    if (expirationDate < date) {
      setError('La fecha de vencimiento no puede ser anterior a la fecha de emisión.');
      return;
    }

    let targetValue = 'Todos';
    let targetTeacherName: string | undefined = undefined;

    if (targetType === 'Docente') {
      const teacherObj = teachers.find((t) => t.id === selectedTeacherId);
      if (!teacherObj) {
        setError('Por favor selecciona un docente destinatario válido.');
        return;
      }
      targetValue = teacherObj.displayName;
      targetTeacherName = teacherObj.displayName;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        type,
        title: title.trim(),
        description: description.trim(),
        target: targetValue,
        targetTeacherId: targetType === 'Docente' ? selectedTeacherId : undefined,
        targetTeacherName,
        date,
        expirationDate,
        authorName: 'Coordinación Académica',
      });
      onClose();
    } catch (err: unknown) {
      console.error('Error al registrar novedad:', err);
      setError('Ocurrió un error al guardar la novedad. Por favor reintenta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeConfig: Record<
    IncidenceType,
    { label: string; desc: string; icon: React.ReactNode; colorClass: string; borderClass: string }
  > = {
    Aviso: {
      label: 'Aviso',
      desc: 'Comunicado informativo general o circular institucional.',
      icon: <Info className="w-4 h-4 text-blue-600" />,
      colorClass: 'bg-blue-50 text-blue-700',
      borderClass: 'border-blue-200 focus:border-blue-500',
    },
    Incapacidad: {
      label: 'Incapacidad',
      desc: 'Licencia o incapacidad médica certificada por EPS.',
      icon: <FileText className="w-4 h-4 text-purple-600" />,
      colorClass: 'bg-purple-50 text-purple-700',
      borderClass: 'border-purple-200 focus:border-purple-500',
    },
    Permiso: {
      label: 'Permiso',
      desc: 'Permiso sindical, calamidad o diligencia autorizada.',
      icon: <Clock className="w-4 h-4 text-amber-600" />,
      colorClass: 'bg-amber-50 text-amber-700',
      borderClass: 'border-amber-200 focus:border-amber-500',
    },
    Urgencia: {
      label: 'Urgencia',
      desc: 'Situación imprevista de atención prioritaria inmediata.',
      icon: <AlertTriangle className="w-4 h-4 text-red-600" />,
      colorClass: 'bg-red-50 text-red-700 font-bold',
      borderClass: 'border-red-200 focus:border-red-500',
    },
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Encabezado */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-900 text-white rounded-xl shadow-xs">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Registrar Novedad o Incidencia
              </h3>
              <p className="text-[11px] text-slate-500">
                Canal oficial unidireccional de Coordinación Académica hacia docentes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Selector de Tipo */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tipo de Incidencia / Comunicado
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['Aviso', 'Incapacidad', 'Permiso', 'Urgencia'] as IncidenceType[]).map((t) => {
                const config = typeConfig[t];
                const isSelected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition cursor-pointer select-none ${
                      isSelected
                        ? `${config.colorClass} border-slate-900 ring-1 ring-slate-900 font-bold shadow-2xs`
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="mb-1">{config.icon}</div>
                    <span className="text-xs">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Destinatario (Target) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Destinatario del Comunicado
            </label>
            <div className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="radio"
                  name="targetType"
                  value="Todos"
                  checked={targetType === 'Todos'}
                  onChange={() => setTargetType('Todos')}
                  className="text-slate-900 focus:ring-slate-900"
                />
                <Users className="w-3.5 h-3.5 text-slate-600" />
                <span>Todos los docentes (General)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="radio"
                  name="targetType"
                  value="Docente"
                  checked={targetType === 'Docente'}
                  onChange={() => setTargetType('Docente')}
                  className="text-slate-900 focus:ring-slate-900"
                />
                <User className="w-3.5 h-3.5 text-slate-600" />
                <span>Docente específico</span>
              </label>
            </div>

            {targetType === 'Docente' && (
              <div className="mt-2">
                <CustomSelectDropdown
                  value={selectedTeacherId}
                  onChange={(val) => setSelectedTeacherId(val)}
                  size="md"
                  icon={<User className="w-3.5 h-3.5 text-[#0c4da2]" />}
                  title="Seleccionar docente destinatario"
                  options={teachers.map((t) => {
                    const identity = getTeacherExcelIdentity(t.id, t.displayName);
                    return {
                      value: t.id,
                      label: `${t.displayName} ${t.documentId ? `(CC: ${t.documentId})` : ''} - ${
                        t.subjects?.[0] || 'Docente'
                      }`,
                      colorHex: t.color_hex || t.color || identity.color_hex || '#007DC5',
                    };
                  })}
                />
              </div>
            )}
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Título del Asunto o Incidencia
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Circular informativa: Cierre de periodo"
              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-slate-800 focus:border-slate-800 outline-none transition"
              maxLength={120}
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Descripción Detallada / Directrices
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Escribe el cuerpo del comunicado, indicaciones horarias o justificación de la novedad..."
              rows={3}
              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-slate-800 focus:border-slate-800 outline-none transition resize-none"
            />
          </div>

          {/* Fechas de Emisión y Expiración */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Fecha de Emisión
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-800 focus:ring-2 focus:ring-slate-800 focus:border-slate-800 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Fecha de Vencimiento (Auto-Purge)
              </label>
              <input
                type="date"
                value={expirationDate}
                min={date}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-800 focus:ring-2 focus:ring-slate-800 focus:border-slate-800 outline-none transition"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Tras esta fecha, se archivará automáticamente en Histórico.
              </span>
            </div>
          </div>

          {/* Pie de acciones */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 transition shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Guardando...' : 'Publicar Novedad'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
