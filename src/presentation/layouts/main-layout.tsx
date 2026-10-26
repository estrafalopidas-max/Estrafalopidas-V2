import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  Users,
  Bell,
  UserPlus,
  UserCog,
  AlertTriangle,
  Loader2,
  Sun,
  Moon,
  Sparkles,
  RotateCcw,
  Undo2,
  Camera,
  UploadCloud,
  AlertCircle,
  CheckCircle2,
  X,
  Trash2,
  Download,
  Share2,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { useCoordinatorMatrix } from '../context/CoordinatorMatrixContext';
import { useAuth } from '../context/AuthContext';
import { AccessManagementModal } from '../components/auth/AccessManagementModal';
import { TeacherFormModal } from '../components/teacher/TeacherFormModal';
import { TrashDropzone } from '../components/matrix/TrashDropzone';
import { UserEntity } from '../../domain/entities/user.entity';
import { TimeBlockEntity } from '../../domain/entities/time-block.entity';
import { FirestoreUserRepository } from '../../infrastructure/repositories/firestore-user.repository';
import { getCurrentWeekText, getOrdinalSuffix } from '../../domain/services/ChronologyEngine';
import { ensureSeedDataLoaded, generateSeedBlocks, SEED_TEACHERS, SEED_GRADES } from '../../infrastructure/seed/initial-seed';
import { savePublicScheduleSnapshot } from '../../domain/services/html-schedule-generator.service';
import { publishScheduleToCloud } from '../../infrastructure/firebase/firebase-client';
import { ResetConfirmationModal, SchoolYearResetMode } from '../components/common/ResetConfirmationModal';
import { generateAutomaticScheduleDistribution } from '../../domain/services/auto-schedule-distributor.service';
import { PublishScheduleModal } from '../components/export/PublishScheduleModal';
import { PublicSchedulePreviewModal } from '../components/export/PublicSchedulePreviewModal';
import { SidebarScheduleAgent } from '../components/agent/SidebarScheduleAgent';

