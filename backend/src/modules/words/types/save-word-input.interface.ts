/**
 * Input structure for saving a new word to the user's vault.
 * Contains the word data and the source context of the word.
 */
export interface SaveWordInput {
  /** The word data including headword, synonyms, and contexts */
  word: {
    /** The word or phrase being saved */
    headword: string;
    /** Target language synonyms (from frontend) */
    synonyms?: string[];
    /** Native language synonyms (from card generators) */
    nativeSynonyms?: string[];
    /** Contextual usage examples with labels and explanations */
    contexts: Array<{ label: string; explanation: string; example: string }>;
  };
  /** The source context where the word was encountered */
  source: 'manual' | 'watch' | 'explore' | 'selection';
}
