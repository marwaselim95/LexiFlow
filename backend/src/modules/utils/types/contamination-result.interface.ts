/**
 * Result of script contamination validation on AI-generated card content.
 * Indicates whether the headword was contaminated and provides filtered data.
 */
export interface ContaminationResult {
  /** Whether the headword contains characters from the wrong script */
  headwordContaminated: boolean;
  /** Synonyms list after removing contaminated entries */
  filteredSynonyms: string[];
  /** Contexts list after removing contaminated entries */
  filteredContexts: Array<Record<string, unknown>>;
  /** Number of synonyms removed during filtering */
  synonymsRemoved: number;
  /** Number of contexts removed during filtering */
  contextsRemoved: number;
}
