// Levenshtein distance — used for typo-tolerant answer evaluation
// Port of supabase/functions/_shared/levenshtein.ts
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function isTypoTolerantMatch(expected: string, actual: string): boolean {
  const a = expected.toLowerCase().trim();
  const b = actual.toLowerCase().trim();
  if (a === b) return true;
  const dist = levenshtein(a, b);
  const len = a.length;
  if (len <= 4) return dist <= 1;
  if (len <= 8) return dist <= 2;
  return dist <= 3;
}
