import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import pg from 'pg';

const { Pool } = pg;

process.env.TZ = process.env.TZ || 'America/Bogota';

function formatColombiaTimestamp(ms: number = Date.now()): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : Date.now();
  return new Date(safeMs).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  });
}

interface AgentChatRequest {
  message: string;
  mode?: 'fast' | 'general';
  history?: { role: 'user' | 'model'; text: string }[];
  context?: {
    selectedShift?: string;
    academicPeriod?: string;
    academicWeek?: number;
    teachersSummary?: {
      name: string;
      level?: string;
      subjects?: string[];
      weeklyAssignedHours?: number;
      maxWeeklyHours?: number;
      entrySchedule?: string;
    }[];
    daySchedulesSummary?: string;
    uncoveredSlotsSummary?: string;
  };
}

function buildLocalExpertFallback(body: AgentChatRequest): string {
  const q = (body.message || '').toLowerCase().trim();
  const ctx = body.context || {};
  const teachers = ctx.teachersSummary || [];

  if (q.includes('libre') || q.includes('disponible') || q.includes('reemplaz') || q.includes('cubrir')) {
    if (ctx.daySchedulesSummary) {
      return `Según la parrilla activa (${ctx.selectedShift === 'morning' ? 'Bachillerato' : ctx.selectedShift === 'afternoon' ? 'Primaria y T2' : 'Transición 1'}):\n${ctx.daySchedulesSummary}\n\nSugerencia: prioriza docentes del mismo nivel con menor carga semanal acumulada (tope oficial: 24h).`;
    }
  }

  if (q.includes('carga') || q.includes('horas') || q.includes('decreto') || q.includes('tope') || q.includes('sobrecarga')) {
    if (teachers.length > 0) {
      const sorted = [...teachers].sort((a, b) => (b.weeklyAssignedHours || 0) - (a.weeklyAssignedHours || 0));
      const top = sorted.slice(0, 5).map((t) => `• ${t.name}: ${t.weeklyAssignedHours ?? 0}/${t.maxWeeklyHours ?? 24}h`).join('\n');
      const free = sorted.filter((t) => (t.weeklyAssignedHours || 0) < (t.maxWeeklyHours || 24)).slice(-4).map((t) => `• ${t.name}: ${t.weeklyAssignedHours ?? 0}/${t.maxWeeklyHours ?? 24}h`).join('\n');
      return `Resumen de carga lectiva semanal (24h oficiales):\n\nMayor asignación:\n${top}\n\nMayor disponibilidad:\n${free}`;
    }
  }

  if (q.includes('hueco') || q.includes('sin cubrir') || q.includes('ausencia') || q.includes('novedad')) {
    if (ctx.uncoveredSlotsSummary) {
      return `Estado de bloques por cubrir / novedades:\n${ctx.uncoveredSlotsSummary}`;
    }
    return 'No se detectan bloques marcados como ausentes sin cubrir en la jornada activa.';
  }

  const matchedTeacher = teachers.find((t) => q.includes(t.name.toLowerCase()));
  if (matchedTeacher) {
    return `Docente: ${matchedTeacher.name}\n• Nivel: ${matchedTeacher.level || 'General'}\n• Especialidad: ${(matchedTeacher.subjects || []).join(', ') || 'No registrada'}\n• Carga actual: ${matchedTeacher.weeklyAssignedHours ?? 0} de ${matchedTeacher.maxWeeklyHours ?? 24} horas semanales.`;
  }

  return `Analicé la parrilla actual (${ctx.academicPeriod || 'Periodo activo'}, Semana ${ctx.academicWeek || ''}). Puedo ayudarte a consultar:\n• Qué docentes están libres en un día y hora específicos.\n• Quién puede cubrir una ausencia según su especialidad.\n• Revisión de topes de horas semanales (24h) o huecos en la jornada.`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Endpoint para acortador URL de la vista pública
  app.get('/api/shorten-url', async (req, res) => {
    try {
      const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
      const proto = req.get('x-forwarded-proto') || 'https';
      const targetQuery = typeof req.query?.url === 'string' ? req.query.url.trim() : '';
      const directPublicUrl = targetQuery || `${proto}://${host}/h`;

      // 1. Intentar con is.gd
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const isgdRes = await fetch(
          `https://is.gd/create.php?format=json&url=${encodeURIComponent(directPublicUrl)}`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VillaFloraScheduler/1.0)' },
          }
        );
        clearTimeout(timeout);
        if (isgdRes.ok) {
          const data = (await isgdRes.json()) as { shorturl?: string };
          if (data && typeof data.shorturl === 'string' && data.shorturl.startsWith('http')) {
            res.status(200).json({ shorturl: data.shorturl, directUrl: directPublicUrl });
            return;
          }
        }
      } catch {
        // Continuar al siguiente proveedor
      }

      // 2. Intentar con TinyURL API
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const tinyRes = await fetch(
          `https://tinyurl.com/api-create.php?url=${encodeURIComponent(directPublicUrl)}`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VillaFloraScheduler/1.0)' },
          }
        );
        clearTimeout(timeout);
        if (tinyRes.ok) {
          const shortText = (await tinyRes.text()).trim();
          if (shortText.startsWith('http')) {
            res.status(200).json({ shorturl: shortText, directUrl: directPublicUrl });
            return;
          }
        }
      } catch {
        // Continuar al siguiente proveedor
      }

      // 3. Intentar con v.gd
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const vgdRes = await fetch(
          `https://v.gd/create.php?format=json&url=${encodeURIComponent(directPublicUrl)}`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VillaFloraScheduler/1.0)' },
          }
        );
        clearTimeout(timeout);
        if (vgdRes.ok) {
          const data = (await vgdRes.json()) as { shorturl?: string };
          if (data && typeof data.shorturl === 'string' && data.shorturl.startsWith('http')) {
            res.status(200).json({ shorturl: data.shorturl, directUrl: directPublicUrl });
            return;
          }
        }
      } catch {
        // Fallback al enlace corto interno
      }

      res.status(200).json({ shorturl: directPublicUrl, directUrl: directPublicUrl });
    } catch {
      res.status(200).json({ shorturl: null });
    }
  });

  // Redireccionar rutas legadas hacia la ruta oficial pública /h
  app.get(['/horario.html', '/horario', '/horario-publico'], (_req, res) => {
    res.redirect(301, '/h');
  });

  // Endpoint de carga de logo institucional (raw stream multipart)
  app.post('/api/upload-logo', (req, res) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const MAX_SIZE = 2 * 1024 * 1024;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_SIZE) {
        req.destroy();
        res.status(413).json({ error: 'El archivo excede el tamaño máximo permitido de 2MB.' });
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (res.writableEnded) return;
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        let fileBuffer: Buffer | null = null;

        if (contentType.includes('multipart/form-data')) {
          const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
          if (boundaryMatch) {
            const boundary = boundaryMatch[1] || boundaryMatch[2];
            const boundaryBuffer = Buffer.from(`--${boundary}`);
            const parts: Buffer[] = [];
            let start = 0;
            while (true) {
              const idx = buffer.indexOf(boundaryBuffer, start);
              if (idx === -1) break;
              if (start > 0) parts.push(buffer.subarray(start, idx));
              start = idx + boundaryBuffer.length;
            }

            for (const part of parts) {
              const headerEndIdx = part.indexOf('\r\n\r\n');
              if (headerEndIdx !== -1) {
                const headerStr = part.subarray(0, headerEndIdx).toString('utf-8');
                if (
                  headerStr.includes('filename=') ||
                  headerStr.includes('name="logo"') ||
                  headerStr.includes('name="file"')
                ) {
                  const lowerHeader = headerStr.toLowerCase();
                  if (
                    !lowerHeader.includes('image/png') &&
                    !lowerHeader.includes('image/jpeg') &&
                    !lowerHeader.includes('image/jpg') &&
                    !lowerHeader.includes('image/svg+xml') &&
                    !lowerHeader.includes('image/webp')
                  ) {
                    res.status(400).json({ error: 'Formato inválido. Solo se admiten archivos PNG, JPEG y SVG.' });
                    return;
                  }
                  let content = part.subarray(headerEndIdx + 4);
                  if (content.length >= 2 && content[content.length - 2] === 13 && content[content.length - 1] === 10) {
                    content = content.subarray(0, content.length - 2);
                  }
                  fileBuffer = content;
                  break;
                }
              }
            }
          }
        } else {
          fileBuffer = buffer;
        }

        if (!fileBuffer || fileBuffer.length === 0) {
          res.status(400).json({ error: 'No se detectó ningún archivo en la petición.' });
          return;
        }

        const targetPath = path.resolve(process.cwd(), 'public/logo-institucional.png');
        fs.writeFileSync(targetPath, fileBuffer);
        try {
          fs.writeFileSync(path.resolve(process.cwd(), 'public/logo.png'), fileBuffer);
        } catch {}

        res.status(200).json({
          success: true,
          message: 'Logo institucional actualizado correctamente en el servidor.',
          url: '/logo-institucional.png',
        });
      } catch (err) {
        console.error('[Upload-Logo] Error al guardar logo:', err);
        res.status(500).json({ error: 'Error interno del servidor al guardar el archivo.' });
      }
    });
  });

  // JSON parser para las demás rutas API
  app.use('/api', express.json({ limit: '10mb' }));

  const setNoCacheHeaders = (res: express.Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  };

  // Directorio persistente para TrueNAS / Docker (volumen montado en /app/data)
  const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Fallback silencioso
  }

  const resolvePersistentFile = (filename: string): string => {
    try {
      fs.accessSync(DATA_DIR, fs.constants.W_OK);
      return path.join(DATA_DIR, filename);
    } catch {
      return path.join('/tmp', filename);
    }
  };

  const PUBLISHED_SCHEDULE_FILE = resolvePersistentFile('ievf_published_schedule.json');
  const WEEK_SCHEDULES_FILE = resolvePersistentFile('ievf_week_schedules.json');
  const ACCESS_CONTROL_FILE = resolvePersistentFile('ievf_access_control.json');
  const TEACHERS_FILE = resolvePersistentFile('ievf_teachers.json');
  const PRIMARY_ADMIN_EMAIL = process.env.PRIMARY_ADMIN_EMAIL || 'estrafalopidas@gmail.com';

  interface ServerWeekContainer {
    schemaVersion?: number;
    mondayIso: string;
    timeBlocks: unknown[];
    meetingDays: Record<string, boolean>;
    scheduleTypes: Record<string, 'A' | 'B' | 'C' | 'D'>;
    updatedAt: number;
  }

  interface ServerAuthorizedEditor {
    email: string;
    username?: string;
    name: string;
    position?: string;
    password?: string;
    role: 'admin' | 'editor';
    addedAt: string;
    active: boolean;
  }

  interface ServerAccessControlConfig {
    requireAuth: boolean;
    inactivityTimeoutMinutes: number;
    primaryAdminEmail: string;
    primaryAdminPassword?: string;
    editors: ServerAuthorizedEditor[];
    updatedAtMs: number;
  }

  let latestPublishedSchedule: Record<string, any> | null = (() => {
    try {
      if (fs.existsSync(PUBLISHED_SCHEDULE_FILE)) {
        return JSON.parse(fs.readFileSync(PUBLISHED_SCHEDULE_FILE, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return null;
  })();

  let weekSchedulesMap: Record<string, ServerWeekContainer> = (() => {
    try {
      if (fs.existsSync(WEEK_SCHEDULES_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(WEEK_SCHEDULES_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  })();

  let teachersList: unknown[] | null = (() => {
    try {
      if (fs.existsSync(TEACHERS_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf-8'));
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  })();

  let accessControlState: ServerAccessControlConfig = (() => {
    try {
      if (fs.existsSync(ACCESS_CONTROL_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(ACCESS_CONTROL_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.editors)) {
          return {
            requireAuth: typeof parsed.requireAuth === 'boolean' ? parsed.requireAuth : true,
            inactivityTimeoutMinutes:
              typeof parsed.inactivityTimeoutMinutes === 'number'
                ? parsed.inactivityTimeoutMinutes
                : 30,
            primaryAdminEmail: PRIMARY_ADMIN_EMAIL,
            primaryAdminPassword:
              typeof parsed.primaryAdminPassword === 'string' &&
              parsed.primaryAdminPassword.trim() &&
              parsed.primaryAdminPassword.trim() !== 'VillaFlora2026*'
                ? parsed.primaryAdminPassword.trim()
                : 'piloro666',
            editors: parsed.editors,
            updatedAtMs: Number(parsed.updatedAtMs || Date.now()),
          };
        }
      }
    } catch {
      // ignore
    }
    return {
      requireAuth: true,
      inactivityTimeoutMinutes: 30,
      primaryAdminEmail: PRIMARY_ADMIN_EMAIL,
      primaryAdminPassword: 'piloro666',
      editors: [],
      updatedAtMs: Date.now(),
    };
  })();

  // Inicialización de PostgreSQL (cuando DATABASE_URL está configurado en TrueNAS / Docker)
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const pgPool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      })
    : null;

  let isPgReady = false;

  if (pgPool) {
    pgPool.on('error', (err) => {
      console.error('[PostgreSQL] Pool error:', err.message);
    });

    try {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS published_schedule (
          id TEXT PRIMARY KEY,
          snapshot JSONB NOT NULL,
          updated_at_ms BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS week_schedules (
          monday_iso TEXT PRIMARY KEY,
          container JSONB NOT NULL,
          updated_at_ms BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_kv_store (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at_ms BIGINT NOT NULL
        );
      `);
      isPgReady = true;
      console.log('[PostgreSQL] Conectado y tablas verificadas correctamente.');

      // 1. Hidratar o migrar published_schedule
      const pubRes = await pgPool.query(
        `SELECT snapshot FROM published_schedule WHERE id = 'active' LIMIT 1`
      );
      if (pubRes.rows.length > 0 && pubRes.rows[0].snapshot) {
        latestPublishedSchedule = pubRes.rows[0].snapshot;
      } else if (latestPublishedSchedule) {
        const ts = Number(latestPublishedSchedule.updatedAtMs || Date.now());
        await pgPool.query(
          `INSERT INTO published_schedule (id, snapshot, updated_at_ms)
           VALUES ('active', $1::jsonb, $2)
           ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at_ms = EXCLUDED.updated_at_ms`,
          [JSON.stringify(latestPublishedSchedule), ts]
        );
      }

      // 2. Hidratar o migrar week_schedules
      const weeksRes = await pgPool.query(`SELECT monday_iso, container FROM week_schedules`);
      if (weeksRes.rows.length > 0) {
        const loadedMap: Record<string, ServerWeekContainer> = {};
        for (const row of weeksRes.rows) {
          if (row.monday_iso && row.container) {
            loadedMap[row.monday_iso] = row.container;
          }
        }
        weekSchedulesMap = loadedMap;
      } else if (Object.keys(weekSchedulesMap).length > 0) {
        for (const [iso, container] of Object.entries(weekSchedulesMap)) {
          await pgPool.query(
            `INSERT INTO week_schedules (monday_iso, container, updated_at_ms)
             VALUES ($1, $2::jsonb, $3)
             ON CONFLICT (monday_iso) DO UPDATE SET container = EXCLUDED.container, updated_at_ms = EXCLUDED.updated_at_ms`,
            [iso, JSON.stringify(container), Number(container.updatedAt || Date.now())]
          );
        }
      }

      // 3. Hidratar o migrar access_control
      const acRes = await pgPool.query(
        `SELECT value FROM app_kv_store WHERE key = 'access_control' LIMIT 1`
      );
      if (acRes.rows.length > 0 && acRes.rows[0].value) {
        accessControlState = acRes.rows[0].value;
      } else {
        await pgPool.query(
          `INSERT INTO app_kv_store (key, value, updated_at_ms)
           VALUES ('access_control', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at_ms = EXCLUDED.updated_at_ms`,
          [JSON.stringify(accessControlState), accessControlState.updatedAtMs]
        );
      }

      // 4. Hidratar o migrar teachers
      const teachersRes = await pgPool.query(
        `SELECT value FROM app_kv_store WHERE key = 'teachers' LIMIT 1`
      );
      if (teachersRes.rows.length > 0 && Array.isArray(teachersRes.rows[0].value)) {
        teachersList = teachersRes.rows[0].value;
      } else if (Array.isArray(teachersList) && teachersList.length > 0) {
        await pgPool.query(
          `INSERT INTO app_kv_store (key, value, updated_at_ms)
           VALUES ('teachers', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at_ms = EXCLUDED.updated_at_ms`,
          [JSON.stringify(teachersList), Date.now()]
        );
      }
    } catch (err) {
      console.error('[PostgreSQL] Error inicializando esquema, operando con respaldo en disco:', err);
    }
  }

  const persistPublishedSchedule = async (normalized: Record<string, any>) => {
    latestPublishedSchedule = normalized;
    try {
      fs.writeFileSync(PUBLISHED_SCHEDULE_FILE, JSON.stringify(normalized), 'utf-8');
    } catch {
      // ignore
    }
    if (pgPool && isPgReady) {
      try {
        await pgPool.query(
          `INSERT INTO published_schedule (id, snapshot, updated_at_ms)
           VALUES ('active', $1::jsonb, $2)
           ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at_ms = EXCLUDED.updated_at_ms`,
          [JSON.stringify(normalized), Number(normalized.updatedAtMs || Date.now())]
        );
      } catch (err) {
        console.error('[PostgreSQL] Error guardando published_schedule:', err);
      }
    }
  };

  const persistWeekSchedule = async (mondayIso: string, container: ServerWeekContainer) => {
    weekSchedulesMap[mondayIso] = container;
    try {
      fs.writeFileSync(WEEK_SCHEDULES_FILE, JSON.stringify(weekSchedulesMap), 'utf-8');
    } catch {
      // ignore
    }
    if (pgPool && isPgReady) {
      try {
        await pgPool.query(
          `INSERT INTO week_schedules (monday_iso, container, updated_at_ms)
           VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (monday_iso) DO UPDATE SET container = EXCLUDED.container, updated_at_ms = EXCLUDED.updated_at_ms`,
          [mondayIso, JSON.stringify(container), Number(container.updatedAt || Date.now())]
        );
      } catch (err) {
        console.error('[PostgreSQL] Error guardando week_schedules:', err);
      }
    }
  };

  app.get('/api/published-schedule', async (_req, res) => {
    setNoCacheHeaders(res);
    if (pgPool && isPgReady) {
      try {
        const dbRes = await pgPool.query(
          `SELECT snapshot FROM published_schedule WHERE id = 'active' LIMIT 1`
        );
        if (dbRes.rows.length > 0 && dbRes.rows[0].snapshot) {
          latestPublishedSchedule = dbRes.rows[0].snapshot;
        }
      } catch {
        // Fallback a memoria/disco
      }
    }
    if (latestPublishedSchedule && typeof latestPublishedSchedule === 'object') {
      const ts = Number(
        latestPublishedSchedule.updatedAtMs || latestPublishedSchedule.metadata?.updatedAtMs || 0
      );
      if (ts > 0) {
        latestPublishedSchedule = {
          ...latestPublishedSchedule,
          metadata: {
            ...(latestPublishedSchedule.metadata || {}),
            lastUpdated: formatColombiaTimestamp(ts),
          },
        };
      }
    }
    res.status(200).json({ snapshot: latestPublishedSchedule });
  });

  app.post('/api/published-schedule', async (req, res) => {
    setNoCacheHeaders(res);
    const incoming = req.body?.snapshot || req.body;
    if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.timeBlocks)) {
      res.status(400).json({ error: 'Formato de horario publicado inválido.' });
      return;
    }
    const nowMs = Date.now();
    const isBlank = Boolean(
      incoming.blankMatrixMode ?? incoming.dayConfigs?.blankMatrixMode ?? incoming.timeBlocks.length === 0
    );
    const normalized: Record<string, any> = {
      ...incoming,
      blankMatrixMode: isBlank,
      updatedAtMs: nowMs,
      timeBlocks: isBlank ? [] : incoming.timeBlocks,
      dayConfigs: {
        ...(incoming.dayConfigs || {}),
        blankMatrixMode: isBlank,
        updatedAtMs: nowMs,
      },
      metadata: {
        ...(incoming.metadata || {}),
        blankMatrixMode: isBlank,
        updatedAtMs: nowMs,
        totalBlocks: isBlank ? 0 : incoming.timeBlocks.length,
        lastUpdated: formatColombiaTimestamp(nowMs),
      },
    };

    await persistPublishedSchedule(normalized);

    const anchorMondayIso = normalized.dayConfigs?.anchorMondayIso;
    if (anchorMondayIso && typeof anchorMondayIso === 'string' && !isBlank) {
      await persistWeekSchedule(anchorMondayIso, {
        schemaVersion: 4,
        mondayIso: anchorMondayIso,
        timeBlocks: normalized.timeBlocks,
        meetingDays: normalized.dayConfigs?.meetingDays || {},
        scheduleTypes: normalized.dayConfigs?.scheduleTypes || {},
        updatedAt: nowMs,
      });
    }

    res.status(200).json({ ok: true, blankMatrixMode: isBlank, updatedAtMs: normalized.updatedAtMs });
  });

  // Endpoints de contenedores semanales en PostgreSQL
  app.get('/api/week-schedules', async (_req, res) => {
    setNoCacheHeaders(res);
    if (pgPool && isPgReady) {
      try {
        const dbRes = await pgPool.query(`SELECT monday_iso, container FROM week_schedules`);
        const loadedMap: Record<string, ServerWeekContainer> = {};
        for (const row of dbRes.rows) {
          if (row.monday_iso && row.container) {
            loadedMap[row.monday_iso] = row.container;
          }
        }
        weekSchedulesMap = loadedMap;
      } catch {
        // Fallback a memoria
      }
    }
    res.status(200).json({ weeks: weekSchedulesMap });
  });

  app.get('/api/week-schedules/:mondayIso', async (req, res) => {
    setNoCacheHeaders(res);
    const { mondayIso } = req.params;
    if (pgPool && isPgReady) {
      try {
        const dbRes = await pgPool.query(
          `SELECT container FROM week_schedules WHERE monday_iso = $1 LIMIT 1`,
          [mondayIso]
        );
        if (dbRes.rows.length > 0 && dbRes.rows[0].container) {
          weekSchedulesMap[mondayIso] = dbRes.rows[0].container;
        }
      } catch {
        // Fallback
      }
    }
    res.status(200).json({ container: weekSchedulesMap[mondayIso] || null });
  });

  app.post('/api/week-schedules/:mondayIso', async (req, res) => {
    setNoCacheHeaders(res);
    const { mondayIso } = req.params;
    const body = req.body || {};
    const incomingContainer = body.container || body;
    if (!mondayIso || !incomingContainer || !Array.isArray(incomingContainer.timeBlocks)) {
      res.status(400).json({ error: 'Contenedor semanal inválido.' });
      return;
    }

    const nowMs = Date.now();
    const container: ServerWeekContainer = {
      schemaVersion: 4,
      mondayIso,
      timeBlocks: incomingContainer.timeBlocks,
      meetingDays: incomingContainer.meetingDays || {},
      scheduleTypes: incomingContainer.scheduleTypes || {},
      updatedAt: nowMs,
    };

    await persistWeekSchedule(mondayIso, container);

    res.status(200).json({ ok: true, mondayIso, updatedAt: nowMs });
  });

  app.delete('/api/week-schedules', async (_req, res) => {
    setNoCacheHeaders(res);
    weekSchedulesMap = {};
    try {
      if (fs.existsSync(WEEK_SCHEDULES_FILE)) {
        fs.unlinkSync(WEEK_SCHEDULES_FILE);
      }
    } catch {
      // ignore
    }
    if (pgPool && isPgReady) {
      try {
        await pgPool.query(`DELETE FROM week_schedules`);
      } catch (err) {
        console.error('[PostgreSQL] Error limpiando week_schedules:', err);
      }
    }
    res.status(200).json({ ok: true });
  });

  // Endpoints de Docentes en PostgreSQL
  app.get('/api/teachers', async (_req, res) => {
    setNoCacheHeaders(res);
    if (pgPool && isPgReady) {
      try {
        const dbRes = await pgPool.query(
          `SELECT value FROM app_kv_store WHERE key = 'teachers' LIMIT 1`
        );
        if (dbRes.rows.length > 0 && Array.isArray(dbRes.rows[0].value)) {
          teachersList = dbRes.rows[0].value;
        }
      } catch {
        // Fallback
      }
    }
    res.status(200).json({ teachers: teachersList });
  });

  app.post('/api/teachers', async (req, res) => {
    setNoCacheHeaders(res);
    const incoming = req.body?.teachers || req.body;
    if (!Array.isArray(incoming)) {
      res.status(400).json({ error: 'Lista de docentes inválida.' });
      return;
    }
    const nowMs = Date.now();
    teachersList = incoming;
    try {
      fs.writeFileSync(TEACHERS_FILE, JSON.stringify(teachersList), 'utf-8');
    } catch {
      // ignore
    }
    if (pgPool && isPgReady) {
      try {
        await pgPool.query(
          `INSERT INTO app_kv_store (key, value, updated_at_ms)
           VALUES ('teachers', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at_ms = EXCLUDED.updated_at_ms`,
          [JSON.stringify(teachersList), nowMs]
        );
      } catch (err) {
        console.error('[PostgreSQL] Error guardando teachers:', err);
      }
    }

    res.status(200).json({ ok: true, count: teachersList.length });
  });

  app.get('/api/access-control', async (_req, res) => {
    setNoCacheHeaders(res);
    if (pgPool && isPgReady) {
      try {
        const dbRes = await pgPool.query(
          `SELECT value FROM app_kv_store WHERE key = 'access_control' LIMIT 1`
        );
        if (dbRes.rows.length > 0 && dbRes.rows[0].value) {
          accessControlState = dbRes.rows[0].value;
        }
      } catch {
        // Fallback
      }
    }
    res.status(200).json(accessControlState);
  });

  app.post('/api/access-control', async (req, res) => {
    setNoCacheHeaders(res);
    const body = req.body || {};
    const nextRequireAuth =
      typeof body.requireAuth === 'boolean' ? body.requireAuth : accessControlState.requireAuth;
    const nextInactivityMinutes =
      typeof body.inactivityTimeoutMinutes === 'number'
        ? body.inactivityTimeoutMinutes
        : accessControlState.inactivityTimeoutMinutes ?? 30;
    const nextPrimaryAdminPassword =
      typeof body.primaryAdminPassword === 'string' &&
      body.primaryAdminPassword.trim() &&
      body.primaryAdminPassword.trim() !== 'VillaFlora2026*'
        ? body.primaryAdminPassword.trim()
        : accessControlState.primaryAdminPassword || 'piloro666';
    const nextEditors: ServerAuthorizedEditor[] = Array.isArray(body.editors)
      ? body.editors
          .filter((e: any) => e && typeof e.email === 'string' && e.email.trim())
          .map((e: any) => ({
            email: e.email.trim().toLowerCase(),
            ...(typeof e.username === 'string' && e.username.trim()
              ? { username: e.username.trim().toLowerCase() }
              : {}),
            name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : e.email.trim(),
            ...(typeof e.position === 'string' && e.position.trim()
              ? { position: e.position.trim() }
              : {}),
            ...(typeof e.password === 'string' && e.password.trim()
              ? { password: e.password.trim() }
              : {}),
            role: e.role === 'admin' ? 'admin' : 'editor',
            addedAt: typeof e.addedAt === 'string' ? e.addedAt : new Date().toISOString(),
            active: typeof e.active === 'boolean' ? e.active : true,
          }))
      : accessControlState.editors;

    accessControlState = {
      requireAuth: nextRequireAuth,
      inactivityTimeoutMinutes: nextInactivityMinutes,
      primaryAdminEmail: PRIMARY_ADMIN_EMAIL,
      primaryAdminPassword: nextPrimaryAdminPassword,
      editors: nextEditors,
      updatedAtMs: Date.now(),
    };

    try {
      fs.writeFileSync(ACCESS_CONTROL_FILE, JSON.stringify(accessControlState), 'utf-8');
    } catch {
      // ignore
    }

    if (pgPool && isPgReady) {
      try {
        await pgPool.query(
          `INSERT INTO app_kv_store (key, value, updated_at_ms)
           VALUES ('access_control', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at_ms = EXCLUDED.updated_at_ms`,
          [JSON.stringify(accessControlState), accessControlState.updatedAtMs]
        );
      } catch (err) {
        console.error('[PostgreSQL] Error guardando access_control:', err);
      }
    }

    res.status(200).json(accessControlState);
  });

  // Endpoint del Agente Experto en Asignación Horaria
  app.post('/api/schedule-agent/chat', async (req, res) => {
    const body = (req.body || {}) as AgentChatRequest;
    const userMessage = (body.message || '').trim();

    if (!userMessage) {
      res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(200).json({ reply: buildLocalExpertFallback(body) });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const ctx = body.context || {};
      const shiftLabel =
        ctx.selectedShift === 'morning'
          ? 'Bachillerato (Mañana)'
          : ctx.selectedShift === 'afternoon'
          ? 'Primaria y Transición 2 (Tarde)'
          : 'Transición 1';

      const systemInstruction = [
        'Eres el Agente Experto en Asignación Horaria de la Institución Educativa Villa Flora (Medellín, Colombia).',
        'Tu objetivo es asistir al coordinador académico de forma breve, directa, precisa y en español.',
        'Reglas normativas e institucionales clave:',
        '- Tope oficial de asignación académica semanal por docente: 24 horas semanales.',
        '- Bachillerato tiene 6 horas base (06:10 a 12:10 con descanso 08:50-09:25) y bloques de Media Técnica (7ª a 11ª hora para 10° y 11°).',
        '- Horario especial de ingreso: Gleysher Omar Mosquera Perea y Alexander Uribe Montalvo ingresan al colegio a las 9:25 a.m., excepto Alexander Uribe el lunes (ingresa 6:10 a.m.) y Gleysher Mosquera el jueves (ingresa 6:10 a.m.).',
        '- Cuando se activa "Atención a padres" en Bachillerato (06:10-07:00), las clases inician a las 07:00 desplazando 1ª a 5ª hora hacia abajo.',
        '- Primaria y Transición 2 operan en la jornada tarde (5 horas base). Transición 1 opera aislada en la mañana.',
        `Contexto en vivo de la parrilla actual (${ctx.academicPeriod || 'Periodo actual'}, Semana ${ctx.academicWeek || ''}, Jornada activa: ${shiftLabel}):`,
        ctx.teachersSummary && ctx.teachersSummary.length > 0
          ? `Docentes y carga semanal:\n${ctx.teachersSummary
              .map(
                (t) =>
                  `- ${t.name} (${t.level || 'general'}): ${t.weeklyAssignedHours ?? 0}/${t.maxWeeklyHours ?? 24}h | Áreas: ${(t.subjects || []).join(', ') || 'General'}${t.entrySchedule ? ` | ${t.entrySchedule}` : ''}`
              )
              .join('\n')}`
          : '',
        ctx.uncoveredSlotsSummary ? `Ausencias o bloques por cubrir:\n${ctx.uncoveredSlotsSummary}` : '',
        ctx.daySchedulesSummary ? `Resumen de disponibilidad y bloques:\n${ctx.daySchedulesSummary}` : '',
        'Responde en máximo 4 a 6 líneas claras o viñetas puntuales. No uses saludos largos ni relleno.',
      ]
        .filter(Boolean)
        .join('\n\n');

      const historyContents = (body.history || [])
        .filter((msg) => msg && msg.text && (msg.role === 'user' || msg.role === 'model'))
        .slice(-10)
        .map((msg) => ({
          role: msg.role,
          parts: [{ text: msg.text }],
        }));

      const selectedModel =
        body.mode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash';

      const chat = ai.chats.create({
        model: selectedModel,
        history: historyContents,
        config: {
          systemInstruction,
          temperature: 0.25,
        },
      });

      const response = await chat.sendMessage({
        message: userMessage,
      });

      const replyText = response.text?.trim() || buildLocalExpertFallback(body);
      res.status(200).json({ reply: replyText, model: selectedModel });
    } catch (error) {
      console.error('[ScheduleAgent] Error consultando Gemini, aplicando motor local:', error);
      res.status(200).json({ reply: buildLocalExpertFallback(body) });
    }
  });

  // Purgar cualquier Service Worker previo que haya cacheado bundles antiguos con CacheFirst
  app.get(['/sw.js', '/dev-sw.js', '/registerSW.js'], (_req, res) => {
    setNoCacheHeaders(res);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.status(200).send(`
      self.addEventListener('install', () => {
        self.skipWaiting();
      });
      self.addEventListener('activate', (event) => {
        event.waitUntil(
          caches.keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .then(() => self.registration.unregister())
            .then(() => self.clients.matchAll({ type: 'window' }))
            .then((clients) => {
              clients.forEach((client) => {
                if ('navigate' in client) {
                  client.navigate(client.url);
                }
              });
            })
        );
      });
    `);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use((req, res, next) => {
      if (
        req.path === '/' ||
        req.path.endsWith('.html') ||
        req.path.startsWith('/src/') ||
        req.path.startsWith('/@')
      ) {
        setNoCacheHeaders(res);
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
