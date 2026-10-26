import React, { useEffect, useMemo, useState } from 'react';
import { Globe, X, Download, Sparkles, Copy, Check } from 'lucide-react';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import {
  generateStandaloneScheduleHtml,
  savePublicScheduleSnapshot,
  DEFAULT_LOGO_BASE64,
} from '../../../domain/services/html-schedule-generator.service';
import {
  publishScheduleToCloud,
  buildInternalShortUrl,
} from '../../../infrastructure/firebase/firebase-client';
import { PublicScheduleViewerPage } from '../../pages/public/public-schedule-viewer.page';
import { copyToClipboard } from '../../utils/clipboard';

interface PublicSchedulePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  timeBlocks: TimeBlockEntity[];
  teachers: UserEntity[];
  academicPeriod?: string;
  academicWeek?: number;
}

export const PublicSchedulePreviewModal: React.FC<PublicSchedulePreviewModalProps> = ({
  isOpen,
  onClose,
  timeBlocks,
  teachers,
  academicPeriod = '3er Periodo',
  academicWeek = 9,
}) => {
  const [copiedOfficialUrl, setCopiedOfficialUrl] = useState(false);
  const officialUrl = useMemo(() => buildInternalShortUrl('vf'), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const snapshot = savePublicScheduleSnapshot(
      timeBlocks,
      teachers,
      academicPeriod,
      academicWeek
    );
    publishScheduleToCloud(snapshot, officialUrl, 'vf', false).catch(() => {});
    // Solo sincronizar al abrir el modal para evitar bucles de renderizado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyOfficialLink = async () => {
    const ok = await copyToClipboard(officialUrl);
    if (ok) {
      setCopiedOfficialUrl(true);
      setTimeout(() => setCopiedOfficialUrl(false), 2500);
    }
  };

  const handleDownloadHtml = () => {
    const logo = localStorage.getItem('ievf_logo_data_url') || DEFAULT_LOGO_BASE64;
    const snapshot = savePublicScheduleSnapshot(
      timeBlocks,
      teachers,
      academicPeriod,
      academicWeek
    );
    const generatedHtml = generateStandaloneScheduleHtml({
      timeBlocks,
      teachers,
      academicPeriod,
      academicWeek,
      logoDataUrl: logo,
      dayConfigs: snapshot.dayConfigs,
    });
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `horario_villa_flora_${academicPeriod.replace(/[^a-zA-Z0-9]/g, '_')}_sem${academicWeek}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[96vw] h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 px-4 sm:px-6 py-3 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-400/30 shrink-0">
              <Globe className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white truncate">
                  Consulta Pública Oficial
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                  <Sparkles className="w-3 h-3" /> Homologada con el enlace oficial
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate font-mono">
                {officialUrl}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyOfficialLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer shadow-xs"
              title="Copiar enlace único oficial"
            >
              {copiedOfficialUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="hidden sm:inline">¡Link copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Copiar link oficial</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer shadow-xs"
              title="Descargar archivo HTML autónomo"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Descargar HTML</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition cursor-pointer"
              title="Cerrar previsualización (Esc)"
            >
              <X className="w-4 h-4" />
              <span>Cerrar</span>
            </button>
          </div>
        </div>

        <div className="flex-1 w-full bg-slate-50 overflow-y-auto relative">
          <PublicScheduleViewerPage
            isEmbeddedModal
            liveTimeBlocks={timeBlocks}
            liveTeachers={teachers}
            liveAcademicPeriod={academicPeriod}
            liveAcademicWeek={academicWeek}
          />
        </div>
      </div>
    </div>
  );
};
