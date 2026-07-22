// ─── Live Service Layer ───────────────────────────────────────────────────────
// All functions call the real Supabase backend (DB or edge functions).
// Exported signatures are frozen — the entire UI depends on them exactly.

import { supabase } from '../../lib/supabase';
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

// ─── Error normalisation ──────────────────────────────────────────────────────
// Every component/hook that consumes these functions expects errors to be thrown
// as plain Error objects (the Redux thunks catch them and store message strings).
// For edge function calls, map the top-level `error` from functions.invoke into
// a thrown Error so error boundaries see a consistent surface.

function invokeError(err: { message: string } | null | undefined): never {
  throw new Error(err?.message ?? 'An unknown error occurred.');
}

// ─── Dev-only caching ─────────────────────────────────────────────────────────
// Caches AI edge function responses in memory during development to save quota.
// This is entirely bypassed in production builds.

const isDev = import.meta.env.DEV;
const devCache = new Map<string, any>();

if (isDev) {
  // @ts-ignore
  window.clearDevCache = () => {
    devCache.clear();
    console.log('[dev-cache] Cache cleared.');
  };
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
    const { data, error } = await supabase.functions.invoke('generateDetailCard', {
      body: { text: input.text, nativeLang: input.nativeLang, targetLang: input.targetLang },
    });
    if (error) invokeError(error);

    // Edge function may return { error: { type, message } } with a 2xx-ish status in some edge cases.
    // Guard against this so we don't crash on data.card access below.
    if (data?.error) {
      throw new Error(data.error.message ?? 'AI provider error');
    }

    // Edge function returns { mode, card } — shape matches GenerateDetailCardResult exactly.
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
    const { data, error } = await supabase.functions.invoke('checkTypos', {
      body: { text: input.text },
    });
    if (error) invokeError(error);
    return data as { hasTypos: boolean; suggestion?: string };
  });
}

export async function translateExplanations(input: {
  explanations: string[];
  nativeLang: string;
}): Promise<{ translated: string[] }> {
  return withDevCache('translateExplanations', input, async () => {
    const { data, error } = await supabase.functions.invoke('translateExplanations', {
      body: { explanations: input.explanations, nativeLang: input.nativeLang },
    });
    if (error) invokeError(error);
    return data as { translated: string[] };
  });
}

// getYouglishVideo removed — YouGlish is now rendered client-side via the YouGlish JS widget.

