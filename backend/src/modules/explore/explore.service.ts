import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.module';
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';
import { error } from '../utils/http-error.util';
import { validateCardScripts } from '../utils/text-sanitize.util';

const SAMPLE_SIZE = 20;
const SEED_COUNT = 3;
const OUTPUT_COUNT = 5;

@Injectable()
export class ExploreService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private users: UsersService,
  ) {}

  // ── getExploreSuggestions ───────────────────────────────────────────────────

  async getSuggestions(userId: string): Promise<{ cards?: any[]; emptyMessage?: string }> {
    const profile = await this.users.getProfile(userId);
    const targetCode = profile?.targetLanguage ?? 'en';
    const nativeCode = profile?.nativeLanguage ?? 'en';

    const codeToName = await this.users.resolveLanguageNames([nativeCode, targetCode]);
    const targetLang = codeToName[targetCode] ?? targetCode;
    const nativeLang = codeToName[nativeCode] ?? nativeCode;

    const vaultWords = await this.prisma.word.findMany({
      where: { userId, targetLanguage: targetCode },
      select: { id: true, headword: true },
      orderBy: { savedAt: 'desc' },
      take: SAMPLE_SIZE,
    });

    if (vaultWords.length === 0) {
      return { emptyMessage: 'Save some words to start exploring!' };
    }

    // Pick seed sample (random subset)
    const shuffled = [...vaultWords].sort(() => Math.random() - 0.5);
    const seeds = shuffled.slice(0, Math.min(SEED_COUNT, shuffled.length));
    const seedWords = seeds.map((s) => s.headword).join(', ');

    const suggestionPrompt = `Given these ${targetLang} vocabulary words: ${seedWords}
Suggest exactly ${OUTPUT_COUNT} semantically related vocabulary items (words or phrases) in ${targetLang} that a language learner would find useful.
Do NOT repeat the seed words.
Return a JSON object: { "suggestions": ["word1", "word2", ...] }`;

    const rawSuggestions = await this.ai.callGemini(suggestionPrompt, { jsonMode: true });
    const parsedSuggestions = JSON.parse(rawSuggestions);
    const suggestions: string[] = Array.isArray(parsedSuggestions.suggestions)
      ? parsedSuggestions.suggestions
      : (parsedSuggestions[Object.keys(parsedSuggestions)[0]] ?? []);

    // Generate a full DetailCard for each suggestion
    const cards = await Promise.all(
      suggestions.map(async (suggestion) => {
        const prompt = `You are a language-learning assistant. Generate a full vocabulary card for: "${suggestion}"
Native language: ${nativeLang}
Target language: ${targetLang}

Return ONLY valid JSON (no markdown):
{
  "mode": "full",
  "card": {
    "headword": "${suggestion}",
    "nativeSynonyms": ["<1-3 synonyms in ${nativeLang}>"],
    "contexts": [
      { "label": "<domain, written in ${targetLang}>", "explanation": "<explanation in ${targetLang}>", "example": "<sentence in ${targetLang} with **${suggestion}** bolded>" }
    ]
  }
}
Every field except nativeSynonyms must be written entirely in ${targetLang}. Do not mix languages within label, explanation, or example.`;
        try {
          const raw = await this.ai.callGemini(prompt, { jsonMode: true });
          const parsed = JSON.parse(raw);
          const card = parsed.card ?? null;
          if (!card) return null;

          if ('nativeSynonyms' in card) {
            card.synonyms = card.nativeSynonyms;
            delete card.nativeSynonyms;
          }

          card.id = randomUUID();
          card.stage = 0;
          card.stage6_streak = 0;
          card.active = true;
          card.source = 'explore';

          const validation = validateCardScripts(card, nativeLang, targetLang, 'getExploreSuggestions');
          if (validation.headwordContaminated) {
            console.error(
              `[getExploreSuggestions] Headword script-contaminated, dropping card. ` +
                `headword="${card.headword}" targetLang="${targetLang}"`,
            );
            return null;
          }
          card.synonyms = validation.filteredSynonyms;
          card.contexts = validation.filteredContexts;

          return card;
        } catch {
          return null;
        }
      }),
    );

    return { cards: cards.filter(Boolean) };
  }

  // ── searchExplore ───────────────────────────────────────────────────────────

  async search(
    userId: string,
    query: string,
    lang: 'native' | 'target',
  ): Promise<{ cards?: any[]; safetyError?: boolean }> {
    if (!query || !lang) throw error('unknown', 'query and lang required', 400);

    const profile = await this.users.getProfile(userId);
    const targetCode = profile?.targetLanguage ?? 'en';
    const nativeCode = profile?.nativeLanguage ?? 'en';

    const codeToName = await this.users.resolveLanguageNames([nativeCode, targetCode]);
    const targetLang = codeToName[targetCode] ?? targetCode;
    const nativeLang = codeToName[nativeCode] ?? nativeCode;

    // Step 1: cluster of related vocab items
    const clusterPrompt = `A language learner typed this search query: "${query}"
The query is in: ${lang === 'native' ? nativeLang : targetLang}
Target learning language: ${targetLang}

Generate a cluster of 6-8 semantically related ${targetLang} vocabulary words or phrases that address this concept.
Example: for "manipulating language to hide the truth" → [Weasel words, Gaslighting, Cherry-picking, Spin, Equivocation, Doublespeak, Paltering, Straw manning]
Return a JSON object: { "words": ["word1", "word2", ...] }`;

    let cluster: string[];
    try {
      const raw = await this.ai.callGemini(clusterPrompt, { jsonMode: true });
      const parsed = JSON.parse(raw);
      cluster = Array.isArray(parsed.words)
        ? parsed.words
        : (parsed[Object.keys(parsed)[0]] ?? []);
    } catch (err) {
      if (this.ai.isSafetyBlock(err)) return { safetyError: true };
      throw err;
    }

    // Step 2: DetailCard per vocab item
    const cards = await Promise.all(
      cluster.map(async (word) => {
        const cardPrompt = `You are a language-learning assistant. Generate a full vocabulary card for the ${targetLang} word/phrase: "${word}"
Native language: ${nativeLang}
Target language: ${targetLang}

Return ONLY valid JSON (no markdown):
{
  "headword": "${word}",
  "nativeSynonyms": ["<1-3 synonyms in ${nativeLang}>"],
  "contexts": [
    { "label": "<domain, written in ${targetLang}>", "explanation": "<explanation in ${targetLang}>", "example": "<sentence in ${targetLang} with **${word}** bolded>" }
  ]
}
Every field except nativeSynonyms must be written entirely in ${targetLang}. Do not mix languages within label, explanation, or example.`;
        try {
          const raw = await this.ai.callGemini(cardPrompt, { jsonMode: true });
          const card = JSON.parse(raw);

          if (card && 'nativeSynonyms' in card) {
            card.synonyms = card.nativeSynonyms;
            delete card.nativeSynonyms;
          }
          if (card) {
            card.id = randomUUID();
            card.stage = 0;
            card.stage6_streak = 0;
            card.active = true;
            card.source = 'explore';
          }

          if (card) {
            const validation = validateCardScripts(card, nativeLang, targetLang, 'searchExplore');
            if (validation.headwordContaminated) {
              console.error(
                `[searchExplore] Headword script-contaminated, dropping card. ` +
                  `headword="${card.headword}" targetLang="${targetLang}"`,
              );
              return null;
            }
            card.synonyms = validation.filteredSynonyms;
            card.contexts = validation.filteredContexts;
          }

          return card;
        } catch (err) {
          if (this.ai.isSafetyBlock(err)) return null;
          return null;
        }
      }),
    );

    return { cards: cards.filter(Boolean) };
  }
}
