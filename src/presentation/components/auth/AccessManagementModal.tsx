import React, { useState, useRef, useEffect } from 'react';
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
  ChevronDown,
  Briefcase,
  KeyRound,
  Eye,
  EyeOff,
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
    updateEditorPassword,
    toggleEditorActive,
    removeEditor,
    setRequireAuth,
  } = useAuth();

  const visibleEditors = editors.filter(
    (ed) => ed.email.trim().toLowerCase() !== PRIMARY_ADMIN_EMAIL.toLowerCase()
  );

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState<'editor' | 'admin'>('editor');
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [editingEditorEmail, setEditingEditorEmail] = useState<string | null>(null);
  const [editorPwdInput, setEditorPwdInput] = useState('');

  useEffect(() => {
    if (!isRoleMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setIsRoleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRoleMenuOpen]);

  if (!isOpen) return null;

  const handleAddEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const res = await addEditor(
      newEmail,
      newName,
      newRole,
      newPosition,
      newPassword
    );
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'No se pudo registrar el usuario.' });
      return;
    }

    setFeedback({
      type: 'ok',
      text: `Usuario ${newEmail.trim().toLowerCase()} creado con contraseña asignada.`,
    });
    setNewEmail('');
    setNewName('');
    setNewPosition('');
    setNewPassword('');
    setNewRole('editor');
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleSaveEditorPassword = async (email: string) => {
    const res = await updateEditorPassword(email, editorPwdInput);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'No se pudo actualizar la contraseña.' });
      return;
    }
    setEditingEditorEmail(null);
    setEditorPwdInput('');
    setFeedback({
      type: 'ok',
      text: `Contraseña de ${email} actualizada correctamente.`,
    });
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
                <span>Control de accesos</span>
              </h2>
              <p className="text-xs text-blue-200/90">
                Registro y control de usuarios
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
                    ? 'Protección activa: Solo usuarios registrados pueden editar'
                    : 'Acceso abierto temporalmente (Sin solicitud de login)'}
                </p>
                <p className="text-[11px] text-slate-500">
                  La consulta pública siempre permanece libre para toda la comunidad educativa
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

          {/* Formulario para crear usuario */}
          {isAdmin ? (
            <form
              onSubmit={handleAddEditor}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <span>Crear usuario</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Nombre y apellido
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ej. Laura Gómez"
                      className="w-full h-9 pl-8 pr-3 rounded-lg bg-white border border-slate-300 focus:border-blue-600 text-xs text-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Cargo
                  </label>
                  <div className="relative">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={newPosition}
                      onChange={(e) => setNewPosition(e.target.value)}
                      placeholder="Ej. Secretaría / Apoyo"
                      className="w-full h-9 pl-8 pr-3 rounded-lg bg-white border border-slate-300 focus:border-blue-600 text-xs text-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Usuario o correo electrónico *
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="usuario o correo@gmail.com"
                      className="w-full h-9 pl-8 pr-3 rounded-lg bg-white border border-slate-300 focus:border-blue-600 text-xs text-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Contraseña *
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Asignar contraseña"
                      className="w-full h-9 pl-8 pr-8 rounded-lg bg-white border border-slate-300 focus:border-blue-600 text-xs text-slate-900 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">Rol:</span>
                  <div ref={roleMenuRef} className="relative w-64 sm:w-72">
                    <button
                      type="button"
                      onClick={() => setIsRoleMenuOpen((prev) => !prev)}
                      className="h-9 w-full flex items-center justify-between gap-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 transition-all text-xs font-semibold cursor-pointer select-none shadow-2xs"
                    >
                      <span className="font-bold truncate">
                        {newRole === 'editor'
                          ? 'Editor (Edita parrilla y docentes)'
                          : 'Administrador (También gestiona accesos)'}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform duration-150 ${
                          isRoleMenuOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {isRoleMenuOpen && (
                      <div className="absolute left-0 mt-1.5 w-full bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 select-none">
                        <button
                          type="button"
                          onClick={() => {
                            setNewRole('editor');
                            setIsRoleMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors text-left"
                        >
                          <span
                            className={`text-xs font-semibold ${
                              newRole === 'editor' ? 'text-[#0c4da2] font-bold' : 'text-slate-700'
                            }`}
                          >
                            Editor (Edita parrilla y docentes)
                          </span>
                          {newRole === 'editor' && (
                            <span className="w-2 h-2 rounded-full bg-[#0c4da2] shrink-0" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewRole('admin');
                            setIsRoleMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors text-left"
                        >
                          <span
                            className={`text-xs font-semibold ${
                              newRole === 'admin' ? 'text-[#0c4da2] font-bold' : 'text-slate-700'
                            }`}
                          >
                            Administrador (También gestiona accesos)
                          </span>
                          {newRole === 'admin' && (
                            <span className="w-2 h-2 rounded-full bg-[#0c4da2] shrink-0" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Crear usuario</span>
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
              Has ingresado como <strong>Editor</strong> ({user?.email}). Solo Coordinación académica puede agregar o revocar usuarios.
            </div>
          )}

          {/* Lista de Usuarios Registrados */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Usuarios registrados ({visibleEditors.length})
              </span>
              {visibleEditors.length > 0 && (
                <span className="text-[10px] text-slate-400">
                  Puedes pausar, cambiar contraseña o revocar el permiso
                </span>
              )}
            </div>

            {visibleEditors.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                No hay usuarios registrados. Solo Coordinación académica puede editar.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleEditors.map((ed) => (
                  <div
                    key={ed.email}
                    className={`p-3 rounded-xl border space-y-2 transition ${
                      ed.active
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-50 border-slate-200 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 truncate">{ed.name}</span>
                          {ed.position && (
                            <span className="text-[11px] text-slate-500 font-medium truncate">
                              • {ed.position}
                            </span>
                          )}
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
                            onClick={() => {
                              if (editingEditorEmail === ed.email) {
                                setEditingEditorEmail(null);
                                setEditorPwdInput('');
                              } else {
                                setEditingEditorEmail(ed.email);
                                setEditorPwdInput(ed.password || '');
                              }
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 transition cursor-pointer"
                            title="Asignar o cambiar contraseña"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

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
                            title="Revocar y eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {editingEditorEmail === ed.email && isAdmin && (
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                        <input
                          type="text"
                          value={editorPwdInput}
                          onChange={(e) => setEditorPwdInput(e.target.value)}
                          placeholder="Nueva contraseña para este usuario"
                          className="flex-1 h-8 px-3 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveEditorPassword(ed.email)}
                          className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shrink-0"
                        >
                          Guardar clave
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pie */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
