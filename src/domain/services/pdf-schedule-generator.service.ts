import { TimeBlockEntity, classifyBlockType } from '../entities/time-block.entity';
import { calculateLuminanceContrast } from './teacher-color.service';
import { toTitleCase, getShortTeacherName } from './teacher-visual-identity.service';
import { getTeacherExcelIdentity, resolveOfficialTeacherEntry } from './teacher-normalization.service';
import { getFirstAndLastNameInitials } from './html-schedule-generator.service';
import { resolveEffectiveClassroomForBlock } from './grade-normalization.service';

export interface PdfSlotConfig {
  period: number;
  time: string;
  label: string;
  isBreak?: boolean;
  isTransition?: boolean;
  mediaTecnicaOnly?: boolean;
  isPreJornada?: boolean;
  isMeetingFirstHour?: boolean;
  meetingTitle?: string;
  meetingDesc?: string;
}

export interface PdfScheduleExportOptions {
  shiftLabel: string;
  shiftKey: string;
  dayLabel: string;
  scheduleType: 'A' | 'B' | 'C' | 'D';
  academicPeriod: string;
  academicWeek: number;
  isHoliday: boolean;
  grades: string[];
  periodSlots: PdfSlotConfig[];
  blocks: TimeBlockEntity[];
  teachers: Array<{ id: string; displayName: string; color: string }>;
  logoSrc: string;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2
): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = current + ' ' + words[i];
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines - 1) break;
    }
  }
  lines.push(current);
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }
  // Truncate last line with ellipsis if needed
  const lastIdx = lines.length - 1;
  while (lines[lastIdx].length > 3 && ctx.measureText(lines[lastIdx]).width > maxWidth) {
    lines[lastIdx] = lines[lastIdx].slice(0, -2) + '…';
  }
  return lines;
}

