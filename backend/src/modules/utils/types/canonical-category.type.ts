/**
 * Canonical video category names used for watch history classification.
 * These are the standardized categories for content recommendation.
 */
export const CANONICAL_CATEGORIES = [
  'history', 'science', 'technology', 'business', 'health',
  'self-development', 'travel', 'cooking', 'sports', 'entertainment',
  'education', 'nature', 'art', 'philosophy', 'politics', 'other',
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];
