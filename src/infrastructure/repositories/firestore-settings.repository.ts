/**
 * LocalStorage Settings Repository
 * Manages institutional settings in local storage with image support via base64 Data URLs.
 */

import { InstitutionSettingsEntity } from '../../domain/entities/institution-settings.entity';

const LOCAL_STORAGE_KEY = 'ie_villa_flora_settings';
const EVENT_NAME = 'institution_settings_updated';

const DEFAULT_SETTINGS: InstitutionSettingsEntity = {
  id: 'general',
  institutionName: 'I.E. Villa Flora',
  logoUrl: null,
  updatedAt: new Date().toISOString(),
};

export class FirestoreSettingsRepository {
  private memoryCache: InstitutionSettingsEntity;

  constructor() {
    this.memoryCache = this.readFromLocalStorage();
  }

  private readFromLocalStorage(): InstitutionSettingsEntity {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore
    }
    return DEFAULT_SETTINGS;
  }

  private saveToLocalStorage(settings: InstitutionSettingsEntity): void {
    try {
      this.memoryCache = settings;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch (e) {
      console.warn('[SettingsRepository] Error saving settings to localStorage:', e);
    }
  }

  /**
   * Retrieves current general settings
   */
  public async getSettings(): Promise<InstitutionSettingsEntity> {
    return this.memoryCache;
  }

  /**
   * Real-time subscription to settings changes
   */
  public subscribe(callback: (settings: InstitutionSettingsEntity) => void): () => void {
    callback(this.memoryCache);

    const handler = () => {
      this.memoryCache = this.readFromLocalStorage();
      callback(this.memoryCache);
    };

    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener('storage', handler);
    };
  }

  /**
   * Uploads an institution logo file as base64 data URL and updates settings
   */
  public async uploadInstitutionLogo(file: File): Promise<string> {
    const logoUrl = await this.convertFileToDataUrl(file);

    const updatedSettings: InstitutionSettingsEntity = {
      ...this.memoryCache,
      id: 'general',
      logoUrl,
      updatedAt: new Date().toISOString(),
    };

    this.saveToLocalStorage(updatedSettings);
    return logoUrl;
  }

  /**
   * Removes custom logo and resets to default
   */
  public async removeInstitutionLogo(): Promise<void> {
    const updatedSettings: InstitutionSettingsEntity = {
      ...this.memoryCache,
      logoUrl: null,
      updatedAt: new Date().toISOString(),
    };

    this.saveToLocalStorage(updatedSettings);
  }

  /**
   * Updates meeting day status for a specific day in settings
   */
  public async updateMeetingDay(day: string, isMeetingDay: boolean): Promise<Record<string, boolean>> {
    const currentMeetingDays = this.memoryCache.meetingDays || {};
    const updatedMeetingDays = { ...currentMeetingDays, [day]: isMeetingDay };
    const updatedSettings: InstitutionSettingsEntity = {
      ...this.memoryCache,
      meetingDays: updatedMeetingDays,
      updatedAt: new Date().toISOString(),
    };

    this.saveToLocalStorage(updatedSettings);
    return updatedMeetingDays;
  }

  /**
   * Updates event day status (Modo Evento Primaria) for a specific day in settings
   */
  public async updateEventDay(day: string, isEventDay: boolean): Promise<Record<string, boolean>> {
    const currentEventDays = this.memoryCache.eventDays || {};
    const updatedEventDays = { ...currentEventDays, [day]: isEventDay };
    const updatedSettings: InstitutionSettingsEntity = {
      ...this.memoryCache,
      eventDays: updatedEventDays,
      updatedAt: new Date().toISOString(),
    };

    this.saveToLocalStorage(updatedSettings);
    return updatedEventDays;
  }

  private convertFileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }
}
