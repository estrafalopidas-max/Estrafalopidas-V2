import React, { useState } from 'react';
import {
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
  Globe,
  ArrowRight,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_LOGO_BASE64 } from '../../../domain/services/html-schedule-generator.service';

export const CoordinatorAuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    isAuthorized,
    isLoading,
    loginWithCredentials,
    recoverAccountPassword,
  } = useAuth();
  const navigate = useNavigate();

  const [identifierInput, setIdentifierInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estado para recuperación de contraseña
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'verify' | 'reset'>('verify');
  const [newRecoveryPassword, setNewRecoveryPassword] = useState('');
  const [confirmRecoveryPassword, setConfirmRecoveryPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [recoveryFeedback, setRecoveryFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-3 text-slate-700 font-semibold text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Verificando credenciales...</span>
        </div>
      </div>
    );
  }

  if (isAuthorized) {
    return <>{children}</>;
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const res = await loginWithCredentials(identifierInput, passwordInput);
      if (!res.ok && res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryFeedback(null);
    setIsSubmitting(true);
    try {
      if (recoveryStep === 'verify') {
        const res = await recoverAccountPassword(recoveryIdentifier);
        if (!res.ok) {
          setRecoveryFeedback({
            type: 'err',
            text: res.error || 'No se pudo verificar la cuenta.',
          });
          return;
        }
        setRecoveryStep('reset');
        setRecoveryFeedback({
          type: 'ok',
          text: res.message || 'Cuenta verificada. Define tu nueva contraseña.',
        });
      } else {
        if (newRecoveryPassword.trim().length < 4) {
          setRecoveryFeedback({
            type: 'err',
            text: 'La nueva contraseña debe tener al menos 4 caracteres.',
          });
          return;
        }
        if (newRecoveryPassword.trim() !== confirmRecoveryPassword.trim()) {
          setRecoveryFeedback({
            type: 'err',
            text: 'Las contraseñas no coinciden.',
          });
          return;
        }
        const res = await recoverAccountPassword(
          recoveryIdentifier,
          newRecoveryPassword.trim()
        );
        if (!res.ok) {
          setRecoveryFeedback({
            type: 'err',
            text: res.error || 'No se pudo actualizar la contraseña.',
          });
          return;
        }
        setIdentifierInput(recoveryIdentifier.trim());
        setPasswordInput('');
        setIsRecoveryMode(false);
        setRecoveryStep('verify');
        setNewRecoveryPassword('');
        setConfirmRecoveryPassword('');
        setErrorMsg(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const logoSrc = '/assets/aistudio/logo_html_859fb25c.png';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabecera Institucional */}
        <div className="bg-gradient-to-r from-blue-950 via-indigo-900 to-sky-900 px-6 py-6 text-white border-b-4 border-amber-400 flex flex-col items-center text-center">
          <img
            src={logoSrc}
            alt="Escudo I.E. Villa Flora"
            className="h-16 sm:h-[72px] w-auto object-contain mb-3 select-none"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_BASE64;
            }}
          />
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white leading-tight">
            <span className="block">Sistema de Agendamiento Escolar</span>
            <span className="block text-sky-200 font-bold text-xs sm:text-sm mt-1">
              Horarios, actividades y jornadas académicas
            </span>
          </h1>
        </div>

        {/* Cuerpo del Login / Recuperación */}
        <div className="p-6 space-y-5">
          {!isRecoveryMode ? (
            <>
              {errorMsg && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-0.5">
                      <p className="font-bold text-red-800">No se pudo iniciar sesión</p>
                      <p className="text-red-700 leading-relaxed">{errorMsg}</p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    Usuario o correo electrónico
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={identifierInput}
                      onChange={(e) => setIdentifierInput(e.target.value)}
                      placeholder="usuario o correo@gmail.com"
                      className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 text-xs text-slate-900 font-medium outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRecoveryMode(true);
                        setRecoveryIdentifier(identifierInput);
                        setRecoveryStep('verify');
                        setRecoveryFeedback(null);
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-10 pl-10 pr-10 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 text-xs text-slate-900 font-medium outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      tabIndex={-1}
                      title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Iniciar sesión</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                  <span>Recuperar contraseña</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsRecoveryMode(false);
                    setRecoveryStep('verify');
                    setRecoveryFeedback(null);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver al ingreso</span>
                </button>
              </div>

              {recoveryFeedback && (
                <div
                  className={`p-3 rounded-xl flex items-start gap-2 text-xs ${
                    recoveryFeedback.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-red-50 text-red-900 border border-red-200'
                  }`}
                >
                  {recoveryFeedback.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <span>{recoveryFeedback.text}</span>
                </div>
              )}

              <form onSubmit={handleRecoverySubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    Usuario o correo electrónico registrado
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      disabled={recoveryStep === 'reset'}
                      value={recoveryIdentifier}
                      onChange={(e) => setRecoveryIdentifier(e.target.value)}
                      placeholder="usuario o correo@gmail.com"
                      className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-300 focus:border-blue-600 text-xs text-slate-900 font-medium outline-none disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {recoveryStep === 'reset' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                        Nueva contraseña
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          value={newRecoveryPassword}
                          onChange={(e) => setNewRecoveryPassword(e.target.value)}
                          placeholder="Mínimo 4 caracteres"
                          className="w-full h-10 pl-10 pr-10 rounded-xl border border-slate-300 focus:border-blue-600 text-xs text-slate-900 font-medium outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          tabIndex={-1}
                        >
                          {showNewPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                        Confirmar nueva contraseña
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          value={confirmRecoveryPassword}
                          onChange={(e) => setConfirmRecoveryPassword(e.target.value)}
                          placeholder="Repite la nueva contraseña"
                          className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-300 focus:border-blue-600 text-xs text-slate-900 font-medium outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>
                      {recoveryStep === 'verify'
                        ? 'Verificar cuenta'
                        : 'Guardar nueva contraseña'}
                    </span>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Pie: Ir a Consulta Pública sin login */}
          <div className="pt-3 border-t border-slate-100 flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              onClick={() => navigate('/h')}
              className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ir a Consulta Pública de Horarios (Sin contraseña)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
