import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Share2,
  X,
  Check,
  Copy,
  ExternalLink,
  Download,
  Eye,
  FileCode,
  Globe,
  CheckCircle2,
  Sparkles,
  Link2,
  Loader2,
  CloudUpload,
} from 'lucide-react';
import { TimeBlockEntity } from '../../../domain/entities/time-block.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import {
  generateStandaloneScheduleHtml,
  savePublicScheduleSnapshot,
  resolveEffectiveDayConfigs,
  DEFAULT_LOGO_BASE64,
} from '../../../domain/services/html-schedule-generator.service';
import {
  publishScheduleToCloud,
  shortenUrlExternal,
} from '../../../infrastructure/firebase/firebase-client';
import { copyToClipboard } from '../../utils/clipboard';

interface PublishScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  timeBlocks: TimeBlockEntity[];
  teachers: UserEntity[];
  academicPeriod?: string;
  academicWeek?: number;
}

export const PublishScheduleModal: React.FC<PublishScheduleModalProps> = ({
  isOpen,
  onClose,
  timeBlocks,
  teachers,
  academicPeriod = '3° Periodo',
  academicWeek = 8,
}) => {
  const navigate = useNavigate();
  const [isPublished, setIsPublished] = useState<boolean>(false);
  const [isPublishingCloud, setIsPublishingCloud] = useState<boolean>(false);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(() => {
    return localStorage.getItem('ievf_last_published_at') || null;
  });

  const baseOrigin = (window.location.origin || 'https://ais-dev-wwkbgo7t3yhqgrvh74ipk7-881148575307.us-east1.run.app').replace(/\/+$/, '');
  const cleanShortRouteUrl = `${baseOrigin}/h`;
  const [shortenedUrl, setShortenedUrl] = useState<string>(() => {
    const saved = localStorage.getItem('ievf_active_short_url');
    return saved && saved.startsWith('http') ? saved : cleanShortRouteUrl;
  });
  const [isShortening, setIsShortening] = useState<boolean>(false);

  const [copiedIframe, setCopiedIframe] = useState<boolean>(false);
  const [copiedShortUrl, setCopiedShortUrl] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [generatedHtml, setGeneratedHtml] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    setIsPublished(false);
    const logo = localStorage.getItem('ievf_logo_data_url') || DEFAULT_LOGO_BASE64;
    const currentDayConfigs = resolveEffectiveDayConfigs();
    const html = generateStandaloneScheduleHtml({
      timeBlocks,
      teachers,
      academicPeriod,
      academicWeek,
      logoDataUrl: logo,
      dayConfigs: currentDayConfigs,
    });
    setGeneratedHtml(html);

    let active = true;
    setIsShortening(true);
    shortenUrlExternal(cleanShortRouteUrl)
      .then((shortRes) => {
        const short = typeof shortRes === 'string' ? shortRes : shortRes?.shortUrl || cleanShortRouteUrl;
        if (active) {
          setShortenedUrl(short);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setIsShortening(false);
        }
      });

    return () => {
      active = false;
    };
    // Solo preparar previsualización al abrir el modal sin publicar automáticamente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePublishNow = async (): Promise<string> => {
    setIsPublishingCloud(true);
    const snapshot = savePublicScheduleSnapshot(timeBlocks, teachers, academicPeriod, academicWeek);
    let resolvedShort = shortenedUrl;
    try {
      const shortRes = await shortenUrlExternal(cleanShortRouteUrl);
      resolvedShort = typeof shortRes === 'string' ? shortRes : shortRes?.shortUrl || cleanShortRouteUrl;
      setShortenedUrl(resolvedShort);
      await publishScheduleToCloud(snapshot, resolvedShort, 'vf', true);
    } catch (err) {
      console.warn('[PublishScheduleModal] Error sincronizando con Firestore:', err);
    } finally {
      setIsPublishingCloud(false);
    }

    const timestampStr = new Date().toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    setLastPublishedAt(timestampStr);
    setIsPublished(true);
    return resolvedShort;
  };

  const handleDownloadHtmlFile = () => {
    const logo = localStorage.getItem('ievf_logo_data_url') || DEFAULT_LOGO_BASE64;
    const currentDayConfigs = resolveEffectiveDayConfigs();
    const html = generateStandaloneScheduleHtml({
      timeBlocks,
      teachers,
      academicPeriod,
      academicWeek,
      logoDataUrl: logo,
      dayConfigs: currentDayConfigs,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `horario_villa_flora_${academicPeriod.replace(/[^a-zA-Z0-9]/g, '_')}_sem${academicWeek}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenPublicViewer = () => {
    onClose();
    window.dispatchEvent(new Event('open_public_schedule_preview'));
  };

  const handleCopyIframeSnippet = async () => {
    const iframeSnippet = `<!-- Horario Institucional I.E. Villa Flora - Consulta Pública -->
<iframe 
  src="${shortenedUrl}"
  width="100%" 
  height="920" 
  frameborder="0" 
  style="border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);"
  title="Horario Oficial I.E. Villa Flora"
  allowfullscreen>
</iframe>`;

    const success = await copyToClipboard(iframeSnippet);
    if (success) {
      setCopiedIframe(true);
      setTimeout(() => setCopiedIframe(false), 2500);
    }
  };

  const handleCopyShortUrl = async () => {
    const urlToCopy = shortenedUrl || cleanShortRouteUrl;
    const success = await copyToClipboard(urlToCopy);
    if (success) {
      setCopiedShortUrl(true);
      setTimeout(() => setCopiedShortUrl(false), 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-950 via-indigo-900 to-sky-900 px-6 py-5 text-white flex items-center justify-between shrink-0 border-b-2 border-amber-500">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <FileCode className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Publicación en la Nube y Enlace Acortado</span>
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                  <Sparkles className="w-3 h-3 shrink-0" /> Sincronización en vivo
                </span>
              </h2>
              <p className="text-xs text-blue-200/80">
                Publica en tiempo real con ruta oculta y link acortado para el sitio web del colegio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {/* Tarjeta de Resumen */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                Periodo Oficial
              </span>
              <span className="text-sm font-bold text-slate-900">
                {academicPeriod}
              </span>
              <span className="text-[10px] text-slate-500 truncate">
                Semana académica {academicWeek} de 14
              </span>
            </div>
            <div className="flex flex-col border-l border-slate-200 pl-3">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                Docentes
              </span>
              <span className="text-sm font-bold text-blue-700">
                {teachers.length} profesores
              </span>
              <span className="text-[10px] text-slate-500">Plantilla activa</span>
            </div>
            <div className="flex flex-col border-l border-slate-200 pl-3">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                Franjas Horarias
              </span>
              <span className="text-sm font-bold text-emerald-700">
                {timeBlocks.length === 0 ? '0 asignaciones (Parrilla en blanco)' : `${timeBlocks.length} asignaciones`}
              </span>
              <span className="text-[10px] text-slate-500">
                {timeBlocks.length === 0 ? 'Estado: Parrilla en blanco' : 'Casillas 60/40 homologadas'}
              </span>
            </div>
          </div>

          {isPublished && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-900 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-[11px] font-bold">
                ¡Horario sincronizado en la nube! El link acortado ya refleja los últimos cambios en cualquier dispositivo.
              </span>
            </div>
          )}

          {/* Barra destacada de Acortador de Link con Ruta Oculta */}
          <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                <Link2 className="w-4 h-4 text-blue-600" />
                <span>Link Acortado Oficial (Oculta la ruta del enlace)</span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                Ruta enmascarada automáticamente
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div
                onClick={handleCopyShortUrl}
                title="Haz clic para copiar el enlace"
                className="flex-1 bg-white border border-blue-200 hover:border-blue-400 rounded-lg px-3 py-2 font-mono text-xs text-slate-800 flex items-center justify-between select-all cursor-pointer transition shadow-2xs"
              >
                {isShortening ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generando enlace corto...
                  </span>
                ) : (
                  <span className="font-bold text-blue-700 truncate">{shortenedUrl}</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleCopyShortUrl}
                disabled={isShortening}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-lg text-xs transition cursor-pointer shrink-0 shadow-xs"
              >
                {copiedShortUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>¡Link Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Link Corto</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-slate-600">
              Al abrir este enlace corto, el navegador oculta automáticamente la ruta interna para que nunca se vea <code className="bg-white px-1 py-0.5 rounded border border-slate-200">/public/schedule</code>.
            </p>
          </div>

          {/* Opciones de Publicación: Visor Web Público y Descarga HTML */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Opción 1: Visor Web de Consulta Pública */}
            <div className="p-4 bg-white border border-slate-200 hover:border-blue-400 rounded-xl transition shadow-xs flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-blue-700 font-bold text-xs mb-1">
                  <Globe className="w-4 h-4" />
                  <span>Vista Pública en Caliente</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Abre la página visual exactamente como la ven padres, estudiantes y docentes con filtros interactivos.
                </p>
              </div>
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenPublicViewer}
                  disabled={isPublishingCloud}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-[11px] transition cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Consulta Pública</span>
                </button>
              </div>
            </div>

            {/* Opción 2: Descarga Archivo HTML Autónomo */}
            <div className="p-4 bg-white border border-slate-200 hover:border-emerald-400 rounded-xl transition shadow-xs flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs mb-1">
                  <Download className="w-4 h-4" />
                  <span>Descargar Archivo HTML Único</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Genera el archivo <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">.html</code> autónomo con logo institucional y casillas 60/40 para respaldo offline.
                </p>
              </div>
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadHtmlFile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-[11px] transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar HTML</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(!isPreviewOpen)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[11px] transition cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isPreviewOpen ? 'Ocultar Previa' : 'Previsualizar'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Previsualización incrustada del HTML si se activa */}
          {isPreviewOpen && (
            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-inner bg-slate-100 animate-in fade-in">
              <div className="bg-slate-200 px-3 py-2 flex items-center justify-between text-[11px] font-semibold text-slate-700 border-b border-slate-300">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  Previsualización en tiempo real con escudo y casillas 60/40
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Renderizado fiel</span>
              </div>
              <iframe
                srcDoc={generatedHtml}
                title="Previsualización HTML"
                className="w-full h-80 border-none bg-white"
              />
            </div>
          )}

          {/* Código Iframe para el Sitio Web */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-indigo-600" />
                Código Iframe con Link Corto para el Sitio Web del Colegio
              </span>
              <button
                type="button"
                onClick={handleCopyIframeSnippet}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] transition cursor-pointer shadow-2xs"
              >
                {copiedIframe ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Iframe</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-2.5 bg-slate-900 text-slate-200 rounded-lg text-[10px] overflow-x-auto font-mono">
{`<iframe 
  src="${shortenedUrl}"
  width="100%" 
  height="920" 
  frameborder="0"
  allowfullscreen>
</iframe>`}
            </pre>
          </div>

          {lastPublishedAt && (
            <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
              <span>Última sincronización en la nube:</span>
              <span className="font-semibold text-slate-700 font-mono">{lastPublishedAt}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer"
          >
            Cerrar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePublishNow}
              disabled={isPublishingCloud}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-md hover:shadow-lg transition active:scale-95 cursor-pointer"
            >
              {isPublishingCloud ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CloudUpload className="w-4 h-4" />
              )}
              <span>{isPublishingCloud ? 'Sincronizando en la nube...' : 'Publicar y Sincronizar en la Nube'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
