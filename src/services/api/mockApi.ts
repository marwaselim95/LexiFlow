// ─── Live Service Layer ───────────────────────────────────────────────────────
// All functions call the NestJS backend (REST + JWT).
// Exported signatures are frozen — the entire UI depends on them exactly.

import { apiFetch } from '../../lib/api';
import {
  DetailCardData,
  ReviewItem,
  VaultWord,
  VideoItem,
  CaptionLine,
  PhonemeStatus,
  PronunciationResult,
  GenerateDetailCardResult,
  GetSuggestedVideosResult,
  GetExploreSuggestionsResult,
  SearchExploreResult,
  GenerateVaultParagraphResult,
  LearningLanguage,
} from './types';

// ─── Dev-only caching ─────────────────────────────────────────────────────────
// Caches AI endpoint responses in memory during development to save quota.
// This is entirely bypassed in production builds.

const isDev = import.meta.env.DEV;
const devCache = new Map<string, any>();

if (isDev) {
  // @ts-ignore
  window.clearDevCache = () => {
    devCache.clear();
    console.log('[dev-cache] Cache cleared.');
  }
}

/**
 * Wraps a fetcher function with an in-memory cache.
 * Key is derived from function name and serialized payload.
 * In production, it completely bypasses the cache.
 * Only successful responses are cached.
 */
async function withDevCache<T>(
  functionName: string,
  payload: any,
  fetcher: () => Promise<T>,
  bypassCache = false
): Promise<T> {
  if (!isDev) return fetcher();

  const key = `${functionName}:${JSON.stringify(payload)}`;
  if (!bypassCache && devCache.has(key)) {
    console.log(`[dev-cache] ${functionName} served from cache`, payload);
    // Return a deep clone so mutations by the caller don't affect the cache
    return JSON.parse(JSON.stringify(devCache.get(key)));
  }

  const result = await fetcher();
  // If we reach here, the fetcher didn't throw, meaning it was successful.
  devCache.set(key, JSON.parse(JSON.stringify(result)));
  return result;
}

// ─── API Implementation ───────────────────────────────────────────────────────

export async function generateDetailCard(input: {
  text: string;
  nativeLang: string;
  targetLang: string;
}): Promise<GenerateDetailCardResult> {
  return withDevCache('generateDetailCard', input, async () => {
    const data = await apiFetch<{ mode: string; card?: any }>('/detail-card', {
      method: 'POST',
      body: JSON.stringify({ text: input.text, nativeLang: input.nativeLang, targetLang: input.targetLang }),
    });

    // Card from the backend may be missing SRS fields (stage, stage6_streak, active) —
    // supply defaults so the frontend type is fully satisfied.
    if (data.card) {
      data.card = {
        stage: 0,
        stage6_streak: 0,
        active: true,
        synonyms: [],
        contexts: [],
        ...data.card,
      };
    }
    return data as GenerateDetailCardResult;
  });
}

export async function checkTypos(input: { text: string }): Promise<{
  hasTypos: boolean;
  suggestion?: string;
}> {
  return withDevCache('checkTypos', input, async () => {
    return apiFetch<{ hasTypos: boolean; suggestion?: string }>('/typos', {
      method: 'POST',
      body: JSON.stringify({ text: input.text }),
    });
  });
}

export async function translateExplanations(input: {
  explanations: string[];
  nativeLang: string;
}): Promise<{ translated: string[] }> {
  return withDevCache('translateExplanations', input, async () => {
    return apiFetch<{ translated: string[] }>('/explanations/translate', {
      method: 'POST',
      body: JSON.stringify({ explanations: input.explanations, nativeLang: input.nativeLang }),
    });
  });
}

export async function assessPronunciation(input: {
  audioBlob: Blob;
  word: string;
  targetLang: string;
}): Promise<PronunciationResult> {
  const form = new FormData();
  form.append('audio', input.audioBlob, 'recording.mp3');
  form.append('word', input.word);
  form.append('targetLang', input.targetLang);

  return apiFetch<PronunciationResult>('/pronunciation/assess', {
    method: 'POST',
    body: form,
  });
}

export async function saveWord(input: {
  word: DetailCardData;
  source: 'manual' | 'watch' | 'explore' | 'selection';
}): Promise<{ wordId: string }> {
  return apiFetch<{ wordId: string }>('/words', {
    method: 'POST',
    body: JSON.stringify({ word: input.word, source: input.source }),
  });
}

