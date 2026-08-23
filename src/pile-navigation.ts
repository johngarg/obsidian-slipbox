export type PileNavigationDirection = -1 | 1;

export type PileFocusLocation =
  | { readonly surface: "deck" }
  | { readonly surface: "desk"; readonly pileId: string };

export interface NavigablePile {
  readonly cards: readonly { readonly cardRef: string }[];
}

function pileTarget(pileId: string): PileFocusLocation {
  return { surface: "desk", pileId };
}

/**
 * Cycle card focus through the Deck and visible Desk piles.
 *
 * The Deck is omitted when it has no filed card to receive focus. A Desk with
 * no piles has no navigation target even when the Deck is available, because
 * pile-navigation actions are unavailable in that state.
 */
export function cyclePileFocusTarget(
  pileIds: readonly string[],
  current: PileFocusLocation | null,
  deckAvailable: boolean,
  direction: PileNavigationDirection,
): PileFocusLocation | null {
  if (pileIds.length === 0) {
    return null;
  }
  const targets: readonly PileFocusLocation[] = [
    ...(deckAvailable ? [{ surface: "deck" } as const] : []),
    ...pileIds.map(pileTarget),
  ];
  const currentIndex = targets.findIndex((target) =>
    target.surface === current?.surface &&
    (target.surface === "deck" ||
      (current?.surface === "desk" && target.pileId === current.pileId))
  );
  if (currentIndex < 0) {
    return direction === 1 ? targets[0] ?? null : targets[targets.length - 1] ?? null;
  }
  const targetIndex = (currentIndex + direction + targets.length) % targets.length;
  return targets[targetIndex] ?? null;
}

/** Resolve the other side of the Deck/remembered-pile swap. */
export function swapPileFocusTarget(
  pileIds: readonly string[],
  current: PileFocusLocation,
  lastFocusedPileId: string | null,
  deckAvailable: boolean,
): PileFocusLocation | null {
  if (pileIds.length === 0) {
    return null;
  }
  if (current.surface === "desk") {
    return deckAvailable ? { surface: "deck" } : null;
  }
  const fallback = pileIds[0];
  if (fallback === undefined) {
    return null;
  }
  const remembered = lastFocusedPileId === null
    ? undefined
    : pileIds.find((pileId) => pileId === lastFocusedPileId);
  return pileTarget(remembered ?? fallback);
}

/** Keep the last pile when focus returns to the Deck. */
export function rememberPileFocus(
  lastFocusedPileId: string | null,
  target: PileFocusLocation,
): string | null {
  return target.surface === "desk" ? target.pileId : lastFocusedPileId;
}

/** Find the adjacent card in an expanded pile, wrapping at either end. */
export function wrappedPileCardNeighbour(
  pile: NavigablePile,
  cardRef: string,
  direction: PileNavigationDirection,
): string | null {
  const index = pile.cards.findIndex((card) => card.cardRef === cardRef);
  if (index < 0 || pile.cards.length === 0) {
    return null;
  }
  const targetIndex = (index + direction + pile.cards.length) % pile.cards.length;
  return pile.cards[targetIndex]?.cardRef ?? null;
}
