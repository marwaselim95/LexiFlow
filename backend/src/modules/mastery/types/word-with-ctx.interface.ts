/**
 * A word with its associated context data, used in mastery review sessions.
 * Combines core word metadata with learning contexts for question generation.
 */
export interface WordWithCtx {
  /** Unique identifier for the word */
  id: string;
  /** The word or phrase being learned */
  headword: string;
  /** Native language synonyms for the word */
  nativeSynonyms: string[];
  /** Current SRS stage (1-6) */
  stage: number;
  /** Contextual usage examples with labels and explanations */
  contexts: Array<{ label: string; explanation: string; example: string }>;
}
