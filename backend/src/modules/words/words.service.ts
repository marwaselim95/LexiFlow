import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';
import { WordsModel } from './words.model';
import { SrsService } from '../srs/srs.service';
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';
import { error } from '../utils/http-error.util';

import { SaveWordInput } from './types/save-word-input.interface';

@Injectable()
export class WordsService {
  constructor(
    private prisma: PrismaService,
    private wordsModel: WordsModel,
    private srs: SrsService,
    private ai: AiService,
    private users: UsersService,
  ) {}

  // ── saveWord ────────────────────────────────────────────────────────────────

  async saveWord(userId: string, input: SaveWordInput): Promise<{ wordId: string }> {
    const word = input.word;

    // Accept both field names — frontend sends `synonyms`, card generators send `nativeSynonyms`
    const nativeSynonyms = word?.synonyms ?? word?.nativeSynonyms ?? [];

    if (!word?.headword || !word?.contexts || !input.source) {
      throw error('unknown', 'Missing required fields', 400);
    }

    const targetLanguage = await this.users.getTargetLanguage(userId);

    const wordRow = await this.prisma.$transaction(async (tx) => {
      const created = await this.wordsModel.createWordWithContexts(tx, userId, { headword: word.headword, nativeSynonyms, targetLanguage, source: input.source }, word.contexts);
      await this.srs.scheduleReview(tx, created.id);
      return created;
    });

    return { wordId: wordRow.id };
  }

  // ── removeWord ──────────────────────────────────────────────────────────────

  async removeWord(userId: string, wordId: string): Promise<{ success: true }> {
    if (!wordId) throw error('unknown', 'wordId required', 400);

    // Ownership enforced via userId filter (replaces RLS)
    await this.wordsModel.deleteWord(wordId, userId);
    return { success: true };
  }

  // ── Vault ───────────────────────────────────────────────────────────────────

  async getVaultMonths(userId: string): Promise<Array<{ month: string; wordCount: number }>> {
    const targetLanguage = await this.users.getTargetLanguage(userId);

    const words = await this.wordsModel.getWordsForMonth(userId, targetLanguage, new Date('2000-01-01'), new Date('2100-01-01'));

    const monthMap = new Map<string, number>();
    for (const row of words) {
      const month = row.savedAt.toISOString().slice(0, 7);
      monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
    }

    return Array.from(monthMap.entries()).map(([month, wordCount]) => ({ month, wordCount }));
  }

  async getVaultWords(userId: string, month?: string) {
    if (!month || !/^\d{4}-\d{2}$/.test(month ?? '')) {
      throw error('unknown', 'month required (YYYY-MM)', 400);
    }

    const startDate = new Date(`${month}-01T00:00:00.000Z`);
    const [year, mon] = month.split('-').map(Number);
    const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;
    const endDate = new Date(`${nextMonth}-01T00:00:00.000Z`);

    const targetLanguage = await this.users.getTargetLanguage(userId);

    const rows = await this.wordsModel.getWordsForMonthWithContexts(userId, targetLanguage, startDate, endDate);

    return rows.map((row) => ({
      id: row.id,
      headword: row.headword,
      nativeTranslation: row.nativeSynonyms?.[0] ?? '',
      savedAt: row.savedAt.toISOString(),
      stage: row.stage,
      cardData: {
        id: row.id,
        headword: row.headword,
        synonyms: row.nativeSynonyms ?? [],
        contexts: row.contexts.map((c) => ({
          label: c.label,
          explanation: c.explanation,
          example: c.example,
        })),
        stage: row.stage,
        stage6_streak: 0,
        active: row.active,
        savedAt: row.savedAt.toISOString(),
        source: row.source as 'manual' | 'watch' | 'explore' | 'selection',
      },
    }));
  }

  // ── generateVaultParagraph ──────────────────────────────────────────────────

  async generateVaultParagraph(
    userId: string,
    month: string,
    excludeWordIds: string[] = [],
  ): Promise<{ paragraph: string; pickedWordIds: string[] }> {
    if (!month) throw error('unknown', 'month required', 400);

    const startDate = new Date(`${month}-01T00:00:00.000Z`);
    const [year, mon] = month.split('-').map(Number);
    const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;
    const endDate = new Date(`${nextMonth}-01T00:00:00.000Z`);

    const targetLanguage = await this.users.getTargetLanguage(userId);

    const allWords = await this.wordsModel.getWordsForMonth(userId, targetLanguage, startDate, endDate);

    let available = allWords.filter((w) => !excludeWordIds.includes(w.id));

    // Cycle reset: if we've exhausted everything, restart with full pool
    if (available.length === 0 && excludeWordIds.length > 0) {
      available = allWords;
    }

    if (available.length === 0) {
      throw error('unknown', 'No saved words yet this month.', 404);
    }

    const makePrompt = (pairs: string) => `
You are a language-learning assistant generating a reading passage.
Available words (format — id: word):
${pairs}

Select a coherent subset of these words and write ONE paragraph that:
- Naturally and clearly uses each selected word or phrase
- Has a topic from: self-development, history, philosophy, or general knowledge
- Is at most 200 words long (adjust naturally to the number of words picked)

Return STRICT JSON (no markdown):
{ "paragraph": "<the paragraph text>", "picked_words": ["<id1>", "<id2>", ...] }
The picked_words array must contain the IDs (not the words) of every word used.`;

    let result: { paragraph: string; pickedWordIds: string[] } | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const subsetSize = attempt === 0 ? available.length : Math.min(5, available.length);
      const subset = available.slice(0, subsetSize);
      const pairs = subset.map((w) => `${w.id}: ${w.headword}`).join('\n');

      try {
        const raw = await this.ai.callGemini(makePrompt(pairs), { jsonMode: true });
        const parsed = JSON.parse(raw);
        if (parsed.paragraph && parsed.picked_words?.length > 0) {
          result = { paragraph: parsed.paragraph, pickedWordIds: parsed.picked_words };
          break;
        }
      } catch {
        // retry
      }
    }

    if (!result) {
      throw error('unknown', "Couldn't generate a paragraph, try again.", 502);
    }

    return result;
  }
}
