// Maps a numeric score (0-100) to a qualitative performance category.
export function bucketScore(score: number): 'excellent' | 'good' | 'wrong' {
  if (score >= 80) return 'excellent';
  if (score >= 50) return 'good';
  return 'wrong';
}
