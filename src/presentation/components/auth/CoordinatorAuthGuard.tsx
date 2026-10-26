import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, AlertCircle, Globe, LogOut, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, PRIMARY_ADMIN_EMAIL } from '../../context/AuthContext';
import { DEFAULT_LOGO_BASE64 } from '../../../domain/services/html-schedule-generator.service';

export const CoordinatorAuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    isAuthorized,
    isLoading,
    unauthorizedEmail,
    loginWithGoogle,
    loginWithAuthorizedEmail,
    logout,
  } = useAuth();
  const navigate = useNavigate();

  const [emailInput, setEmailInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmittingGoogle, setIsSubmittingGoogle] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-3 text-slate-700 font-semibold text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Verificando credenciales de edición...</span>
        </div>
      </div>
    );
  }

  if (isAuthorized) {
    return <>{children}</>;
  }

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsSubmittingGoogle(true);
    try {
      const res = await loginWithGoogle();
      if (!res.ok && res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setIsSubmittingGoogle(false);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const res = loginWithAuthorizedEmail(emailInput);
    if (!res.ok && res.error) {
      setErrorMsg(res.error);
    }
  };

  const logoSrc = localStorage.getItem('ievf_logo_url') || '/logo-institucional.png';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabecera Institucional */}
        <div className="bg-gradient-to-r from-blue-950 via-indigo-900 to-sky-900 px-6 py-6 text-white border-b-4 border-amber-400 flex flex-col items-center text-center">
          <div className="bg-white p-2.5 rounded-2xl shadow-md mb-3">
            <img
              src={logoSrc}
              alt="Escudo I.E. Villa Flora"
              className="h-14 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_BASE64;
              }}
            />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] font-bold uppercase tracking-wider mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
            <span>Editor de Horarios Protegido</span>
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-white">
            Coordinación Académica
          </h1>
          <p className="text-xs text-blue-200 mt-0.5">
            Acceso exclusivo para Coordinación y terceros delegados autorizados
          </p>
        </div>

        {/* Cuerpo del Login */}
        <div className="p-6 space-y-5">
          {(errorMsg || unauthorizedEmail) && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 space-y-2 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-red-800">Acceso restringido a la edición</p>
                  <p className="text-red-700 leading-relaxed">
                    {errorMsg ||
                      `La cuenta "${unauthorizedEmail}" no figura en la lista de correos delegados autorizados por Coordinación.`}
                  </p>
                </div>
              </div>
              {unauthorizedEmail && (
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      void logout();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 hover:text-red-900 underline cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Intentar con otra cuenta</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Opción 1: Google OAuth Popup */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmittingGoogle}
              className="w-full h-11 px-4 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-bold text-xs border-2 border-slate-200 hover:border-blue-400 shadow-xs flex items-center justify-center gap-3 transition cursor-pointer disabled:opacity-60"
            >
              {isSubmittingGoogle ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                  />
                </svg>
              )}
              <span>Iniciar sesión con cuenta de Google</span>
            </button>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="grow border-t border-slate-200" />
            <span className="shrink mx-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              o verificar correo autorizado
            </span>
            <div className="grow border-t border-slate-200" />
          </div>

          {/* Opción 2: Verificación directa de correo autorizado (útil si el navegador bloquea popups) */}
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Correo electrónico autorizado (Coordinación o Delegado)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="ejemplo@gmail.com"
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 text-xs text-slate-900 font-medium outline-none transition"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Validar y Entrar al Editor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

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
            <p className="text-[10px] text-slate-400">
              Administradora principal: <span className="font-mono text-slate-500">{PRIMARY_ADMIN_EMAIL}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
