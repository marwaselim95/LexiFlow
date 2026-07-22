// ─── Shared TypeScript Interfaces ───────────────────────────────────────────
// These types form the exact interface contract between the frontend and backend.
// The backend engineer should implement functions that return exactly these shapes.

export interface DetailCardData {
  id: string;
  headword: string;
  synonyms: string[];          // 1–3 synonyms in native language
  contexts: ContextBlock[];
  stage: number;               // SRS stage 0–6
  stage6_streak: number;
  active: boolean;
  savedAt?: string;            // ISO date string
  source?: 'manual' | 'watch' | 'explore' | 'selection';
  nativeTranslation?: string;  // used in simplified mode
}

export interface ContextBlock {
  label: string;               // e.g. "Figurative", "Formal"
  explanation: string;         // bold-italic in UI
  example: string;             // sentence with headword bolded
}

export interface ReviewItem {
  reviewId: string;
  wordId: string;
  headword: string;
  questionType: 1 | 2 | 3 | 4 | 5 | 6;
  // Type 1: MCQ — user picks correct definition/synonym
  mcqOptions?: string[];
  correctOption?: string;
  // Type 2: Reversed MCQ — user picks correct headword given definition
  reversedDefinition?: string;
  reversedOptions?: string[];
  // Type 3: Listen-and-Write — audio prompt (word spoken), user writes it
  audioUrl?: string;
  // Type 4: Fill-in-blanks — sentence with blank
  fillSentence?: string;       // e.g. "She felt _____ by the news."
  // Type 5: Nuanced Usage — user writes a nuanced sentence
  nuancedPrompt?: string;
  // Type 6: Open Production — user writes their own sentence
  productionPrompt?: string;
  // All types have the card data for post-answer reveal
  cardData: DetailCardData;
}

export interface VaultWord {
  id: string;
  headword: string;
  nativeTranslation: string;
  savedAt: string;             // ISO date string
  stage: number;
  cardData: DetailCardData;
}

export interface VideoItem {
  videoId: string;             // YouTube video ID
  title: string;
  channelName: string;
  thumbnailUrl: string;
  duration: string;            // e.g. "12:34"
  category: string;
  language: 'en' | 'fr';
}

export interface CaptionLine {
  startMs: number;
  endMs: number;
  text: string;
}

// ─── API Response shapes ─────────────────────────────────────────────────────

export interface PhonemeStatus {
  phoneme: string;
  status: 'excellent' | 'good' | 'wrong';
}

export interface PronunciationResult {
  score: number;
  phonemeBreakdown: PhonemeStatus[];
}

export type GenerateDetailCardResult =
  | { mode: 'full';       card: DetailCardData }
  | { mode: 'simplified'; card: DetailCardData }
  | { mode: 'too_long';   card: null };

export type GetSuggestedVideosResult =
  | { videos: VideoItem[] }
  | { promptMessage: string };

export type GetExploreSuggestionsResult =
  | { cards: DetailCardData[] }
  | { emptyMessage: string };

export type SearchExploreResult =
  | { cards: DetailCardData[] }
  | { safetyError: true };

export type GenerateVaultParagraphResult =
  | { paragraph: string; pickedWordIds: string[] }
  | { error: string };

// ─── Language ─────────────────────────────────────────────────────────────────

/** Shape returned by getLearningLanguages edge function per language entry. */
export interface LearningLanguage {
  code: string;       // ISO 639-1, e.g. 'en', 'fr', 'ar'
  name: string;       // Display name, e.g. 'English'
  addedAt: string;    // ISO timestamp
  isActive: boolean;  // true for the currently active language
}
