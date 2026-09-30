/**
 * Represents the pronunciation status of a single phoneme
 * as evaluated by the speech assessment service.
 */
export interface PhonemeStatus {
  /** The phoneme character or symbol (e.g. "æ", "θ") */
  phoneme: string;
  /** Pronunciation quality rating for this phoneme */
  status: 'excellent' | 'good' | 'wrong';
}
