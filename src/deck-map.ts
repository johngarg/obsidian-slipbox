export interface DeckMapMarker {
  readonly path: string;
  /** One-based position in the complete filed Deck. */
  readonly ordinal: number;
  /** Normalized horizontal coordinate in the inclusive range from 0 to 1. */
  readonly position: number;
}

export interface DeckMapModel {
  readonly cardCount: number;
  readonly active: DeckMapMarker | null;
  readonly bookmarks: readonly DeckMapMarker[];
}

export interface DeckMapSectionCard {
  readonly path: string;
  readonly address: string;
}

export interface DeckMapSectionMarker extends DeckMapMarker {
  readonly label: string;
}

export function deckMapCoordinate(
  index: number,
  cardCount: number,
): number | null {
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(cardCount) ||
    cardCount <= 0 ||
    index < 0 ||
    index >= cardCount
  ) {
    return null;
  }
  return cardCount === 1 ? 0.5 : index / (cardCount - 1);
}

export function buildDeckMapModel(
  orderedFiledPaths: readonly string[],
  activePath: string | null,
  bookmarkedPaths: Iterable<string>,
): DeckMapModel {
  const cardCount = orderedFiledPaths.length;
  const bookmarked = new Set(bookmarkedPaths);
  const markers = orderedFiledPaths.map((path, index): DeckMapMarker => ({
    path,
    ordinal: index + 1,
    position: deckMapCoordinate(index, cardCount) ?? 0,
  }));

  return {
    cardCount,
    active:
      activePath === null
        ? null
        : markers.find((marker) => marker.path === activePath) ?? null,
    bookmarks: markers.filter((marker) => bookmarked.has(marker.path)),
  };
}

export function buildDeckMapSectionMarkers(
  orderedFiledCards: readonly DeckMapSectionCard[],
): readonly DeckMapSectionMarker[] {
  const sections: DeckMapSectionMarker[] = [];
  let previousLabel: string | null = null;

  for (const [index, card] of orderedFiledCards.entries()) {
    const label = Array.from(card.address)[0] ?? "";
    if (label === "" || label === previousLabel) {
      continue;
    }
    sections.push({
      path: card.path,
      ordinal: index + 1,
      position: deckMapCoordinate(index, orderedFiledCards.length) ?? 0,
      label,
    });
    previousLabel = label;
  }

  return sections;
}

export function visibleDeckMapSectionMarkers(
  sections: readonly DeckMapSectionMarker[],
  railWidth: number,
  minimumSpacing: number,
): readonly DeckMapSectionMarker[] {
  const visible: DeckMapSectionMarker[] = [];
  let previousPosition: number | null = null;

  for (const section of sections) {
    const pixelPosition = section.position * Math.max(0, railWidth);
    if (
      previousPosition === null ||
      pixelPosition - previousPosition >= Math.max(0, minimumSpacing)
    ) {
      visible.push(section);
      previousPosition = pixelPosition;
    }
  }

  return visible;
}

export function deckMapIndexAtOffset(
  offset: number,
  railWidth: number,
  cardCount: number,
): number | null {
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(railWidth) ||
    railWidth <= 0 ||
    !Number.isInteger(cardCount) ||
    cardCount <= 0
  ) {
    return null;
  }
  if (cardCount === 1) {
    return 0;
  }
  const normalized = Math.max(0, Math.min(1, offset / railWidth));
  return Math.round(normalized * (cardCount - 1));
}
