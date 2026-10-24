import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import {
  PublicScheduleSnapshot,
  PublicDayConfigs,
  resolveEffectiveDayConfigs,
} from '../../domain/services/html-schedule-generator.service';
import { resolveCanonicalGradeName, resolveCanonicalShift, normalizeTimeBlocksGrades } from '../../domain/services/grade-normalization.service';

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const QUOTA_BACKOFF_KEY = 'ievf_fb_quota_backoff_until';
const LAST_PUBLISHED_HASH_KEY = 'ievf_last_published_hash_v1';
const LOCAL_UPDATED_AT_KEY = 'ievf_local_schedule_updated_at';

function isQuotaExceededError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code || '';
  return (
    code === 'resource-exhausted' ||
    msg.includes('Quota exceeded') ||
    msg.includes('resource-exhausted')
  );
}

function isQuotaBackedOff(): boolean {
  try {
    const until = Number(
      localStorage.getItem(QUOTA_BACKOFF_KEY) || sessionStorage.getItem(QUOTA_BACKOFF_KEY) || '0'
    );
    return Date.now() < until;
  } catch {
    return false;
  }
}

function markQuotaBackedOff(): void {
  try {
    const untilStr = String(Date.now() + 15 * 60 * 1000);
    localStorage.setItem(QUOTA_BACKOFF_KEY, untilStr);
    sessionStorage.setItem(QUOTA_BACKOFF_KEY, untilStr);
  } catch {
    // ignore
  }
}

function computeSimpleHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

