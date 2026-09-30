import { Injectable } from '@nestjs/common';

import { PronounceModel } from './pronounce.model';
import { SpeechService } from '../speech/speech.service';
import { UsersService } from '../users/users.service';
import { error } from '../utils/http-error.util';

@Injectable()
export class PronounceService {
  constructor(
    private pronounceModel: PronounceModel,
    private speech: SpeechService,
    private users: UsersService,
  ) {}

  // ── getPhonemeList ──────────────────────────────────────────────────────────

  async getPhonemeList(userId: string): Promise<Array<{ phoneme: string; status: 'excellent' | 'good' | 'wrong' }>> {
    const lang = await this.users.getTargetLanguage(userId).catch(() => 'en');

    const refs = await this.pronounceModel.getPhonemeReferences(lang);

    const assessments = await this.pronounceModel.getPhonemeAssessments(userId, lang);

    const assessMap = new Map(assessments.map((a) => [a.phoneme, a.status]));

    const ORDER: Record<string, number> = { excellent: 0, good: 1, wrong: 2 };

    return refs
      .map((r) => ({
        phoneme: r.phoneme,
        status: (assessMap.get(r.phoneme) ?? 'wrong') as 'excellent' | 'good' | 'wrong',
      }))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  }

  // ── getWordForPhoneme ───────────────────────────────────────────────────────

  async getWordForPhoneme(userId: string, phoneme?: string): Promise<{ word: string }> {
    if (!phoneme) throw error('unknown', 'phoneme required', 400);

    const lang = await this.users.getTargetLanguage(userId).catch(() => 'en');

    const row = await this.pronounceModel.getPhonemeExampleWord(lang, phoneme);

    if (!row) throw error('unknown', 'No example word found for phoneme', 404);

    return { word: row.word };
  }

  // ── assessPronunciation ─────────────────────────────────────────────────────

  async assessPronunciation(input: {
    userId: string;
    audioBuffer: Buffer;
    word: string;
    targetLang: string;
  }): Promise<{ score: number; phonemeBreakdown: Array<{ phoneme: string; status: string }> }> {
    const { userId, audioBuffer, word, targetLang } = input;

    if (!audioBuffer || !word || !targetLang) {
      throw error('unknown', 'audio, word, and targetLang required', 400);
    }

    const audioB64 = audioBuffer.toString('base64');
    const result = await this.speech.evaluateWord(audioB64, word, targetLang);

    // Upsert phoneme_assessments for each phoneme + increment attempts
    for (const ph of result.phonemeBreakdown) {
      await this.pronounceModel.upsertPhonemeAssessment(userId, targetLang, ph.phoneme, ph.status);
    }

    return result;
  }
}
