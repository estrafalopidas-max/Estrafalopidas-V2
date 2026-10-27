import { TimeBlockEntity, DayOfWeek, TimeBlockType } from '../../domain/entities/time-block.entity';
import { GradeEntity } from '../../domain/entities/grade.entity';
import { UserEntity } from '../../domain/entities/user.entity';
import { ClassroomEntity } from '../../domain/entities/classroom.entity';
import { AbsenceRequestEntity } from '../../domain/entities/absence-request.entity';
import { getNextAvailableTeacherColor } from '../../domain/services/teacher-color.service';
import { getSubjectShortName } from '../../domain/constants/subjects';
import {
  getShortTeacherName,
  getFullTeacherName,
  resolveOfficialTeacherEntry,
  updateTeacherDictionaryColor,
} from '../../domain/services/teacher-normalization.service';
import excelSeedData from './excel-seed-data.json';

const PRIMARIA_FULL_SUBJECTS = [
  'Ciencias Naturales',
  'Ciencias Sociales',
  'Educación Artística',
  'Ética y Valores',
  'Educación Física',
  'Educación Religiosa',
  'Lengua Castellana',
  'Inglés',
  'Matemáticas',
  'Estadística',
  'Geometría',
  'Tecnología e Informática',
];

const RAW_SEED_TEACHERS: Omit<UserEntity, 'allowedSubjects'>[] = [
  // =========================================================================
  // 1. DOCENTES CON DIRECCIÓN DE GRUPO (24 DOCENTES)
  // =========================================================================
  {
    id: 't-docente-trans1',
    email: 'yessica.bolivar@ievillaflora.edu.co',
    displayName: 'Yessica Bolívar Bolívar',
    shortName: 'Yessica Bolívar',
    groupDirection: 'TS-01',
    role: 'teacher',
    documentId: '43501012',
    phone: '3102001012',
    subjects: ['Propósitos 1, 2, 3 y 4', 'Proyectos Lúdico Pedagógicos'],
    specialty: ['Propósitos 1, 2, 3 y 4', 'Proyectos Lúdico Pedagógicos'],
    assignedSubject: 'Propósitos 1, 2, 3 y 4',
    subject: 'Propósitos 1, 2, 3 y 4',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-trans-1'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-trans2',
    email: 'ana.monsalve@ievillaflora.edu.co',
    displayName: 'Ana María Monsalve García',
    shortName: 'Ana Monsalve',
    groupDirection: 'TS-02',
    role: 'teacher',
    documentId: '43501013',
    phone: '3102001013',
    subjects: ['Propósitos 1, 2, 3 y 4', 'Proyectos Lúdico Pedagógicos'],
    specialty: ['Propósitos 1, 2, 3 y 4', 'Proyectos Lúdico Pedagógicos'],
    assignedSubject: 'Propósitos 1, 2, 3 y 4',
    subject: 'Propósitos 1, 2, 3 y 4',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-trans-2'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-101',
    email: 'mariluz.martinez@ievillaflora.edu.co',
    displayName: 'Mariluz Viviana Martínez Cortés',
    shortName: 'Mariluz Martínez',
    groupDirection: '01-01',
    role: 'teacher',
    documentId: '43501001',
    phone: '3102001001',
    subjects: [...PRIMARIA_FULL_SUBJECTS],
    specialty: [...PRIMARIA_FULL_SUBJECTS],
    assignedSubject: 'Lengua Castellana',
    subject: 'Lengua Castellana',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-101'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-102',
    email: 'daniela.murillo@ievillaflora.edu.co',
    displayName: 'Daniela María Murillo Rueda',
    shortName: 'Daniela Murillo',
    groupDirection: '01-02',
    role: 'teacher',
    documentId: '43501002',
    phone: '3102001002',
    subjects: [...PRIMARIA_FULL_SUBJECTS],
    specialty: [...PRIMARIA_FULL_SUBJECTS],
    assignedSubject: 'Lengua Castellana',
    subject: 'Lengua Castellana',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-102'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-201',
    email: 'laura.arroyave@ievillaflora.edu.co',
    displayName: 'Laura Arroyave Mejía',
    shortName: 'Laura Arroyave',
    groupDirection: '02-01',
    role: 'teacher',
    documentId: '43501003',
    phone: '3102001003',
    subjects: [...PRIMARIA_FULL_SUBJECTS],
    specialty: [...PRIMARIA_FULL_SUBJECTS],
    assignedSubject: 'Matemáticas',
    subject: 'Matemáticas',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-201'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-202',
    email: 'juliana.arias@ievillaflora.edu.co',
    displayName: 'Juliana Arias Suárez',
    shortName: 'Juliana Arias',
    groupDirection: '02-02',
    role: 'teacher',
    documentId: '43501004',
    phone: '3102001004',
    subjects: [...PRIMARIA_FULL_SUBJECTS],
    specialty: [...PRIMARIA_FULL_SUBJECTS],
    assignedSubject: 'Matemáticas',
    subject: 'Matemáticas',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-202'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-301',
    email: 'silvia.vanegas@ievillaflora.edu.co',
    displayName: 'Silvia Rosa Vanegas Villa',
    shortName: 'Silvia Vanegas',
    groupDirection: '03-01',
    role: 'teacher',
    documentId: '43501005',
    phone: '3102001005',
    subjects: [...PRIMARIA_FULL_SUBJECTS],
    specialty: [...PRIMARIA_FULL_SUBJECTS],
    assignedSubject: 'Matemáticas',
    subject: 'Matemáticas',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-301'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-302',
    email: 'mary.mesa@ievillaflora.edu.co',
    displayName: 'Mary Luz Mesa Osorio',
    shortName: 'Mary Mesa',
    groupDirection: '03-02',
    role: 'teacher',
    documentId: '43501006',
    phone: '3102001006',
    subjects: [...PRIMARIA_FULL_SUBJECTS],
    specialty: [...PRIMARIA_FULL_SUBJECTS],
    assignedSubject: 'Matemáticas',
    subject: 'Matemáticas',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-302'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-303',
    email: 'eliana.ascuntar@ievillaflora.edu.co',
    displayName: 'Eliana Marina Ascuntar Ascuntar',
    shortName: 'Eliana Ascuntar',
    groupDirection: '03-03',
    role: 'teacher',
    documentId: '43501007',
    phone: '3102001007',
    subjects: [...PRIMARIA_FULL_SUBJECTS],
    specialty: [...PRIMARIA_FULL_SUBJECTS],
    assignedSubject: 'Matemáticas',
    subject: 'Matemáticas',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-303'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-401',
    email: 'gleider.guerra@ievillaflora.edu.co',
    displayName: 'Gleider Yael Guerra Ortiz',
    shortName: 'Gleider Guerra',
    groupDirection: '04-01',
    role: 'teacher',
    documentId: '43501008',
    phone: '3102001008',
    subjects: ['Ciencias Naturales', 'Educación Artística', 'Ética y Valores', 'Estadística'],
    specialty: ['Ciencias Naturales', 'Educación Artística', 'Ética y Valores', 'Estadística'],
    assignedSubject: 'Ciencias Naturales',
    subject: 'Ciencias Naturales',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-401', 'g-402', 'g-501', 'g-502'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-402',
    email: 'edelmira.mena@ievillaflora.edu.co',
    displayName: 'Edelmira Mena Mosquera',
    shortName: 'Edelmira Mena',
    groupDirection: '04-02',
    role: 'teacher',
    documentId: '43501009',
    phone: '3102001009',
    subjects: ['Ciencias Sociales', 'Ética y Valores', 'Matemáticas'],
    specialty: ['Ciencias Sociales', 'Ética y Valores', 'Matemáticas'],
    assignedSubject: 'Matemáticas',
    subject: 'Matemáticas',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-401', 'g-402', 'g-501', 'g-502'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-501',
    email: 'cristina.henao@ievillaflora.edu.co',
    displayName: 'Cristina Liceth Henao Taborda',
    shortName: 'Cristina Henao',
    groupDirection: '05-01',
    role: 'teacher',
    documentId: '43501010',
    phone: '3102001010',
    subjects: ['Ética y Valores', 'Lengua Castellana', 'Tecnología e Informática'],
    specialty: ['Ética y Valores', 'Lengua Castellana', 'Tecnología e Informática'],
    assignedSubject: 'Lengua Castellana',
    subject: 'Lengua Castellana',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-401', 'g-402', 'g-501', 'g-502'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-docente-502',
    email: 'luis.williams@ievillaflora.edu.co',
    displayName: 'Luis Eduardo Williams Flórez',
    shortName: 'Luis Williams',
    groupDirection: '05-02',
    role: 'teacher',
    documentId: '43501011',
    phone: '3102001011',
    subjects: [
      'Ética y Valores',
      'Educación Física',
      'Educación Religiosa',
      'Lengua Castellana',
      'Inglés',
      'Geometría',
    ],
    specialty: [
      'Ética y Valores',
      'Educación Física',
      'Educación Religiosa',
      'Lengua Castellana',
      'Inglés',
      'Geometría',
    ],
    assignedSubject: 'Educación Física',
    subject: 'Educación Física',
    academicLevel: 'primaria',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-401', 'g-402', 'g-501', 'g-502'],
    maxWeeklyHours: 25,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-m-isabel',
    email: 'maria.giraldo@ievillaflora.edu.co',
    displayName: 'María Isabel Giraldo Rojas',
    shortName: 'Mª Isabel Giraldo',
    groupDirection: '06-01',
    role: 'teacher',
    documentId: '71234008',
    phone: '3001001008',
    subjects: ['Lengua Castellana', 'Literatura'],
    specialty: ['Lengua Castellana', 'Literatura'],
    assignedSubject: 'Lengua Castellana',
    subject: 'Lengua Castellana',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-601', 'g-602', 'g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-claudia',
    email: 'claudia.castaneda@ievillaflora.edu.co',
    displayName: 'Claudia Cecilia Castañeda Ceballos',
    shortName: 'Claudia Castañeda',
    groupDirection: '06-02',
    role: 'teacher',
    documentId: '71234004',
    phone: '3001001004',
    subjects: ['Matemáticas', 'Estadística'],
    specialty: ['Matemáticas', 'Estadística'],
    assignedSubject: 'Matemáticas',
    subject: 'Matemáticas',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802', 'g-901', 'g-902'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-diana',
    email: 'diana.silva@ievillaflora.edu.co',
    displayName: 'Diana Yasmín Silva Granda',
    shortName: 'Diana Silva',
    groupDirection: '07-01',
    role: 'teacher',
    documentId: '71234013',
    phone: '3001001013',
    subjects: ['Geometría'],
    specialty: ['Geometría'],
    assignedSubject: 'Geometría',
    subject: 'Geometría',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: [
      'g-601',
      'g-602',
      'g-701',
      'g-702',
      'g-801',
      'g-802',
      'g-901',
      'g-902',
      'g-1001',
      'g-1002',
      'g-1101',
      'g-1102',
    ],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-eliana',
    email: 'eliana.osorio@ievillaflora.edu.co',
    displayName: 'Eliana María Osorio Zapata',
    shortName: 'Eliana Osorio',
    groupDirection: '07-02',
    role: 'teacher',
    documentId: '71234014',
    phone: '3001001014',
    subjects: ['Filosofía', 'Ciencias Sociales'],
    specialty: ['Filosofía', 'Ciencias Sociales'],
    assignedSubject: 'Ciencias Sociales',
    subject: 'Ciencias Sociales',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-701', 'g-702', 'g-801', 'g-802', 'g-1001', 'g-1002', 'g-1101', 'g-1102'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-linda',
    email: 'linda.montoya@ievillaflora.edu.co',
    displayName: 'Linda Patricia Montoya Vega',
    shortName: 'Linda Montoya',
    groupDirection: '08-01',
    role: 'teacher',
    documentId: '71234007',
    phone: '3001001007',
    subjects: ['Educación Artística'],
    specialty: ['Educación Artística'],
    assignedSubject: 'Educación Artística',
    subject: 'Educación Artística',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: [
      'g-601',
      'g-602',
      'g-701',
      'g-702',
      'g-801',
      'g-802',
      'g-901',
      'g-902',
      'g-1001',
      'g-1002',
      'g-1101',
      'g-1102',
    ],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-diego',
    email: 'diego.castano@ievillaflora.edu.co',
    displayName: 'Diego Alexander Castaño Aristizábal',
    shortName: 'Diego Castaño',
    groupDirection: '08-02',
    role: 'teacher',
    documentId: '71234006',
    phone: '3001001006',
    subjects: ['Tecnología e Informática', 'Cátedra de la Paz'],
    specialty: ['Tecnología e Informática', 'Cátedra de la Paz'],
    assignedSubject: 'Tecnología e Informática',
    subject: 'Tecnología e Informática',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-katia',
    email: 'katia.agualimpia@ievillaflora.edu.co',
    displayName: 'Katia Danesa Agualimpia Puerta',
    shortName: 'Katia Agualimpia',
    groupDirection: '09-01',
    role: 'teacher',
    documentId: '71234012',
    phone: '3001001012',
    subjects: ['Ciencias Sociales', 'Economía y Política'],
    specialty: ['Ciencias Sociales', 'Economía y Política'],
    assignedSubject: 'Ciencias Sociales',
    subject: 'Ciencias Sociales',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-601', 'g-602', 'g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-betty',
    email: 'maria.vasquez@ievillaflora.edu.co',
    displayName: 'María Betty Vásquez Vélez',
    shortName: 'Betty Vásquez',
    groupDirection: '09-02',
    role: 'teacher',
    documentId: '71234005',
    phone: '3001001005',
    subjects: ['Lengua Castellana', 'Literatura'],
    specialty: ['Lengua Castellana', 'Literatura'],
    assignedSubject: 'Lengua Castellana',
    subject: 'Lengua Castellana',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-701', 'g-702', 'g-801', 'g-802', 'g-901', 'g-902'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-alejandra',
    email: 'maria.perez@ievillaflora.edu.co',
    displayName: 'María Alejandra Pérez Pino',
    shortName: 'Alejandra Pérez',
    groupDirection: '10-01',
    role: 'teacher',
    documentId: '71234016',
    phone: '3001001016',
    subjects: ['Ciencias Naturales', 'Biología', 'Química'],
    specialty: ['Ciencias Naturales', 'Biología', 'Química'],
    assignedSubject: 'Biología',
    subject: 'Biología',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-lorena-l',
    email: 'lizhet.lopera@ievillaflora.edu.co',
    displayName: 'Lizhet Lorena Lopera Mazo',
    shortName: 'Lorena Lopera',
    groupDirection: '10-02',
    role: 'teacher',
    documentId: '71234009',
    phone: '3001001009',
    subjects: ['Matemáticas', 'Estadística'],
    specialty: ['Matemáticas', 'Estadística'],
    assignedSubject: 'Matemáticas',
    subject: 'Matemáticas',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-701', 'g-702', 'g-1001', 'g-1002', 'g-1101', 'g-1102'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-natalia',
    email: 'natalia.caro@ievillaflora.edu.co',
    displayName: 'Natalia Andrea Caro Sánchez',
    shortName: 'Natalia Caro',
    groupDirection: '11-01',
    role: 'teacher',
    documentId: '71234010',
    phone: '3001001010',
    subjects: ['Inglés', 'Laboratorio de Inglés'],
    specialty: ['Inglés', 'Laboratorio de Inglés'],
    assignedSubject: 'Inglés',
    subject: 'Inglés',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },

  // =========================================================================
  // 2. DOCENTES SIN DIRECCIÓN DE GRUPO (8 DOCENTES)
  // =========================================================================
  {
    id: 't-laura',
    email: 'laura.gallego@ievillaflora.edu.co',
    displayName: 'Laura Gallego Cortés',
    shortName: 'Laura Gallego',
    groupDirection: 'Sin asignación',
    role: 'teacher',
    documentId: '71234003',
    phone: '3001001003',
    subjects: ['Ética y Valores', 'Educación Religiosa'],
    specialty: ['Ética y Valores', 'Educación Religiosa'],
    assignedSubject: 'Ética y Valores',
    subject: 'Ética y Valores',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: [
      'g-601',
      'g-602',
      'g-701',
      'g-702',
      'g-801',
      'g-802',
      'g-901',
      'g-902',
      'g-1001',
      'g-1002',
      'g-1101',
      'g-1102',
    ],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-omar',
    email: 'gleysher.mosquera@ievillaflora.edu.co',
    displayName: 'Gleysher Omar Mosquera Perea',
    shortName: 'Omar Mosquera',
    groupDirection: 'Sin asignación',
    entrySchedule: {
      defaultEntryTime: '09:25',
      exceptions: { jueves: '06:10' },
      label: 'Ingreso 9:25 a.m. (Jueves 6:10 a.m.)',
    },
    role: 'teacher',
    documentId: '71234017',
    phone: '3001001017',
    subjects: ['Tecnología e Informática', 'MT-Bases de Datos', 'Cátedra de la Paz'],
    specialty: ['Tecnología e Informática', 'MT-Bases de Datos', 'Cátedra de la Paz'],
    assignedSubject: 'MT-Bases de Datos',
    subject: 'MT-Bases de Datos',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-601', 'g-602', 'g-901', 'g-902', 'g-1001', 'g-1101'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-jairo-andres',
    email: 'jairo.murcia@ievillaflora.edu.co',
    displayName: 'Jairo Andrés Murcia Velasco',
    shortName: 'Jairo Murcia',
    groupDirection: 'Sin asignación',
    role: 'teacher',
    documentId: '71234002',
    phone: '3001001002',
    subjects: ['Ciencias Naturales', 'Cátedra de la Paz'],
    specialty: ['Ciencias Naturales', 'Cátedra de la Paz'],
    assignedSubject: 'Ciencias Naturales',
    subject: 'Ciencias Naturales',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-liscy',
    email: 'liscy.palacios@ievillaflora.edu.co',
    displayName: 'Liscy Vanessa Palacios Ibargüen',
    shortName: 'Liscy Palacios',
    groupDirection: 'Sin asignación',
    role: 'teacher',
    documentId: '71234011',
    phone: '3001001011',
    subjects: ['Física', 'Matemáticas'],
    specialty: ['Física', 'Matemáticas'],
    assignedSubject: 'Física',
    subject: 'Física',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-901', 'g-902', 'g-1001', 'g-1002', 'g-1101', 'g-1102'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-alejandro',
    email: 'alejandro.ramirez@ievillaflora.edu.co',
    displayName: 'Alejandro Ramírez Cañas',
    shortName: 'Alejandro Ramírez',
    groupDirection: 'Sin asignación',
    role: 'teacher',
    documentId: '71234001',
    phone: '3001001001',
    subjects: ['Inglés', 'Laboratorio de Inglés'],
    specialty: ['Inglés', 'Laboratorio de Inglés'],
    assignedSubject: 'Inglés',
    subject: 'Inglés',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-601', 'g-602', 'g-701', 'g-702', 'g-801', 'g-802'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-camilo',
    email: 'camilo.torres@ievillaflora.edu.co',
    displayName: 'Camilo Andrés Torres Charry',
    shortName: 'Camilo Torres',
    groupDirection: 'Sin asignación',
    role: 'teacher',
    documentId: '71234015',
    phone: '3001001015',
    subjects: ['Educación Física'],
    specialty: ['Educación Física'],
    assignedSubject: 'Educación Física',
    subject: 'Educación Física',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: [
      'g-601',
      'g-602',
      'g-701',
      'g-702',
      'g-801',
      'g-802',
      'g-901',
      'g-902',
      'g-1001',
      'g-1002',
      'g-1101',
      'g-1102',
    ],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-sara',
    email: 'sara.casafus@ievillaflora.edu.co',
    displayName: 'Sara Casafus',
    shortName: 'Sara Casafus',
    groupDirection: 'Sin asignación',
    role: 'teacher',
    documentId: '71234026',
    phone: '3001001026',
    subjects: ['MT-Audiovisuales'],
    specialty: ['MT-Audiovisuales'],
    assignedSubject: 'MT-Audiovisuales',
    subject: 'MT-Audiovisuales',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-1002', 'g-1102'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-paola',
    email: 'paola@ievillaflora.edu.co',
    displayName: 'Paola',
    shortName: 'Paola',
    groupDirection: 'Sin asignación',
    role: 'teacher',
    documentId: '71234027',
    phone: '3001001027',
    subjects: ['MT-Bases de Datos'],
    specialty: ['MT-Bases de Datos'],
    assignedSubject: 'MT-Bases de Datos',
    subject: 'MT-Bases de Datos',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-1001', 'g-1101'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 't-alexander',
    email: 'alexander.uribe@ievillaflora.edu.co',
    displayName: 'Alexander Uribe Montalvo',
    shortName: 'Alexander Uribe',
    groupDirection: 'Sin asignación',
    entrySchedule: {
      defaultEntryTime: '09:25',
      exceptions: { lunes: '06:10' },
      label: 'Ingreso 9:25 a.m. (Lunes 6:10 a.m.)',
    },
    role: 'teacher',
    documentId: '71234018',
    phone: '3001001018',
    subjects: ['Tecnología e Informática', 'MT-Audiovisuales'],
    specialty: ['Tecnología e Informática', 'MT-Audiovisuales'],
    assignedSubject: 'Tecnología e Informática',
    subject: 'Tecnología e Informática',
    academicLevel: 'bachillerato',
    academicAssignmentStatus: 'assigned',
    assignedGradeIds: ['g-901', 'g-902', 'g-1002', 'g-1102'],
    maxWeeklyHours: 24,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
];

export const SEED_TEACHERS: UserEntity[] = RAW_SEED_TEACHERS.map((t) => {
  const officialEntry = resolveOfficialTeacherEntry(t.id, t.displayName);
  const canonicalColor = officialEntry?.originalExcelHex || t.color_hex || t.color || '#007DC5';
  return {
    ...t,
    color: canonicalColor,
    color_hex: canonicalColor,
    avatarColor: canonicalColor,
    maxWeeklyHours: t.maxWeeklyHours ?? (t.academicLevel === 'primaria' ? 25 : 24),
    allowedSubjects: (t.subjects || []).map((s) => getSubjectShortName(s)),
  };
});

export const SEED_CLASSROOMS: ClassroomEntity[] = [
  // Bachillerato Classrooms
  { id: 'aula-101', code: '101', name: 'Aula 101', capacity: 40, building: 'Bloque A', floor: 1, type: 'standard', isActive: true },
  { id: 'aula-102', code: '102', name: 'Aula 102', capacity: 38, building: 'Bloque A', floor: 1, type: 'standard', isActive: true },
  { id: 'aula-103', code: '103', name: 'Aula 103', capacity: 38, building: 'Bloque A', floor: 1, type: 'standard', isActive: true },
  { id: 'aula-201', code: '201', name: 'Aula 201', capacity: 38, building: 'Bloque A', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-202', code: '202', name: 'Aula 202', capacity: 40, building: 'Bloque A', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-203', code: '203', name: 'Aula 203', capacity: 36, building: 'Bloque A', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-204', code: '204', name: 'Aula 204', capacity: 35, building: 'Bloque A', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-301', code: '301', name: 'Aula 301', capacity: 35, building: 'Bloque B', floor: 3, type: 'standard', isActive: true },
  { id: 'aula-302', code: '302', name: 'Aula 302', capacity: 35, building: 'Bloque B', floor: 3, type: 'standard', isActive: true },
  { id: 'aula-303', code: '303', name: 'Aula 303', capacity: 35, building: 'Bloque B', floor: 3, type: 'standard', isActive: true },
  { id: 'aula-304', code: '304', name: 'Aula 304', capacity: 35, building: 'Bloque B', floor: 3, type: 'standard', isActive: true },
  { id: 'aula-305', code: '305', name: 'Aula 305', capacity: 35, building: 'Bloque B', floor: 3, type: 'standard', isActive: true },
  { id: 'aula-401', code: '401', name: 'Aula 401', capacity: 35, building: 'Bloque B', floor: 4, type: 'standard', isActive: true },
  { id: 'aula-402', code: '402', name: 'Aula 402', capacity: 35, building: 'Bloque B', floor: 4, type: 'standard', isActive: true },
  { id: 'aula-rota', code: 'ROTA', name: 'Aula (ROTACIÓN)', capacity: 35, building: 'Rotativa', floor: 1, type: 'standard', isActive: true },
  { id: 'lab-quimica', code: 'LAB-1', name: 'Lab. Ciencias y Química', capacity: 32, building: 'Bloque C', floor: 1, type: 'laboratory', isActive: true },
  { id: 'lab-fisica', code: 'LAB-2', name: 'Lab. Física', capacity: 32, building: 'Bloque C', floor: 1, type: 'laboratory', isActive: true },
  { id: 'sala-sistemas', code: 'SIS-1', name: 'Sala de Cómputo 1', capacity: 35, building: 'Bloque C', floor: 2, type: 'computer_lab', isActive: true },

  // Primaria Classrooms
  { id: 'aula-p-101', code: 'P-101', name: 'Aula P-101', capacity: 35, building: 'Bloque Primaria', floor: 1, type: 'standard', isActive: true },
  { id: 'aula-p-102', code: 'P-102', name: 'Aula P-102', capacity: 35, building: 'Bloque Primaria', floor: 1, type: 'standard', isActive: true },
  { id: 'aula-p-103', code: 'P-103', name: 'Aula P-103', capacity: 35, building: 'Bloque Primaria', floor: 1, type: 'standard', isActive: true },
  { id: 'aula-p-201', code: 'P-201', name: 'Aula P-201', capacity: 35, building: 'Bloque Primaria', floor: 1, type: 'standard', isActive: true },
  { id: 'aula-p-202', code: 'P-202', name: 'Aula P-202', capacity: 35, building: 'Bloque Primaria', floor: 1, type: 'standard', isActive: true },
  { id: 'aula-p-301', code: 'P-301', name: 'Aula P-301', capacity: 35, building: 'Bloque Primaria', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-p-302', code: 'P-302', name: 'Aula P-302', capacity: 35, building: 'Bloque Primaria', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-p-303', code: 'P-303', name: 'Aula P-303', capacity: 35, building: 'Bloque Primaria', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-p-304', code: 'P-304', name: 'Aula P-304', capacity: 35, building: 'Bloque Primaria', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-p-305', code: 'P-305', name: 'Aula P-305', capacity: 35, building: 'Bloque Primaria', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-p-401', code: 'P-401', name: 'Aula P-401', capacity: 35, building: 'Bloque Primaria', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-p-402', code: 'P-402', name: 'Aula P-402', capacity: 35, building: 'Bloque Primaria', floor: 2, type: 'standard', isActive: true },
  { id: 'aula-p-501', code: 'P-501', name: 'Aula P-501', capacity: 35, building: 'Bloque Primaria', floor: 3, type: 'standard', isActive: true },
  { id: 'aula-p-502', code: 'P-502', name: 'Aula P-502', capacity: 35, building: 'Bloque Primaria', floor: 3, type: 'standard', isActive: true },
];

export const BACHILLERATO_GRADES: GradeEntity[] = [
  { id: 'g-601', gradeLevel: '6°', groupNumber: '1', fullName: '6°1', shift: 'morning', studentCount: 38, academicYear: 2026, defaultClassroomId: 'Aula 303', isActive: true },
  { id: 'g-602', gradeLevel: '6°', groupNumber: '2', fullName: '6°2', shift: 'morning', studentCount: 36, academicYear: 2026, defaultClassroomId: 'Aula 402', isActive: true },
  { id: 'g-701', gradeLevel: '7°', groupNumber: '1', fullName: '7°1', shift: 'morning', studentCount: 35, academicYear: 2026, defaultClassroomId: 'Aula 202', isActive: true },
  { id: 'g-702', gradeLevel: '7°', groupNumber: '2', fullName: '7°2', shift: 'morning', studentCount: 37, academicYear: 2026, defaultClassroomId: 'Aula 304', isActive: true },
  { id: 'g-801', gradeLevel: '8°', groupNumber: '1', fullName: '8°1', shift: 'morning', studentCount: 34, academicYear: 2026, defaultClassroomId: 'Aula 401', isActive: true },
  { id: 'g-802', gradeLevel: '8°', groupNumber: '2', fullName: '8°2', shift: 'morning', studentCount: 33, academicYear: 2026, defaultClassroomId: 'Aula 302', isActive: true },
  { id: 'g-901', gradeLevel: '9°', groupNumber: '1', fullName: '9°1', shift: 'morning', studentCount: 33, academicYear: 2026, defaultClassroomId: 'Aula (ROTACIÓN)', isActive: true },
  { id: 'g-902', gradeLevel: '9°', groupNumber: '2', fullName: '9°2', shift: 'morning', studentCount: 34, academicYear: 2026, defaultClassroomId: 'Aula 301', isActive: true },
  { id: 'g-1001', gradeLevel: '10°', groupNumber: '1', fullName: '10°1', shift: 'morning', studentCount: 32, academicYear: 2026, defaultClassroomId: 'Aula 201', isActive: true },
  { id: 'g-1002', gradeLevel: '10°', groupNumber: '2', fullName: '10°2', shift: 'morning', studentCount: 31, academicYear: 2026, defaultClassroomId: 'Aula 102', isActive: true },
  { id: 'g-1101', gradeLevel: '11°', groupNumber: '1', fullName: '11°1', shift: 'morning', studentCount: 30, academicYear: 2026, defaultClassroomId: 'Aula 103', isActive: true },
  { id: 'g-1102', gradeLevel: '11°', groupNumber: '2', fullName: '11°2', shift: 'morning', studentCount: 29, academicYear: 2026, defaultClassroomId: 'Aula 305', isActive: true },
];

export const TRANSICION_2_GRADES: GradeEntity[] = [
  { id: 'g-trans-2', gradeLevel: 'Transición', groupNumber: '2', fullName: 'Transición 2', shift: 'transicion-1', studentCount: 25, academicYear: 2026, defaultClassroomId: 'Aula P-101', isActive: true },
];

export const PRIMARIA_GRADES: GradeEntity[] = [
  { id: 'g-101', gradeLevel: '1°', groupNumber: '1', fullName: '1.1', shift: 'afternoon', studentCount: 32, academicYear: 2026, defaultClassroomId: 'Aula 102', isActive: true },
  { id: 'g-102', gradeLevel: '1°', groupNumber: '2', fullName: '1.2', shift: 'afternoon', studentCount: 30, academicYear: 2026, defaultClassroomId: 'Aula 103', isActive: true },
  { id: 'g-201', gradeLevel: '2°', groupNumber: '1', fullName: '2.1', shift: 'afternoon', studentCount: 33, academicYear: 2026, defaultClassroomId: 'Aula 402', isActive: true },
  { id: 'g-202', gradeLevel: '2°', groupNumber: '2', fullName: '2.2', shift: 'afternoon', studentCount: 31, academicYear: 2026, defaultClassroomId: 'Aula 401', isActive: true },
  { id: 'g-301', gradeLevel: '3°', groupNumber: '1', fullName: '3.1', shift: 'afternoon', studentCount: 35, academicYear: 2026, defaultClassroomId: 'Aula 301', isActive: true },
  { id: 'g-302', gradeLevel: '3°', groupNumber: '2', fullName: '3.2', shift: 'afternoon', studentCount: 34, academicYear: 2026, defaultClassroomId: 'Aula 302', isActive: true },
  { id: 'g-303', gradeLevel: '3°', groupNumber: '3', fullName: '3.3', shift: 'afternoon', studentCount: 32, academicYear: 2026, defaultClassroomId: 'Aula 303', isActive: true },
  { id: 'g-401', gradeLevel: '4°', groupNumber: '1', fullName: '4.1', shift: 'afternoon', studentCount: 36, academicYear: 2026, defaultClassroomId: 'Aula 305', isActive: true },
  { id: 'g-402', gradeLevel: '4°', groupNumber: '2', fullName: '4.2', shift: 'afternoon', studentCount: 35, academicYear: 2026, defaultClassroomId: 'Aula 304', isActive: true },
  { id: 'g-501', gradeLevel: '5°', groupNumber: '1', fullName: '5.1', shift: 'afternoon', studentCount: 34, academicYear: 2026, defaultClassroomId: 'Aula 201', isActive: true },
  { id: 'g-502', gradeLevel: '5°', groupNumber: '2', fullName: '5.2', shift: 'afternoon', studentCount: 33, academicYear: 2026, defaultClassroomId: 'Aula 202', isActive: true },
];

export const TRANSICION_1_GRADES: GradeEntity[] = [
  { id: 'g-trans-1', gradeLevel: 'Transición', groupNumber: '1', fullName: 'Transición 1', shift: 'transicion-1', studentCount: 26, academicYear: 2026, defaultClassroomId: 'Aula P-102', isActive: true },
  ...TRANSICION_2_GRADES,
];

export const SEED_GRADES: GradeEntity[] = [
  ...BACHILLERATO_GRADES,
  ...PRIMARIA_GRADES,
  ...TRANSICION_1_GRADES,
];

export const SEED_ABSENCE_REQUESTS: AbsenceRequestEntity[] = [
  {
    id: 'abs-req-001',
    teacher_id: 't-alejandro',
    teacher_name: 'Alejandro Ramírez Cañas',
    date: '2026-10-19',
    status: 'approved',
    reason: 'Cita médica especialista EPS Sura',
    created_at: '2026-10-16T14:30:00Z',
    reviewed_by: 'Coord. Académica',
    reviewed_at: '2026-10-16T15:00:00Z',
    affected_periods: [1, 2],
    replacement_teacher_id: 't-natalia',
    replacement_teacher_name: 'Natalia Andrea Caro Sánchez',
    review_notes: 'Aprobado. Se asigna Prof. Natalia Caro en apoyo institucional.',
  },
];

/**
 * Reconciles any array of time blocks with the official 32-teacher roster and subjects
 * while preserving institutional novelties created by the coordinator.
 */
export function reconcileBlocksWithOfficialRoster(blocks: TimeBlockEntity[]): TimeBlockEntity[] {
  const canonicalSeedMap = new Map<string, TimeBlockEntity>();
  if (Array.isArray(excelSeedData)) {
    (excelSeedData as TimeBlockEntity[]).forEach((b) => {
      canonicalSeedMap.set(b.id, b);
    });
  }

  const result = blocks.map((b) => {
    const isTransicion =
      b.gradeId === 'g-trans-1' ||
      b.gradeId === 'g-trans-2' ||
      b.gradeName === 'Transición 1' ||
      b.gradeName === 'Transición 2';

    const isNovelty =
      b.block_type === 'novelty' ||
      Boolean(b.motivo_novedad) ||
      Boolean(b.notes && b.notes.toLowerCase().includes('novedad')) ||
      Boolean(b.subject && b.subject.toUpperCase().startsWith('NOVEDAD'));

    if (isNovelty) {
      return isTransicion ? { ...b, shift: 'transicion-1' as const } : b;
    }

    const seedMatch = canonicalSeedMap.get(b.id);
    if (seedMatch) {
      return {
        ...b,
        shift: seedMatch.shift,
        startTime: seedMatch.startTime,
        endTime: seedMatch.endTime,
        subject: seedMatch.subject,
        teacherId: seedMatch.teacherId,
        teacherName: getShortTeacherName(seedMatch.teacherId, seedMatch.teacherName),
        gradeId: seedMatch.gradeId,
        gradeName: seedMatch.gradeName,
        classroomId: seedMatch.classroomId,
        classroomName: seedMatch.classroomName,
      };
    }

    if (b.teacherId && b.teacherId !== 'unassigned') {
      const shortName = getShortTeacherName(b.teacherId, b.teacherName);
      let subj = b.subject;
      if (subj === 'Plan Lector') subj = 'Lengua Castellana';
      if (subj === 'Cátedra de Paz') subj = 'Cátedra de la Paz';
      if (subj === 'Ciencias Políticas y Económicas') subj = 'Economía y Política';
      if (subj === 'Media Técnica') {
        subj = b.gradeId === 'g-1001' || b.gradeId === 'g-1101' ? 'MT-Bases de Datos' : 'MT-Audiovisuales';
      }
      return {
        ...b,
        shift: isTransicion ? ('transicion-1' as const) : b.shift,
        subject: subj,
        teacherName: shortName,
      };
    }

    return isTransicion ? { ...b, shift: 'transicion-1' as const } : b;
  });

  // Ensure all canonical 2026 blocks exist
  const existingIds = new Set(result.map((b) => b.id));
  if (Array.isArray(excelSeedData)) {
    (excelSeedData as TimeBlockEntity[]).forEach((seedBlock) => {
      if (!existingIds.has(seedBlock.id)) {
        result.push({ ...seedBlock });
      }
    });
  }

  return result;
}

export function generateSeedBlocks(): TimeBlockEntity[] {
  if (Array.isArray(excelSeedData) && excelSeedData.length > 0) {
    return reconcileBlocksWithOfficialRoster([...excelSeedData] as TimeBlockEntity[]);
  }
  return [];
}

// Asignación de Paleta Curada Anti-Colisión (Selección sin Reemplazo de VILLA_FLORA_PALETTE)
const usedSeedColors: string[] = [];

// 1. Prioridad: Colores canónicos oficiales bloqueados por docente
SEED_TEACHERS.forEach((teacher) => {
  const officialEntry = resolveOfficialTeacherEntry(teacher.id, teacher.displayName);
  const canonicalHex = officialEntry?.originalExcelHex || teacher.color_hex || teacher.color;
  if (canonicalHex) {
    teacher.color = canonicalHex;
    teacher.color_hex = canonicalHex;
    teacher.avatarColor = canonicalHex;
    usedSeedColors.push(canonicalHex);
  }
});

// 2. Asignación Anti-Colisión sin reemplazo para cualquier docente adicional
SEED_TEACHERS.forEach((teacher) => {
  if (!teacher.color_hex) {
    const nextColor = getNextAvailableTeacherColor(usedSeedColors);
    teacher.color = nextColor;
    teacher.color_hex = nextColor;
    teacher.avatarColor = nextColor;
    usedSeedColors.push(nextColor);
  }
});

export const OFFICIAL_2026_SEED_VERSION = 'v2026_definitiva';

export function ensureSeedDataLoaded() {
  const isCurrentVersion = localStorage.getItem('ievf_seed_version') === OFFICIAL_2026_SEED_VERSION;

  // 1. Cargar o consolidar el mapa permanente de colores bloqueados (Ad Perpetuum)
  const lockedColors: Record<string, string> = {};
  try {
    const rawLocked = localStorage.getItem('ievf_locked_teacher_colors_v1');
    if (rawLocked) {
      const parsedLocked = JSON.parse(rawLocked);
      if (parsedLocked && typeof parsedLocked === 'object') {
        Object.assign(lockedColors, parsedLocked);
      }
    }
  } catch {}

  try {
    const oldRaw = localStorage.getItem('ievf_users_v1');
    if (oldRaw) {
      const oldUsers = JSON.parse(oldRaw);
      if (Array.isArray(oldUsers)) {
        oldUsers.forEach((u: any) => {
          const hex = u?.color_hex || u?.color || u?.avatarColor;
          if (u?.id && hex && !lockedColors[u.id]) {
            lockedColors[u.id] = hex;
          }
        });
      }
    }
  } catch {}

  SEED_TEACHERS.forEach((t) => {
    const hex = lockedColors[t.id] || t.color_hex || t.color || '#007DC5';
    lockedColors[t.id] = hex;
    updateTeacherDictionaryColor(t.id, hex);
  });

  try {
    localStorage.setItem('ievf_locked_teacher_colors_v1', JSON.stringify(lockedColors));
  } catch {}

  let deletedIds = new Set<string>();
  try {
    const delRaw = localStorage.getItem('ievf_deleted_teacher_ids_v1');
    if (delRaw) {
      const parsedDel = JSON.parse(delRaw);
      if (Array.isArray(parsedDel)) {
        deletedIds = new Set(parsedDel.map((id: any) => String(id)));
      }
    }
  } catch {}

  if (!isCurrentVersion || !localStorage.getItem('ievf_users_v1')) {
    const mergedTeachers = SEED_TEACHERS.filter((t) => !deletedIds.has(t.id)).map((t) => {
      const lockedHex = lockedColors[t.id] || t.color_hex || t.color || '#007DC5';
      return { ...t, color: lockedHex, color_hex: lockedHex, avatarColor: lockedHex };
    });
    localStorage.setItem('ievf_users_v1', JSON.stringify(mergedTeachers));
  } else {
    try {
      const seedTeacherById = new Map<string, UserEntity>();
      SEED_TEACHERS.forEach((st) => seedTeacherById.set(st.id, st));

      const existingRaw = localStorage.getItem('ievf_users_v1');
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) {
          let changed = false;
          const filtered = parsed
            .filter((u: any) => {
              const rem =
                (u?.id && deletedIds.has(String(u.id))) ||
                u?.id === 't-adriana-mier' ||
                String(u?.displayName || '').toLowerCase().includes('adriana mier') ||
                String(u?.displayName || '').toLowerCase().includes('adriana luc');
              if (rem) changed = true;
              return !rem;
            })
            .map((u: any) => {
              if (u?.userEdited) {
                const userHex = u?.color_hex || u?.color || (u?.id && lockedColors[u.id]) || '#007DC5';
                if (u?.id && userHex) {
                  updateTeacherDictionaryColor(u.id, userHex);
                }
                return {
                  ...u,
                  color: userHex,
                  color_hex: userHex,
                  avatarColor: userHex,
                };
              }

              let nextUser = u;
              const canonicalSeed = u?.id ? seedTeacherById.get(u.id) : undefined;
              if (canonicalSeed) {
                if (!Array.isArray(nextUser.assignedGradeIds) || nextUser.assignedGradeIds.length === 0) {
                  changed = true;
                  nextUser = { ...nextUser, assignedGradeIds: [...(canonicalSeed.assignedGradeIds || [])] };
                }
                if (!nextUser.groupDirection && canonicalSeed.groupDirection) {
                  changed = true;
                  nextUser = { ...nextUser, groupDirection: canonicalSeed.groupDirection };
                }
                if (!nextUser.academicLevel && canonicalSeed.academicLevel) {
                  changed = true;
                  nextUser = { ...nextUser, academicLevel: canonicalSeed.academicLevel };
                }
                if (!nextUser.entrySchedule && canonicalSeed.entrySchedule) {
                  changed = true;
                  nextUser = { ...nextUser, entrySchedule: canonicalSeed.entrySchedule };
                }
                if (!Array.isArray(nextUser.subjects) || nextUser.subjects.length === 0) {
                  changed = true;
                  nextUser = {
                    ...nextUser,
                    subjects: [...(canonicalSeed.subjects || [])],
                    specialty: [...(canonicalSeed.specialty || canonicalSeed.subjects || [])],
                  };
                }
              }
              if (u?.id === 't-m-isabel' && nextUser.shortName !== 'Mª Isabel Giraldo') {
                changed = true;
                nextUser = { ...nextUser, shortName: 'Mª Isabel Giraldo' };
              }
              if (u?.id === 't-alejandra' && nextUser.shortName !== 'Alejandra Pérez') {
                changed = true;
                nextUser = { ...nextUser, shortName: 'Alejandra Pérez' };
              }
              if (u?.id === 't-betty' && nextUser.shortName !== 'Betty Vásquez') {
                changed = true;
                nextUser = { ...nextUser, shortName: 'Betty Vásquez' };
              }
              const lockedHex =
                (u?.id && lockedColors[u.id]) ||
                resolveOfficialTeacherEntry(u?.id, u?.displayName)?.originalExcelHex ||
                u?.color_hex ||
                u?.color;
              if (
                lockedHex &&
                (nextUser.color !== lockedHex ||
                  nextUser.color_hex !== lockedHex ||
                  nextUser.avatarColor !== lockedHex)
              ) {
                changed = true;
                nextUser = {
                  ...nextUser,
                  color: lockedHex,
                  color_hex: lockedHex,
                  avatarColor: lockedHex,
                };
              }
              if (u?.id && lockedHex) {
                updateTeacherDictionaryColor(u.id, lockedHex);
              }
              return nextUser;
            });
          if (changed) {
            localStorage.setItem('ievf_users_v1', JSON.stringify(filtered));
          }
        }
      }
    } catch {}
  }

  // Sincronizar colores bloqueados y nombres oficiales en el snapshot público local si existe
  try {
    const snapRaw = localStorage.getItem('ievf_public_schedule_snapshot');
    if (snapRaw) {
      const snap = JSON.parse(snapRaw);
      if (snap && Array.isArray(snap.teachers)) {
        let snapChanged = false;
        snap.teachers = snap.teachers
          .filter(
            (t: any) =>
              t?.id !== 't-adriana-mier' &&
              !String(t?.displayName || '').toLowerCase().includes('adriana mier') &&
              !String(t?.displayName || '').toLowerCase().includes('adriana luc')
          )
          .map((t: any) => {
            const officialEntry = resolveOfficialTeacherEntry(t?.id, t?.displayName);
            const canonicalId = officialEntry?.id || t?.id;
            const lockedHex =
              (canonicalId && lockedColors[canonicalId]) ||
              officialEntry?.originalExcelHex ||
              t?.color ||
              '#007DC5';
            const fullName = getFullTeacherName(canonicalId, t?.displayName);
            if (t?.color !== lockedHex || t?.displayName !== fullName) {
              snapChanged = true;
              return { ...t, id: canonicalId || t.id, displayName: fullName, color: lockedHex };
            }
            return t;
          });
        if (snapChanged) {
          localStorage.setItem('ievf_public_schedule_snapshot', JSON.stringify(snap));
        }
      }
    }
  } catch {}

  if (!isCurrentVersion || !localStorage.getItem('ievf_classrooms_v1')) {
    localStorage.setItem('ievf_classrooms_v1', JSON.stringify(SEED_CLASSROOMS));
  }
  if (!isCurrentVersion || !localStorage.getItem('ievf_grades_v1')) {
    localStorage.setItem('ievf_grades_v1', JSON.stringify(SEED_GRADES));
  }
  if (!isCurrentVersion || !localStorage.getItem('ievf_absence_requests_v1')) {
    localStorage.setItem('ievf_absence_requests_v1', JSON.stringify(SEED_ABSENCE_REQUESTS));
  }

  const isBlankMatrixMode = localStorage.getItem('ievf_blank_matrix_mode') === '1';

  if (isBlankMatrixMode) {
    if (!localStorage.getItem('ievf_baseline_2026_v1')) {
      localStorage.setItem('ievf_baseline_2026_v1', JSON.stringify(generateSeedBlocks()));
    }
    localStorage.setItem('ievf_time_blocks_v1', '[]');
    localStorage.setItem('villaFloraMatrix', '[]');
  } else if (!isCurrentVersion) {
    const seedBlocks = generateSeedBlocks();
    localStorage.setItem('ievf_baseline_2026_v1', JSON.stringify(seedBlocks));
    try {
      const existingRaw = localStorage.getItem('villaFloraMatrix') || localStorage.getItem('ievf_time_blocks_v1');
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const reconciled = reconcileBlocksWithOfficialRoster(parsed);
          localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(reconciled));
          localStorage.setItem('villaFloraMatrix', JSON.stringify(reconciled));
        } else {
          localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(seedBlocks));
          localStorage.setItem('villaFloraMatrix', JSON.stringify(seedBlocks));
        }
      } else {
        localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(seedBlocks));
        localStorage.setItem('villaFloraMatrix', JSON.stringify(seedBlocks));
      }
    } catch {
      localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(seedBlocks));
      localStorage.setItem('villaFloraMatrix', JSON.stringify(seedBlocks));
    }
  } else if (!localStorage.getItem('ievf_time_blocks_v1') && !localStorage.getItem('villaFloraMatrix')) {
    const seedBlocks = generateSeedBlocks();
    localStorage.setItem('ievf_baseline_2026_v1', JSON.stringify(seedBlocks));
    localStorage.setItem('ievf_time_blocks_v1', JSON.stringify(seedBlocks));
    localStorage.setItem('villaFloraMatrix', JSON.stringify(seedBlocks));
  } else if (!localStorage.getItem('villaFloraMatrix')) {
    const existing = localStorage.getItem('ievf_time_blocks_v1');
    if (existing) {
      localStorage.setItem('villaFloraMatrix', existing);
    }
  }

  // Asegurar que los bloques en caché reflejen los nombres abreviados actualizados (Mª Isabel Giraldo, Alejandra Pérez y Betty Vásquez)
  try {
    for (const key of ['ievf_time_blocks_v1', 'villaFloraMatrix', 'ievf_baseline_2026_v1']) {
      const rawBlocks = localStorage.getItem(key);
      if (
        rawBlocks &&
        (rawBlocks.includes('María Giraldo') ||
          rawBlocks.includes('"Isabel Giraldo"') ||
          rawBlocks.includes('María Pérez') ||
          rawBlocks.includes('María Vásquez'))
      ) {
        const updatedRaw = rawBlocks
          .replace(/"teacherName"\s*:\s*"(María Giraldo|Isabel Giraldo)"/g, '"teacherName":"Mª Isabel Giraldo"')
          .replace(/"teacherName"\s*:\s*"María Pérez"/g, '"teacherName":"Alejandra Pérez"')
          .replace(/"teacherName"\s*:\s*"María Vásquez"/g, '"teacherName":"Betty Vásquez"');
        localStorage.setItem(key, updatedRaw);
      }
    }
  } catch {}

  localStorage.setItem('ievf_seed_version', OFFICIAL_2026_SEED_VERSION);
}
