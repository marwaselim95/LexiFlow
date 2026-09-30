import { Injectable } from '@nestjs/common';

import { UsersModel } from './users.model';
import { error } from '../utils/http-error.util';

@Injectable()
export class UsersService {
  constructor(private usersModel: UsersModel) {}

  /** The active target language — equivalent of reading profiles.target_language. */
  async getTargetLanguage(userId: string): Promise<string> {
    const profile = await this.usersModel.findProfileById(userId);
    if (!profile || !profile.targetLanguage) throw error('unknown', 'Profile not found', 404);
    return profile.targetLanguage;
  }
  
  async getProfile(userId: string) {
    const profile = await this.usersModel.findProfileById(userId);
    if (!profile) throw error('unknown', 'Profile not found', 404);
    return profile;
  }

  /** Resolve ISO codes to full language names for prompts ("Arabic" not "ar"). */
  async resolveLanguageNames(codes: string[]): Promise<Record<string, string>> {
    const rows = await this.usersModel.findSupportedLanguages(codes);
    const map: Record<string, string> = {};
    for (const row of rows) map[row.code] = row.name;
    return map;
  }

  // ── Learning languages ──────────────────────────────────────────────────────

  async getLearningLanguagesFor(userId: string): Promise<{
    languages: Array<{ code: string; name: string; addedAt: Date; isActive: boolean }>;
    activeLanguage: string | null;
  }> {
    const userLangs = await this.usersModel.findUserLanguages(userId);

    const profile = await this.usersModel.findProfileById(userId);

    const activeLanguage = profile?.targetLanguage ?? null;

    const languages = userLangs.map((row) => ({
      code: row.language,
      name: row.supported?.name ?? row.language,
      addedAt: row.addedAt,
      isActive: row.language === activeLanguage,
    }));

    return { languages, activeLanguage };
  }

  async addLearningLanguage(userId: string, language: string): Promise<{ success: true; language: string }> {
    const supported = await this.usersModel.findSupportedLanguageByCode(language);
    if (!supported) {
      throw error('unknown', `Unsupported language code: ${language}`, 400);
    }

    // Idempotent insert
    await this.usersModel.upsertUserLanguage(userId, language);

    return { success: true, language };
  }

  async setActiveLanguage(userId: string, language: string): Promise<{ success: true; activeLanguage: string }> {
    const userLang = await this.usersModel.findUserLanguage(userId, language);
    if (!userLang) {
      throw error('unknown', `Language '${language}' not in your learning languages. Add it first.`, 400);
    }

    await this.usersModel.updateProfileTargetLanguage(userId, language);

    return { success: true, activeLanguage: language };
  }

  async updateNativeLanguage(userId: string, language: string): Promise<{ success: true; nativeLanguage: string }> {
    const supported = await this.usersModel.findSupportedLanguageByCode(language);
    if (!supported) {
      throw error('unknown', `Unsupported language code: ${language}`, 400);
    }

    await this.usersModel.updateProfileNativeLanguage(userId, language);

    return { success: true, nativeLanguage: language };
  }
}