export async function assessPronunciation(input: {
  audioBlob: Blob;
  word: string;
  targetLang: string;
}): Promise<PronunciationResult> {
  // The edge function reads req.formData() — must send as FormData, not JSON.
  const form = new FormData();
  form.append('audio', input.audioBlob, 'recording.mp3');
  form.append('word', input.word);
  form.append('targetLang', input.targetLang);

  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;

  // functions.invoke does not support FormData bodies directly, so use fetch.
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assessPronunciation`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `assessPronunciation HTTP ${res.status}`);
  }

  return res.json() as Promise<PronunciationResult>;
}

export async function saveWord(input: {
  word: DetailCardData;
  source: 'manual' | 'watch' | 'explore' | 'selection';
}): Promise<{ wordId: string }> {
  const { data, error } = await supabase.functions.invoke('saveWord', {
    body: { word: input.word, source: input.source },
  });
  if (error) invokeError(error);
  return data as { wordId: string };
}

export async function removeWord(input: { wordId: string }): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke('removeWord', {
    body: { wordId: input.wordId },
  });
  if (error) invokeError(error);
  return data as { success: boolean };
}

export async function getMasterySession(): Promise<{
  queue: ReviewItem[];
  totalToday: number;
}> {
  const { data, error } = await supabase.functions.invoke('getMasterySession', { body: {} });
  if (error) invokeError(error);
  return data as { queue: ReviewItem[]; totalToday: number };
}

export async function submitAnswer(input: {
  wordId: string;
  reviewId: string;
  userAnswer: string;
  questionType: number;
}): Promise<{ isCorrect: boolean; newStage: number }> {
  const { data, error } = await supabase.functions.invoke('submitAnswer', {
    body: {
      wordId: input.wordId,
      reviewId: input.reviewId,
      userAnswer: input.userAnswer,
      questionType: input.questionType,
    },
  });
  if (error) invokeError(error);
  return data as { isCorrect: boolean; newStage: number };
}

export async function getVaultMonths(): Promise<{ month: string; wordCount: number }[]> {
  const { data, error } = await supabase.functions.invoke('getVaultMonths', { body: {} });
  if (error) invokeError(error);
  // Edge function returns an array directly (not wrapped in an object).
  return data as { month: string; wordCount: number }[];
}

export async function getVaultWords(month: string): Promise<VaultWord[]> {
  const { data, error } = await supabase.functions.invoke('getVaultWords', {
    body: { month },
  });
  if (error) invokeError(error);
  // Edge function returns the VaultWord array directly.
  return data as VaultWord[];
}

export async function generateVaultParagraph(input: {
  month: string;
  excludeWordIds: string[];
}): Promise<GenerateVaultParagraphResult> {
  return withDevCache('generateVaultParagraph', input, async () => {
    const { data, error } = await supabase.functions.invoke('generateVaultParagraph', {
      body: { month: input.month, excludeWordIds: input.excludeWordIds },
    });
    if (error) invokeError(error);
    // Edge function returns { paragraph, pickedWordIds } or { error: string }.
    return data as GenerateVaultParagraphResult;
  });
}

export async function getSuggestedVideos(query?: string): Promise<GetSuggestedVideosResult> {
  const body: Record<string, unknown> = {};
  if (query) body.query = query;
  const { data, error } = await supabase.functions.invoke('getSuggestedVideos', { body });
  if (error) invokeError(error);
  // targetLanguage is read from the user's profile server-side — no need to pass it.
  // The edge function now hard-filters on defaultAudioLanguage matching the profile lang.
  return data as GetSuggestedVideosResult;
}

export async function validateVideoUrl(input: { url: string }): Promise<{
  valid: boolean;
  reason?: string;
}> {
  const { data, error } = await supabase.functions.invoke('validateVideoUrl', {
    // targetLanguage is read from the user's profile server-side by the edge function.
    body: { url: input.url },
  });
  if (error) invokeError(error);
  return data as { valid: boolean; reason?: string };
}

export async function getVideoCaptions(videoId: string): Promise<{ captions: CaptionLine[] }> {
  const { data, error } = await supabase.functions.invoke('getVideoCaptions', {
    body: { videoId },
  });
  if (error) invokeError(error);
  return data as { captions: CaptionLine[] };
}

/**
 * Record a video watch in watch_history.
 * Direct Supabase insert — fire-and-forget so it never blocks the player.
 * RLS ensures only the authenticated user's own rows can be written.
 */
export async function recordWatchHistory(
  videoId: string,
  categories: string[] = [],
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return; // silently skip if not authenticated

  const { error } = await supabase.from('watch_history').insert({
    user_id: user.id,
    video_id: videoId,
    categories,
  });

  if (error) {
    console.warn('[watch-history] Insert failed:', error.message);
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
  // language changes. The actual edge function body is unchanged — it derives
  // language from the user's server-side profile.
  const cachePayload = langContext
    ? { nativeLanguage: langContext.nativeLanguage, targetLanguage: langContext.targetLanguage }
    : {};
  return withDevCache('getExploreSuggestions', cachePayload, async () => {
    const { data, error } = await supabase.functions.invoke('getExploreSuggestions', { body: {} });
    if (error) invokeError(error);
    // Edge function returns { cards } or { emptyMessage }.
    return data as GetExploreSuggestionsResult;
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

  // Include language pair in the cache key so dev-cache differentiates across
  // language changes. The actual edge function body is unchanged — it derives
  // language from the user's server-side profile.
  const cachePayload = langContext
    ? { ...input, nativeLanguage: langContext.nativeLanguage, targetLanguage: langContext.targetLanguage }
    : input;
  return withDevCache('searchExplore', cachePayload, async () => {
    const { data, error } = await supabase.functions.invoke('searchExplore', {
      body: { query: input.query, lang: input.lang },
    });
    if (error) invokeError(error);
    // Edge function returns { cards } or { safetyError: true }.
    return data as SearchExploreResult;
  });
}

export async function getPhonemeList(): Promise<PhonemeStatus[]> {
  const { data, error } = await supabase.functions.invoke('getPhonemeList', { body: {} });
  if (error) invokeError(error);
  // Edge function returns the PhonemeStatus array directly.
  return data as PhonemeStatus[];
}

export async function getWordForPhoneme(phoneme: string): Promise<{ word: string }> {
  const { data, error } = await supabase.functions.invoke('getWordForPhoneme', {
    body: { phoneme },
  });
  if (error) invokeError(error);
  return data as { word: string };
}

// ─── Language management ──────────────────────────────────────────────────────

/**
 * Fetch the full list of languages the user is learning, plus which is active.
 * Returns codes — the caller is responsible for code→name display conversion.
 */
export async function getLearningLanguages(): Promise<{
  languages: LearningLanguage[];
  activeLanguage: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('getLearningLanguages', { body: {} });
  if (error) invokeError(error);
  return data as { languages: LearningLanguage[]; activeLanguage: string | null };
}

/**
 * Add a new language (by ISO code) to the user's learning list.
 * Idempotent — duplicate additions are silently ignored by the backend.
 */
export async function addLearningLanguage(language: string): Promise<{ success: true; language: string }> {
  const { data, error } = await supabase.functions.invoke('addLearningLanguage', {
    body: { language },
  });
  if (error) invokeError(error);
  return data as { success: true; language: string };
}

/**
 * Set a new active learning language (must already be in the user's list).
 * Updates profiles.target_language server-side.
 */
export async function setActiveLanguage(language: string): Promise<{ success: true; activeLanguage: string }> {
  const { data, error } = await supabase.functions.invoke('setActiveLanguage', {
    body: { language },
  });
  if (error) invokeError(error);
  return data as { success: true; activeLanguage: string };
}

/**
 * Update the user's native language (by ISO code).
 * Updates profiles.native_language server-side.
 */
export async function updateNativeLanguage(language: string): Promise<{ success: true; nativeLanguage: string }> {
  const { data, error } = await supabase.functions.invoke('updateNativeLanguage', {
    body: { language },
  });
  if (error) invokeError(error);
  return data as { success: true; nativeLanguage: string };
}

