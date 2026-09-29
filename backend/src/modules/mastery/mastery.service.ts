import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';
import { SrsService } from '../srs/srs.service';
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';
import { error } from '../utils/http-error.util';
import { isTypoTolerantMatch } from '../utils/levenshtein.util';

const DAILY_REVIEW_CAP = 50;

interface WordWithCtx {
  id: string;
  headword: string;
  nativeSynonyms: string[];
  stage: number;
  contexts: Array<{ label: string; explanation: string; example: string }>;
}

@Injectable()
export class MasteryService {
  constructor(
    private prisma: PrismaService,
    private srs: SrsService,
    private ai: AiService,
    private users: UsersService,
  ) {}

  // ── getMasterySession ───────────────────────────────────────────────────────

  async getSession(userId: string): Promise<{ queue: any[]; totalToday: number }> {
    const activeLanguage = await this.users.getTargetLanguage(userId);

    const queueRows = await this.prisma.reviewQueue.findMany({
      where: {
        userId,
        targetLanguage: activeLanguage,
        status: 'pending',
        scheduledFor: { lte: new Date() },
      },
      orderBy: { scheduledFor: 'asc' },
      take: DAILY_REVIEW_CAP,
      select: { id: true, wordId: true, questionType: true, scheduledFor: true, currentMcq: true },
    });

    if (queueRows.length === 0) return { queue: [], totalToday: 0 };

    const wordIds = [...new Set(queueRows.map((r) => r.wordId))];
    const words = await this.prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: {
        id: true,
        headword: true,
        nativeSynonyms: true,
        stage: true,
        contexts: { select: { label: true, explanation: true, example: true } },
      },
    });

    const wordMap = new Map(words.map((w) => [w.id, w]));

    const queue = await Promise.all(
      queueRows.map(async (item) => {
        const word = wordMap.get(item.wordId);
        if (!word) return null;

        let questionType = item.questionType;
        let questionContent: unknown = null;

        // ── Cache check ──────────────────────────────────────────────
        if (item.currentMcq !== null && item.currentMcq !== undefined) {
          questionContent = item.currentMcq;
        } else {
          try {
            questionContent = await this.generateQuestion(word, questionType);
          } catch {
            if (questionType >= 3) {
              // For audio/production types, fall back to MCQ
              questionType = questionType % 2 === 0 ? 2 : 1;
              try {
                questionContent = await this.generateQuestion(word, questionType);
              } catch {
                questionContent = { fallback: true };
              }
            } else {
              questionContent = { fallback: true };
            }
          }

          // Save to cache (best-effort; never blocks the response)
          if (questionContent && !(questionContent as Record<string, unknown>).fallback) {
            try {
              await this.prisma.reviewQueue.update({
                where: { id: item.id },
                data: { currentMcq: questionContent as any },
              });
            } catch (cacheEx) {
              console.error('[getMasterySession] Exception caching MCQ for review', item.id, cacheEx);
            }
          }
        }

        return this.flattenReviewItem(item.id, item.wordId, word, questionType, questionContent);
      }),
    );

    const filtered = queue.filter(Boolean);
    return { queue: filtered, totalToday: filtered.length };
  }

  private flattenReviewItem(
    reviewId: string,
    wordId: string,
    word: WordWithCtx,
    questionType: number,
    questionContent: unknown,
  ): Record<string, unknown> {
    const qc = questionContent as Record<string, unknown> | null;

    const flat: Record<string, unknown> = {
      reviewId,
      wordId,
      headword: word.headword,
      questionType,
      cardData: {
        id: wordId,
        headword: word.headword,
        synonyms: word.nativeSynonyms ?? [],
        contexts: (word.contexts ?? []).map((c) => ({
          label: c.label,
          explanation: c.explanation,
          example: c.example,
        })),
        stage: word.stage,
        stage6_streak: 0,
        active: true,
      },
    };

    if (qc && !qc.fallback) {
      if (questionType === 1) {
        const opts = qc.options as string[] | undefined;
        const idx = qc.correctIndex as number | undefined;
        flat.mcqOptions = opts;
        flat.correctOption = opts && idx !== undefined ? opts[idx] : undefined;
      } else if (questionType === 2) {
        const opts = qc.options as string[] | undefined;
        const idx = qc.correctIndex as number | undefined;
        flat.reversedDefinition = qc.question;
        flat.reversedOptions = opts;
        flat.correctOption = opts && idx !== undefined ? opts[idx] : undefined;
      } else if (questionType === 3) {
        // audio type — frontend uses TTS with the headword; leave audioUrl undefined
        flat.audioUrl = undefined;
      } else if (questionType === 4) {
        flat.fillSentence = qc.sentence;
      } else if (questionType === 5) {
        flat.nuancedPrompt = qc.question;
      } else if (questionType === 6) {
        flat.productionPrompt = qc.instruction;
      }
    } else if (questionType === 1 || questionType === 2) {
      // AI failed — build minimal playable options from the word's synonyms.
      const distractors = (word.nativeSynonyms ?? []).slice(0, 3);
      const opts = [word.headword, ...distractors].slice(0, 4);
      if (questionType === 1) {
        flat.mcqOptions = opts;
        flat.correctOption = word.headword;
      } else {
        flat.reversedDefinition = (word.nativeSynonyms ?? []).join(', ') || word.headword;
        flat.reversedOptions = opts;
        flat.correctOption = word.headword;
      }
    }

    return flat;
  }

  // ── generateQuestion (port of the edge function's Gemini prompt block) ──────

  private async generateQuestion(word: WordWithCtx, questionType: number): Promise<unknown> {
    const contextsText = word.contexts
      .map((c) => `[${c.label}] ${c.explanation} — "${c.example}"`)
      .join('\n');

    const randomContext =
      word.contexts.length > 0 ? word.contexts[Math.floor(Math.random() * word.contexts.length)] : null;
    const singleDefinition = randomContext
      ? `[${randomContext.label}] ${randomContext.explanation}`
      : word.headword;

    const prompts: Record<number, string> = {
      1: `Generate a multiple-choice question (4 options) testing knowledge of the word "${word.headword}".
Here are all the word's context definitions (they are ALL correct meanings of this word):
${contextsText}

Instructions:
- Pick exactly ONE of the context explanations above as the basis for the correct answer option.
- Generate 3 plausible-but-incorrect distractor definitions that describe words DIFFERENT from "${word.headword}".
- CRITICAL: Do NOT reuse or paraphrase ANY of the other context explanations listed above as a distractor, because they are also genuinely correct definitions of this same word and would create multiple right answers.
- The "question" field should be: "Which definition is correct for '${word.headword}'?"
Return JSON: { "question": string, "options": string[], "correctIndex": number }`,

      2: `Generate a REVERSED multiple-choice question. The user sees a definition and must pick the correct word from 4 options.

Definition to show the user: "${singleDefinition}"
Correct word: "${word.headword}"

Instructions:
- The "question" field must contain the definition shown above.
- Exactly one of the 4 options MUST be "${word.headword}" (the correct answer).
- The other 3 options must be real words that are clearly WRONG — they must NOT mean the same thing as the definition above.
- Do not use any of these words as distractors since they are synonyms and would also be correct: ${word.nativeSynonyms.join(', ')}.
- Make the distractors plausible (real words from the same language/domain) but clearly different in meaning.
Return JSON: { "question": string, "options": string[], "correctIndex": number }`,

      3: `Generate a listen-and-write prompt for the word "${word.headword}". The user will hear the word and must type it.
Return JSON: { "instruction": "Listen and type the word you hear", "answer": "${word.headword}" }`,

      4: `Generate a fill-in-the-blanks sentence for the word "${word.headword}" using one of these examples: ${word.contexts.map((c) => c.example).join(' / ')}.
Replace the word with _____.
Return JSON: { "sentence": string, "answer": "${word.headword}" }`,

      5: `Generate a nuanced usage question for the word "${word.headword}". Ask the user to write a sentence demonstrating they understand the distinction between its usages.
Context: ${contextsText}
Return JSON: { "question": string, "rubric": string, "word": "${word.headword}" }`,

      6: `Generate an open production prompt: ask the user to write a sentence using "${word.headword}" naturally.
Return JSON: { "instruction": string, "word": "${word.headword}" }`,
    };

    const raw = await this.ai.callGemini(prompts[questionType], { jsonMode: true });
    const parsed = JSON.parse(raw);

    // Defense-in-depth: validate generated options for types 1 & 2
    if (questionType === 1 && parsed.options && word.contexts.length > 1) {
      const correctIdx = parsed.correctIndex as number;
      const contextExplanations = word.contexts.map((c) => c.explanation.toLowerCase());
      for (let i = 0; i < parsed.options.length; i++) {
        if (i === correctIdx) continue;
        const distractor = (parsed.options[i] as string).toLowerCase();
        for (const ctx of contextExplanations) {
          if (ctx.includes(distractor) || distractor.includes(ctx)) {
            console.warn(
              `[getMasterySession] Type 1 validation failed: distractor "${parsed.options[i]}" duplicates a context explanation for "${word.headword}". Falling back.`,
            );
            throw new Error('Type 1 distractor matches an existing context explanation');
          }
        }
      }
    }

    if (questionType === 2 && parsed.options && word.nativeSynonyms?.length > 0) {
      const correctIdx = parsed.correctIndex as number;
      const synonymsLower = word.nativeSynonyms.map((s) => s.toLowerCase());
      for (let i = 0; i < parsed.options.length; i++) {
        if (i === correctIdx) continue;
        const distractor = (parsed.options[i] as string).toLowerCase();
        if (synonymsLower.includes(distractor)) {
          console.warn(
            `[getMasterySession] Type 2 validation failed: distractor "${parsed.options[i]}" matches a native synonym of "${word.headword}". Falling back.`,
          );
          throw new Error('Type 2 distractor matches a native synonym');
        }
      }
    }

    return parsed;
  }

  // ── submitAnswer ────────────────────────────────────────────────────────────

  async submitAnswer(input: {
    userId: string;
    wordId: string;
    reviewId: string;
    userAnswer: unknown;
    questionType: number;
  }): Promise<{ isCorrect: boolean; newStage: number }> {
    const { userId, wordId, reviewId, userAnswer, questionType } = input;
    if (!wordId || !reviewId || userAnswer === undefined || !questionType) {
      throw error('unknown', 'Missing required fields', 400);
    }

    // Ownership check (replaces RLS): the word must belong to the caller
    const word = await this.prisma.word.findFirst({
      where: { id: wordId, userId },
      include: { contexts: { select: { label: true, explanation: true } } },
    });
    if (!word) throw error('unknown', 'Word not found', 404);

    let isCorrect = false;

    if (questionType === 1 || questionType === 2) {
      isCorrect = userAnswer === 'true' || userAnswer === true;
    } else if (questionType === 3 || questionType === 4) {
      isCorrect = isTypoTolerantMatch(word.headword, String(userAnswer));
    } else if (questionType === 5) {
      // Nuanced Usage — LLM-graded
      const contextsText = word.contexts
        .map((c) => `[${c.label}] ${c.explanation}`)
        .join('\n');

      const prompt = `You are grading a language-learning exercise.
Word: "${word.headword}"
Word contexts:
${contextsText}

User's answer: "${userAnswer}"

Does the user's sentence demonstrate a clear, contextually correct understanding of "${word.headword}"?
Be lenient with minor grammar issues but strict about whether the meaning is used correctly.
Return ONLY JSON: { "correct": true } or { "correct": false, "reason": string }`;

      const raw = await this.ai.callGemini(prompt, { jsonMode: true });
      const res = JSON.parse(raw);
      isCorrect = res.correct === true;
    } else if (questionType === 6) {
      const ans = String(userAnswer);
      isCorrect =
        isTypoTolerantMatch(word.headword, ans) ||
        ans.toLowerCase().includes(word.headword.toLowerCase());
    }

    // on_answer handles stage transitions + scheduling + cache clearing transactionally
    const result = await this.srs.onAnswer(reviewId, wordId, isCorrect);

    return { isCorrect: result.isCorrect, newStage: result.newStage ?? word.stage };
  }
}
