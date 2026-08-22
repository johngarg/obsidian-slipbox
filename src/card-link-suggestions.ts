/** One filed card offered by the insert-card-link suggester. */
export interface CardLinkCandidate {
  readonly path: string;
  readonly address: string;
  readonly title: string;
}

export interface CardLinkSuggestion extends CardLinkCandidate {
  /** True when another filed card shares this address and the path disambiguates. */
  readonly ambiguous: boolean;
}

const MATCH_TIERS = 4;
const NO_MATCH = -1;

/** Flag cards whose address is shared, so the suggester can show their paths. */
export function buildCardLinkSuggestions(
  candidates: readonly CardLinkCandidate[],
): readonly CardLinkSuggestion[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.address, (counts.get(candidate.address) ?? 0) + 1);
  }
  return candidates.map((candidate) => ({
    ...candidate,
    ambiguous: (counts.get(candidate.address) ?? 0) > 1,
  }));
}

function matchTier(candidate: CardLinkCandidate, needle: string): number {
  const address = candidate.address.toLowerCase();
  if (address === needle) {
    return 0;
  }
  if (address.startsWith(needle)) {
    return 1;
  }
  if (address.includes(needle)) {
    return 2;
  }
  return candidate.title.toLowerCase().includes(needle) ? 3 : NO_MATCH;
}

/**
 * Rank Deck-ordered cards for a query, exact addresses first.
 *
 * Addresses are matched ahead of titles so that typing a complete address and
 * pressing Enter always inserts that card. Matching is deliberately literal
 * rather than fuzzy, because fuzzy scoring orders punctuated addresses such as
 * `10,5/3t` incoherently. Deck order is preserved within each tier.
 */
export function matchCardLinkSuggestions<T extends CardLinkCandidate>(
  candidates: readonly T[],
  query: string,
): readonly T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...candidates];
  }
  const tiers: T[][] = Array.from({ length: MATCH_TIERS }, () => []);
  for (const candidate of candidates) {
    const tier = matchTier(candidate, needle);
    if (tier !== NO_MATCH) {
      tiers[tier]?.push(candidate);
    }
  }
  return tiers.flat();
}
