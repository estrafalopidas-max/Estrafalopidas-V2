import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  disableNetwork,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import {
  PublicScheduleSnapshot,
  resolveEffectiveDayConfigs,
} from '../../domain/services/html-schedule-generator.service';
import { normalizeTimeBlocksGrades } from '../../domain/services/grade-normalization.service';

// Silenciar logs internos del SDK de Firestore para evitar ruido por cuota gratuita agotada
try {
  setLogLevel('silent');
} catch {
  // ignore
}

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache(),
  },
  firebaseConfig.firestoreDatabaseId
);

// Mantener la red de Firestore deshabilitada: toda la persistencia opera en el servidor propio (/api/published-schedule en NAS/Docker) y localStorage
if (typeof window !== 'undefined') {
  disableNetwork(db).catch(() => {});
}

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

const LOCAL_UPDATED_AT_KEY = 'ievf_local_schedule_updated_at';
const LAST_FETCH_KEY = 'ievf_cloud_schedule_fetched_at';
const DAY_CONFIG_BLOCK_ID = '__ievf_day_configs__';

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

export function buildInternalShortUrl(_code: string = 'vf'): string {
  const base = getPublicBaseUrl() || 'https://ais-dev-wwkbgo7t3yhqgrvh74ipk7-881148575307.us-east1.run.app';
  return `${base.replace(/\/+$/, '')}/h`;
}

export async function shortenUrlExternal(longUrl?: string): Promise<{ shortUrl: string; directUrl: string }> {
  const targetUrl = (longUrl && longUrl.trim()) || buildInternalShortUrl('vf');

  if (typeof window !== 'undefined') {
    const cachedShort = localStorage.getItem('ievf_active_short_url');
    const cachedTarget = localStorage.getItem('ievf_active_short_target');
    if (
      cachedShort &&
      cachedTarget === targetUrl &&
      cachedShort !== targetUrl &&
      (cachedShort.includes('is.gd') || cachedShort.includes('tinyurl.com') || cachedShort.includes('v.gd'))
    ) {
      return { shortUrl: cachedShort, directUrl: targetUrl };
    }
  }

  try {
    const response = await fetch(`/api/shorten-url?url=${encodeURIComponent(targetUrl)}`);
    if (response.ok) {
      const data = (await response.json()) as { shorturl?: string; directUrl?: string };
      if (data?.shorturl && typeof data.shorturl === 'string' && data.shorturl.startsWith('http')) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('ievf_active_short_url', data.shorturl);
          localStorage.setItem('ievf_active_short_target', targetUrl);
        }
        return {
          shortUrl: data.shorturl,
          directUrl: data.directUrl || targetUrl,
        };
      }
    }
  } catch {
    // Fallback si el endpoint no responde
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem('ievf_active_short_url', targetUrl);
  }
  return { shortUrl: targetUrl, directUrl: targetUrl };
}

export async function publishScheduleToCloud(
  snapshot: PublicScheduleSnapshot,
  shortUrl?: string,
  shortCode = 'vf',
  _forceWrite = false
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
}

export function subscribeToPublishedSchedule(
  onUpdate: (data: CloudPublishedScheduleData) => void,
  _forceRefresh = false
): () => void {
  let lastAppliedUpdatedAtMs = (() => {
    try {
      return Number(localStorage.getItem(LOCAL_UPDATED_AT_KEY) || '0');
    } catch {
      return 0;
    }
  })();

  const applyPublishedData = (parsed: CloudPublishedScheduleData, updatedAtMs?: number) => {
    let localTs = 0;
    try {
      localTs = Number(localStorage.getItem(LOCAL_UPDATED_AT_KEY) || '0');
    } catch {
      localTs = 0;
    }
    const effectiveBaselineTs = Math.max(lastAppliedUpdatedAtMs, localTs);
    const incomingTs = Number(
      updatedAtMs || parsed.metadata?.updatedAtMs || parsed.dayConfigs?.updatedAtMs || 0
    );
    if (effectiveBaselineTs > 0 && (incomingTs === 0 || incomingTs < effectiveBaselineTs)) {
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
      if (incomingTs > 0) {
        localStorage.setItem(LOCAL_UPDATED_AT_KEY, String(incomingTs));
      }
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
      const officialOrigin = getPublicBaseUrl();
      if (officialOrigin) {
        localStorage.setItem('ievf_active_short_url', officialOrigin);
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

  void fetchServerSnapshot();

  return () => {
    window.clearInterval(pollInterval);
    window.removeEventListener('storage', handleLocalStorageUpdate);
    window.removeEventListener('schedule_matrix_updated', handleLocalStorageUpdate);
    window.removeEventListener('public_schedule_snapshot_updated', handleLocalStorageUpdate);
    window.removeEventListener('focus', handleVisibilityOrFocus);
    document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
  };
}

