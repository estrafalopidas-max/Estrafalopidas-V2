/**
 * Domain Entity: AbsenceRequest
 * Firestore Collection: 'absence_requests'
 * Core Maker-Checker Engine Model (PRD Sections 2 & 3)
 * 
 * Flow:
 * 1. MAKER (Teacher): Submits absence request -> Status 'pending'.
 *    Teachers DO NOT have direct write access to 'time_blocks'.
 * 2. CHECKER (Coordinator / Admin): Reviews request -> Approves or Rejects.
 *    Upon approval, workflow updates corresponding 'time_blocks' records.
 */

export type AbsenceStatus = 'pending' | 'approved' | 'rejected';

export interface AbsenceRequestEntity {
  id: string; // Document ID (e.g. 'abs-req-1729123456')
  
  // Maker Data (PRD §3)
  teacher_id: string; // Document ID of requesting teacher
  teacher_name?: string;
  date: string; // Date of absence: ISO YYYY-MM-DD
  status: AbsenceStatus; // 'pending' | 'approved' | 'rejected'
  reason: string; // Explanation of absence
  created_at: string; // Timestamp ISO 8601
  
  // Checker Data (PRD §3)
  reviewed_by: string | null; // Coordinator Name / UID
  reviewed_at: string | null; // Timestamp ISO 8601
  
  // Maker-Checker Scheduling Extensions
  affected_periods?: number[]; // [1, 2, 3] or all periods for the shift
  replacement_teacher_id?: string | null; // Assigned replacement teacher by Checker
  replacement_teacher_name?: string | null;
  review_notes?: string | null; // Coordinator review feedback
}
