import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';
import { SpeechService } from '../speech/speech.service';
import { UsersService } from '../users/users.service';
import { error } from '../utils/http-error.util';

@Injectable()
export class PronounceService {
  constructor(
    private prisma: PrismaService,
    private speech: SpeechService,
    private users: UsersService,
  ) {}

  // ── getPhonemeList ──────────────────────────────────────────────────────────

  async getPhonemeList(userId: string): Promise<Array<{ phoneme: string; status: 'excellent' | 'good' | 'wrong' }>> {
    const lang = await this.users.getTargetLanguage(userId).catch(() => 'en');

    const refs = await this.prisma.phonemeReference.findMany({
      where: { language: lang },
      orderBy: { phoneme: 'asc' },
    });

    const assessments = await this.prisma.phonemeAssessment.findMany({
      where: { userId, targetLanguage: lang },
      select: { phoneme: true, status: true },
    });

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

    const row = await this.prisma.phonemeExampleWord.findUnique({
      where: { language_phoneme: { language: lang, phoneme } },
      select: { word: true },
    });

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
      await this.prisma.phonemeAssessment.upsert({
        where: {
          userId_targetLanguage_phoneme: {
            userId,
            targetLanguage: targetLang,
            phoneme: ph.phoneme,
          },
        },
        update: { status: ph.status, lastAssessedAt: new Date(), attempts: { increment: 1 } },
        create: {
          userId,
          targetLanguage: targetLang,
          phoneme: ph.phoneme,
          status: ph.status,
          attempts: 1,
        },
      });
    }

    return result;
  }
}
