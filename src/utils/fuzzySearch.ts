/**
 * Simple fuzzy search implementation
 * Returns a score between 0 and 1, where 1 is a perfect match
 */
export function fuzzyMatch(search: string, target: string): number {
  const searchLower = search.toLowerCase();
  const targetLower = target.toLowerCase();

  // Exact match
  if (targetLower === searchLower) return 1;

  // Contains match
  if (targetLower.includes(searchLower)) return 0.9;

  // Fuzzy match - check if all search characters appear in order
  let searchIndex = 0;
  let matchCount = 0;
  let consecutiveMatches = 0;
  let maxConsecutiveMatches = 0;

  for (let i = 0; i < targetLower.length && searchIndex < searchLower.length; i++) {
    if (targetLower[i] === searchLower[searchIndex]) {
      matchCount++;
      consecutiveMatches++;
      maxConsecutiveMatches = Math.max(maxConsecutiveMatches, consecutiveMatches);
      searchIndex++;
    } else {
      consecutiveMatches = 0;
    }
  }

  // All characters must match
  if (searchIndex !== searchLower.length) return 0;

  // Score based on match ratio and consecutive matches
  const matchRatio = matchCount / targetLower.length;
  const consecutiveBonus = maxConsecutiveMatches / searchLower.length;

  return (matchRatio * 0.6) + (consecutiveBonus * 0.4);
}

/**
 * Filter and sort items by fuzzy search score
 */
export function fuzzyFilter<T>(
  items: T[],
  search: string,
  getter: (item: T) => string
): T[] {
  if (!search.trim()) return items;

  return items
    .map(item => ({
      item,
      score: fuzzyMatch(search, getter(item))
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
