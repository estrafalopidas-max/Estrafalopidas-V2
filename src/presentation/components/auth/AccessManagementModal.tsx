import React, { useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Trash2,
  X,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Mail,
  User,
  Lock,
  Unlock,
  AlertCircle,
  Crown,
} from 'lucide-react';
import { useAuth, PRIMARY_ADMIN_EMAIL } from '../../context/AuthContext';

interface AccessManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccessManagementModal: React.FC<AccessManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    user,
    isAdmin,
    requireAuth,
    editors,
    addEditor,
    toggleEditorActive,
    removeEditor,
    setRequireAuth,
  } = useAuth();

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'admin'>('editor');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleAddEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const res = await addEditor(newEmail, newName, newRole);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'No se pudo autorizar el correo.' });
      return;
    }

    setFeedback({
      type: 'ok',
      text: `Se autorizó a ${newEmail.trim().toLowerCase()} para editar la parrilla.`,
    });
    setNewEmail('');
    setNewName('');
    setNewRole('editor');
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="bg-gradient-to-r from-blue-950 via-indigo-900 to-sky-900 px-6 py-4 text-white flex items-center justify-between border-b-2 border-amber-400 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/20">
              <ShieldCheck className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Delegación de Edición y Accesos</span>
                <span className="text-[10px] font-semibold bg-amber-400/20 text-amber-200 border border-amber-300/30 px-2 py-0.5 rounded-full">
                  Control de Coordinación
                </span>
              </h2>
              <p className="text-xs text-blue-200/90">
                Autoriza o revoca a terceros para que editen la parrilla horaria
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {/* Estado de bloqueo de seguridad */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              {requireAuth ? (
                <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              ) : (
                <Unlock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold text-slate-900">
                  {requireAuth
                    ? 'Protección activa: Solo correos autorizados pueden editar'
                    : 'Acceso abierto temporalmente (Sin solicitud de login)'}
                </p>
                <p className="text-[11px] text-slate-500">
                  La Consulta Pública (<code className="font-mono">/h</code>) siempre permanece libre para padres, estudiantes y docentes.
                </p>
              </div>
            </div>

            {isAdmin && (
              <label className="inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={requireAuth}
                  onChange={(e) => void setRequireAuth(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all relative peer-checked:bg-blue-600" />
              </label>
            )}
          </div>

          {/* Cuenta Principal de Coordinación */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Cuenta Principal (Propietaria)
            </span>
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
                  <Crown className="w-4 h-4 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">
                    Coordinación Académica Principal
                  </p>
                  <p className="text-[11px] font-mono text-blue-700 truncate">
                    {PRIMARY_ADMIN_EMAIL}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">
                Admin Permanente
              </span>
            </div>
          </div>

          {/* Formulario para delegar a un tercero */}
          {isAdmin ? (
            <form
              onSubmit={handleAddEditor}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <span>Delegar edición a un tercero</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Correo electrónico (Google) *
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="tercero@gmail.com"
                      className="w-full h-9 pl-8 pr-3 rounded-lg bg-white border border-slate-300 focus:border-blue-600 text-xs text-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Nombre o Cargo
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ej. Secretaría / Apoyo"
                      className="w-full h-9 pl-8 pr-3 rounded-lg bg-white border border-slate-300 focus:border-blue-600 text-xs text-slate-900 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">Rol:</span>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'editor' | 'admin')}
                    className="h-8 px-2.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="editor">Editor Delegado (Edita parrilla y docentes)</option>
                    <option value="admin">Administrador (También gestiona accesos)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Autorizar Correo</span>
                </button>
              </div>

              {feedback && (
                <div
                  className={`p-2.5 rounded-lg flex items-center gap-2 text-[11px] font-semibold ${
                    feedback.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {feedback.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}
            </form>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
              Has ingresado como <strong>Editor Delegado</strong> ({user?.email}). Solo la cuenta de Coordinación Principal puede agregar o revocar correos.
            </div>
          )}

          {/* Lista de Terceros Delegados */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Terceros Delegados ({editors.length})
              </span>
              {editors.length > 0 && (
                <span className="text-[10px] text-slate-400">
                  Puedes pausar o revocar el permiso en cualquier momento
                </span>
              )}
            </div>

            {editors.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                No hay terceros delegados registrados. Solo Coordinación Principal tiene acceso de edición.
              </div>
            ) : (
              <div className="space-y-2">
                {editors.map((ed) => (
                  <div
                    key={ed.email}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                      ed.active
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-50 border-slate-200 opacity-70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 truncate">{ed.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ed.active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {ed.active ? 'Activo' : 'Pausado'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                          {ed.role === 'admin' ? 'Admin' : 'Editor'}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-600 truncate mt-0.5">
                        {ed.email} <span className="text-slate-400 font-sans">• Desde {ed.addedAt}</span>
                      </p>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void toggleEditorActive(ed.email)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                            ed.active
                              ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                          title={
                            ed.active
                              ? 'Pausar temporalmente el acceso de este usuario'
                              : 'Reactivar el acceso de este usuario'
                          }
                        >
                          {ed.active ? (
                            <>
                              <PauseCircle className="w-3.5 h-3.5" />
                              <span>Pausar</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-3.5 h-3.5" />
                              <span>Activar</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => void removeEditor(ed.email)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition cursor-pointer"
                          title="Revocar y eliminar correo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pie del Modal */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Sesión actual: <strong className="text-slate-800">{user?.email || PRIMARY_ADMIN_EMAIL}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
