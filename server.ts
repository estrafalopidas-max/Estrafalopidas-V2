import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
  app.disable('x-powered-by');

  // Blindaje de cabeceras HTTP y bloqueo contra exploración de rutas / archivos internos del contenedor o NAS
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    const decodedPath = (() => {
      try {
        return decodeURIComponent(req.path || '');
      } catch {
        return req.path || '';
      }
    })().toLowerCase();

    if (
      decodedPath.includes('..') ||
      decodedPath.includes('\0') ||
      decodedPath.startsWith('/data/') ||
      decodedPath.startsWith('/.env') ||
      decodedPath.startsWith('/.git') ||
      decodedPath.endsWith('.key') ||
      (decodedPath.includes('ievf_') && decodedPath.endsWith('.json'))
    ) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }
    next();
  });

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

  // Endpoint y servicio de logo institucional (soporta JSON dataUrl y stream multipart/raw, con persistencia en NAS/PostgreSQL)
  let verifyWriteRequestRef: ((req: express.Request) => boolean) | null = null;
  let saveLogoToDatabaseRef: ((buf: Buffer, mime: string) => Promise<void>) | null = null;

  const detectMimeType = (buf: Buffer, fallbackMime = 'image/png'): string => {
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return 'image/png';
    }
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'image/jpeg';
    }
    if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    const headStr = buf.subarray(0, 256).toString('utf-8').trim();
    if (headStr.startsWith('<svg') || headStr.includes('<svg')) {
      return 'image/svg+xml';
    }
    return fallbackMime;
  };

  app.post('/api/upload-logo', (req, res) => {
    if (verifyWriteRequestRef && !verifyWriteRequestRef(req)) {
      res.status(401).json({ error: 'Operación protegida: se requiere sesión activa de Coordinación.' });
      return;
    }
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB para soportar base64 holgadamente

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_SIZE) {
        req.destroy();
        res.status(413).json({ error: 'El archivo excede el tamaño máximo permitido.' });
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (res.writableEnded) return;
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = (req.headers['content-type'] || '').toLowerCase();
        let fileBuffer: Buffer | null = null;
        let detectedMime = 'image/png';

        if (contentType.includes('application/json')) {
          const parsed = JSON.parse(buffer.toString('utf-8'));
          const dataUrl: string = parsed?.dataUrl || parsed?.logoDataUrl || parsed?.base64 || '';
          if (dataUrl.startsWith('data:')) {
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
            if (match) {
              detectedMime = match[1].toLowerCase();
              fileBuffer = Buffer.from(match[2], 'base64');
            }
          } else if (dataUrl) {
            fileBuffer = Buffer.from(dataUrl, 'base64');
          }
        } else if (contentType.includes('multipart/form-data')) {
          const boundaryMatch = (req.headers['content-type'] || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i);
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
              let headerEndIdx = part.indexOf('\r\n\r\n');
              let sepLen = 4;
              if (headerEndIdx === -1) {
                headerEndIdx = part.indexOf('\n\n');
                sepLen = 2;
              }
              if (headerEndIdx !== -1) {
                const headerStr = part.subarray(0, headerEndIdx).toString('utf-8');
                if (
                  headerStr.includes('filename=') ||
                  headerStr.includes('name="logo"') ||
                  headerStr.includes('name="file"')
                ) {
                  let content = part.subarray(headerEndIdx + sepLen);
                  if (content.length >= 2 && content[content.length - 2] === 13 && content[content.length - 1] === 10) {
                    content = content.subarray(0, content.length - 2);
                  } else if (content.length >= 1 && content[content.length - 1] === 10) {
                    content = content.subarray(0, content.length - 1);
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
          res.status(400).json({ error: 'No se detectó ningún archivo válido en la petición.' });
          return;
        }

        detectedMime = detectMimeType(fileBuffer, detectedMime);

        const targetPaths = [
          path.resolve(process.cwd(), 'public/logo-institucional.png'),
          path.resolve(process.cwd(), 'public/logo.png'),
          path.resolve(process.cwd(), 'dist/logo-institucional.png'),
          path.resolve(process.cwd(), 'dist/logo.png'),
          path.resolve(process.env.DATA_DIR || path.resolve(process.cwd(), 'data'), 'logo-institucional.png'),
        ];

        for (const p of targetPaths) {
          try {
            const dir = path.dirname(p);
            if (fs.existsSync(dir)) {
              fs.writeFileSync(p, fileBuffer);
            }
          } catch {
            // ignore
          }
        }

        if (saveLogoToDatabaseRef) {
          await saveLogoToDatabaseRef(fileBuffer, detectedMime).catch(() => {});
        }

        const dataUrlResponse = `data:${detectedMime};base64,${fileBuffer.toString('base64')}`;

        res.status(200).json({
          success: true,
          message: 'Logo institucional actualizado correctamente en el servidor.',
          url: `/logo-institucional.png?t=${Date.now()}`,
          dataUrl: dataUrlResponse,
        });
      } catch (err) {
        console.error('[Upload-Logo] Error al guardar logo:', err);
        res.status(500).json({ error: 'Error interno del servidor al guardar el archivo.' });
      }
    });
  });

  // Servir dinámicamente el logo institucional administrativo sin caché
  app.get(['/logo-institucional.png', '/logo.png', '/api/logo'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const candidatePaths = [
      path.resolve(process.env.DATA_DIR || path.resolve(process.cwd(), 'data'), 'logo-institucional.png'),
      path.resolve(process.cwd(), 'public/logo-institucional.png'),
      path.resolve(process.cwd(), 'dist/logo-institucional.png'),
      path.resolve(process.cwd(), 'public/logo.png'),
    ];

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const buf = fs.readFileSync(p);
          if (buf && buf.length > 0) {
            const mime = detectMimeType(buf, 'image/png');
            res.setHeader('Content-Type', mime);
            res.status(200).send(buf);
            return;
          }
        }
      } catch {
        // continue
      }
    }

    res.status(404).end();
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
  const ACADEMIC_CALENDARS_FILE = resolvePersistentFile('ievf_academic_calendars.json');
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

  let academicCalendarsState: Record<string, any> | null = (() => {
    try {
      if (fs.existsSync(ACADEMIC_CALENDARS_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(ACADEMIC_CALENDARS_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed;
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

        ALTER TABLE published_schedule ENABLE ROW LEVEL SECURITY;
        ALTER TABLE week_schedules ENABLE ROW LEVEL SECURITY;
        ALTER TABLE app_kv_store ENABLE ROW LEVEL SECURITY;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'published_schedule' AND policyname = 'rls_published_schedule_backend'
          ) THEN
            CREATE POLICY rls_published_schedule_backend ON published_schedule
              FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'week_schedules' AND policyname = 'rls_week_schedules_backend'
          ) THEN
            CREATE POLICY rls_week_schedules_backend ON week_schedules
              FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'app_kv_store' AND policyname = 'rls_app_kv_store_backend'
          ) THEN
            CREATE POLICY rls_app_kv_store_backend ON app_kv_store
              FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
          END IF;
        END
        $$;
      `);
      isPgReady = true;
      console.log('[PostgreSQL] Conectado, tablas y políticas RLS verificadas correctamente.');

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

      // 5. Hidratar o migrar academic_calendars
      const calRes = await pgPool.query(
        `SELECT value FROM app_kv_store WHERE key = 'academic_calendars' LIMIT 1`
      );
      if (calRes.rows.length > 0 && calRes.rows[0].value) {
        academicCalendarsState = calRes.rows[0].value;
      } else if (academicCalendarsState) {
        await pgPool.query(
          `INSERT INTO app_kv_store (key, value, updated_at_ms)
           VALUES ('academic_calendars', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at_ms = EXCLUDED.updated_at_ms`,
          [JSON.stringify(academicCalendarsState), Number(academicCalendarsState.updatedAtMs || Date.now())]
        );
      }

      // 6. Hidratar logo institucional personalizado desde PostgreSQL
      const logoRes = await pgPool.query(
        `SELECT value FROM app_kv_store WHERE key = 'institutional_logo' LIMIT 1`
      );
      if (logoRes.rows.length > 0 && logoRes.rows[0].value?.base64) {
        try {
          const logoBuf = Buffer.from(logoRes.rows[0].value.base64, 'base64');
          if (logoBuf.length > 0) {
            const hydratePaths = [
              path.resolve(process.cwd(), 'public/logo-institucional.png'),
              path.resolve(process.cwd(), 'public/logo.png'),
              path.resolve(process.cwd(), 'dist/logo-institucional.png'),
              path.resolve(process.cwd(), 'dist/logo.png'),
              path.resolve(DATA_DIR, 'logo-institucional.png'),
            ];
            for (const p of hydratePaths) {
              try {
                if (fs.existsSync(path.dirname(p))) {
                  fs.writeFileSync(p, logoBuf);
                }
              } catch {}
            }
          }
        } catch {}
      }

      saveLogoToDatabaseRef = async (buf: Buffer, mime: string) => {
        if (!pgPool || !isPgReady) return;
        const payload = {
          base64: buf.toString('base64'),
          mimeType: mime,
          updatedAtMs: Date.now(),
        };
        await pgPool.query(
          `INSERT INTO app_kv_store (key, value, updated_at_ms)
           VALUES ('institutional_logo', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at_ms = EXCLUDED.updated_at_ms`,
          [JSON.stringify(payload), payload.updatedAtMs]
        );
      };
    } catch (err) {
      console.error('[PostgreSQL] Error inicializando esquema, operando con respaldo en disco:', err);
    }
  }

  // Motor criptográfico silencioso de sesiones firmadas (HMAC-SHA256) y protección de escritura en API
  const SECRET_KEY_FILE = resolvePersistentFile('ievf_server_secret.key');
  const SERVER_SECRET: string = (() => {
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
      return process.env.SESSION_SECRET.trim();
    }
    try {
      if (fs.existsSync(SECRET_KEY_FILE)) {
        const stored = fs.readFileSync(SECRET_KEY_FILE, 'utf-8').trim();
        if (stored.length >= 32) return stored;
      }
      const generated = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(SECRET_KEY_FILE, generated, { encoding: 'utf-8', mode: 0o600 });
      return generated;
    } catch {
      return crypto.createHash('sha256').update(`ievf-nas-secret-${PRIMARY_ADMIN_EMAIL}`).digest('hex');
    }
  })();

  const createSessionToken = (email: string, role: 'admin' | 'editor'): string => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: email.trim().toLowerCase(),
        role,
        iat: Date.now(),
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }),
      'utf-8'
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', SERVER_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  };

  const verifySessionToken = (token: string | undefined | null): { sub: string; role: string } | null => {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    try {
      const expectedSig = crypto.createHmac('sha256', SERVER_SECRET).update(payload).digest('base64url');
      const a = Buffer.from(sig);
      const b = Buffer.from(expectedSig);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      if (!decoded || typeof decoded.exp !== 'number' || decoded.exp < Date.now()) return null;
      return { sub: String(decoded.sub || ''), role: String(decoded.role || 'editor') };
    } catch {
      return null;
    }
  };

  const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
    const map: Record<string, string> = {};
    if (!cookieHeader) return map;
    cookieHeader.split(';').forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        map[k] = decodeURIComponent(v);
      }
    });
    return map;
  };

  const isAuthorizedActorEmail = (identifierRaw: string | undefined | null): { email: string; role: 'admin' | 'editor' } | null => {
    if (!identifierRaw || typeof identifierRaw !== 'string') return null;
    const normalized = identifierRaw.trim().toLowerCase();
    if (!normalized) return null;
    const primaryPrefix = PRIMARY_ADMIN_EMAIL.split('@')[0].toLowerCase();
    if (
      normalized === PRIMARY_ADMIN_EMAIL.toLowerCase() ||
      normalized === primaryPrefix ||
      normalized === 'coordinacion' ||
      normalized === 'admin'
    ) {
      return { email: PRIMARY_ADMIN_EMAIL.toLowerCase(), role: 'admin' };
    }
    const found = (accessControlState.editors || []).find((e) => {
      if (!e || !e.active) return false;
      const em = (e.email || '').trim().toLowerCase();
      const un = (e.username || '').trim().toLowerCase();
      const pf = em.split('@')[0];
      return em === normalized || (Boolean(un) && un === normalized) || pf === normalized;
    });
    if (found) {
      return { email: found.email.toLowerCase(), role: found.role === 'admin' ? 'admin' : 'editor' };
    }
    return null;
  };

  const isWriteRequestAuthorized = (req: express.Request): boolean => {
    if (!accessControlState.requireAuth) return true;

    // 1. Verificar token criptográfico en cabecera o cookie HttpOnly
    const headerToken =
      (req.headers['x-ievf-session-token'] as string | undefined) ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : undefined);
    if (verifySessionToken(headerToken)) return true;

    const cookies = parseCookies(req.headers.cookie);
    if (verifySessionToken(cookies['ievf_session_token'])) return true;

    // 2. Respaldo silencioso para solicitudes legítimas del mismo origen en el navegador
    const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    const host = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
    const origin = (req.get('origin') || '').toLowerCase();
    const referer = (req.get('referer') || '').toLowerCase();
    const isSameOrigin =
      secFetchSite === 'same-origin' ||
      (Boolean(host) && (origin.includes(host) || referer.includes(host)));

    if (isSameOrigin && secFetchSite !== 'cross-site') {
      return true;
    }

    return false;
  };

  verifyWriteRequestRef = isWriteRequestAuthorized;

  // Control de intentos de inicio de sesión contra fuerza bruta (por IP)
  const loginAttemptsMap = new Map<string, { count: number; resetAt: number }>();

  app.post('/api/auth/session', (req, res) => {
    setNoCacheHeaders(res);
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local');
    const now = Date.now();
    const rateRecord = loginAttemptsMap.get(clientIp);
    if (rateRecord && rateRecord.resetAt > now && rateRecord.count >= 20) {
      res.status(429).json({
        ok: false,
        error: 'Demasiados intentos seguidos. Espera unos minutos antes de volver a intentar.',
      });
      return;
    }

    const body = req.body || {};
    const identifier = String(body.identifier || body.email || '').trim().toLowerCase();
    const password = typeof body.password === 'string' ? body.password.trim() : undefined;
    const isSilentHandshake = Boolean(body.silentHandshake);

    const actor = isAuthorizedActorEmail(identifier);
    if (!actor) {
      loginAttemptsMap.set(clientIp, {
        count: (rateRecord && rateRecord.resetAt > now ? rateRecord.count : 0) + 1,
        resetAt: now + 5 * 60 * 1000,
      });
      res.status(401).json({ ok: false, error: 'Usuario no autorizado.' });
      return;
    }

    if (isSilentHandshake) {
      const existingHeaderToken =
        (req.headers['x-ievf-session-token'] as string | undefined) ||
        (req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7).trim()
          : undefined);
      const cookies = parseCookies(req.headers.cookie);
      const verifiedExisting =
        verifySessionToken(existingHeaderToken) || verifySessionToken(cookies['ievf_session_token']);
      if (!verifiedExisting || verifiedExisting.sub.toLowerCase() !== actor.email.toLowerCase()) {
        res.status(401).json({ ok: false, error: 'Sesión previa inválida o expirada.' });
        return;
      }
    } else {
      if (password === undefined || !password) {
        res.status(401).json({ ok: false, error: 'Se requiere contraseña para iniciar sesión.' });
        return;
      }
      const isPrimary = actor.email === PRIMARY_ADMIN_EMAIL.toLowerCase();
      if (isPrimary) {
        const expected = accessControlState.primaryAdminPassword || 'piloro666';
        if (password !== expected) {
          loginAttemptsMap.set(clientIp, {
            count: (rateRecord && rateRecord.resetAt > now ? rateRecord.count : 0) + 1,
            resetAt: now + 5 * 60 * 1000,
          });
          res.status(401).json({ ok: false, error: 'Contraseña incorrecta.' });
          return;
        }
      } else {
        const ed = (accessControlState.editors || []).find(
          (e) => e.email.trim().toLowerCase() === actor.email
        );
        const expected = ed?.password?.trim() || 'VillaFlora2026*';
        if (password !== expected) {
          loginAttemptsMap.set(clientIp, {
            count: (rateRecord && rateRecord.resetAt > now ? rateRecord.count : 0) + 1,
            resetAt: now + 5 * 60 * 1000,
          });
          res.status(401).json({ ok: false, error: 'La contraseña ingresada es incorrecta.' });
          return;
        }
      }
    }

    loginAttemptsMap.delete(clientIp);
    const token = createSessionToken(actor.email, actor.role);
    res.setHeader(
      'Set-Cookie',
      `ievf_session_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
    );
    res.status(200).json({ ok: true, token, email: actor.email, role: actor.role });
  });

  app.post('/api/auth/logout', (_req, res) => {
    setNoCacheHeaders(res);
    res.setHeader(
      'Set-Cookie',
      'ievf_session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    );
    res.status(200).json({ ok: true });
  });

  // Middleware silencioso que protege todas las rutas de escritura/borrado en /api/*
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    if (req.path === '/auth/session' || req.path === '/auth/logout') {
      next();
      return;
    }
    if (!isWriteRequestAuthorized(req)) {
      res.status(401).json({
        error: 'Operación protegida: se requiere sesión activa de Coordinación.',
      });
      return;
    }
    next();
  });

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

  const getCurrentActiveMondayIso = (): string => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now.getTime());
    monday.setDate(now.getDate() + diff);
    if ((day === 5 && now.getHours() >= 18) || day === 6 || day === 0) {
      monday.setDate(monday.getDate() + 7);
    }
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const extractDayBadgesForWeek = (
    calState: Record<string, any> | null,
    mondayIso: string
  ): Record<string, any[]> => {
    const result: Record<string, any[]> = {
      lunes: [],
      martes: [],
      miercoles: [],
      jueves: [],
      viernes: [],
    };
    if (!calState || !calState.years || !mondayIso) return result;

    const [yearStr, monthStr, dayStr] = mondayIso.split('-');
    const baseDate = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
    const dayIds = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

    const weekDates = dayIds.map((id, index) => {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + index);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return { id, iso: `${y}-${m}-${dt}`, year: y };
    });

    weekDates.forEach(({ id, iso, year }) => {
      const yearConfig = calState.years[year] || calState.years[String(year)];
      const events: any[] = yearConfig?.institutionalEvents || [];
      const matching = events.filter((ev) => {
        if (!ev || !ev.date) return false;
        const start = String(ev.date).trim();
        const end = ev.endDate ? String(ev.endDate).trim() : start;
        return iso >= start && iso <= end;
      });

      if (matching.length > 0) {
        result[id] = matching.map((ev) => ({
          id: ev.id || `ev-${iso}-${Math.random().toString(36).slice(2, 6)}`,
          title: ev.title || 'Evento Especial',
          badgeLabel: ev.badgeLabel || (ev.title ? String(ev.title).slice(0, 22) : 'Especial'),
          description: ev.description || ev.title || '',
          date: ev.date,
          endDate: ev.endDate,
          modality: ev.modality || 'A',
        }));
      }
    });

    return result;
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
      const currentActiveMondayIso = getCurrentActiveMondayIso();
      const pubMondayIso = latestPublishedSchedule.dayConfigs?.anchorMondayIso;
      const isStaleWeek = Boolean(pubMondayIso && pubMondayIso < currentActiveMondayIso);
      const targetMondayIso = isStaleWeek || !pubMondayIso ? currentActiveMondayIso : pubMondayIso;

      let activeContainer = weekSchedulesMap[targetMondayIso];
      if (!activeContainer && pgPool && isPgReady) {
        try {
          const wkRes = await pgPool.query(
            `SELECT container FROM week_schedules WHERE monday_iso = $1 LIMIT 1`,
            [targetMondayIso]
          );
          if (wkRes.rows.length > 0 && wkRes.rows[0].container) {
            activeContainer = wkRes.rows[0].container;
            weekSchedulesMap[targetMondayIso] = activeContainer!;
          }
        } catch {
          // ignore
        }
      }

      const snapTs = Number(
        latestPublishedSchedule.updatedAtMs || latestPublishedSchedule.metadata?.updatedAtMs || 0
      );
      const containerTs = Number(activeContainer?.updatedAt || 0);

      if (isStaleWeek || (activeContainer && containerTs > snapTs)) {
        const effectiveTs = Math.max(snapTs, containerTs, Date.now());
        const nextBlocks =
          activeContainer && Array.isArray(activeContainer.timeBlocks)
            ? activeContainer.timeBlocks
            : latestPublishedSchedule.timeBlocks || [];
        latestPublishedSchedule = {
          ...latestPublishedSchedule,
          updatedAtMs: effectiveTs,
          timeBlocks: nextBlocks,
          dayConfigs: {
            ...(latestPublishedSchedule.dayConfigs || {}),
            anchorMondayIso: targetMondayIso,
            activeWeekSlot: 'current',
            ...(activeContainer
              ? {
                  meetingDays: activeContainer.meetingDays || {},
                  scheduleTypes: activeContainer.scheduleTypes || {},
                }
              : isStaleWeek
              ? { meetingDays: {}, scheduleTypes: {} }
              : {}),
            updatedAtMs: effectiveTs,
          },
          metadata: {
            ...(latestPublishedSchedule.metadata || {}),
            totalBlocks: nextBlocks.length,
            updatedAtMs: effectiveTs,
            lastUpdated: formatColombiaTimestamp(effectiveTs),
          },
        };
      } else if (snapTs > 0) {
        latestPublishedSchedule = {
          ...latestPublishedSchedule,
          metadata: {
            ...(latestPublishedSchedule.metadata || {}),
            lastUpdated: formatColombiaTimestamp(snapTs),
          },
        };
      }

      const pubBadges = latestPublishedSchedule.dayConfigs?.dayBadges;
      const hasPubBadges =
        pubBadges &&
        Object.values(pubBadges).some((arr: any) => Array.isArray(arr) && arr.length > 0);
      if (!hasPubBadges && academicCalendarsState && academicCalendarsState.years) {
        const effMonday = latestPublishedSchedule.dayConfigs?.anchorMondayIso || targetMondayIso;
        const extractedBadges = extractDayBadgesForWeek(academicCalendarsState, effMonday);
        if (Object.values(extractedBadges).some((arr) => arr.length > 0)) {
          latestPublishedSchedule = {
            ...latestPublishedSchedule,
            dayConfigs: {
              ...(latestPublishedSchedule.dayConfigs || {}),
              dayBadges: extractedBadges,
            },
          };
        }
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

    let dayBadges = incoming.dayConfigs?.dayBadges || {};
    const hasAnyBadges = Object.values(dayBadges).some(
      (arr: any) => Array.isArray(arr) && arr.length > 0
    );
    if (!hasAnyBadges && academicCalendarsState && academicCalendarsState.years) {
      const targetMonday = incoming.dayConfigs?.anchorMondayIso || getCurrentActiveMondayIso();
      dayBadges = extractDayBadgesForWeek(academicCalendarsState, targetMonday);
    }

    const normalized: Record<string, any> = {
      ...incoming,
      blankMatrixMode: isBlank,
      updatedAtMs: nowMs,
      timeBlocks: isBlank ? [] : incoming.timeBlocks,
      dayConfigs: {
        ...(incoming.dayConfigs || {}),
        dayBadges,
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

    const currentActiveMondayIso = getCurrentActiveMondayIso();
    if (
      latestPublishedSchedule &&
      typeof latestPublishedSchedule === 'object' &&
      (mondayIso === currentActiveMondayIso ||
        mondayIso === latestPublishedSchedule.dayConfigs?.anchorMondayIso)
    ) {
      const updatedPublished = {
        ...latestPublishedSchedule,
        updatedAtMs: nowMs,
        timeBlocks: container.timeBlocks,
        dayConfigs: {
          ...(latestPublishedSchedule.dayConfigs || {}),
          anchorMondayIso: mondayIso,
          meetingDays: container.meetingDays,
          scheduleTypes: container.scheduleTypes,
          updatedAtMs: nowMs,
        },
        metadata: {
          ...(latestPublishedSchedule.metadata || {}),
          totalBlocks: container.timeBlocks.length,
          updatedAtMs: nowMs,
          lastUpdated: formatColombiaTimestamp(nowMs),
        },
      };
      await persistPublishedSchedule(updatedPublished);
    }

    res.status(200).json({ ok: true, mondayIso, updatedAt: nowMs });
  });

  app.delete('/api/week-schedules', async (req, res) => {
    setNoCacheHeaders(res);
    const rawFrom = typeof req.query.fromMondayIso === 'string' ? req.query.fromMondayIso.trim() : '';
    const cutoffIso = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : getCurrentActiveMondayIso();

    for (const key of Object.keys(weekSchedulesMap)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key >= cutoffIso) {
        delete weekSchedulesMap[key];
      }
    }

    try {
      fs.writeFileSync(WEEK_SCHEDULES_FILE, JSON.stringify(weekSchedulesMap), 'utf-8');
    } catch {
      // ignore
    }

    if (pgPool && isPgReady) {
      try {
        await pgPool.query(`DELETE FROM week_schedules WHERE monday_iso >= $1`, [cutoffIso]);
      } catch (err) {
        console.error('[PostgreSQL] Error limpiando week_schedules desde fecha activa:', err);
      }
    }
    res.status(200).json({ ok: true, cutoffIso });
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
    if (!teachersList && fs.existsSync(TEACHERS_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf-8'));
        if (Array.isArray(parsed)) teachersList = parsed;
      } catch {
        // ignore
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

  const sanitizeAccessControlForClient = (state: ServerAccessControlConfig) => ({
    requireAuth: state.requireAuth,
    inactivityTimeoutMinutes: state.inactivityTimeoutMinutes,
    primaryAdminEmail: state.primaryAdminEmail,
    updatedAtMs: state.updatedAtMs,
    editors: (state.editors || []).map(({ password: _pwd, ...rest }) => rest),
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
    res.status(200).json(sanitizeAccessControlForClient(accessControlState));
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
      body.primaryAdminPassword.trim() !== 'VillaFlora2026*' &&
      body.primaryAdminPassword.trim() !== '***REDACTED***'
        ? body.primaryAdminPassword.trim()
        : accessControlState.primaryAdminPassword || 'piloro666';
    const existingEditorsByEmail = new Map(
      (accessControlState.editors || []).map((e) => [e.email.trim().toLowerCase(), e])
    );
    const nextEditors: ServerAuthorizedEditor[] = Array.isArray(body.editors)
      ? body.editors
          .filter((e: any) => e && typeof e.email === 'string' && e.email.trim())
          .map((e: any) => {
            const cleanEmail = e.email.trim().toLowerCase();
            const prevEditor = existingEditorsByEmail.get(cleanEmail);
            const incomingPwd =
              typeof e.password === 'string' &&
              e.password.trim() &&
              e.password.trim() !== '***REDACTED***'
                ? e.password.trim()
                : prevEditor?.password;
            return {
              email: cleanEmail,
              ...(typeof e.username === 'string' && e.username.trim()
                ? { username: e.username.trim().toLowerCase() }
                : prevEditor?.username
                ? { username: prevEditor.username }
                : {}),
              name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : e.email.trim(),
              ...(typeof e.position === 'string' && e.position.trim()
                ? { position: e.position.trim() }
                : {}),
              ...(incomingPwd ? { password: incomingPwd } : {}),
              role: e.role === 'admin' ? 'admin' : 'editor',
              addedAt: typeof e.addedAt === 'string' ? e.addedAt : new Date().toISOString(),
              active: typeof e.active === 'boolean' ? e.active : true,
            };
          })
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

    res.status(200).json(sanitizeAccessControlForClient(accessControlState));
  });

  // Endpoints de Planificador de Año Escolar (Multi-Año) en NAS / PostgreSQL
  app.get('/api/academic-calendar', async (_req, res) => {
    setNoCacheHeaders(res);
    if (pgPool && isPgReady) {
      try {
        const dbRes = await pgPool.query(
          `SELECT value FROM app_kv_store WHERE key = 'academic_calendars' LIMIT 1`
        );
        if (dbRes.rows.length > 0 && dbRes.rows[0].value) {
          academicCalendarsState = dbRes.rows[0].value;
        }
      } catch {
        // Fallback a memoria / disco
      }
    }
    res.status(200).json({ store: academicCalendarsState });
  });

  app.post('/api/academic-calendar', async (req, res) => {
    setNoCacheHeaders(res);
    const incoming = req.body?.store || req.body;
    if (!incoming || typeof incoming !== 'object' || !incoming.years) {
      res.status(400).json({ error: 'Formato de calendario académico inválido.' });
      return;
    }
    const nowMs = Date.now();
    academicCalendarsState = {
      ...incoming,
      updatedAtMs: nowMs,
    };

    try {
      fs.writeFileSync(ACADEMIC_CALENDARS_FILE, JSON.stringify(academicCalendarsState), 'utf-8');
    } catch {
      // ignore
    }

    if (pgPool && isPgReady) {
      try {
        await pgPool.query(
          `INSERT INTO app_kv_store (key, value, updated_at_ms)
           VALUES ('academic_calendars', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at_ms = EXCLUDED.updated_at_ms`,
          [JSON.stringify(academicCalendarsState), nowMs]
        );
      } catch (err) {
        console.error('[PostgreSQL] Error guardando academic_calendars:', err);
      }
    }

    res.status(200).json({ ok: true, store: academicCalendarsState });
  });

  // Endpoint de extracción automática por IA de Resoluciones de Calendario Académico (Imagen / PDF)
  app.post('/api/academic-calendar/parse-resolution', async (req, res) => {
    setNoCacheHeaders(res);
    const body = req.body || {};
    let base64Data: string = typeof body.base64Data === 'string' ? body.base64Data.trim() : '';
    let mimeType: string = typeof body.mimeType === 'string' ? body.mimeType.trim() : 'image/png';
    const targetYearHint = Number(body.year) || 2027;

    if (body.useAttached2027Resolution) {
      try {
        const attachedPath = path.resolve(process.cwd(), 'public/assets/aistudio/image_8e3d5042.png');
        if (fs.existsSync(attachedPath)) {
          base64Data = fs.readFileSync(attachedPath).toString('base64');
          mimeType = 'image/png';
        }
      } catch {
        // ignore
      }
    }

    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1] || base64Data;
    }

    if (!base64Data) {
      res.status(400).json({ error: 'No se recibió ninguna imagen o PDF de la resolución.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada en el servidor para analizar imágenes.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const promptText = [
        `Analiza esta imagen o documento oficial de la Resolución de Calendario Académico (año sugerido: ${targetYearHint}).`,
        'Extrae con precisión todas las fechas en formato ISO YYYY-MM-DD:',
        '1. El año escolar principal (year) y título descriptivo de la resolución (resolutionTitle).',
        '2. Los bloques de semanas lectivas del Artículo 2 (lectureBlocks: start, end, weeks, label).',
        '3. Distribuye las 40 semanas lectivas hábiles (descontando las semanas de receso estudiantil intermedias) en 3 periodos académicos institucionales: Periodo 1 (13 semanas), Periodo 2 (13 semanas) y Periodo 3 (14 semanas).',
        '4. Las semanas de Desarrollo Institucional (institutionalDevelopmentWeeks: start, end, weeks, name).',
        '5. Las semanas de Vacaciones de Docentes y Directivos Docentes (teacherVacations: start, end, weeks, name).',
        '6. Las semanas de Receso Estudiantil (studentRecesses: start, end, weeks, name).',
        '7. Las semanas lectivas adicionales para CLEI V y VI si aparecen (cleiAdditionalWeeks: start, end, weeks, name).',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              year: { type: Type.INTEGER, description: 'Año escolar de la resolución (ej. 2027)' },
              resolutionTitle: { type: Type.STRING, description: 'Título de la resolución' },
              periods: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    period: { type: Type.INTEGER },
                    start: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    end: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    totalWeeks: { type: Type.INTEGER },
                    label: { type: Type.STRING },
                  },
                },
              },
              lectureBlocks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    end: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    weeks: { type: Type.INTEGER },
                    label: { type: Type.STRING },
                  },
                },
              },
              institutionalDevelopmentWeeks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    end: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    weeks: { type: Type.INTEGER },
                    name: { type: Type.STRING },
                  },
                },
              },
              teacherVacations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    end: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    weeks: { type: Type.INTEGER },
                    name: { type: Type.STRING },
                  },
                },
              },
              studentRecesses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    end: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    weeks: { type: Type.INTEGER },
                    name: { type: Type.STRING },
                  },
                },
              },
              cleiAdditionalWeeks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    end: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    weeks: { type: Type.INTEGER },
                    name: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsedJson = JSON.parse((response.text ?? '{}').trim());
      res.status(200).json({ extracted: parsedJson });
    } catch (err: any) {
      console.error('[Parse-Resolution] Error procesando imagen con Gemini:', err);
      res.status(500).json({
        error: err?.message || 'Error al analizar la resolución con inteligencia artificial.',
      });
    }
  });

  // Endpoint de extracción automática por IA de Días de Trabajo Especiales / Proyección de Actividades (Imagen / Circular)
  app.post('/api/academic-calendar/parse-special-days', async (req, res) => {
    setNoCacheHeaders(res);
    const body = req.body || {};
    let base64Data: string = typeof body.base64Data === 'string' ? body.base64Data.trim() : '';
    const mimeType: string = typeof body.mimeType === 'string' ? body.mimeType.trim() : 'image/png';
    const targetYearHint = Number(body.year) || 2026;

    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1] || base64Data;
    }

    if (!base64Data) {
      res.status(400).json({ error: 'No se recibió ninguna imagen del cronograma o circular.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada en el servidor para analizar imágenes.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const promptText = [
        `Analiza esta imagen de cronograma, proyección o circular de actividades institucionales para el año escolar ${targetYearHint}.`,
        'Extrae cada actividad o día de trabajo especial con:',
        `- date: fecha de inicio en formato ISO YYYY-MM-DD (usando el año ${targetYearHint}).`,
        '- endDate: fecha de fin en formato ISO YYYY-MM-DD solo si la actividad abarca varios días (ej. "Del 9 al 13 de noviembre" -> date: "2026-11-09", endDate: "2026-11-13"); si es un solo día, deja endDate vacío.',
        '- title: nombre claro de la actividad.',
        '- badgeLabel: texto muy corto (máximo 18 caracteres) para la insignia del día en el HTML público (ej. "Pruebas Periodo", "Planes de apoyo", "1ª Comisión", "Graduación").',
        '- description: descripción completa que se mostrará en el tooltip al pasar el cursor por la insignia en el HTML público (incluyendo horas, lugares o detalles si aparecen).',
        '- modality: "D" si menciona planes de apoyo con horario especial; "B" si menciona atención a padres o entrega de notas; "holiday" si es día sin clases; "novelty" si es acto especial o graduación; "A" para el resto.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              events: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    endDate: { type: Type.STRING, description: 'YYYY-MM-DD opcional' },
                    title: { type: Type.STRING },
                    badgeLabel: { type: Type.STRING },
                    description: { type: Type.STRING },
                    modality: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsedJson = JSON.parse((response.text ?? '{}').trim());
      res.status(200).json({ events: Array.isArray(parsedJson?.events) ? parsedJson.events : [] });
    } catch (err: any) {
      console.error('[Parse-Special-Days] Error procesando imagen con Gemini:', err);
      res.status(500).json({
        error: err?.message || 'Error al analizar la imagen de actividades con inteligencia artificial.',
      });
    }
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