export async function removeWord(input: { wordId: string }): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/words/${encodeURIComponent(input.wordId)}`, {
    method: 'DELETE',
  });
}

export async function getMasterySession(): Promise<{
  queue: ReviewItem[];
  totalToday: number;
}> {
  return apiFetch<{ queue: ReviewItem[]; totalToday: number }>('/mastery/session');
}

export async function submitAnswer(input: {
  wordId: string;
  reviewId: string;
  userAnswer: string;
  questionType: number;
}): Promise<{ isCorrect: boolean; newStage: number }> {
  return apiFetch<{ isCorrect: boolean; newStage: number }>('/mastery/submit', {
    method: 'POST',
    body: JSON.stringify({
      wordId: input.wordId,
      reviewId: input.reviewId,
      userAnswer: input.userAnswer,
      questionType: input.questionType,
    }),
  });
}

export async function getVaultMonths(): Promise<{ month: string; wordCount: number }[]> {
  // Backend returns an array directly (not wrapped in an object).
  return apiFetch<{ month: string; wordCount: number }[]>('/words/vault/months');
}

export async function getVaultWords(month: string): Promise<VaultWord[]> {
  // Backend returns the VaultWord array directly.
  return apiFetch<VaultWord[]>(`/words/vault/words?month=${encodeURIComponent(month)}`);
}

export async function generateVaultParagraph(input: {
  month: string;
  excludeWordIds: string[];
}): Promise<GenerateVaultParagraphResult> {
  return withDevCache('generateVaultParagraph', input, async () => {
    return apiFetch<GenerateVaultParagraphResult>('/words/vault/paragraph', {
      method: 'POST',
      body: JSON.stringify({ month: input.month, excludeWordIds: input.excludeWordIds }),
    });
  });
}

export async function getSuggestedVideos(query?: string): Promise<GetSuggestedVideosResult> {
  // targetLanguage is read from the user's profile server-side — no need to pass it.
  return apiFetch<GetSuggestedVideosResult>('/videos/suggested', {
    method: 'POST',
    body: JSON.stringify(query ? { query } : {}),
  });
}

export async function validateVideoUrl(input: { url: string }): Promise<{
  valid: boolean;
  reason?: string;
}> {
  return apiFetch<{ valid: boolean; reason?: string }>('/videos/validate', {
    method: 'POST',
    body: JSON.stringify({ url: input.url }),
  });
}

export async function getVideoCaptions(videoId: string): Promise<{ captions: CaptionLine[] }> {
  return apiFetch<{ captions: CaptionLine[] }>(`/videos/captions?videoId=${encodeURIComponent(videoId)}`);
}

/**
 * Record a video watch in watch history.
 * Fire-and-forget so it never blocks the player; failures are logged only.
 */
export async function recordWatchHistory(
  videoId: string,
  categories: string[] = [],
): Promise<void> {
  try {
    await apiFetch('/watch/history', {
      method: 'POST',
      body: JSON.stringify({ videoId, categories }),
    });
  } catch (err) {
    console.warn('[watch-history] Insert failed:', (err as Error).message);
  }
}

const STATIC_CARDS: DetailCardData[] = [
  {
    id: 'hardcoded-neat',
    headword: 'neat',
    synonyms: ['أنيق', 'مرتب'],
    contexts: [
      {
        label: 'Organization',
        explanation: 'Arranged in a tidy, orderly way.',
        example: 'She carefully stacked the books in a _neat_ pile on her desk.'
      },
      {
        label: 'Informal',
        explanation: 'Something that is exceptionally good, clever, or interesting.',
        example: 'That is a really _neat_ trick you learned.'
      }
    ],
    stage: 0,
    stage6_streak: 0,
    active: true,
    source: 'explore'
  },
  {
    id: 'hardcoded-eloquence',
    headword: 'eloquence',
    synonyms: ['فصاحة', 'بلاغة'],
    contexts: [
      {
        label: 'Communication',
        explanation: 'Fluent or persuasive speaking or writing.',
        example: 'The speaker moved the entire audience with her profound _eloquence_.'
      },
      {
        label: 'Expression',
        explanation: 'The quality of delivering a clear, strong message.',
        example: 'His _eloquence_ in the written essay earned him the highest grade.'
      }
    ],
    stage: 0,
    stage6_streak: 0,
    active: true,
    source: 'explore'
  },
  {
    id: 'hardcoded-flourish',
    headword: 'flourish',
    synonyms: ['ازدهار', 'تألق'],
    contexts: [
      {
        label: 'Growth',
        explanation: 'To grow or develop in a healthy or vigorous way.',
        example: 'These tropical plants will _flourish_ if you keep them in direct sunlight.'
      },
      {
        label: 'Action',
        explanation: 'A bold or extravagant gesture to attract attention.',
        example: 'The magician finished his act with a dramatic _flourish_.'
      }
    ],
    stage: 0,
    stage6_streak: 0,
    active: true,
    source: 'explore'
  },
  {
    id: 'hardcoded-immaculate',
    headword: 'immaculate',
    synonyms: ['ناصع', 'لا تشوبه شائبة'],
    contexts: [
      {
        label: 'Appearance',
        explanation: 'Perfectly clean, neat, or tidy.',
        example: 'The hotel room was absolutely _immaculate_ when we arrived.'
      },
      {
        label: 'Performance',
        explanation: 'Free from flaws or mistakes; perfect.',
        example: 'The timing of her presentation was _immaculate_.'
      }
    ],
    stage: 0,
    stage6_streak: 0,
    active: true,
    source: 'explore'
  },
  {
    id: 'hardcoded-entropy',
    headword: 'entropy',
    synonyms: ['إنتروبيا', 'قصور حراري'],
    contexts: [
      {
        label: 'Physics',
        explanation: 'A measure of the unavailability of a system’s thermal energy for conversion into mechanical work.',
        example: 'In any closed system, _entropy_ will always increase over time.'
      },
      {
        label: 'General',
        explanation: 'A gradual decline into disorder or chaos.',
        example: 'Without strict management, the project quickly descended into _entropy_.'
      }
    ],
    stage: 0,
    stage6_streak: 0,
    active: true,
    source: 'explore'
  }
];

export async function getExploreSuggestions(
  forceRefresh = false,
  langContext?: { nativeLanguage: string; targetLanguage: string },
): Promise<GetExploreSuggestionsResult> {
  // Include language pair in the cache key so dev-cache differentiates across
  // language changes. The backend derives language from the user's profile.
  const cachePayload = langContext
    ? { nativeLanguage: langContext.nativeLanguage, targetLanguage: langContext.targetLanguage }
    : {};
  return withDevCache('getExploreSuggestions', cachePayload, async () => {
    // Backend returns { cards } or { emptyMessage }.
    return apiFetch<GetExploreSuggestionsResult>('/explore/suggestions');
  }, forceRefresh);
}


export async function searchExplore(
  input: { query: string; lang: 'native' | 'target' },
  langContext?: { nativeLanguage: string; targetLanguage: string },
): Promise<SearchExploreResult> {
  const queryStr = input.query.toLowerCase().trim();
  const match = STATIC_CARDS.find(c => c.headword === queryStr);
  if (match) {
    return { cards: [match] };
  }

  const cachePayload = langContext
    ? { ...input, nativeLanguage: langContext.nativeLanguage, targetLanguage: langContext.targetLanguage }
    : input;
  return withDevCache('searchExplore', cachePayload, async () => {
    // Backend returns { cards } or { safetyError: true }.
    return apiFetch<SearchExploreResult>('/explore/search', {
      method: 'POST',
      body: JSON.stringify({ query: input.query, lang: input.lang }),
    });
  });
}

export async function getPhonemeList(): Promise<PhonemeStatus[]> {
  // Backend returns the PhonemeStatus array directly.
  return apiFetch<PhonemeStatus[]>('/phonemes');
}

export async function getWordForPhoneme(phoneme: string): Promise<{ word: string }> {
  return apiFetch<{ word: string }>(`/phonemes/word?phoneme=${encodeURIComponent(phoneme)}`);
}

// ─── Language management ──────────────────────────────────────────────────────

/**
 * Fetch the full list of languages the user is learning, plus which is active.
 */
export async function getLearningLanguages(): Promise<{
  languages: LearningLanguage[];
  activeLanguage: string | null;
}> {
  return apiFetch<{ languages: LearningLanguage[]; activeLanguage: string | null }>('/languages');
}

/**
 * Add a new language (by ISO code) to the user's learning list.
 * Idempotent — duplicate additions are silently ignored by the backend.
 */
export async function addLearningLanguage(language: string): Promise<{ success: true; language: string }> {
  return apiFetch<{ success: true; language: string }>('/languages', {
    method: 'POST',
    body: JSON.stringify({ language }),
  });
}

/**
 * Set a new active learning language (must already be in the user's list).
 */
export async function setActiveLanguage(language: string): Promise<{ success: true; activeLanguage: string }> {
  return apiFetch<{ success: true; activeLanguage: string }>('/languages/active', {
    method: 'POST',
    body: JSON.stringify({ language }),
  });
}

/**
 * Update the user's native language (by ISO code).
 */
export async function updateNativeLanguage(language: string): Promise<{ success: true; nativeLanguage: string }> {
  return apiFetch<{ success: true; nativeLanguage: string }>('/languages/native', {
    method: 'POST',
    body: JSON.stringify({ language }),
  });
}
