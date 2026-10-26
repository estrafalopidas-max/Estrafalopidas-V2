import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth } from '../../infrastructure/firebase/firebase-client';

export const PRIMARY_ADMIN_EMAIL = 'estrafalopidas@gmail.com';
const ACCESS_CONTROL_STORAGE_KEY = 'ievf_access_control_v1';
const VERIFIED_SESSION_STORAGE_KEY = 'ievf_verified_editor_session_v1';

export interface AuthorizedEditor {
  email: string;
  name: string;
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
}

interface StoredAccessControl {
  requireAuth: boolean;
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
  editors: AuthorizedEditor[];
  loginWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  loginWithAuthorizedEmail: (email: string) => { ok: boolean; error?: string };
  logout: () => Promise<void>;
  addEditor: (email: string, name: string, role?: 'admin' | 'editor') => Promise<{ ok: boolean; error?: string }>;
  toggleEditorActive: (email: string) => Promise<void>;
  removeEditor: (email: string) => Promise<void>;
  setRequireAuth: (val: boolean) => Promise<void>;
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
          editors: Array.isArray(parsed.editors) ? parsed.editors : [],
          updatedAtMs: Number(parsed.updatedAtMs || 0),
        };
      }
    }
  } catch {
    // ignore
  }
  return { requireAuth: true, editors: [], updatedAtMs: 0 };
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

  const syncWithServer = useCallback(async () => {
    try {
      const res = await fetch('/api/access-control');
      if (res.ok) {
        const serverData = await res.json();
        const localData = loadLocalAccessControl();
        const serverUpdated = Number(serverData?.updatedAtMs || 0);
        const localUpdated = Number(localData?.updatedAtMs || 0);

        if (serverUpdated >= localUpdated && Array.isArray(serverData.editors)) {
          setRequireAuthState(
            typeof serverData.requireAuth === 'boolean' ? serverData.requireAuth : true
          );
          setEditors(serverData.editors);
          saveLocalAccessControl({
            requireAuth:
              typeof serverData.requireAuth === 'boolean' ? serverData.requireAuth : true,
            editors: serverData.editors,
            updatedAtMs: serverUpdated,
          });
        } else if (localData.editors.length > 0) {
          // Subir configuración local al servidor si es más reciente
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
    async (nextRequireAuth: boolean, nextEditors: AuthorizedEditor[]) => {
      const updatedAtMs = Date.now();
      setRequireAuthState(nextRequireAuth);
      setEditors(nextEditors);
      saveLocalAccessControl({
        requireAuth: nextRequireAuth,
        editors: nextEditors,
        updatedAtMs,
      });

      try {
        await fetch('/api/access-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requireAuth: nextRequireAuth,
            editors: nextEditors,
          }),
        });
      } catch {
        // Fallback local ya guardado
      }
    },
    []
  );

  const resolveAuthorizedUser = useCallback(
    (emailRaw: string | null | undefined, displayName?: string | null, photoURL?: string | null, uid?: string): AuthUser | null => {
      if (!emailRaw) return null;
      const normalized = emailRaw.trim().toLowerCase();

      if (normalized === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
        return {
          uid: uid || 'coord-primary',
          email: normalized,
          displayName: displayName || 'Coordinación Académica',
          photoURL: photoURL || null,
          role: 'admin',
        };
      }

      const found = editors.find(
        (e) => e.email.trim().toLowerCase() === normalized && e.active
      );
      if (found) {
        return {
          uid: uid || `editor-${normalized}`,
          email: normalized,
          displayName: displayName || found.name || normalized,
          photoURL: photoURL || null,
          role: found.role,
        };
      }

      return null;
    },
    [editors]
  );

  const activeUser: AuthUser | null = React.useMemo(() => {
    if (firebaseUser?.email) {
      const resolved = resolveAuthorizedUser(
        firebaseUser.email,
        firebaseUser.displayName,
        firebaseUser.photoURL,
        firebaseUser.uid
      );
      if (resolved) return resolved;
    }
    if (manualSessionEmail) {
      const resolved = resolveAuthorizedUser(manualSessionEmail);
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

  const loginWithGoogle = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setUnauthorizedEmail(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const email = result.user?.email?.trim().toLowerCase();

      await syncWithServer();

      if (!email) {
        return { ok: false, error: 'No se pudo obtener el correo electrónico de Google.' };
      }

      const resolved = resolveAuthorizedUser(
        email,
        result.user.displayName,
        result.user.photoURL,
        result.user.uid
      );

      if (!resolved) {
        setUnauthorizedEmail(email);
        return {
          ok: false,
          error: `El correo ${email} no está autorizado para editar la parrilla.`,
        };
      }

      try {
        localStorage.setItem(VERIFIED_SESSION_STORAGE_KEY, email);
        setManualSessionEmail(email);
      } catch {
        // ignore
      }
      return { ok: true };
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        return { ok: false, error: 'Se cerró la ventana de inicio de sesión antes de completar.' };
      }
      if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        return {
          ok: false,
          error: 'El navegador bloqueó la ventana emergente. Puedes ingresar tu correo autorizado directamente abajo.',
        };
      }
      return {
        ok: false,
        error: 'No se pudo abrir Google Auth en esta vista. Usa la verificación de correo autorizado abajo.',
      };
    }
  }, [resolveAuthorizedUser, syncWithServer]);

  const loginWithAuthorizedEmail = useCallback(
    (emailInput: string): { ok: boolean; error?: string } => {
      const clean = emailInput.trim().toLowerCase();
      if (!clean || !clean.includes('@')) {
        return { ok: false, error: 'Ingresa un correo electrónico válido.' };
      }

      const resolved = resolveAuthorizedUser(clean);
      if (!resolved) {
        setUnauthorizedEmail(clean);
        return {
          ok: false,
          error: `El correo "${clean}" no tiene permisos activos de edición. Solicita autorización a Coordinación (${PRIMARY_ADMIN_EMAIL}).`,
        };
      }

      setUnauthorizedEmail(null);
      setManualSessionEmail(clean);
      try {
        localStorage.setItem(VERIFIED_SESSION_STORAGE_KEY, clean);
      } catch {
        // ignore
      }
      return { ok: true };
    },
    [resolveAuthorizedUser]
  );

  const logout = useCallback(async () => {
    setManualSessionEmail(null);
    setUnauthorizedEmail(null);
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

  const addEditor = useCallback(
    async (
      emailRaw: string,
      nameRaw: string,
      role: 'admin' | 'editor' = 'editor'
    ): Promise<{ ok: boolean; error?: string }> => {
      const email = emailRaw.trim().toLowerCase();
      const name = nameRaw.trim() || email.split('@')[0];

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: 'Por favor ingresa un correo electrónico válido.' };
      }

      if (email === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
        return { ok: false, error: 'Este correo ya es la cuenta de Coordinación Principal.' };
      }

      const exists = editors.some((e) => e.email.toLowerCase() === email);
      if (exists) {
        const updated = editors.map((e) =>
          e.email.toLowerCase() === email ? { ...e, name, role, active: true } : e
        );
        await persistAccessControl(requireAuthState, updated);
        return { ok: true };
      }

      const newEntry: AuthorizedEditor = {
        email,
        name,
        role,
        addedAt: new Date().toLocaleDateString('es-CO', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        active: true,
      };

      const nextEditors = [newEntry, ...editors];
      await persistAccessControl(requireAuthState, nextEditors);
      return { ok: true };
    },
    [editors, persistAccessControl, requireAuthState]
  );

  const toggleEditorActive = useCallback(
    async (emailRaw: string) => {
      const email = emailRaw.trim().toLowerCase();
      const nextEditors = editors.map((e) =>
        e.email.toLowerCase() === email ? { ...e, active: !e.active } : e
      );
      await persistAccessControl(requireAuthState, nextEditors);
    },
    [editors, persistAccessControl, requireAuthState]
  );

  const removeEditor = useCallback(
    async (emailRaw: string) => {
      const email = emailRaw.trim().toLowerCase();
      const nextEditors = editors.filter((e) => e.email.toLowerCase() !== email);
      await persistAccessControl(requireAuthState, nextEditors);
    },
    [editors, persistAccessControl, requireAuthState]
  );

  const setRequireAuth = useCallback(
    async (val: boolean) => {
      await persistAccessControl(val, editors);
    },
    [editors, persistAccessControl]
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
        editors,
        loginWithGoogle,
        loginWithAuthorizedEmail,
        logout,
        addEditor,
        toggleEditorActive,
        removeEditor,
        setRequireAuth,
      }}
    >
      {children}
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
