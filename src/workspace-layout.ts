const DECK_WITH_PILES_CENTER_RATIO = 0.62;
const DECK_WITH_PILES_MAX_HEIGHT_RATIO = 0.62;
const DEFAULT_PILE_VERTICAL_STEP_PX = 42;

export interface WorkspacePoint {
  readonly x: number;
  readonly y: number;
}

/** Keep the home pile closest to the Deck and stack later automatic piles upward. */
export function defaultPilePosition(pileIndex: number): WorkspacePoint {
  const index = Number.isFinite(pileIndex)
    ? Math.max(0, Math.trunc(pileIndex))
    : 0;
  return {
    x: 0,
    y: index === 0 ? 0 : -index * DEFAULT_PILE_VERTICAL_STEP_PX,
  };
}

/**
 * Return the untransformed top edge of the Deck footprint used when piles are
 * present. Before the first pile exists, cap the measured card to its future
 * with-piles height so pointer-chosen positions do not jump when the Deck moves.
 */
export function deckTopForPileAnchor(
  stageHeight: number,
  measuredDeckHeight: number,
): number | null {
  if (
    !Number.isFinite(stageHeight) ||
    !Number.isFinite(measuredDeckHeight) ||
    stageHeight <= 0 ||
    measuredDeckHeight <= 0
  ) {
    return null;
  }
  const deckHeight = Math.min(
    measuredDeckHeight,
    stageHeight * DECK_WITH_PILES_MAX_HEIGHT_RATIO,
  );
  return stageHeight * DECK_WITH_PILES_CENTER_RATIO - deckHeight / 2;
}
