import { PublicScheduleSnapshot } from './html-schedule-generator.service';

export const SCHEDULE_CACHE_NAME = 'ievf-published-schedule-cache-v1';
export const SCHEDULE_CACHE_ENDPOINT = '/api/published-schedule';

export interface CachedScheduleCandidate extends PublicScheduleSnapshot {
  updatedAtMs?: number;
  shortUrl?: string;
  shortCode?: string;
}

export function extractSnapshotTimestamp(
  snapshot: Partial<CachedScheduleCandidate> | null | undefined
): number {
  if (!snapshot || typeof snapshot !== 'object') return 0;

  const directTs = Number(snapshot.updatedAtMs || 0);
  const metaTs = Number(snapshot.metadata?.updatedAtMs || 0);
  const dayConfigTs = Number(snapshot.dayConfigs?.updatedAtMs || 0);

  const numericTs = Math.max(
    Number.isFinite(directTs) ? directTs : 0,
    Number.isFinite(metaTs) ? metaTs : 0,
    Number.isFinite(dayConfigTs) ? dayConfigTs : 0
  );

  if (numericTs > 0) {
    return numericTs;
  }

  if (typeof snapshot.metadata?.lastUpdated === 'string' && snapshot.metadata.lastUpdated.trim()) {
    const parsed = Date.parse(snapshot.metadata.lastUpdated);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

export function isValidScheduleSnapshot(
  candidate: unknown
): candidate is CachedScheduleCandidate {
  if (!candidate || typeof candidate !== 'object') return false;
  const snap = candidate as Partial<CachedScheduleCandidate>;
  return Array.isArray(snap.timeBlocks);
}

export function selectMostRecentSnapshot<T extends CachedScheduleCandidate>(
  candidates: Array<T | null | undefined>
): T | null {
  let bestCandidate: T | null = null;
  let bestTimestamp = -1;

  for (const candidate of candidates) {
    if (!isValidScheduleSnapshot(candidate)) continue;
    const candidateTs = extractSnapshotTimestamp(candidate);
    if (bestCandidate === null || candidateTs > bestTimestamp) {
      bestCandidate = candidate;
      bestTimestamp = candidateTs;
    }
  }

  return bestCandidate;
}

export async function readSnapshotFromCacheStorage(): Promise<CachedScheduleCandidate | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await window.caches.open(SCHEDULE_CACHE_NAME);
    const cachedResponse = await cache.match(SCHEDULE_CACHE_ENDPOINT, { ignoreSearch: true });
    if (!cachedResponse || !cachedResponse.ok) return null;

    const payload = await cachedResponse.json();
    const candidate = payload?.snapshot ?? payload;
    if (isValidScheduleSnapshot(candidate)) {
      return candidate;
    }
  } catch {
    // Ignore Cache Storage read errors
  }
  return null;
}

export async function writeSnapshotToCacheStorage(
  snapshot: CachedScheduleCandidate
): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  if (!isValidScheduleSnapshot(snapshot)) return;

  try {
    const cache = await window.caches.open(SCHEDULE_CACHE_NAME);
    const updatedAtMs = extractSnapshotTimestamp(snapshot) || Date.now();
    const normalizedPayload = {
      ok: true,
      cachedAtMs: Date.now(),
      snapshot: {
        ...snapshot,
        updatedAtMs,
        metadata: {
          ...snapshot.metadata,
          updatedAtMs,
        },
      },
    };

    const response = new Response(JSON.stringify(normalizedPayload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Cache-Strategy': 'Cache-First',
        'X-Schedule-Updated-At': String(updatedAtMs),
      },
    });

    await cache.put(SCHEDULE_CACHE_ENDPOINT, response);
  } catch {
    // Ignore Cache Storage write errors
  }
}
