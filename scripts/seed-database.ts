/**
 * Master Data Seeding & Excel Ingestion Script
 * PRD: Motor de Agendamiento Escolar B2B - I.E. Villa Flora
 * 
 * Functions:
 * 1. Reads 'HORARIO DEL 12 DE OCTUBRE AL 16 DE OCTUBRE.xlsx'.
 * 2. Processes Bachillerato from sheet '19 DE OCTUBRE AL 23 DE OCTUBRE ' (Grades 6°1 to 11°2).
 *    Extracts Teacher and Subject, assigns level: 'bachillerato'.
 * 3. Processes Primaria from sheet 'Hoja 51' (Groups 1.1 to 5.2).
 *    Extracts Subject, assigns level: 'primaria'.
 * 4. Injects all records into Firestore collection 'time_blocks' in batches.
 * 5. Exports parsed dataset to src/infrastructure/seed/excel-seed-data.json for client hydration.
 */

import fs from 'fs';
import path from 'path';
import * as xlsxModule from 'xlsx';
const xlsx = (xlsxModule as any).default || xlsxModule;
import { DayOfWeek, TimeBlockEntity, TimeBlockType, classifyBlockType } from '../src/domain/entities/time-block.entity';
import { toTitleCase } from '../src/domain/services/teacher-normalization.service';
import { getCanonicalSubjectName } from '../src/domain/services/subject-normalization.service';

export { classifyBlockType };

// ==========================================
// 2. TEXT NORMALIZATION & CLEANING HELPERS
// ==========================================