function buildPdfFromJpegDataUrl(
  jpegDataUrl: string,
  imgWidthPx: number,
  imgHeightPx: number
): Blob {
  const base64 = jpegDataUrl.split(',')[1];
  const binaryStr = atob(base64);
  const jpegBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    jpegBytes[i] = binaryStr.charCodeAt(i);
  }

  // Landscape A4 width = 841.89pt; scale height proportionally
  const pageWidthPt = 841.89;
  const pageHeightPt = Math.max(595.28, Math.round((imgHeightPx / imgWidthPx) * pageWidthPt * 100) / 100);

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  offsets[1] = currentOffset;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  offsets[2] = currentOffset;
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: Page
  offsets[3] = currentOffset;
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  // 4: Image XObject
  offsets[4] = currentOffset;
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidthPx} /Height ${imgHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  // 5: Content Stream
  const contentStream = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  offsets[5] = currentOffset;
  pushStr(
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
  );

  // Xref
  const xrefOffset = currentOffset;
  pushStr('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    pushStr(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  }

  pushStr(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

export async function downloadScheduleAsPdf(options: PdfScheduleExportOptions): Promise<void> {
  const {
    shiftLabel,
    shiftKey,
    dayLabel,
    scheduleType,
    academicPeriod,
    academicWeek,
    isHoliday,
    grades,
    periodSlots,
    blocks,
    teachers,
    logoSrc,
  } = options;

  const teacherMap = new Map<string, { name: string; color: string }>();
  teachers.forEach((t) => {
    const official = resolveOfficialTeacherEntry(t.id, t.displayName);
    const identity = getTeacherExcelIdentity(t.id, t.displayName);
    const resolvedColor = identity.color_hex || t.color || '#007DC5';
    teacherMap.set(t.id, { name: t.displayName, color: resolvedColor });
    if (official) {
      if (official.id) {
        teacherMap.set(official.id, { name: official.canonicalName, color: resolvedColor });
      }
      teacherMap.set(official.canonicalName.toLowerCase().trim(), {
        name: official.canonicalName,
        color: resolvedColor,
      });
      teacherMap.set(official.shortName.toLowerCase().trim(), {
        name: official.canonicalName,
        color: resolvedColor,
      });
    }
    if (t.displayName) {
      teacherMap.set(t.displayName.toLowerCase().trim(), {
        name: t.displayName,
        color: resolvedColor,
      });
    }
  });

  const scale = 2;
  const timeColW = 128;
  const minGradeColW = 128;
  const tableContentW = Math.max(1360, timeColW + Math.max(1, grades.length) * minGradeColW);
  const gradeColW = (tableContentW - timeColW) / Math.max(1, grades.length);
  const padX = 28;
  const logicalW = tableContentW + padX * 2;

  const headerH = 112;
  const subBarH = 44;
  const tableHeaderH = 42;
  const holidayBannerH = isHoliday ? 38 : 0;

  const rowHeights = periodSlots.map((slot) => {
    if (slot.isBreak) return 40;
    if (slot.isTransition) return 34;
    if ((slot.isPreJornada || slot.isMeetingFirstHour) && !isHoliday) return 68;
    return 96;
  });

  const totalRowsH = rowHeights.reduce((a, b) => a + b, 0);
  const footerH = 44;
  const logicalH = 24 + headerH + 14 + subBarH + 14 + tableHeaderH + holidayBannerH + totalRowsH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(logicalW * scale);
  canvas.height = Math.round(logicalH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);

  // Page Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, logicalW, logicalH);

  // 1. Header Banner (#0c4da2)
  const hx = padX;
  const hy = 20;
  const hw = tableContentW;
  drawRoundedRect(ctx, hx, hy, hw, headerH, 18);
  ctx.fillStyle = '#0c4da2';
  ctx.fill();

  // Logo on left
  const logoImg = await loadImage(logoSrc);
  let titleStartX = hx + 28;
  if (logoImg && logoImg.width > 0 && logoImg.height > 0) {
    const targetLogoH = 66;
    const targetLogoW = (logoImg.width / logoImg.height) * targetLogoH;
    ctx.drawImage(logoImg, hx + 24, hy + (headerH - targetLogoH) / 2, targetLogoW, targetLogoH);
    titleStartX = hx + 24 + targetLogoW + 26;

    // Subtle divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(titleStartX - 13, hy + 22);
    ctx.lineTo(titleStartX - 13, hy + headerH - 22);
    ctx.stroke();
  }

  // Title in header
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 23px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('Sistema de Agendamiento Escolar', titleStartX, hy + headerH / 2 - 12);

  ctx.fillStyle = '#bae6fd';
  ctx.font = '700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Horarios, actividades y jornadas académicas', titleStartX, hy + headerH / 2 + 15);

  // Periodo Académico box on right
  const metaW = 240;
  const metaH = 68;
  const metaX = hx + hw - metaW - 22;
  const metaY = hy + (headerH - metaH) / 2;
  drawRoundedRect(ctx, metaX, metaY, metaW, metaH, 12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const formattedPdfPeriod =
    (academicPeriod || '3er Periodo').toLowerCase().includes('académico') ||
    (academicPeriod || '3er Periodo').toLowerCase().includes('academico')
      ? academicPeriod || '3er Periodo académico'
      : `${academicPeriod || '3er Periodo'} académico`;

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(formattedPdfPeriod, metaX + metaW - 16, metaY + 25);

  ctx.fillStyle = '#e0f2fe';
  ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`Semana académica ${academicWeek || 9} de 14`, metaX + metaW - 16, metaY + 47);

  // 2. Context Sub-bar
  const subY = hy + headerH + 12;
  drawRoundedRect(ctx, hx, subY, hw, subBarH, 10);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(
    `Jornada: ${shiftLabel}   •   Día: ${dayLabel}${isHoliday ? ' (Día Festivo)' : ''}   •   Horario ${scheduleType}`,
    hx + 16,
    subY + subBarH / 2
  );

  // 3. Schedule Table
  let curY = subY + subBarH + 12;
  const tableTotalH = tableHeaderH + holidayBannerH + totalRowsH;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(hx, curY, hw, tableTotalH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(hx, curY, hw, tableTotalH);

  // Table Header Row
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(hx, curY, hw, tableHeaderH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(hx, curY + tableHeaderH);
  ctx.lineTo(hx + hw, curY + tableHeaderH);
  ctx.stroke();

  // First column header: Horario A / B
  ctx.fillStyle = '#334155';
  ctx.font = '800 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`HORARIO ${scheduleType}`, hx + 12, curY + tableHeaderH / 2);

  // Grade columns headers
  grades.forEach((g, idx) => {
    const colX = hx + timeColW + idx * gradeColW;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(colX, curY);
    ctx.lineTo(colX, curY + tableHeaderH);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(g, colX + gradeColW / 2, curY + tableHeaderH / 2);
  });

  curY += tableHeaderH;

  // Holiday Banner Row if active
  if (isHoliday) {
    ctx.fillStyle = '#fef2f2';
    ctx.fillRect(hx, curY, hw, holidayBannerH);
    ctx.strokeStyle = '#fecaca';
    ctx.beginPath();
    ctx.moveTo(hx, curY + holidayBannerH);
    ctx.lineTo(hx + hw, curY + holidayBannerH);
    ctx.stroke();

    ctx.fillStyle = '#991b1b';
    ctx.font = '800 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Día Festivo Institucional • Sin actividad académica programada',
      hx + hw / 2,
      curY + holidayBannerH / 2
    );
    curY += holidayBannerH;
  }

  // Rows
  periodSlots.forEach((slot, rIdx) => {
    const rowH = rowHeights[rIdx];

    if (slot.isBreak) {
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(hx, curY, hw, rowH);
      ctx.fillStyle = '#92400e';
      ctx.font = '800 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${slot.label} • (${slot.time})`, hx + hw / 2, curY + rowH / 2);

      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(hx, curY + rowH);
      ctx.lineTo(hx + hw, curY + rowH);
      ctx.stroke();
      curY += rowH;
      return;
    }

    if (slot.isTransition) {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(hx, curY, hw, rowH);
      ctx.fillStyle = '#475569';
      ctx.font = '800 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${slot.label} • (${slot.time})`, hx + hw / 2, curY + rowH / 2);

      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(hx, curY + rowH);
      ctx.lineTo(hx + hw, curY + rowH);
      ctx.stroke();
      curY += rowH;
      return;
    }

    if ((slot.isPreJornada || slot.isMeetingFirstHour) && !isHoliday) {
      // Left time column
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(hx, curY, timeColW, rowH);
      ctx.fillStyle = '#0c4da2';
      ctx.font = '800 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(slot.label, hx + 12, curY + rowH / 2 - 8);
      ctx.fillStyle = '#64748b';
      ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(slot.time, hx + 12, curY + rowH / 2 + 10);

      // Right full-span meeting banner
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(hx + timeColW, curY, hw - timeColW, rowH);
      ctx.fillStyle = '#111827';
      ctx.font = '900 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        slot.meetingTitle || 'ATENCIÓN A PADRES',
        hx + timeColW + (hw - timeColW) / 2,
        curY + rowH / 2 - 9
      );
      ctx.fillStyle = '#374151';
      ctx.font = '600 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(
        slot.meetingDesc || '',
        hx + timeColW + (hw - timeColW) / 2,
        curY + rowH / 2 + 11
      );

      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(hx + timeColW, curY);
      ctx.lineTo(hx + timeColW, curY + rowH);
      ctx.moveTo(hx, curY + rowH);
      ctx.lineTo(hx + hw, curY + rowH);
      ctx.stroke();
      curY += rowH;
      return;
    }

    // Standard Period Row
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(hx, curY, timeColW, rowH);
    ctx.fillStyle = '#0c4da2';
    ctx.font = '800 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(slot.label, hx + 12, curY + rowH / 2 - 8);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(slot.time, hx + 12, curY + rowH / 2 + 10);

    grades.forEach((grade, gIdx) => {
      const cellX = hx + timeColW + gIdx * gradeColW;
      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(cellX, curY);
      ctx.lineTo(cellX, curY + rowH);
      ctx.stroke();

      const cardX = cellX + 4;
      const cardY = curY + 4;
      const cardW = gradeColW - 8;
      const cardH = rowH - 8;

      if (isHoliday) {
        drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 6);
        ctx.fillStyle = '#f3f4f6';
        ctx.fill();
        ctx.strokeStyle = '#e5e7eb';
        ctx.stroke();
        ctx.fillStyle = '#9ca3af';
        ctx.font = '800 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FESTIVO', cardX + cardW / 2, cardY + cardH / 2 - 6);
        ctx.font = '600 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('Sin actividad', cardX + cardW / 2, cardY + cardH / 2 + 8);
        return;
      }

      const cellBlocks = blocks.filter((b) => b.period === slot.period && b.gradeName === grade);
      const isSeniorHigh = grade.startsWith('10') || grade.startsWith('11');
      const isBeyondRegularMorning = shiftKey === 'morning' && slot.period > 6 && !isSeniorHigh;

      if (cellBlocks.length === 0) {
        drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 6);
        ctx.fillStyle = isBeyondRegularMorning ? '#f1f5f9' : '#f9fafb';
        ctx.fill();
        ctx.strokeStyle = '#d1d5db';
        ctx.stroke();
        ctx.fillStyle = '#9ca3af';
        ctx.font = '600 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          isBeyondRegularMorning ? 'Fin de jornada' : 'Sin asignación',
          cardX + cardW / 2,
          cardY + cardH / 2
        );
        return;
      }

      const b = cellBlocks[0];
      const effectiveType =
        b.block_type && b.block_type !== 'class' ? b.block_type : classifyBlockType(b.subject);

      const fallbackIdentity = getTeacherExcelIdentity(b.teacherId, b.teacherName);
      const teacherInfo =
        teacherMap.get(b.teacherId) ||
        teacherMap.get((b.teacherName || '').toLowerCase().trim()) || {
          name: b.teacherName || 'Sin asignar',
          color: fallbackIdentity.color_hex || '#034EA2',
        };
      teacherInfo.color = fallbackIdentity.color_hex || teacherInfo.color || '#034EA2';
      const teacherName = getShortTeacherName(b.teacherId, b.teacherName || teacherInfo.name || 'Sin Asignar');

      if (effectiveType === 'novelty' || b.motivo_novedad) {
        drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 6);
        ctx.fillStyle = '#fffbeb';
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;

        const rawReason =
          b.motivo_novedad ||
          (b.notes
            ? b.notes
                .replace(/^novedad:\s*/i, '')
                .replace(/^evento institucional programado:\s*/i, '')
                .trim()
            : '') ||
          (b.teacherId === 'evento-institucional' ||
          (b.subject &&
            /^(NOVEDAD|ACTO\s|ACTIVIDAD\s|REUNI[OÓ]N\s|JORNADA\s|DIRECCI[OÓ]N\s)/i.test(
              b.subject.trim()
            ))
            ? b.subject
            : 'NOVEDAD DOCENTE');

        const reasonUpper = String(rawReason).replace(/🇨🇴/g, '').trim().toUpperCase();
        const isActoCivico =
          reasonUpper.includes('ACTO CÍVICO') || reasonUpper.includes('ACTO CIVICO');

        const iconY = cardY + 14;
        const subY = cardY + 25;

        ctx.textAlign = 'center';
        ctx.font = '700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#d97706';
        ctx.fillText('⚠️', cardX + cardW / 2, iconY);

        ctx.fillStyle = '#92400e';
        ctx.font = '600 7.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('Novedad institucional', cardX + cardW / 2, subY);

        ctx.fillStyle = '#451a03';
        ctx.font = '900 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const novLines = wrapTextLines(ctx, reasonUpper, cardW - 10, 2);
        const descStartY = cardY + (novLines.length > 1 ? 36 : 38);
        novLines.forEach((ln, li) => {
          ctx.fillText(ln, cardX + cardW / 2, descStartY + li * 10);
        });

        const afterDescY = descStartY + (novLines.length - 1) * 10;

        if (isActoCivico) {
          const flagW = 14;
          const flagH = 9;
          const flagX = cardX + (cardW - flagW) / 2;
          const flagY = afterDescY + 6;
          ctx.fillStyle = '#FCD116';
          ctx.fillRect(flagX, flagY, flagW, flagH * 0.5);
          ctx.fillStyle = '#003893';
          ctx.fillRect(flagX, flagY + flagH * 0.5, flagW, flagH * 0.25);
          ctx.fillStyle = '#CE1126';
          ctx.fillRect(flagX, flagY + flagH * 0.75, flagW, flagH * 0.25);
          ctx.strokeStyle = 'rgba(69,26,3,0.2)';
          ctx.strokeRect(flagX, flagY, flagW, flagH);
        } else {
          let catSymbol = '📅';
          if (
            reasonUpper.includes('JORNADA PEDAG') ||
            reasonUpper.includes('CAPACITACI') ||
            reasonUpper.includes('TALLER')
          ) {
            catSymbol = '📖';
          } else if (
            reasonUpper.includes('REUNI') ||
            reasonUpper.includes('ÁREA') ||
            reasonUpper.includes('AREA') ||
            reasonUpper.includes('CONSEJO')
          ) {
            catSymbol = '👥';
          } else if (
            reasonUpper.includes('DIRECCI') ||
            reasonUpper.includes('GRUPO') ||
            reasonUpper.includes('CONVIVENCIA')
          ) {
            catSymbol = '🛡️';
          } else if (
            reasonUpper.includes('SINDICAL') ||
            reasonUpper.includes('ASAMBLEA') ||
            reasonUpper.includes('PARO')
          ) {
            catSymbol = '📢';
          } else if (
            reasonUpper.includes('DOCENTE') ||
            reasonUpper.includes('PERMISO') ||
            reasonUpper.includes('INCAPACIDAD') ||
            reasonUpper.includes('CALAMIDAD')
          ) {
            catSymbol = '👤';
          }

          ctx.fillStyle = '#92400e';
          ctx.font = '700 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText(catSymbol, cardX + cardW / 2, afterDescY + 14);
        }
        return;
      }
      const colorHex = teacherInfo.color || '#034EA2';
      const initials = getFirstAndLastNameInitials(teacherName);
      const contrast =
        calculateLuminanceContrast(colorHex) === 'text-white' ? '#ffffff' : '#111827';

      const topH = Math.round(cardH * 0.58);
      const botH = cardH - topH;

      // Top 58%
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(cardX, cardY, cardW, topH);

      ctx.fillStyle = '#111827';
      ctx.font = '700 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      const subjLines = wrapTextLines(ctx, b.subject || 'Sin Asignatura', cardW - 8, 2);
      if (subjLines.length === 1) {
        ctx.fillText(subjLines[0], cardX + cardW / 2, cardY + topH / 2 - 7);
      } else {
        ctx.fillText(subjLines[0], cardX + cardW / 2, cardY + topH / 2 - 13);
        ctx.fillText(subjLines[1], cardX + cardW / 2, cardY + topH / 2 - 1);
      }

      ctx.fillStyle = '#6b7280';
      ctx.font = '500 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      const displayRoom = resolveEffectiveClassroomForBlock(b, scheduleType);
      ctx.fillText(displayRoom, cardX + cardW / 2, cardY + topH - 9);

      // Bottom 42%
      ctx.fillStyle = colorHex;
      ctx.fillRect(cardX, cardY + topH, cardW, botH);

      // Initials box
      const initW = 24;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(cardX, cardY + topH, initW, botH);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(initials, cardX + initW / 2, cardY + topH + botH / 2);

      // Teacher Name
      ctx.fillStyle = contrast;
      ctx.font = '700 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const tLines = wrapTextLines(ctx, teacherName, cardW - initW - 6, 2);
      const tCenterX = cardX + initW + (cardW - initW) / 2;
      if (tLines.length === 1) {
        ctx.fillText(tLines[0], tCenterX, cardY + topH + botH / 2);
      } else {
        ctx.fillText(tLines[0], tCenterX, cardY + topH + botH / 2 - 6);
        ctx.fillText(tLines[1], tCenterX, cardY + topH + botH / 2 + 6);
      }

      // Card border
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(cardX, cardY, cardW, cardH);
    });

    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(hx, curY + rowH);
    ctx.lineTo(hx + hw, curY + rowH);
    ctx.stroke();

    curY += rowH;
  });

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Sistema de Agendamiento Escolar • Horarios y jornadas académicas',
    hx + hw / 2,
    curY + 22
  );

  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const pdfBlob = buildPdfFromJpegDataUrl(jpegDataUrl, canvas.width, canvas.height);

  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  const safeDay = dayLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  link.href = url;
  link.download = `Horario_Académico_${shiftKey}_${safeDay}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
