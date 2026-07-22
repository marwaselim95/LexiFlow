import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// ─── Canonical 24-language list (mirrors migration 009 supported_languages seed) ─
// Keyed by ISO 639-1 code. This is the single source of truth for the frontend —
// do NOT maintain a separate list. Any drift from the DB's supported_languages
// table will cause addLearningLanguage / updateNativeLanguage to reject the code.

export interface SupportedLanguage {
  code: string;
  name: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'ar', name: 'Arabic' },
  { code: 'zh', name: 'Chinese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'es', name: 'Spanish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
];

// Pre-built lookup maps for O(1) access
const CODE_TO_NAME = new Map(SUPPORTED_LANGUAGES.map(l => [l.code, l.name]));
const NAME_TO_CODE = new Map(SUPPORTED_LANGUAGES.map(l => [l.name.toLowerCase(), l.code]));

/**
 * Convert an ISO code to a human-readable language name.
 * Used at every call site that passes a language into an AI-prompt-driving
 * edge function (generateDetailCard, translateExplanations, YouGlish, etc.)
 * so the AI receives "English" not "en".
 * Falls back to the code itself if not found (defensive, should not happen).
 */
export function codeToName(code: string): string {
  return CODE_TO_NAME.get(code) ?? code;
}

/**
 * Convert a full language name to an ISO code.
 * Used during session restoration to migrate old localStorage snapshots
 * that stored full names ('English') into the new code format ('en').
 */
export function nameToCode(name: string): string {
  return NAME_TO_CODE.get(name.toLowerCase()) ?? name;
}

// ─── Legacy compat exports (OnboardingPage uses LANGUAGES / TARGET_LANGUAGES) ─
/** @deprecated Use SUPPORTED_LANGUAGES instead. Kept for OnboardingPage compat. */
export const LANGUAGES = SUPPORTED_LANGUAGES.map(l => l.name);
/** @deprecated Only English and French are currently seeded as target languages. */
export const TARGET_LANGUAGES = ['English', 'French'];

// ─── State ────────────────────────────────────────────────────────────────────

export interface UserState {
  /** ISO 639-1 code, e.g. 'ar', 'en' */
  nativeLanguage: string;
  /** ISO 639-1 code — the currently active learning language */
  targetLanguage: string;
  /** All ISO codes the user is learning (from user_languages table) */
  learningLanguages: string[];
  onboarded: boolean;
}

// ─── Migrations ──────────────────────────────────────────────────────────────
// Old localStorage snapshots stored full names ('English', 'Arabic').
// Transparently convert them to codes on first load.

function migrateToCode(value: string): string {
  // If it's already a short code (≤ 3 chars), pass through
  if (value.length <= 3) return value;
  // Otherwise treat it as a full name and convert
  return nameToCode(value);
}

function loadInitialState(): UserState {
  try {
    const stored = localStorage.getItem('lexi_user');
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<UserState> & {
        nativeLanguage?: string;
        targetLanguage?: string;
      };
      const native = migrateToCode(parsed.nativeLanguage ?? 'ar');
      const target = migrateToCode(parsed.targetLanguage ?? 'en');
      return {
        nativeLanguage: native,
        targetLanguage: target,
        // Default learningLanguages to [target] for existing single-language sessions
        learningLanguages: parsed.learningLanguages ?? [target],
        onboarded: parsed.onboarded ?? false,
      };
    }
  } catch { /* ignore parse errors */ }
  return {
    nativeLanguage: 'ar',
    targetLanguage: 'en',
    learningLanguages: ['en'],
    onboarded: false,
  };
}

const initialState: UserState = loadInitialState();

// ─── Slice ────────────────────────────────────────────────────────────────────

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    /** Called on onboarding — sets languages from human-readable names (converts to codes). */
    setLanguages(state, action: PayloadAction<{ nativeLanguage: string; targetLanguage: string }>) {
      state.nativeLanguage = migrateToCode(action.payload.nativeLanguage);
      state.targetLanguage = migrateToCode(action.payload.targetLanguage);
    },
    setOnboarded(state, action: PayloadAction<boolean>) {
      state.onboarded = action.payload;
    },
    /** Called on onboarding completion — converts full names to codes. */
    completeOnboarding(state, action: PayloadAction<{ nativeLanguage: string; targetLanguage: string }>) {
      state.nativeLanguage = migrateToCode(action.payload.nativeLanguage);
      state.targetLanguage = migrateToCode(action.payload.targetLanguage);
      if (!state.learningLanguages.includes(state.targetLanguage)) {
        state.learningLanguages = [state.targetLanguage];
      }
      state.onboarded = true;
    },
    /**
     * Called after getLearningLanguages succeeds — replaces the full list
     * and syncs the active language.
     */
    setLearningLanguages(
      state,
      action: PayloadAction<{ languages: string[]; activeLanguage: string | null }>,
    ) {
      state.learningLanguages = action.payload.languages;
      if (action.payload.activeLanguage) {
        state.targetLanguage = action.payload.activeLanguage;
      }
    },
    /**
     * Called after setActiveLanguage API call succeeds — updates the active
     * target language and marks it in the learningLanguages list.
     */
    setActiveTargetLanguage(state, action: PayloadAction<string>) {
      state.targetLanguage = action.payload;
      // Ensure the new active lang is in the list (defensive)
      if (!state.learningLanguages.includes(action.payload)) {
        state.learningLanguages = [...state.learningLanguages, action.payload];
      }
    },
    /**
     * Called after updateNativeLanguage API call succeeds — optimistic update.
     */
    setNativeLanguage(state, action: PayloadAction<string>) {
      state.nativeLanguage = action.payload;
    },
    /**
     * Called after addLearningLanguage API call succeeds — adds to the list.
     */
    addLanguageToList(state, action: PayloadAction<string>) {
      if (!state.learningLanguages.includes(action.payload)) {
        state.learningLanguages = [...state.learningLanguages, action.payload];
      }
    },
  },
});

export const {
  setLanguages,
  setOnboarded,
  completeOnboarding,
  setLearningLanguages,
  setActiveTargetLanguage,
  setNativeLanguage,
  addLanguageToList,
} = userSlice.actions;
export default userSlice.reducer;