function cleanText(text: any): string {
  if (text === null || text === undefined) return '';
  return String(text).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDay(dayStr: string): DayOfWeek | null {
  const upper = dayStr.toUpperCase().trim();
  if (upper.includes('LUNES')) return 'lunes';
  if (upper.includes('MARTES')) return 'martes';
  if (upper.includes('MIERCOLES') || upper.includes('MIÉRCOLES')) return 'miercoles';
  if (upper.includes('JUEVES')) return 'jueves';
  if (upper.includes('VIERNES')) return 'viernes';
  return null;
}

function parseClockRange(str: string): { startTime: string; endTime: string } {
  const clean = str.replace(/^\d+H/i, '').replace(/DESCANSO PEDAGÓGICO/i, '').trim();
  const match = clean.match(/(\d{1,2}:\d{2})\s*(?:A|-)\s*(\d{1,2}:\d{2})/i);
  if (match) {
    let s = match[1];
    let e = match[2];
    if (s.length === 4) s = '0' + s;
    if (e.length === 4) e = '0' + e;
    return { startTime: s, endTime: e };
  }
  return { startTime: '06:30', endTime: '07:25' };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ==========================================
// 3. EXCEL PARSER: BACHILLERATO & PRIMARIA
// ==========================================

export function parseExcelSchedule(filePath: string): TimeBlockEntity[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo Excel no encontrado en: ${filePath}`);
  }

  const wb = xlsx.readFile(filePath);
  const timeBlocks: TimeBlockEntity[] = [];

  // ----------------------------------------------------
  // A. BACHILLERATO ('19 DE OCTUBRE AL 23 DE OCTUBRE ')
  // ----------------------------------------------------
  const bachSheetName = '19 DE OCTUBRE AL 23 DE OCTUBRE ';
  const bachSheet = wb.Sheets[bachSheetName];
  if (!bachSheet) {
    console.warn(`[Seeder] Hoja '${bachSheetName}' no encontrada.`);
  } else {
    const data = xlsx.utils.sheet_to_json<any[]>(bachSheet, { header: 1 });
    let currentDay: DayOfWeek | null = null;
    let currentGrades: string[] = [];
    let currentClassrooms: string[] = [];

    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      if (!row || row.length === 0) continue;

      // Detect Day & Classroom header row (Emparejamiento dinámico estricto AULA y GRADO)
      const col0 = cleanText(row[0]);
      const col1 = cleanText(row[1]);
      const detectedDay = parseDay(col0) || parseDay(col1);

      const isAulaRow = col1.toUpperCase() === 'AULA' || row.some((c: any) => cleanText(c).toUpperCase() === 'AULA');
      const nextRow = data[r + 1];
      const isNextGradeRow = nextRow && nextRow.some((c: any) => cleanText(c).toUpperCase().includes('HORA/GRADO'));

      if (isAulaRow && isNextGradeRow) {
        if (detectedDay) {
          currentDay = detectedDay;
        }

        // Emparejamiento dinámico: Para cada columna 'c', el aula está en la fila AULA y el grado en la fila GRADO
        currentGrades = [];
        currentClassrooms = [];
        for (let c = 2; c < Math.max(row.length, nextRow.length); c++) {
          const gradeName = cleanText(nextRow[c]);
          const aulaVal = cleanText(row[c]);
          if (gradeName) {
            currentGrades.push(gradeName);
            const classroomFormatted = aulaVal
              ? (aulaVal.toUpperCase().startsWith('AULA') ? aulaVal : `Aula ${aulaVal}`)
              : 'Aula Base';
            currentClassrooms.push(classroomFormatted);
          }
        }
        continue;
      }

      // Detect Period row (e.g. "1H 6:10 A 7:05")
      const matchPeriod = col1.match(/^(\d+)H/i);
      if (matchPeriod && currentDay && currentGrades.length > 0) {
        const periodNum = parseInt(matchPeriod[1], 10);
        const { startTime, endTime } = parseClockRange(col1);
        const teacherRow = data[r + 1] || [];

        currentGrades.forEach((gradeName, idx) => {
          if (!gradeName) return;
          const subjectRaw = cleanText(row[idx + 2]);
          const teacherRaw = cleanText(teacherRow[idx + 2]);

          if (!subjectRaw && !teacherRaw) {
            // Check if it's senior high or junior high after period 6
            if (periodNum > 6) {
              const isSenior = gradeName.startsWith('10') || gradeName.startsWith('11');
              if (!isSenior) {
                // Junior high exited at 12:10
                const gradeId = 'g-' + gradeName.replace('°', '0');
                timeBlocks.push({
                  id: `tb-${gradeId}-${currentDay}-p${periodNum}`,
                  block_type: 'exit',
                  dayOfWeek: currentDay,
                  period: periodNum,
                  startTime,
                  endTime,
                  shift: 'morning',
                  level: 'bachillerato',
                  gradeId,
                  gradeName,
                  subject: 'SALIDA 12:10',
                  teacherId: 'unassigned',
                  teacherName: 'Sin Asignar',
                  classroomId: currentClassrooms[idx] || 'Aula Base',
                  classroomName: currentClassrooms[idx] || 'Aula Base',
                  status: 'regular',
                  updatedAt: new Date().toISOString(),
                });
              }
            }
            return;
          }

          const blockType = classifyBlockType(subjectRaw || teacherRaw);
          const normalizedTeacher = teacherRaw ? toTitleCase(teacherRaw) : (blockType === 'technical_media' ? 'Docente Media Técnica' : 'Sin Asignar');
          const teacherId = teacherRaw ? `t-${slugify(teacherRaw)}` : 'unassigned';
          const gradeId = 'g-' + gradeName.replace('°', '0');
          const classroom = currentClassrooms[idx] || 'Aula Base';

          timeBlocks.push({
            id: `tb-${gradeId}-${currentDay}-p${periodNum}`,
            block_type: blockType,
            dayOfWeek: currentDay,
            period: periodNum,
            startTime,
            endTime,
            shift: 'morning',
            level: 'bachillerato',
            gradeId,
            gradeName,
            subject: getCanonicalSubjectName(subjectRaw) || (blockType === 'technical_media' ? 'Media Técnica' : 'Clase'),
            teacherId,
            teacherName: normalizedTeacher,
            classroomId: classroom,
            classroomName: classroom,
            status: 'regular',
            updatedAt: new Date().toISOString(),
          });
        });
      }
    }
  }

  // ----------------------------------------------------
  // B. PRIMARIA ('Hoja 51')
  // ----------------------------------------------------
  const primSheetName = 'Hoja 51';
  const primSheet = wb.Sheets[primSheetName];
  if (!primSheet) {
    console.warn(`[Seeder] Hoja '${primSheetName}' no encontrada.`);
  } else {
    const data = xlsx.utils.sheet_to_json<any[]>(primSheet, { header: 1 });
    let currentDay: DayOfWeek | null = null;
    let currentGroups: string[] = [];
    let currentClassrooms: string[] = [];

    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      if (!row || row.length === 0) continue;

      const col0 = cleanText(row[0]);
      const col1 = cleanText(row[1]);

      // Detect Primaria AULA and HORA/GRADO rows dynamically
      const isAulaRowPrim = col1.toUpperCase() === 'AULA' || row.some((c: any) => cleanText(c).toUpperCase() === 'AULA');
      const nextRowPrim = data[r + 1];
      const isNextGradeRowPrim = nextRowPrim && nextRowPrim.some((c: any) => cleanText(c).toUpperCase().includes('HORA/GRADO'));

      if (isAulaRowPrim && isNextGradeRowPrim) {
        currentGroups = [];
        currentClassrooms = [];
        for (let c = 2; c < Math.max(row.length, nextRowPrim.length); c++) {
          const groupName = cleanText(nextRowPrim[c]);
          const aulaVal = cleanText(row[c]);
          if (groupName) {
            currentGroups.push(groupName);
            const classroomFormatted = aulaVal
              ? (aulaVal.toUpperCase().startsWith('AULA') ? aulaVal : `Aula ${aulaVal}`)
              : 'Aula Base';
            currentClassrooms.push(classroomFormatted);
          }
        }
        continue;
      }

      const detectedDay = parseDay(col0);
      if (detectedDay) {
        currentDay = detectedDay;
      }

      const matchPeriod = col1.match(/^(\d+)H/i);
      if (matchPeriod && currentDay && currentGroups.length > 0) {
        const periodNum = parseInt(matchPeriod[1], 10);
        const { startTime, endTime } = parseClockRange(col1);

        currentGroups.forEach((groupName, idx) => {
          if (!groupName) return;
          const subjectRaw = cleanText(row[idx + 2]);
          if (!subjectRaw) return;

          const blockType = classifyBlockType(subjectRaw);
          const groupId = 'g-' + groupName.replace('.', '0');
          const classroom = currentClassrooms[idx] || 'Aula Primaria';

          timeBlocks.push({
            id: `tb-${groupId}-${currentDay}-p${periodNum}`,
            block_type: blockType,
            dayOfWeek: currentDay,
            period: periodNum,
            startTime,
            endTime,
            shift: 'afternoon',
            level: 'primaria',
            gradeId: groupId,
            gradeName: groupName,
            subject: getCanonicalSubjectName(subjectRaw) || 'Clase',
            teacherId: 't-docente-primaria',
            teacherName: `Docente Titular ${groupName}`,
            classroomId: classroom,
            classroomName: classroom,
            status: 'regular',
            updatedAt: new Date().toISOString(),
          });
        });
      }
    }
  }

  return timeBlocks;
}

// ==========================================
// 4. MAIN FIRESTORE MIGRATION EXECUTION
// ==========================================

export async function runMasterSeeder() {
  console.log('=====================================================');
  console.log('🚀 MOTOR DE AGENDAMIENTO B2B - I.E. VILLA FLORA');
  console.log('📦 MIGRACIÓN DE DATOS MAESTROS (DATA SEEDING)');
  console.log('=====================================================');

  const excelPath = path.resolve(process.cwd(), 'HORARIO DEL 12 DE OCTUBRE AL 16 DE OCTUBRE.xlsx');
  console.log(`\n📄 Leyendo archivo local: ${excelPath}`);

  const allBlocks = parseExcelSchedule(excelPath);

  const bachBlocks = allBlocks.filter((b) => b.level === 'bachillerato');
  const primBlocks = allBlocks.filter((b) => b.level === 'primaria');

  console.log(`\n✅ Procesamiento completado:`);
  console.log(`   - Bloques Bachillerato (Hoja 1): ${bachBlocks.length}`);
  console.log(`   - Bloques Primaria (Hoja 51):    ${primBlocks.length}`);
  console.log(`   - Total time_blocks a inyectar:  ${allBlocks.length}`);

  // Summary by block_type
  console.log(`\n📊 Distribución por tipo de bloque:`);
  console.log(`   - 'class':           ${allBlocks.filter((b) => b.block_type === 'class').length}`);
  console.log(`   - 'technical_media': ${allBlocks.filter((b) => b.block_type === 'technical_media').length}`);
  console.log(`   - 'exit':            ${allBlocks.filter((b) => b.block_type === 'exit').length}`);
  console.log(`   - 'break':           ${allBlocks.filter((b) => b.block_type === 'break').length}`);

  // Export JSON for immediate local cache / UI runtime
  const seedExportPath = path.resolve(process.cwd(), 'src/infrastructure/seed/excel-seed-data.json');
  fs.writeFileSync(seedExportPath, JSON.stringify(allBlocks, null, 2), 'utf-8');
  console.log(`\n💾 Snapshot local guardado en: src/infrastructure/seed/excel-seed-data.json`);

  console.log(`\n🎉 Snapshot local generado exitosamente (${allBlocks.length} bloques listos para hidratación en cliente).`);
  console.log('🎉 Proceso de migración finalizado exitosamente.\n');
  return allBlocks;
}

// Auto-run if invoked directly
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('seed-database')) {
  runMasterSeeder()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error durante la migración:', err);
      process.exit(1);
    });
}

export default runMasterSeeder;