export const MainLayout: React.FC = () => {
  const { user: authUser, editors, logout } = useAuth();
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const {
    selectedShift,
    setSelectedShift,
    pendingRequestsCount,
    kpiStats,
    statusFilter,
    setStatusFilter,
    activeTeachers,
    triggerReload,
    currentAcademicWeek,
    setCurrentAcademicWeek,
    currentPeriod: contextAcademicPeriod,
    setCurrentPeriod: setContextAcademicPeriod,
    teachers,
    isTeacherModalOpen,
    setIsTeacherModalOpen,
    selectedTeacherForEdit,
    setSelectedTeacherForEdit,
    openTeacherModal,
    canUndo,
    triggerUndo,
    currentSection: contextSection,
    isMatrixActive: contextIsMatrixActive,
  } = useCoordinatorMatrix();

  // Estado de colapso del menú lateral (solo íconos al cerrarse, manteniendo la cabecera fija)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ievf_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ievf_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Inyección de Dependencia de Ruta y Evaluación de Contexto Lógico (Route-Aware Controls)
  const location = useLocation();
  const currentSection = useMemo(() => {
    if (contextSection) return contextSection;
    if (location.pathname === '/' || location.pathname === '/coordinator/matrix') {
      return 'Inicio';
    }
    if (location.pathname.startsWith('/coordinator/assignments')) {
      return 'Horarios';
    }
    if (location.pathname.startsWith('/coordinator/novedades') || location.pathname.startsWith('/teacher/absences')) {
      return 'Novedades';
    }
    return 'Otro';
  }, [contextSection, location.pathname]);

  const isMatrixActive = typeof contextIsMatrixActive === 'boolean'
    ? contextIsMatrixActive
    : currentSection === 'Inicio';

  // Cronología Académica Oficial (Estrictamente de Solo Lectura)
  const { lunesFormat, viernesFormat, weekNumber, periodNumber, totalWeeksInPeriod, isRecess, recessName } = useMemo(
    () => getCurrentWeekText(new Date()),
    []
  );

  // Destrucción de Caché Visual (Busting) y Gestión Dinámica de Logo
  const [logoUrl, setLogoUrl] = useState<string>(() => {
    return localStorage.getItem('ievf_logo_url') || '/logo-institucional.png';
  });
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validación estricta en cliente (tamaño <= 2MB y formatos admitidos)
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];

    if (file.size > MAX_SIZE) {
      setUploadError('El archivo excede el tamaño máximo permitido de 2MB.');
      e.target.value = '';
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Formato inválido. Solo se admiten archivos PNG, JPEG y SVG.');
      e.target.value = '';
      return;
    }

    setIsUploadingLogo(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const response = await fetch('/api/upload-logo', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Error al procesar y guardar el logo en el servidor.');
      }

      // Destrucción de Caché Visual (Busting):
      const newTimestampUrl = `/logo-institucional.png?t=${Date.now()}`;
      setLogoUrl(newTimestampUrl);
      localStorage.setItem('ievf_logo_url', newTimestampUrl);

      // Respaldo en Data URL para renderizado local inmediato
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          localStorage.setItem('ievf_logo_data_url', reader.result);
        }
      };
      reader.readAsDataURL(file);

      setUploadSuccess('¡Logo institucional actualizado correctamente!');
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('[Upload-Logo Error]:', err);
      setUploadError(err.message || 'Error al actualizar el logo institucional.');
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  // Estado y disparador directo de Publicación en Consulta Pública / HTML Autónomo
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isPublicPreviewModalOpen, setIsPublicPreviewModalOpen] = useState(false);
  const [matrixRevision, setMatrixRevision] = useState(0);

  const getCurrentTimeBlocks = useCallback((): TimeBlockEntity[] => {
    try {
      if (localStorage.getItem('ievf_blank_matrix_mode') === '1') {
        return [];
      }
      const saved = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('[MainLayout] Error leyendo bloques de tiempo para publicación:', err);
    }
    ensureSeedDataLoaded();
    try {
      const fallback = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      return fallback ? JSON.parse(fallback) : [];
    } catch {
      return [];
    }
  }, []);

  const modalTimeBlocks = useMemo(() => {
    if (!isPublishModalOpen && !isPublicPreviewModalOpen) return [];
    return getCurrentTimeBlocks();
  }, [isPublishModalOpen, isPublicPreviewModalOpen, getCurrentTimeBlocks, matrixRevision]);

  useEffect(() => {
    const handleOpenPublicPreview = () => {
      setMatrixRevision((r) => r + 1);
      setIsPublicPreviewModalOpen(true);
    };
    const handleMatrixSync = () => {
      setMatrixRevision((r) => r + 1);
    };
    window.addEventListener('open_public_schedule_preview', handleOpenPublicPreview);
    window.addEventListener('schedule_matrix_updated', handleMatrixSync);
    window.addEventListener('storage', handleMatrixSync);
    return () => {
      window.removeEventListener('open_public_schedule_preview', handleOpenPublicPreview);
      window.removeEventListener('schedule_matrix_updated', handleMatrixSync);
      window.removeEventListener('storage', handleMatrixSync);
    };
  }, []);

  const handlePublishSchedule = () => {
    setIsPublishModalOpen(true);
  };

  // Estado para el modal de validación de intención positiva (Hard-Confirm Modal)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Ejecución protegida de Inicio de Año Escolar (3 opciones: 'blank' | 'auto' | 'template')
  const handleExecuteFactoryReset = useCallback(
    async (mode: SchoolYearResetMode = 'template') => {
      ensureSeedDataLoaded();

      // Obtener docentes y grados actuales registrados para conservarlos
      let currentTeachers: UserEntity[] = [];
      try {
        const usersRaw = localStorage.getItem('ievf_users_v1');
        if (usersRaw) {
          const parsedUsers: UserEntity[] = JSON.parse(usersRaw);
          currentTeachers = parsedUsers.filter((u) => !u.role || u.role === 'teacher');
        }
      } catch {
        // ignore
      }
      if (currentTeachers.length === 0) {
        currentTeachers = teachers.length > 0 ? teachers : SEED_TEACHERS;
      }

      let currentGrades = SEED_GRADES;
      try {
        const gradesRaw = localStorage.getItem('ievf_grades_v1');
        if (gradesRaw) {
          const parsedGrades = JSON.parse(gradesRaw);
          if (Array.isArray(parsedGrades) && parsedGrades.length > 0) {
            currentGrades = parsedGrades;
          }
        }
      } catch {
        // ignore
      }

      let targetBlocks: TimeBlockEntity[] = [];

      if (mode === 'blank') {
        // Opción 1: Reiniciar desde cero (Parrilla en blanco) conservando docentes y asignaturas
        localStorage.setItem('ievf_blank_matrix_mode', '1');
        localStorage.setItem('villaFloraMatrix', '[]');
        localStorage.setItem('ievf_time_blocks_v1', '[]');
        localStorage.setItem('ievf_absence_requests_v1', '[]');
        targetBlocks = [];
      } else if (mode === 'auto') {
        // Opción 2: Proponer distribución automática sin cruces ni choques de docentes
        localStorage.removeItem('ievf_blank_matrix_mode');
        targetBlocks = generateAutomaticScheduleDistribution(currentTeachers, currentGrades);
        localStorage.setItem('villaFloraMatrix', JSON.stringify(targetBlocks));
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(targetBlocks));
        localStorage.setItem('ievf_absence_requests_v1', '[]');
      } else {
        // Opción 3: Restaurar plantilla base institucional
        const lockedColorsBackup = localStorage.getItem('ievf_locked_teacher_colors_v1');
        const usersBackup = localStorage.getItem('ievf_users_v1');
        const subjectsBackup = localStorage.getItem('ievf_official_subjects_v1');
        localStorage.removeItem('ievf_blank_matrix_mode');
        if (lockedColorsBackup) {
          localStorage.setItem('ievf_locked_teacher_colors_v1', lockedColorsBackup);
        }
        if (usersBackup) {
          localStorage.setItem('ievf_users_v1', usersBackup);
        }
        if (subjectsBackup) {
          localStorage.setItem('ievf_official_subjects_v1', subjectsBackup);
        }
        targetBlocks = generateSeedBlocks();
        localStorage.setItem('ievf_baseline_2026_v1', JSON.stringify(targetBlocks));
        localStorage.setItem('villaFloraMatrix', JSON.stringify(targetBlocks));
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(targetBlocks));
      }

      // Notificar inmediatamente a los suscriptores locales antes de la escritura asíncrona en la nube
      const snapshot = savePublicScheduleSnapshot(
        targetBlocks,
        currentTeachers,
        contextAcademicPeriod || '3° Periodo',
        currentAcademicWeek || 8
      );
      window.dispatchEvent(new Event('schedule_matrix_updated'));
      window.dispatchEvent(new Event('public_schedule_snapshot_updated'));

      try {
        await publishScheduleToCloud(snapshot, undefined, 'vf', true);
      } catch (err) {
        console.warn('[SchoolYearInit] Error sincronizando con Firestore:', err);
      }

      setIsResetModalOpen(false);
    },
    [contextAcademicPeriod, currentAcademicWeek, teachers]
  );

  // Gestión de Instalación PWA (Zero-Privilege Native Simulation)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);

  useEffect(() => {
    // Verificar si la aplicación ya se ejecuta en modo standalone
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsAppInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) {
      alert('Para instalar la aplicación, haz clic en el icono "Instalar" que aparece a la derecha de la barra de direcciones de tu navegador (Chrome o Edge).');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    }
  };

  const formattedWeekSummary =
    isRecess && recessName
      ? `${recessName.replace(/\.$/, '')}.`
      : `Semana ${weekNumber} de ${totalWeeksInPeriod} semanas.`;

  return (
    <div className="min-h-screen bg-slate-50 text-villa-dark flex flex-col font-sans antialiased">
      {/* BARRA SUPERIOR UNIFICADA: Cabecera del menú lateral fija (abierto o cerrado) + Navbar principal */}
      <div className="sticky top-0 z-40 flex h-[96px] w-full bg-white border-b border-slate-200 shadow-2xs shrink-0">
        {/* Cabecera del menú lateral: Fija con el menú abierto o cerrado */}
        <div className="w-52 sm:w-56 h-full border-r border-slate-200 bg-slate-50 border-l-4 border-blue-600 px-3.5 py-1.5 flex flex-col justify-center shrink-0 select-none">
          {/* Nivel 1: Indicador de Periodo (Badge) */}
          <div className="flex items-center gap-1.5 leading-none">
            <svg className="w-5 h-5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[17px] font-medium text-blue-800 uppercase tracking-wide flex items-baseline">
              <span>
                {periodNumber}
                <span className="text-[0.68em] relative -top-[0.25em] ml-[1px] lowercase font-medium">
                  {getOrdinalSuffix(periodNumber)}
                </span>
              </span>
              <span className="ml-1">Periodo</span>
            </span>
          </div>

          {/* Nivel 2: Rango de Fechas a 2 Líneas con Mes Completo y punto final */}
          <h2 className="text-xs font-bold text-slate-900 leading-[1.2] mt-1">
            <span className="block truncate">Semana del {lunesFormat}</span>
            <span className="block truncate text-slate-800">al {viernesFormat}.</span>
          </h2>

          {/* Nivel 3: Conteo Académico con punto final */}
          <span
            className="text-[12.5px] font-semibold text-slate-500 block truncate leading-tight mt-0.5 tracking-tight"
            title={formattedWeekSummary}
          >
            {formattedWeekSummary}
          </span>
        </div>

        {/* Navbar Principal */}
        <header className="flex-1 h-full bg-white/95 backdrop-blur-xs px-4 sm:px-6 flex items-center justify-between min-w-0">
          {/* Left: Interactive Institutional Logo with Dynamic Upload & Cache Busting */}
          <div className="flex items-center gap-3">
            <div
              className="relative group cursor-pointer flex items-center"
              onClick={() => fileInputRef.current?.click()}
              title="Haga clic para actualizar el logo institucional"
            >
              <img
                src={logoUrl}
                alt="Logo Institucional"
                className="h-[90px] w-auto object-contain shrink-0 transition-opacity group-hover:opacity-85"
                onError={(e) => {
                  const fallback = localStorage.getItem('ievf_logo_data_url') || '/logo.png';
                  if ((e.currentTarget as HTMLImageElement).src !== fallback) {
                    (e.currentTarget as HTMLImageElement).src = fallback;
                  }
                }}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex flex-col items-center justify-center text-white text-[10px] font-bold p-1 select-none">
                {isUploadingLogo ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <>
                    <Camera className="w-4 h-4 mb-0.5 text-white" />
                    <span className="leading-tight">Cambiar</span>
                  </>
                )}
              </div>
            </div>

            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/svg+xml"
              className="hidden"
              onChange={handleLogoFileChange}
            />
          </div>

          {/* Right: Filtro de Grados y Botón de Recargar */}
          <div className="flex items-center gap-3">
            {/* 1. Filtro de Grados (Jornadas / Niveles) */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs h-10 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedShift('morning')}
                className={`h-full flex items-center space-x-1.5 px-3 rounded-lg text-xs transition-all ${
                  selectedShift === 'morning'
                    ? 'bg-slate-900 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-medium'
                }`}
                title="Jornada Bachillerato"
              >
                <Sun
                  className={`w-3.5 h-3.5 ${
                    selectedShift === 'morning' ? 'text-amber-400' : 'text-slate-500'
                  }`}
                />
                <span>Bachillerato</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedShift('afternoon')}
                className={`h-full flex items-center space-x-1.5 px-3 rounded-lg text-xs transition-all ${
                  selectedShift === 'afternoon'
                    ? 'bg-slate-900 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-medium'
                }`}
                title="Jornada Primaria (1° a 5°)"
              >
                <Moon
                  className={`w-3.5 h-3.5 ${
                    selectedShift === 'afternoon' ? 'text-sky-300' : 'text-slate-500'
                  }`}
                />
                <span>Primaria</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedShift('transicion-1')}
                className={`h-full flex items-center space-x-1.5 px-3 rounded-lg text-xs transition-all ${
                  selectedShift === 'transicion-1'
                    ? 'bg-slate-900 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-medium'
                }`}
                title="Jornada Transición (Transición 1: 07:00–12:00 / Transición 2: 12:30–17:30)"
              >
                <Sparkles
                  className={`w-3.5 h-3.5 ${
                    selectedShift === 'transicion-1' ? 'text-purple-400' : 'text-slate-500'
                  }`}
                />
                <span>Transición</span>
              </button>
            </div>

            {/* TrashDropzone Reactivo: Papelera / Registro de Novedades con Expansión Hitbox Bloqueable */}
            <TrashDropzone isMatrixActive={isMatrixActive} />

            {/* Botón visual de 'Deshacer' (Undo Action con flecha curva) */}
            <button
              type="button"
              onClick={triggerUndo}
              disabled={!isMatrixActive || !canUndo}
              className="w-10 h-10 rounded-full border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 flex items-center justify-center transition shadow-2xs hover:shadow-xs active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400/20 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:hover:bg-gray-100 disabled:text-gray-400 transition-all"
              title={
                !isMatrixActive
                  ? 'Desactivado fuera del lienzo de Parrilla académica'
                  : canUndo
                  ? 'Deshacer último cambio (Ctrl + Z)'
                  : 'Sin acciones previas para deshacer'
              }
              aria-label="Deshacer último cambio"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            {/* 2. Acción de Sistema: Botón de 'Recargar' (Sincronización segura sin pérdida de datos) */}
            <button
              type="button"
              onClick={triggerReload}
              disabled={!isMatrixActive}
              className="w-10 h-10 rounded-full border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 flex items-center justify-center transition shadow-2xs hover:shadow-xs active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400/20 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:hover:bg-gray-100 disabled:text-gray-400 transition-all"
              title={
                !isMatrixActive
                  ? 'Desactivado fuera del lienzo de Parrilla académica'
                  : 'Recargar y sincronizar horario (no borra los cambios locales)'
              }
              aria-label="Recargar y sincronizar horario"
            >
              <RotateCcw className="w-4 h-4 text-slate-600 hover:text-slate-900" />
            </button>

            {/* 3. Acción de Publicación: Botón 'Publicar parrilla' (Consulta Pública y HTML Autónomo) */}
            <button
              type="button"
              onClick={handlePublishSchedule}
              className="h-10 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5 transition shadow-2xs hover:shadow-xs active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 shrink-0 cursor-pointer"
              title="Publicar parrilla en Consulta Pública y descargar archivo HTML autónomo"
            >
              <Share2 className="w-4 h-4 text-white" />
              <span className="hidden sm:inline">Publicar parrilla</span>
            </button>
          </div>
        </header>
      </div>

      {/* CUERPO PRINCIPAL: Menú lateral colapsable (solo íconos al cerrarse) + Área de contenido */}
      <div className="flex-1 flex min-w-0">
        <aside
          className={`sticky top-[96px] h-[calc(100vh-96px)] bg-white border-r border-slate-200 flex flex-col z-30 shrink-0 select-none shadow-xs transition-all duration-200 ${
            isSidebarCollapsed ? 'w-16' : 'w-52 sm:w-56'
          }`}
        >
          {/* Botón de alternancia rápida dentro del cuerpo del menú lateral */}
          <div className="px-2 pt-2 pb-1 border-b border-slate-100 shrink-0">
            <button
              type="button"
              onClick={toggleSidebar}
              className={`w-full flex items-center rounded-xl py-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer ${
                isSidebarCollapsed ? 'justify-center px-0' : 'justify-between px-2.5'
              }`}
              title={isSidebarCollapsed ? 'Expandir menú lateral' : 'Ocultar menú lateral (solo íconos)'}
              aria-label={isSidebarCollapsed ? 'Expandir menú lateral' : 'Ocultar menú lateral'}
            >
              {!isSidebarCollapsed && (
                <span className="text-[11px] font-semibold tracking-tight truncate">Menú principal</span>
              )}
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 shrink-0" />
              ) : (
                <PanelLeftClose className="w-4 h-4 shrink-0" />
              )}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-2 space-y-1 overflow-y-auto min-h-0">
            {/* 1. Parrilla académica */}
            <NavLink
              to="/coordinator/matrix"
              title="Parrilla académica"
              className={({ isActive }) =>
                `flex items-center rounded-xl transition-all ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'px-2.5 py-2 space-x-2'
                } ${
                  isActive
                    ? 'bg-villa-blue-light text-white font-bold shadow-xs'
                    : 'text-villa-dark hover:bg-slate-100 hover:text-villa-blue-dark font-medium'
                }`
              }
            >
              <LayoutGrid className="shrink-0 w-4 h-4" />
              {!isSidebarCollapsed && (
                <span className="text-xs tracking-tight truncate">Parrilla académica</span>
              )}
            </NavLink>

            {/* 2. Plantilla docente */}
            <NavLink
              to="/coordinator/assignments"
              title="Plantilla docente"
              className={({ isActive }) =>
                `flex items-center rounded-xl transition-all ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'px-2.5 py-2 space-x-2'
                } ${
                  isActive
                    ? 'bg-villa-blue-light text-white font-bold shadow-xs'
                    : 'text-villa-dark hover:bg-slate-100 hover:text-villa-blue-dark font-medium'
                }`
              }
            >
              <Users className="shrink-0 w-4 h-4" />
              {!isSidebarCollapsed && (
                <span className="text-xs tracking-tight truncate">Plantilla docente</span>
              )}
            </NavLink>

            {/* 3. Novedades */}
            <NavLink
              to="/coordinator/novedades"
              title="Novedades"
              className={({ isActive }) =>
                `relative flex items-center rounded-xl transition-all ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'px-2.5 py-2 space-x-2'
                } ${
                  isActive
                    ? 'bg-villa-blue-light text-white font-bold shadow-xs'
                    : 'text-villa-dark hover:bg-slate-100 hover:text-villa-blue-dark font-medium'
                }`
              }
            >
              <Bell className="shrink-0 w-4 h-4" />
              {!isSidebarCollapsed && (
                <span className="text-xs tracking-tight truncate">Novedades</span>
              )}
              {pendingRequestsCount > 0 && (
                <span
                  className={
                    isSidebarCollapsed
                      ? 'absolute top-1 right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center'
                      : 'ml-auto px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[9px] font-bold'
                  }
                >
                  {pendingRequestsCount}
                </span>
              )}
            </NavLink>

            {/* 6. Previsualizar (Modal de Previsualización sobre la parrilla) */}
            <button
              type="button"
              onClick={() => setIsPublicPreviewModalOpen(true)}
              className={`w-full flex items-center rounded-xl transition-all cursor-pointer ${
                isSidebarCollapsed ? 'justify-center p-2.5' : 'px-2.5 py-2 space-x-2'
              } ${
                isPublicPreviewModalOpen
                  ? 'bg-villa-blue-light text-white font-bold shadow-xs'
                  : 'text-villa-dark hover:bg-slate-100 hover:text-villa-blue-dark font-medium'
              }`}
              title="Previsualizar"
            >
              <Globe
                className={`shrink-0 w-4 h-4 ${
                  isPublicPreviewModalOpen ? 'text-white' : 'text-emerald-600'
                }`}
              />
              {!isSidebarCollapsed && (
                <>
                  <span className="text-xs tracking-tight truncate">Previsualizar</span>
                  <span
                    className={`ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                      isPublicPreviewModalOpen
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    HTML
                  </span>
                </>
              )}
            </button>

            {/* 7. Delegar acceso y Gestión de Permisos */}
            <button
              type="button"
              onClick={() => setIsAccessModalOpen(true)}
              className={`w-full flex items-center rounded-xl transition-all cursor-pointer ${
                isSidebarCollapsed ? 'justify-center p-2.5' : 'px-2.5 py-2 space-x-2'
              } ${
                isAccessModalOpen
                  ? 'bg-villa-blue-light text-white font-bold shadow-xs'
                  : 'text-villa-dark hover:bg-slate-100 hover:text-villa-blue-dark font-medium'
              }`}
              title="Delegar acceso y gestionar permisos de edición"
            >
              <ShieldCheck
                className={`shrink-0 w-4 h-4 ${
                  isAccessModalOpen ? 'text-white' : 'text-blue-600'
                }`}
              />
              {!isSidebarCollapsed && (
                <>
                  <span className="text-xs tracking-tight truncate">Delegar acceso</span>
                  <span
                    className={`ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                      isAccessModalOpen
                        ? 'bg-white/20 text-white'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {editors.filter((e) => e.active).length > 0
                      ? `${editors.filter((e) => e.active).length} activo${
                          editors.filter((e) => e.active).length > 1 ? 's' : ''
                        }`
                      : 'Auth'}
                  </span>
                </>
              )}
            </button>
          </nav>

          {/* Agente Experto en Asignación Horaria incrustado en la parte inferior del menú */}
          <div className="mt-auto w-full shrink-0 flex flex-col">
            <SidebarScheduleAgent
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => {
                setIsSidebarCollapsed(false);
                try {
                  localStorage.setItem('ievf_sidebar_collapsed', 'false');
                } catch {
                  // ignore
                }
              }}
              selectedShift={selectedShift}
              academicPeriod={contextAcademicPeriod}
              academicWeek={currentAcademicWeek}
              teachers={teachers}
              getTimeBlocks={getCurrentTimeBlocks}
            />

            {/* Zona de Configuración Protegida: Inicio de Año Escolar y Sesión */}
            <div className={`border-t border-slate-100 w-full shrink-0 space-y-1.5 ${isSidebarCollapsed ? 'p-1.5' : 'px-3 py-2'}`}>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className={`group w-full flex items-center text-slate-600 bg-transparent hover:bg-amber-50 hover:text-amber-800 transition-colors rounded-md text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center py-2 px-0' : 'justify-start gap-2 py-1.5 px-3'
                }`}
                title="Inicio de año escolar: Reiniciar en blanco, proponer distribución automática o restaurar plantilla base"
                aria-label="Inicio de año escolar"
              >
                <RotateCcw className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Inicio de año escolar</span>}
              </button>

              {authUser && (
                <div
                  className={`flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 ${
                    isSidebarCollapsed ? 'p-1.5 justify-center' : 'px-2.5 py-1.5'
                  }`}
                >
                  {!isSidebarCollapsed && (
                    <div className="min-w-0 pr-1">
                      <p className="text-[10px] font-bold text-slate-800 truncate">
                        {authUser.role === 'admin' ? 'Coordinación' : 'Editor Delegado'}
                      </p>
                      <p className="text-[9px] text-slate-500 font-mono truncate" title={authUser.email}>
                        {authUser.email}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer shrink-0"
                    title={`Cerrar sesión (${authUser.email})`}
                    aria-label="Cerrar sesión"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Anclaje Inferior del Copyright */}
          {!isSidebarCollapsed && (
            <div className="p-4 text-[10px] text-gray-400 text-center border-t border-gray-200 shrink-0">
              <p className="leading-tight">
                © 2026 Desarrollado y diseñado por <span className="font-bold">Reakta Group</span>
              </p>
            </div>
          )}
        </aside>

        {/* Page Content */}
        <main className="flex-1 bg-slate-50 overflow-y-auto min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Modal de Registrar / Editar Docente */}
      <TeacherFormModal
        isOpen={isTeacherModalOpen}
        onClose={() => {
          setIsTeacherModalOpen(false);
          setSelectedTeacherForEdit(null);
        }}
        teacher={selectedTeacherForEdit}
        onSelectTeacher={(t) => setSelectedTeacherForEdit(t)}
        onSuccess={() => {
          setIsTeacherModalOpen(false);
          setSelectedTeacherForEdit(null);
        }}
      />


      {/* Toast de Alerta Visual para Carga de Logo (Manejo de Errores Estricto) */}
      {uploadError && (
        <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 bg-red-600 text-white px-4 py-3 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4 duration-200 max-w-md select-none">
          <AlertCircle className="w-5 h-5 shrink-0 text-white" />
          <span className="text-xs font-semibold">{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="ml-auto text-white/80 hover:text-white p-1 cursor-pointer"
            title="Cerrar notificación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadSuccess && (
        <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4 duration-200 max-w-md select-none">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-white" />
          <span className="text-xs font-semibold">{uploadSuccess}</span>
          <button
            type="button"
            onClick={() => setUploadSuccess(null)}
            className="ml-auto text-white/80 hover:text-white p-1 cursor-pointer"
            title="Cerrar notificación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal de Validación de Intención Positiva (Hard-Confirm Modal) para Factory Reset */}
      <ResetConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleExecuteFactoryReset}
      />

      {/* Modal de Publicación en Formato HTML Autónomo */}
      <PublishScheduleModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        timeBlocks={modalTimeBlocks}
        teachers={teachers}
        academicPeriod={contextAcademicPeriod}
        academicWeek={currentAcademicWeek}
      />

      {/* Modal de Previsualización de Consulta Pública HTML sobre la parrilla */}
      <PublicSchedulePreviewModal
        isOpen={isPublicPreviewModalOpen}
        onClose={() => setIsPublicPreviewModalOpen(false)}
        timeBlocks={modalTimeBlocks}
        teachers={teachers}
        academicPeriod={contextAcademicPeriod}
        academicWeek={currentAcademicWeek}
      />

      {/* Modal de Delegación de Edición y Accesos */}
      <AccessManagementModal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
      />
    </div>
  );
};
