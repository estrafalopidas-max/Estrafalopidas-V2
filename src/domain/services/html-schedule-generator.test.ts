import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStandaloneScheduleHtml } from './html-schedule-generator.service.ts';
import { TimeBlockEntity } from '../entities/time-block.entity.ts';
import { UserEntity } from '../entities/user.entity.ts';
import { getTodayDayOfWeek, generateWeekHeaders } from './ChronologyEngine.ts';

test('generateStandaloneScheduleHtml generates valid standalone HTML document', () => {
  const mockTeachers: UserEntity[] = [
    {
      id: 'teacher-1',
      displayName: 'Alejandro Giraldo',
      email: 'alejandro@villaflora.edu.co',
      role: 'teacher',
      color_hex: '#007DC5',
      maxWeeklyHours: 22,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockTimeBlocks: TimeBlockEntity[] = [
    {
      id: 'tb-1',
      block_type: 'class',
      dayOfWeek: 'lunes',
      period: 1,
      startTime: '06:10',
      endTime: '07:05',
      shift: 'morning',
      gradeId: 'grade-601',
      gradeName: '6°1',
      subject: 'Inglés',
      teacherId: 'teacher-1',
      teacherName: 'Alejandro Giraldo',
      classroomId: 'c-303',
      classroomName: 'Aula 303',
      status: 'regular',
      updatedAt: new Date().toISOString(),
    },
  ];

  const html = generateStandaloneScheduleHtml({
    timeBlocks: mockTimeBlocks,
    teachers: mockTeachers,
    academicPeriod: '3er Periodo',
    academicWeek: 9,
  });

  assert.ok(html.includes('<!DOCTYPE html>'), 'Must include HTML DOCTYPE');
  assert.ok(
    html.includes('Sistema de Agendamiento Escolar'),
    'Must include system title'
  );
  assert.ok(
    html.includes('Horarios, actividades y jornadas académicas'),
    'Must include schedule subtitle'
  );
  assert.ok(html.includes('3er Periodo'), 'Must include academic period');
  assert.ok(html.includes('Semana académica 9 de 14'), 'Must include academic week');
  assert.ok(html.includes('Inglés'), 'Must include subject data');
  assert.ok(html.includes('Alejandro Giraldo'), 'Must include teacher name');
  assert.ok(html.includes('admin-card'), 'Must include admin card styling');
  assert.ok(html.includes('admin-card-top'), 'Must include 60% top block');
  assert.ok(html.includes('admin-card-bottom'), 'Must include 40% bottom block');
  assert.ok(html.includes('header-logo'), 'Must include header logo');
  assert.ok(html.includes('data:image/png;base64'), 'Must embed logo as base64 data URI');
  assert.ok(html.includes('meta-card'), 'Must include meta card');
  assert.ok(html.includes('Descargar PDF'), 'Must include PDF download option');
  assert.ok(html.includes('Imprimir'), 'Must include print option');
  assert.ok(html.includes('@media print'), 'Must include print media stylesheet');
  assert.ok(html.includes('selectShift(\'morning\')'), 'Must include morning shift selector');
  assert.ok(html.includes('selectShift(\'afternoon\')'), 'Must include afternoon shift selector');
  assert.ok(html.includes('selectShift(\'transicion-1\')'), 'Must include transicion-1 shift selector');
  assert.ok(html.includes('buildShiftPeriodSlots'), 'Must include dynamic shift time slots builder');
  assert.ok(!html.includes('Toda la semana'), 'Must only allow day-by-day selection without Toda la semana');
  assert.ok(html.includes('selectDay(currentDay)'), 'Must auto-select current day of week on load');
});

test('getTodayDayOfWeek maps weekdays accurately and defaults weekends to lunes', () => {
  assert.equal(getTodayDayOfWeek(new Date('2026-10-19T12:00:00')), 'lunes');
  assert.equal(getTodayDayOfWeek(new Date('2026-10-20T12:00:00')), 'martes');
  assert.equal(getTodayDayOfWeek(new Date('2026-10-21T12:00:00')), 'miercoles');
  assert.equal(getTodayDayOfWeek(new Date('2026-10-22T12:00:00')), 'jueves');
  assert.equal(getTodayDayOfWeek(new Date('2026-10-23T12:00:00')), 'viernes');
  assert.equal(getTodayDayOfWeek(new Date('2026-10-24T12:00:00')), 'lunes'); // Saturday -> lunes
  assert.equal(getTodayDayOfWeek(new Date('2026-10-25T12:00:00')), 'lunes'); // Sunday -> lunes
});

test('generateWeekHeaders formats full month names in Spanish', () => {
  const headers = generateWeekHeaders(new Date('2026-10-20T12:00:00'));
  assert.equal(headers.length, 5);
  assert.ok(headers[0].label.toLowerCase().includes('octubre'), 'Monday header should include full month name octubre');
  assert.ok(headers[2].label.toLowerCase().includes('octubre'), 'Wednesday header should include full month name octubre');
});

test('generateStandaloneScheduleHtml formats novelty blocks as unified NOVEDAD INSTITUCIONAL in uppercase with Colombian flag for ACTO CÍVICO', () => {
  const mockBlocks: TimeBlockEntity[] = [
    {
      id: 'tb-nov-1',
      block_type: 'novelty',
      dayOfWeek: 'lunes',
      period: 1,
      startTime: '06:10',
      endTime: '07:05',
      shift: 'morning',
      gradeId: 'grade-601',
      gradeName: '6°1',
      subject: 'Educación Física',
      teacherId: 'teacher-1',
      teacherName: 'Alejandro Giraldo',
      classroomId: 'c-303',
      classroomName: 'Aula 303',
      motivo_novedad: 'Acto cívico izada de bandera',
      status: 'regular',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tb-nov-2',
      block_type: 'novelty',
      dayOfWeek: 'lunes',
      period: 2,
      startTime: '07:05',
      endTime: '08:00',
      shift: 'morning',
      gradeId: 'grade-601',
      gradeName: '6°1',
      subject: 'Matemáticas',
      teacherId: 'teacher-1',
      teacherName: 'Alejandro Giraldo',
      classroomId: 'c-303',
      classroomName: 'Aula 303',
      motivo_novedad: 'Jornada pedagógica',
      status: 'regular',
      updatedAt: new Date().toISOString(),
    },
  ];

  const html = generateStandaloneScheduleHtml({
    timeBlocks: mockBlocks,
    teachers: [],
    academicPeriod: '3er Periodo',
    academicWeek: 9,
  });

  assert.ok(html.includes('novelty-upper-zone'), 'Must render upper 2/3 container for novelty');
  assert.ok(html.includes('ACTO CÍVICO IZADA DE BANDERA'), 'Must normalize novelty description to uppercase');
  assert.ok(html.includes('JORNADA PEDAGÓGICA'), 'Must normalize other novelty descriptions to uppercase');
  assert.ok(html.includes('Novedad institucional'), 'Must include Novedad institucional sub-label');
  assert.ok(html.includes('Bandera de Colombia'), 'Must include Colombian flag SVG for ACTO CÍVICO');
  assert.ok(html.includes('aria-label="Jornada pedagógica"'), 'Must include representative SVG icon for other novelty types');
});

test('Official 34 teachers roster resolves shortName for cells, fullName for directories/tooltips, and arrival schedules', async () => {
  const { OFFICIAL_TEACHERS_ROSTER, isTeacherPresentAtSlot } = await import('./teacher-normalization.service.ts');
  const { getShortTeacherName, getFullTeacherName } = await import('./teacher-visual-identity.service.ts');

  assert.equal(OFFICIAL_TEACHERS_ROSTER.length, 33, 'Must register all 33 official teachers');
  assert.equal(getShortTeacherName('t-trans-1', 'Yessica Bolívar Bolívar'), 'Yessica Bolívar');
  assert.equal(getFullTeacherName('t-trans-1', 'Yessica Bolívar'), 'Yessica Bolívar Bolívar');
  assert.equal(getShortTeacherName('t-101', 'Mariluz Viviana Martínez Cortés'), 'Mariluz Martínez');
  assert.equal(getFullTeacherName('t-101', 'Mariluz Martínez'), 'Mariluz Viviana Martínez Cortés');
  assert.equal(getShortTeacherName('t-alejandro', 'Alejandro Ramírez Cañas'), 'Alejandro Ramírez');
  assert.equal(getFullTeacherName('t-alejandro', 'Alejandro Ramírez'), 'Alejandro Ramírez Cañas');
  assert.equal(getShortTeacherName('t-sara', 'Sara Casafus'), 'Sara Casafus');
  assert.equal(getShortTeacherName('t-paola', 'Paola'), 'Paola');
  assert.equal(getShortTeacherName('t-lorena-l', 'Lizhet Lorena Lopera Mazo'), 'Lorena Lopera');
  assert.equal(getFullTeacherName('t-lorena-l', 'Lorena Lopera'), 'Lizhet Lorena Lopera Mazo');
  assert.equal(getShortTeacherName('JAVIER'), 'Alexander Uribe');
  assert.equal(getShortTeacherName('OMAR'), 'Omar Mosquera');
  assert.equal(getFullTeacherName('t-omar', 'Omar Mosquera'), 'Gleysher Omar Mosquera Perea');

  // Arrival schedule checks for Alexander Uribe (9:25 AM except Monday 6:10 AM)
  assert.equal(isTeacherPresentAtSlot('t-alexander', 'Alexander Uribe', 'lunes', 1, 'morning').isPresent, true);
  assert.equal(isTeacherPresentAtSlot('t-alexander', 'Alexander Uribe', 'martes', 1, 'morning').isPresent, false);
  assert.equal(isTeacherPresentAtSlot('t-alexander', 'Alexander Uribe', 'jueves', 3, 'morning').isPresent, false);
  assert.equal(isTeacherPresentAtSlot('t-alexander', 'Alexander Uribe', 'jueves', 4, 'morning').isPresent, true);

  // Arrival schedule checks for Omar Mosquera (9:25 AM except Thursday 6:10 AM)
  assert.equal(isTeacherPresentAtSlot('t-omar', 'Omar Mosquera', 'jueves', 1, 'morning').isPresent, true);
  assert.equal(isTeacherPresentAtSlot('t-omar', 'Omar Mosquera', 'lunes', 1, 'morning').isPresent, false);
  assert.equal(isTeacherPresentAtSlot('t-omar', 'Omar Mosquera', 'miercoles', 3, 'morning').isPresent, false);
  assert.equal(isTeacherPresentAtSlot('t-omar', 'Omar Mosquera', 'lunes', 4, 'morning').isPresent, true);
});

test('generateStandaloneScheduleHtml and savePublicScheduleSnapshot explicitly render Parrilla en blanco state when timeBlocks is empty', async () => {
  const { savePublicScheduleSnapshot } = await import('./html-schedule-generator.service.ts');
  const html = generateStandaloneScheduleHtml({
    timeBlocks: [],
    teachers: [],
    academicPeriod: '1er Periodo',
    academicWeek: 1,
  });

  assert.ok(html.includes('Parrilla en blanco'), 'Must include Parrilla en blanco state banner in standalone HTML');
  assert.ok(html.includes('Sin asignación académica'), 'Must include blank slot cell template');
  assert.ok(html.includes('const ALL_BLOCKS = [];'), 'Must serialize empty ALL_BLOCKS array');

  const snap = savePublicScheduleSnapshot([], [], '1er Periodo', 1);
  assert.equal(snap.timeBlocks.length, 0, 'Snapshot timeBlocks must be empty');
  assert.equal(snap.metadata.blankMatrixMode, true, 'Snapshot metadata must mark blankMatrixMode as true');
  assert.equal(snap.dayConfigs?.blankMatrixMode, true, 'Snapshot dayConfigs must mark blankMatrixMode as true');
});

test('getSupportPlanModalityLabel dynamically resolves period-specific and annual support plan labels for Horario D', async () => {
  const { getSupportPlanModalityLabel } = await import('./ChronologyEngine.ts');

  assert.equal(
    getSupportPlanModalityLabel('2026-03-10'),
    'Planes de apoyo 1er periodo',
    'Period 1 must resolve to Planes de apoyo 1er periodo'
  );
  assert.equal(
    getSupportPlanModalityLabel('2026-06-10'),
    'Planes de apoyo 2do periodo',
    'Period 2 must resolve to Planes de apoyo 2do periodo'
  );
  assert.equal(
    getSupportPlanModalityLabel('2026-10-20'),
    'Planes de apoyo 3er periodo',
    'Period 3 must resolve to Planes de apoyo 3er periodo'
  );
  assert.equal(
    getSupportPlanModalityLabel('2026-12-03'),
    'Planes de apoyo anuales',
    'Year-end closure must resolve to Planes de apoyo anuales'
  );
  assert.equal(
    getSupportPlanModalityLabel('2026-10-20', 'Anual'),
    'Planes de apoyo anuales',
    'Explicit annual override must resolve to Planes de apoyo anuales'
  );
});