async function testConnection() {
  try {
    if (localStorage.getItem('ievf_fb_tested') === '1' || isQuotaBackedOff()) return;
    localStorage.setItem('ievf_fb_tested', '1');
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isQuotaExceededError(error)) {
      markQuotaBackedOff();
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

const SCHEDULE_COLLECTION = 'published_schedules';
const OFFICIAL_DOC_ID = 'official';
const LAST_FETCH_KEY = 'ievf_cloud_schedule_fetched_at';
const DAY_CONFIG_BLOCK_ID = '__ievf_day_configs__';
const FETCH_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos de caché para evitar lecturas repetidas al recargar

export interface CloudPublishedScheduleData extends PublicScheduleSnapshot {
  shortUrl?: string;
  shortCode?: string;
}

export function getPublicBaseUrl(): string {
  const custom = typeof window !== 'undefined' ? localStorage.getItem('ievf_custom_public_domain') : null;
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function buildInternalShortUrl(code: string = 'vf'): string {
  const base = getPublicBaseUrl();
  return `${base}/h`;
}

function isGenuineExternalShortUrl(candidate: string | null | undefined, longUrl: string): candidate is string {
  if (!candidate || typeof candidate !== 'string') return false;
  if (!candidate.startsWith('http')) return false;
  if (candidate === longUrl) return false;
  if (candidate.includes('.run.app') || candidate.includes('localhost')) return false;
  return true;
}

export async function shortenUrlExternal(longUrl?: string): Promise<{ shortUrl: string; directUrl: string }> {
  const directUrl = longUrl || buildInternalShortUrl('vf');
  const fallbackShortRoute = `${getPublicBaseUrl()}/h`;
  const cachedKey = `ievf_short_url_${directUrl}`;
  const cached = typeof window !== 'undefined' ? localStorage.getItem(cachedKey) : null;
  if (isGenuineExternalShortUrl(cached, directUrl)) {
    localStorage.setItem('ievf_active_short_url', cached);
    return { shortUrl: cached, directUrl };
  } else if (cached && typeof window !== 'undefined') {
    localStorage.removeItem(cachedKey);
  }

  try {
    const response = await fetch(
      `/api/shorten-url?url=${encodeURIComponent(directUrl)}`
    );
    if (response.ok) {
      const data = await response.json();
      if (isGenuineExternalShortUrl(data?.shorturl, directUrl)) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(cachedKey, data.shorturl);
          localStorage.setItem('ievf_active_short_url', data.shorturl);
        }
        return { shortUrl: data.shorturl, directUrl };
      }
    }
  } catch {
    // Fallback silencioso a la ruta corta institucional /h
  }

  return { shortUrl: fallbackShortRoute, directUrl };
}

export async function publishScheduleToCloud(
  snapshot: PublicScheduleSnapshot,
  shortUrl?: string,
  shortCode = 'vf',
  forceWrite = false
): Promise<void> {
  const nowMs = Date.now();
  const isBlankMatrix =
    Boolean(snapshot.metadata?.blankMatrixMode ?? snapshot.dayConfigs?.blankMatrixMode) ||
    snapshot.timeBlocks.filter((b) => b.id !== DAY_CONFIG_BLOCK_ID).length === 0;

  const effectiveDayConfigs = resolveEffectiveDayConfigs({
    ...snapshot.dayConfigs,
    blankMatrixMode: isBlankMatrix,
    updatedAtMs: nowMs,
  });

  const normalizedSnapshot: PublicScheduleSnapshot = {
    ...snapshot,
    timeBlocks: isBlankMatrix ? [] : snapshot.timeBlocks,
    dayConfigs: effectiveDayConfigs,
    metadata: {
      ...snapshot.metadata,
      totalBlocks: isBlankMatrix ? 0 : snapshot.timeBlocks.length,
      blankMatrixMode: isBlankMatrix,
      updatedAtMs: nowMs,
    },
  };

  try {
    const nowStr = String(nowMs);
    if (isBlankMatrix) {
      localStorage.setItem('ievf_blank_matrix_mode', '1');
    } else {
      localStorage.removeItem('ievf_blank_matrix_mode');
    }
    localStorage.setItem('ievf_public_schedule_snapshot', JSON.stringify(normalizedSnapshot));
    localStorage.setItem(LAST_FETCH_KEY, nowStr);
    localStorage.setItem(LOCAL_UPDATED_AT_KEY, nowStr);
  } catch {
    // ignore
  }

  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    try {
      await fetch('/api/published-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot: {
            ...normalizedSnapshot,
            shortUrl,
            shortCode,
          },
        }),
      });
    } catch {
      // ignore network error
    }
  }

  if (isQuotaBackedOff()) {
    return;
  }

  const docPath = `${SCHEDULE_COLLECTION}/${OFFICIAL_DOC_ID}`;
  const sanitizedBlocks = normalizedSnapshot.timeBlocks
    .filter((b) => b.id !== DAY_CONFIG_BLOCK_ID)
    .slice(0, 1499)
    .map((b) => ({
      id: String(b.id || ''),
      dayOfWeek: b.dayOfWeek,
      period: Number(b.period || 1),
      startTime: String(b.startTime || ''),
      endTime: String(b.endTime || ''),
      subject: String(b.subject || ''),
      teacherId: String(b.teacherId || ''),
      teacherName: String(b.teacherName || ''),
      classroomName: String(b.classroomName || ''),
      gradeName: resolveCanonicalGradeName(b),
      gradeId: String(b.gradeId || ''),
      status: String(b.status || 'covered'),
      block_type: String(b.block_type || 'class'),
      shift: resolveCanonicalShift(b),
      motivo_novedad: b.motivo_novedad ? String(b.motivo_novedad) : null,
      notes: b.notes ? String(b.notes) : null,
      replacementTeacherName: b.replacementTeacherName ? String(b.replacementTeacherName) : null,
      replacementTeacherId: b.replacementTeacherId ? String(b.replacementTeacherId) : null,
    }));

  sanitizedBlocks.push({
    id: DAY_CONFIG_BLOCK_ID,
    dayOfWeek: 'lunes',
    period: 0,
    startTime: '00:00',
    endTime: '00:00',
    subject: JSON.stringify(effectiveDayConfigs),
    teacherId: 'system',
    teacherName: 'System',
    classroomName: 'System',
    gradeName: 'System',
    gradeId: '',
    status: 'cancelled',
    block_type: 'exit',
    shift: 'morning',
    motivo_novedad: null,
    notes: null,
    replacementTeacherName: null,
    replacementTeacherId: null,
  });

  const sanitizedTeachers = normalizedSnapshot.teachers.slice(0, 300).map((t) => ({
    id: String(t.id || ''),
    displayName: String(t.displayName || 'Docente'),
    color: String(t.color || '#007DC5'),
  }));

  const contentFingerprint = computeSimpleHash(
    JSON.stringify({
      b: sanitizedBlocks,
      t: sanitizedTeachers,
      p: normalizedSnapshot.metadata.academicPeriod,
      w: normalizedSnapshot.metadata.academicWeek,
      s: shortUrl || '',
      blank: isBlankMatrix,
    })
  );

  if (!forceWrite) {
    try {
      const lastHash = localStorage.getItem(LAST_PUBLISHED_HASH_KEY);
      if (lastHash === contentFingerprint) {
        return;
      }
    } catch {
      // ignore
    }
  }

  const payload: Record<string, unknown> = {
    institutionName: String(normalizedSnapshot.metadata.institutionName || 'Institución Educativa Villa Flora').slice(0, 200),
    academicPeriod: String(normalizedSnapshot.metadata.academicPeriod || '3° Periodo').slice(0, 100),
    academicWeek: Math.max(1, Math.min(52, Math.round(Number(normalizedSnapshot.metadata.academicWeek || 8)))),
    lastUpdated: String(normalizedSnapshot.metadata.lastUpdated || new Date().toLocaleString('es-CO')).slice(0, 100),
    shortCode: String(shortCode || 'vf').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50) || 'vf',
    timeBlocks: sanitizedBlocks,
    teachers: sanitizedTeachers,
    updatedAt: serverTimestamp(),
  };

  if (shortUrl && shortUrl.length <= 300) {
    payload.shortUrl = shortUrl;
  }

  try {
    await setDoc(doc(db, SCHEDULE_COLLECTION, OFFICIAL_DOC_ID), payload);
    localStorage.setItem(LAST_PUBLISHED_HASH_KEY, contentFingerprint);
    localStorage.setItem(LAST_FETCH_KEY, String(Date.now()));
  } catch (error) {
    if (isQuotaExceededError(error)) {
      markQuotaBackedOff();
      console.warn('[Firebase] Cuota diaria alcanzada. Operando en modo local sin interrupción.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export function subscribeToPublishedSchedule(
  onUpdate: (data: CloudPublishedScheduleData) => void,
  _forceRefresh = false
): () => void {
  let lastAppliedUpdatedAtMs = 0;

  const applyPublishedData = (parsed: CloudPublishedScheduleData, updatedAtMs?: number) => {
    const incomingTs = Number(
      updatedAtMs || parsed.metadata?.updatedAtMs || parsed.dayConfigs?.updatedAtMs || 0
    );
    if (incomingTs > 0 && lastAppliedUpdatedAtMs > 0 && incomingTs < lastAppliedUpdatedAtMs) {
      return;
    }
    if (incomingTs > 0) {
      lastAppliedUpdatedAtMs = incomingTs;
    }

    const isBlank =
      Boolean(parsed.metadata?.blankMatrixMode ?? parsed.dayConfigs?.blankMatrixMode) ||
      (Array.isArray(parsed.timeBlocks) && parsed.timeBlocks.length === 0);

    const normalizedBlocks = isBlank
      ? []
      : normalizeTimeBlocksGrades(Array.isArray(parsed.timeBlocks) ? parsed.timeBlocks : []);

    const finalData: CloudPublishedScheduleData = {
      ...parsed,
      timeBlocks: normalizedBlocks,
      metadata: {
        ...parsed.metadata,
        totalBlocks: normalizedBlocks.length,
        blankMatrixMode: isBlank,
        updatedAtMs: incomingTs || Date.now(),
      },
      dayConfigs: resolveEffectiveDayConfigs({
        ...parsed.dayConfigs,
        blankMatrixMode: isBlank,
        updatedAtMs: incomingTs || Date.now(),
      }),
    };

    try {
      if (isBlank) {
        localStorage.setItem('ievf_blank_matrix_mode', '1');
        localStorage.setItem('villaFloraMatrix', '[]');
        localStorage.setItem('ievf_time_blocks_v1', '[]');
      } else {
        localStorage.removeItem('ievf_blank_matrix_mode');
        localStorage.setItem('villaFloraMatrix', JSON.stringify(normalizedBlocks));
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(normalizedBlocks));
      }
      localStorage.setItem('ievf_public_schedule_snapshot', JSON.stringify(finalData));
      localStorage.setItem(LAST_FETCH_KEY, String(Date.now()));
      if (finalData.dayConfigs) {
        if (finalData.dayConfigs.meetingDays) {
          localStorage.setItem('ievf_meeting_days', JSON.stringify(finalData.dayConfigs.meetingDays));
        }
        if (finalData.dayConfigs.eventDays) {
          localStorage.setItem('ievf_event_days', JSON.stringify(finalData.dayConfigs.eventDays));
        }
        if (Array.isArray(finalData.dayConfigs.customHolidays)) {
          localStorage.setItem('ievf_custom_holidays', JSON.stringify(finalData.dayConfigs.customHolidays));
        }
      }
      if (finalData.metadata?.lastUpdated) {
        localStorage.setItem('ievf_last_published_at', finalData.metadata.lastUpdated);
      }
      if (finalData.shortUrl) {
        localStorage.setItem('ievf_active_short_url', finalData.shortUrl);
      }
    } catch {
      // ignore storage errors
    }

    onUpdate(finalData);
  };

  const loadFromLocalCache = (): boolean => {
    try {
      const isBlankMode = localStorage.getItem('ievf_blank_matrix_mode') === '1';
      const liveBlocksRaw = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      const cachedRaw = localStorage.getItem('ievf_public_schedule_snapshot');
      if (cachedRaw) {
        const cachedData = JSON.parse(cachedRaw) as CloudPublishedScheduleData;
        if (cachedData) {
          const snapIsBlank =
            isBlankMode ||
            Boolean(cachedData.metadata?.blankMatrixMode ?? cachedData.dayConfigs?.blankMatrixMode) ||
            (Array.isArray(cachedData.timeBlocks) && cachedData.timeBlocks.length === 0);

          if (snapIsBlank) {
            cachedData.timeBlocks = [];
            cachedData.metadata = {
              ...cachedData.metadata,
              totalBlocks: 0,
              blankMatrixMode: true,
            };
            onUpdate(cachedData);
            return true;
          }
          if (liveBlocksRaw) {
            try {
              const liveBlocks = JSON.parse(liveBlocksRaw);
              if (Array.isArray(liveBlocks)) {
                cachedData.timeBlocks =
                  liveBlocks.length > 0 ? normalizeTimeBlocksGrades(liveBlocks) : [];
              }
            } catch {
              // ignore
            }
          }
          if (Array.isArray(cachedData.timeBlocks)) {
            onUpdate(cachedData);
            return true;
          }
        }
      }
    } catch {
      // Ignorar error de lectura de caché inicial
    }
    return false;
  };

  loadFromLocalCache();

  const fetchServerSnapshot = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
    try {
      const res = await fetch('/api/published-schedule', { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      const serverSnap = data?.snapshot;
      if (serverSnap && Array.isArray(serverSnap.timeBlocks)) {
        applyPublishedData(
          serverSnap as CloudPublishedScheduleData,
          Number(serverSnap.updatedAtMs || serverSnap.metadata?.updatedAtMs || serverSnap.dayConfigs?.updatedAtMs || Date.now())
        );
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  const handleLocalStorageUpdate = () => {
    loadFromLocalCache();
  };
  window.addEventListener('storage', handleLocalStorageUpdate);
  window.addEventListener('schedule_matrix_updated', handleLocalStorageUpdate);
  window.addEventListener('public_schedule_snapshot_updated', handleLocalStorageUpdate);

  const handleVisibilityOrFocus = () => {
    void fetchServerSnapshot();
  };
  window.addEventListener('focus', handleVisibilityOrFocus);
  document.addEventListener('visibilitychange', handleVisibilityOrFocus);

  const pollInterval = window.setInterval(() => {
    void fetchServerSnapshot();
  }, 2500);

  void fetchServerSnapshot().then((foundInServer) => {
    if (isQuotaBackedOff()) return;
    getDoc(doc(db, SCHEDULE_COLLECTION, OFFICIAL_DOC_ID))
      .then((snapshot) => {
        if (!snapshot.exists()) return;
        const raw = snapshot.data();
        if (!raw || !Array.isArray(raw.timeBlocks)) return;

        let extractedDayConfigs: PublicDayConfigs | undefined;
        const cleanBlocks = raw.timeBlocks.filter((b: any) => {
          if (b && b.id === DAY_CONFIG_BLOCK_ID) {
            try {
              extractedDayConfigs = JSON.parse(b.subject);
            } catch {
              // ignore
            }
            return false;
          }
          return true;
        });

        const cloudIsBlank =
          Boolean(extractedDayConfigs?.blankMatrixMode) || cleanBlocks.length === 0;
        const cloudUpdatedAtMs = Number(extractedDayConfigs?.updatedAtMs || 0);

        // Si el servidor en memoria ya entregó una versión más reciente (por ejemplo durante la misma sesión), respetarla
        if (foundInServer && lastAppliedUpdatedAtMs > 0 && cloudUpdatedAtMs < lastAppliedUpdatedAtMs) {
          return;
        }

        const effectiveBlocks = cloudIsBlank ? [] : normalizeTimeBlocksGrades(cleanBlocks);
        const resolvedConfigs = resolveEffectiveDayConfigs({
          ...extractedDayConfigs,
          blankMatrixMode: cloudIsBlank,
        });

        const parsed: CloudPublishedScheduleData = {
          metadata: {
            institutionName: raw.institutionName || 'Institución Educativa Villa Flora',
            academicPeriod: raw.academicPeriod || '3° Periodo',
            academicWeek: Number(raw.academicWeek || 8),
            lastUpdated: raw.lastUpdated || 'Sincronizado',
            totalBlocks: effectiveBlocks.length,
            totalTeachers: Array.isArray(raw.teachers) ? raw.teachers.length : 0,
            blankMatrixMode: cloudIsBlank,
            updatedAtMs: cloudUpdatedAtMs || Date.now(),
          },
          timeBlocks: effectiveBlocks,
          teachers: Array.isArray(raw.teachers) ? raw.teachers : [],
          dayConfigs: resolvedConfigs,
          shortUrl: raw.shortUrl,
          shortCode: raw.shortCode,
        };

        applyPublishedData(parsed, cloudUpdatedAtMs);
      })
      .catch((error) => {
        if (isQuotaExceededError(error)) {
          markQuotaBackedOff();
          return;
        }
        console.warn('[Firebase] Lectura remota omitida, usando instantánea local:', error);
      });
  });

  return () => {
    window.clearInterval(pollInterval);
    window.removeEventListener('storage', handleLocalStorageUpdate);
    window.removeEventListener('schedule_matrix_updated', handleLocalStorageUpdate);
    window.removeEventListener('public_schedule_snapshot_updated', handleLocalStorageUpdate);
    window.removeEventListener('focus', handleVisibilityOrFocus);
    document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
  };
}

