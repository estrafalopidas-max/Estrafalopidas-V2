import React, { useState, useEffect } from 'react';
import { Bell, Plus, CheckCircle2, AlertTriangle, Calendar } from 'lucide-react';
import { FirestoreIncidenceRepository } from '../../../infrastructure/repositories/firestore-incidence.repository';
import { IncidenceEntity } from '../../../domain/entities/incidence.entity';
import { useCoordinatorMatrix } from '../../context/CoordinatorMatrixContext';
import { RegisterIncidenceModal } from '../../components/incidences/RegisterIncidenceModal';

export const CoordinatorIncidencesPage: React.FC = () => {
  const { teachers } = useCoordinatorMatrix();
  const [incidences, setIncidences] = useState<IncidenceEntity[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadIncidences = async () => {
    const repo = new FirestoreIncidenceRepository();
    const list = await repo.getAll();
    setIncidences(list);
  };

  useEffect(() => {
    loadIncidences();
  }, []);

  const handleCreateIncidence = async (data: Omit<IncidenceEntity, 'id'>) => {
    const repo = new FirestoreIncidenceRepository();
    await repo.create(data);
    await loadIncidences();
    setIsModalOpen(false);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            <span>Gestión de Novedades y Ausencias Docentes</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Control de incapacidades, permisos sindicales, comisiones y reemplazos en tiempo real
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Novedad</span>
        </button>
      </div>

      {incidences.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">Sin novedades activas registradas</h3>
          <p className="text-xs text-slate-500">
            Todas las sesiones académicas se encuentran operando con normalidad.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {incidences.map((inc) => (
            <div
              key={inc.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    {inc.type}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900">
                    {inc.title || inc.targetTeacherName || inc.target}
                  </h4>
                </div>
                <p className="text-xs text-slate-600">{inc.description || 'Novedad reportada'}</p>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    Desde: {inc.date} — Vigencia: {inc.expirationDate}
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Activa
              </span>
            </div>
          ))}
        </div>
      )}

      <RegisterIncidenceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        teachers={teachers}
        onSubmit={handleCreateIncidence}
      />
    </div>
  );
};
