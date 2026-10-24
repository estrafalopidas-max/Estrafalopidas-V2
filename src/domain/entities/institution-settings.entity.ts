/**
 * Institution Global Settings Entity
 * Stored in Firestore at: settings/general
 */

export interface InstitutionSettingsEntity {
  id: string; // 'general'
  institutionName: string;
  logoUrl: string | null;
  updatedAt: string;
  updatedBy?: string;
  meetingDays?: Record<string, boolean>;
  eventDays?: Record<string, boolean>;
}
