import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';

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
  app.use('/api', express.json({ limit: '5mb' }));

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
  let latestPublishedSchedule: Record<string, unknown> | null = (() => {
    try {
      if (fs.existsSync(PUBLISHED_SCHEDULE_FILE)) {
        return JSON.parse(fs.readFileSync(PUBLISHED_SCHEDULE_FILE, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return null;
  })();

  app.get('/api/published-schedule', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ snapshot: latestPublishedSchedule });
  });

  app.post('/api/published-schedule', (req, res) => {
    const incoming = req.body?.snapshot || req.body;
    if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.timeBlocks)) {
      res.status(400).json({ error: 'Formato de horario publicado inválido.' });
      return;
    }
    const nowMs = Date.now();
    const isBlank = Boolean(incoming.blankMatrixMode ?? incoming.dayConfigs?.blankMatrixMode ?? incoming.timeBlocks.length === 0);
    const normalized = {
      ...incoming,
      blankMatrixMode: isBlank,
      updatedAtMs: Number(incoming.updatedAtMs || incoming.dayConfigs?.updatedAtMs || nowMs),
      timeBlocks: isBlank ? [] : incoming.timeBlocks,
      dayConfigs: {
        ...(incoming.dayConfigs || {}),
        blankMatrixMode: isBlank,
        updatedAtMs: Number(incoming.updatedAtMs || incoming.dayConfigs?.updatedAtMs || nowMs),
      },
      metadata: {
        ...(incoming.metadata || {}),
        blankMatrixMode: isBlank,
        updatedAtMs: Number(incoming.updatedAtMs || incoming.dayConfigs?.updatedAtMs || nowMs),
        totalBlocks: isBlank ? 0 : incoming.timeBlocks.length,
      },
    };
    latestPublishedSchedule = normalized;
    try {
      fs.writeFileSync(PUBLISHED_SCHEDULE_FILE, JSON.stringify(normalized), 'utf-8');
    } catch {
      // ignore
    }
    res.status(200).json({ ok: true, blankMatrixMode: isBlank, updatedAtMs: normalized.updatedAtMs });
  });

  // Endpoints de Control de Acceso y Delegación de Edición
  const ACCESS_CONTROL_FILE = resolvePersistentFile('ievf_access_control.json');
  const PRIMARY_ADMIN_EMAIL = process.env.PRIMARY_ADMIN_EMAIL || 'estrafalopidas@gmail.com';

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
    primaryAdminEmail: string;
    primaryAdminPassword?: string;
    editors: ServerAuthorizedEditor[];
    updatedAtMs: number;
  }

  let accessControlState: ServerAccessControlConfig = (() => {
    try {
      if (fs.existsSync(ACCESS_CONTROL_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(ACCESS_CONTROL_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.editors)) {
          return {
            requireAuth: typeof parsed.requireAuth === 'boolean' ? parsed.requireAuth : true,
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
      primaryAdminEmail: PRIMARY_ADMIN_EMAIL,
      primaryAdminPassword: 'piloro666',
      editors: [],
      updatedAtMs: Date.now(),
    };
  })();

  app.get('/api/access-control', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json(accessControlState);
  });

  app.post('/api/access-control', (req, res) => {
    const body = req.body || {};
    const nextRequireAuth =
      typeof body.requireAuth === 'boolean' ? body.requireAuth : accessControlState.requireAuth;
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
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
