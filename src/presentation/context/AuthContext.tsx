import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User,
} from 'firebase/auth';
import { Clock, LogOut, CheckCircle2 } from 'lucide-react';
import { auth } from '../../infrastructure/firebase/firebase-client';

export const PRIMARY_ADMIN_EMAIL = 'estrafalopidas@gmail.com';
export const DEFAULT_PRIMARY_ADMIN_PASSWORD = 'piloro666';
const ACCESS_CONTROL_STORAGE_KEY = 'ievf_access_control_v1';
const VERIFIED_SESSION_STORAGE_KEY = 'ievf_verified_editor_session_v1';

export interface AuthorizedEditor {
  email: string;
  username?: string;
  name: string;
  position?: string;
  password?: string;
  role: 'admin' | 'editor';
  addedAt: string;
  active: boolean;
}

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  role: 'admin' | 'editor';
  isHiddenRoot?: boolean;
}

interface StoredAccessControl {
  requireAuth: boolean;
  inactivityTimeoutMinutes: number;
  primaryAdminPassword?: string;
  editors: AuthorizedEditor[];
  updatedAtMs?: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  firebaseUser: User | null;
  unauthorizedEmail: string | null;
  isAuthorized: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  requireAuth: boolean;
  inactivityTimeoutMinutes: number;
  primaryAdminPassword: string;
  editors: AuthorizedEditor[];
  loginWithCredentials: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginWithAuthorizedEmail: (email: string) => { ok: boolean; error?: string };
  recoverAccountPassword: (identifier: string, newPassword?: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
  updatePrimaryAdminPassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  updateEditorPassword: (email: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  addEditor: (
    email: string,
    name: string,
    role?: 'admin' | 'editor',
    position?: string,
    password?: string,
    username?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  toggleEditorActive: (email: string) => Promise<void>;
  removeEditor: (email: string) => Promise<void>;
  setRequireAuth: (val: boolean) => Promise<void>;
  setInactivityTimeoutMinutes: (minutes: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadLocalAccessControl(): StoredAccessControl {
  try {
    const raw = localStorage.getItem(ACCESS_CONTROL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          requireAuth: typeof parsed.requireAuth === 'boolean' ? parsed.requireAuth : true,
          inactivityTimeoutMinutes:
            typeof parsed.inactivityTimeoutMinutes === 'number'
              ? parsed.inactivityTimeoutMinutes
              : 30,
          primaryAdminPassword:
            typeof parsed.primaryAdminPassword === 'string' &&
            parsed.primaryAdminPassword.trim() &&
            parsed.primaryAdminPassword.trim() !== 'VillaFlora2026*'
              ? parsed.primaryAdminPassword.trim()
              : DEFAULT_PRIMARY_ADMIN_PASSWORD,
          editors: Array.isArray(parsed.editors) ? parsed.editors : [],
          updatedAtMs: Number(parsed.updatedAtMs || 0),
        };
      }
    }
  } catch {
    // ignore
  }
  return {
    requireAuth: true,
    inactivityTimeoutMinutes: 30,
    primaryAdminPassword: DEFAULT_PRIMARY_ADMIN_PASSWORD,
    editors: [],
    updatedAtMs: 0,
  };
}

function saveLocalAccessControl(data: StoredAccessControl): void {
  try {
    localStorage.setItem(ACCESS_CONTROL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialConfig = loadLocalAccessControl();
  const [requireAuthState, setRequireAuthState] = useState<boolean>(initialConfig.requireAuth);
  const [inactivityTimeoutMinutes, setInactivityTimeoutMinutesState] = useState<number>(
    initialConfig.inactivityTimeoutMinutes
  );
  const [primaryAdminPassword, setPrimaryAdminPassword] = useState<string>(
    initialConfig.primaryAdminPassword || DEFAULT_PRIMARY_ADMIN_PASSWORD
  );
  const [editors, setEditors] = useState<AuthorizedEditor[]>(initialConfig.editors);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [manualSessionEmail, setManualSessionEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(VERIFIED_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [inactivityWarningSeconds, setInactivityWarningSeconds] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const syncWithServer = useCallback(async () => {
    try {
      const res = await fetch('/api/access-control');
      if (res.ok) {
        const serverData = await res.json();
        const localData = loadLocalAccessControl();
        const serverUpdated = Number(serverData?.updatedAtMs || 0);
        const localUpdated = Number(localData?.updatedAtMs || 0);

        if (serverUpdated >= localUpdated && Array.isArray(serverData.editors)) {
          const nextReq =
            typeof serverData.requireAuth === 'boolean' ? serverData.requireAuth : true;
          const nextInactivity =
            typeof serverData.inactivityTimeoutMinutes === 'number'
              ? serverData.inactivityTimeoutMinutes
              : localData.inactivityTimeoutMinutes ?? 30;
          const nextPrimaryPwd =
            typeof serverData.primaryAdminPassword === 'string' &&
            serverData.primaryAdminPassword.trim() &&
            serverData.primaryAdminPassword.trim() !== 'VillaFlora2026*'
              ? serverData.primaryAdminPassword.trim()
              : localData.primaryAdminPassword || DEFAULT_PRIMARY_ADMIN_PASSWORD;

          setRequireAuthState(nextReq);
          setInactivityTimeoutMinutesState(nextInactivity);
          setPrimaryAdminPassword(nextPrimaryPwd);
          setEditors(serverData.editors);
          saveLocalAccessControl({
            requireAuth: nextReq,
            inactivityTimeoutMinutes: nextInactivity,
            primaryAdminPassword: nextPrimaryPwd,
            editors: serverData.editors,
            updatedAtMs: serverUpdated,
          });
        } else if (localData.editors.length > 0 || localUpdated > serverUpdated) {
          await fetch('/api/access-control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localData),
          });
        }
      }
    } catch {
      // Continuar con configuración en localStorage
    }
  }, []);

  useEffect(() => {
    void syncWithServer();
  }, [syncWithServer]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const persistAccessControl = useCallback(
    async (
      nextRequireAuth: boolean,
      nextEditors: AuthorizedEditor[],
      nextPrimaryPwd: string = primaryAdminPassword,
      nextInactivityMinutes: number = inactivityTimeoutMinutes
    ) => {
      const updatedAtMs = Date.now();
      setRequireAuthState(nextRequireAuth);
      setInactivityTimeoutMinutesState(nextInactivityMinutes);
      setPrimaryAdminPassword(nextPrimaryPwd);
      setEditors(nextEditors);
      saveLocalAccessControl({
        requireAuth: nextRequireAuth,
        inactivityTimeoutMinutes: nextInactivityMinutes,
        primaryAdminPassword: nextPrimaryPwd,
        editors: nextEditors,
        updatedAtMs,
      });

      try {
        await fetch('/api/access-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requireAuth: nextRequireAuth,
            inactivityTimeoutMinutes: nextInactivityMinutes,
            primaryAdminPassword: nextPrimaryPwd,
            editors: nextEditors,
          }),
        });
      } catch {
        // Fallback local ya guardado
      }
    },
    [primaryAdminPassword, inactivityTimeoutMinutes]
  );

  const resolveAuthorizedUser = useCallback(
    (
      identifierRaw: string | null | undefined,
      displayName?: string | null,
      photoURL?: string | null,
      uid?: string
    ): AuthUser | null => {
      if (!identifierRaw) return null;
      const normalized = identifierRaw.trim().toLowerCase();
      const primaryPrefix = PRIMARY_ADMIN_EMAIL.split('@')[0].toLowerCase();

      if (
        normalized === PRIMARY_ADMIN_EMAIL.toLowerCase() ||
        normalized === primaryPrefix ||
        normalized === 'coordinacion' ||
        normalized === 'admin'
      ) {
        return {
          uid: uid || 'coord-primary',
          email: '',
          displayName: 'Coordinación académica',
          photoURL: null,
          role: 'admin',
          isHiddenRoot: true,
        };
      }

      const found = editors.find((e) => {
        if (!e.active) return false;
        const emailMatch = e.email.trim().toLowerCase() === normalized;
        const userMatch = e.username && e.username.trim().toLowerCase() === normalized;
        const prefixMatch = e.email.split('@')[0].toLowerCase() === normalized;
        return emailMatch || Boolean(userMatch) || prefixMatch;
      });

      if (found) {
        return {
          uid: uid || `editor-${found.email}`,
          email: found.email.toLowerCase(),
          displayName: displayName || found.name || found.email,
          photoURL: photoURL || null,
          role: found.role,
        };
      }

      return null;
    },
    [editors]
  );

  const activeUser: AuthUser | null = React.useMemo(() => {
    if (manualSessionEmail) {
      const resolved = resolveAuthorizedUser(manualSessionEmail);
      if (resolved) return resolved;
    }
    if (firebaseUser?.email) {
      const resolved = resolveAuthorizedUser(
        firebaseUser.email,
        firebaseUser.displayName,
        firebaseUser.photoURL,
        firebaseUser.uid
      );
      if (resolved) return resolved;
    }
    return null;
  }, [firebaseUser, manualSessionEmail, resolveAuthorizedUser]);

  useEffect(() => {
    if (firebaseUser?.email && !activeUser) {
      setUnauthorizedEmail(firebaseUser.email.toLowerCase());
    } else if (activeUser) {
      setUnauthorizedEmail(null);
    }
  }, [firebaseUser, activeUser]);

  const logout = useCallback(async () => {
    setManualSessionEmail(null);
    setUnauthorizedEmail(null);
    setInactivityWarningSeconds(null);
    try {
      localStorage.removeItem(VERIFIED_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  }, []);

  // Seguimiento de actividad e inactividad
  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setInactivityWarningSeconds((prev) => (prev !== null ? null : prev));
  }, []);

  useEffect(() => {
    if (!activeUser || !requireAuthState || inactivityTimeoutMinutes <= 0) {
      setInactivityWarningSeconds(null);
      return;
    }

    lastActivityRef.current = Date.now();

    const handleUserEvent = () => {
      // Si ya está mostrando la advertencia de últimos 60s, requerir clic explícito en el botón para mayor claridad,
      // o actualizar actividad si aún no está en ventana de advertencia
      const elapsedSec = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const totalSec = inactivityTimeoutMinutes * 60;
      if (totalSec - elapsedSec > 60) {
        lastActivityRef.current = Date.now();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, handleUserEvent, { passive: true }));

    const interval = window.setInterval(() => {
      const totalSec = inactivityTimeoutMinutes * 60;
      const elapsedSec = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remainingSec = totalSec - elapsedSec;

      if (remainingSec <= 0) {
        setInactivityWarningSeconds(null);
        void logout();
      } else if (remainingSec <= 60) {
        setInactivityWarningSeconds(remainingSec);
      } else {
        setInactivityWarningSeconds(null);
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserEvent));
      window.clearInterval(interval);
    };
  }, [activeUser, requireAuthState, inactivityTimeoutMinutes, logout]);

  const loginWithCredentials = useCallback(
    async (identifierInput: string, passwordInput: string): Promise<{ ok: boolean; error?: string }> => {
      setUnauthorizedEmail(null);
      const cleanId = identifierInput.trim().toLowerCase();
      const cleanPwd = passwordInput.trim();

      if (!cleanId) {
        return { ok: false, error: 'Ingresa tu usuario o correo electrónico.' };
      }
      if (!cleanPwd) {
        return { ok: false, error: 'Ingresa tu contraseña.' };
      }

      await syncWithServer();

      const primaryPrefix = PRIMARY_ADMIN_EMAIL.split('@')[0].toLowerCase();
      const isPrimaryUser =
        cleanId === PRIMARY_ADMIN_EMAIL.toLowerCase() ||
        cleanId === primaryPrefix ||
        cleanId === 'coordinacion' ||
        cleanId === 'admin';

      if (isPrimaryUser) {
        const expectedPwd = primaryAdminPassword || DEFAULT_PRIMARY_ADMIN_PASSWORD;
        if (cleanPwd !== expectedPwd) {
          return {
            ok: false,
            error: 'Contraseña incorrecta.',
          };
        }
        const emailToStore = PRIMARY_ADMIN_EMAIL.toLowerCase();
        lastActivityRef.current = Date.now();
        setManualSessionEmail(emailToStore);
        try {
          localStorage.setItem(VERIFIED_SESSION_STORAGE_KEY, emailToStore);
        } catch {
          // ignore
        }
        return { ok: true };
      }

      const found = editors.find((e) => {
        const emailMatch = e.email.trim().toLowerCase() === cleanId;
        const userMatch = e.username && e.username.trim().toLowerCase() === cleanId;
        const prefixMatch = e.email.split('@')[0].toLowerCase() === cleanId;
        return emailMatch || Boolean(userMatch) || prefixMatch;
      });

      if (!found) {
        return {
          ok: false,
          error: `El usuario "${identifierInput.trim()}" no se encuentra registrado.`,
        };
      }

      if (!found.active) {
        return {
          ok: false,
          error: 'Tu cuenta se encuentra pausada temporalmente por Coordinación académica.',
        };
      }

      const expectedEditorPwd = found.password?.trim() || 'VillaFlora2026*';
      if (cleanPwd !== expectedEditorPwd) {
        return {
          ok: false,
          error: 'La contraseña ingresada es incorrecta.',
        };
      }

      const emailToStore = found.email.trim().toLowerCase();
      lastActivityRef.current = Date.now();
      setManualSessionEmail(emailToStore);
      try {
        localStorage.setItem(VERIFIED_SESSION_STORAGE_KEY, emailToStore);
      } catch {
        // ignore
      }
      return { ok: true };
    },
    [editors, primaryAdminPassword, syncWithServer]
  );

  const loginWithAuthorizedEmail = useCallback(
    (emailInput: string): { ok: boolean; error?: string } => {
      const clean = emailInput.trim().toLowerCase();
      if (!clean) {
        return { ok: false, error: 'Ingresa un usuario o correo electrónico válido.' };
      }

      const resolved = resolveAuthorizedUser(clean);
      if (!resolved) {
        setUnauthorizedEmail(clean);
        return {
          ok: false,
          error: `El usuario "${clean}" no tiene permisos activos de edición.`,
        };
      }

      setUnauthorizedEmail(null);
      lastActivityRef.current = Date.now();
      const sessionKey = resolved.isHiddenRoot ? PRIMARY_ADMIN_EMAIL.toLowerCase() : resolved.email;
      setManualSessionEmail(sessionKey);
      try {
        localStorage.setItem(VERIFIED_SESSION_STORAGE_KEY, sessionKey);
      } catch {
        // ignore
      }
      return { ok: true };
    },
    [resolveAuthorizedUser]
  );

  const recoverAccountPassword = useCallback(
    async (
      identifierInput: string,
      newPasswordInput?: string
    ): Promise<{ ok: boolean; message?: string; error?: string }> => {
      const cleanId = identifierInput.trim().toLowerCase();
      if (!cleanId) {
        return { ok: false, error: 'Ingresa tu usuario o correo electrónico registrado.' };
      }

      await syncWithServer();

      const primaryPrefix = PRIMARY_ADMIN_EMAIL.split('@')[0].toLowerCase();
      const isPrimary =
        cleanId === PRIMARY_ADMIN_EMAIL.toLowerCase() ||
        cleanId === primaryPrefix ||
        cleanId === 'coordinacion' ||
        cleanId === 'admin';

      const foundEditor = editors.find((e) => {
        const emailMatch = e.email.trim().toLowerCase() === cleanId;
        const userMatch = e.username && e.username.trim().toLowerCase() === cleanId;
        const prefixMatch = e.email.split('@')[0].toLowerCase() === cleanId;
        return emailMatch || Boolean(userMatch) || prefixMatch;
      });

      if (!isPrimary && !foundEditor) {
        return {
          ok: false,
          error: 'No se encontró ninguna cuenta asociada a ese usuario o correo electrónico.',
        };
      }

      if (newPasswordInput && newPasswordInput.trim().length >= 4) {
        const cleanNewPwd = newPasswordInput.trim();
        if (isPrimary) {
          await persistAccessControl(requireAuthState, editors, cleanNewPwd, inactivityTimeoutMinutes);
          return {
            ok: true,
            message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.',
          };
        }

        if (foundEditor) {
          const updatedEditors = editors.map((e) =>
            e.email.toLowerCase() === foundEditor.email.toLowerCase()
              ? { ...e, password: cleanNewPwd }
              : e
          );
          await persistAccessControl(requireAuthState, updatedEditors, primaryAdminPassword, inactivityTimeoutMinutes);
          return {
            ok: true,
            message: `Contraseña actualizada correctamente para ${foundEditor.email}. Ya puedes iniciar sesión.`,
          };
        }
      }

      const targetEmail = isPrimary ? '' : foundEditor!.email;
      if (!isPrimary && targetEmail) {
        try {
          await sendPasswordResetEmail(auth, targetEmail);
        } catch {
          // Ignorar si el correo no existe en Firebase Auth externo
        }
      }

      return {
        ok: true,
        message: 'Cuenta verificada. Ingresa tu nueva contraseña para restablecer el acceso inmediatamente.',
      };
    },
    [editors, inactivityTimeoutMinutes, persistAccessControl, primaryAdminPassword, requireAuthState, syncWithServer]
  );

  const updatePrimaryAdminPassword = useCallback(
    async (newPasswordRaw: string): Promise<{ ok: boolean; error?: string }> => {
      const clean = newPasswordRaw.trim();
      if (clean.length < 4) {
        return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' };
      }
      await persistAccessControl(requireAuthState, editors, clean, inactivityTimeoutMinutes);
      return { ok: true };
    },
    [editors, inactivityTimeoutMinutes, persistAccessControl, requireAuthState]
  );

  const updateEditorPassword = useCallback(
    async (emailRaw: string, newPasswordRaw: string): Promise<{ ok: boolean; error?: string }> => {
      const email = emailRaw.trim().toLowerCase();
      const cleanPwd = newPasswordRaw.trim();
      if (cleanPwd.length < 4) {
        return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' };
      }
      const nextEditors = editors.map((e) =>
        e.email.toLowerCase() === email ? { ...e, password: cleanPwd } : e
      );
      await persistAccessControl(requireAuthState, nextEditors, primaryAdminPassword, inactivityTimeoutMinutes);
      return { ok: true };
    },
    [editors, inactivityTimeoutMinutes, persistAccessControl, primaryAdminPassword, requireAuthState]
  );

  const addEditor = useCallback(
    async (
      emailRaw: string,
      nameRaw: string,
      role: 'admin' | 'editor' = 'editor',
      positionRaw?: string,
      passwordRaw?: string,
      usernameRaw?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      const rawIdentifier = emailRaw.trim().toLowerCase();
      if (!rawIdentifier) {
        return { ok: false, error: 'Por favor ingresa un usuario o correo electrónico.' };
      }

      const email = rawIdentifier.includes('@')
        ? rawIdentifier
        : `${rawIdentifier}@villaflora.edu.co`;
      const username =
        usernameRaw?.trim().toLowerCase() || rawIdentifier.split('@')[0].toLowerCase();
      const name = nameRaw.trim() || username;
      const position = positionRaw?.trim() || undefined;
      const password = passwordRaw?.trim() || 'VillaFlora2026*';

      if (password.length < 4) {
        return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' };
      }

      if (email === PRIMARY_ADMIN_EMAIL.toLowerCase() || username === 'coordinacion') {
        return { ok: false, error: 'Este usuario no está disponible para registro.' };
      }

      const exists = editors.some(
        (e) =>
          e.email.toLowerCase() === email ||
          (e.username && e.username.toLowerCase() === username)
      );
      if (exists) {
        const updated = editors.map((e) =>
          e.email.toLowerCase() === email ||
          (e.username && e.username.toLowerCase() === username)
            ? { ...e, email, username, name, position, password, role, active: true }
            : e
        );
        await persistAccessControl(requireAuthState, updated, primaryAdminPassword, inactivityTimeoutMinutes);
        return { ok: true };
      }

      const newEntry: AuthorizedEditor = {
        email,
        username,
        name,
        ...(position ? { position } : {}),
        password,
        role,
        addedAt: new Date().toLocaleDateString('es-CO', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        active: true,
      };

      const nextEditors = [newEntry, ...editors];
      await persistAccessControl(requireAuthState, nextEditors, primaryAdminPassword, inactivityTimeoutMinutes);
      return { ok: true };
    },
    [editors, inactivityTimeoutMinutes, persistAccessControl, primaryAdminPassword, requireAuthState]
  );

  const toggleEditorActive = useCallback(
    async (emailRaw: string) => {
      const email = emailRaw.trim().toLowerCase();
      const nextEditors = editors.map((e) =>
        e.email.toLowerCase() === email ? { ...e, active: !e.active } : e
      );
      await persistAccessControl(requireAuthState, nextEditors, primaryAdminPassword, inactivityTimeoutMinutes);
    },
    [editors, inactivityTimeoutMinutes, persistAccessControl, primaryAdminPassword, requireAuthState]
  );

  const removeEditor = useCallback(
    async (emailRaw: string) => {
      const email = emailRaw.trim().toLowerCase();
      const nextEditors = editors.filter((e) => e.email.toLowerCase() !== email);
      await persistAccessControl(requireAuthState, nextEditors, primaryAdminPassword, inactivityTimeoutMinutes);
    },
    [editors, inactivityTimeoutMinutes, persistAccessControl, primaryAdminPassword, requireAuthState]
  );

  const setRequireAuth = useCallback(
    async (val: boolean) => {
      await persistAccessControl(val, editors, primaryAdminPassword, inactivityTimeoutMinutes);
    },
    [editors, inactivityTimeoutMinutes, persistAccessControl, primaryAdminPassword]
  );

  const setInactivityTimeoutMinutes = useCallback(
    async (minutes: number) => {
      lastActivityRef.current = Date.now();
      setInactivityWarningSeconds(null);
      await persistAccessControl(requireAuthState, editors, primaryAdminPassword, minutes);
    },
    [editors, persistAccessControl, primaryAdminPassword, requireAuthState]
  );

  const isAuthorized = Boolean(activeUser) || !requireAuthState;
  const isAdmin = !requireAuthState || activeUser?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user: activeUser,
        firebaseUser,
        unauthorizedEmail,
        isAuthorized,
        isAdmin,
        isLoading,
        requireAuth: requireAuthState,
        inactivityTimeoutMinutes,
        primaryAdminPassword,
        editors,
        loginWithCredentials,
        loginWithAuthorizedEmail,
        recoverAccountPassword,
        updatePrimaryAdminPassword,
        updateEditorPassword,
        logout,
        addEditor,
        toggleEditorActive,
        removeEditor,
        setRequireAuth,
        setInactivityTimeoutMinutes,
      }}
    >
      {children}

      {/* Modal de Aviso de Cierre por Inactividad */}
      {inactivityWarningSeconds !== null && activeUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3.5 text-white flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-white shrink-0" />
              <h3 className="text-sm font-bold">Cierre automático por inactividad</h3>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p className="leading-relaxed">
                No se ha detectado actividad reciente. Por seguridad, tu sesión se cerrará automáticamente en{' '}
                <span className="font-extrabold text-amber-700 text-sm">
                  {inactivityWarningSeconds}s
                </span>
                .
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Cerrar ahora</span>
                </button>
                <button
                  type="button"
                  onClick={registerActivity}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Continuar sesión</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe utilizarse dentro de un AuthProvider');
  }
  return ctx;
};
