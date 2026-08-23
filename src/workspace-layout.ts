const DECK_CENTER_RATIO = 0.5;
const DEFAULT_PILE_HORIZONTAL_STEP_PERCENT = 12;

export interface AutomaticPilePosition {
  readonly xPercent: number;
  readonly y: number;
}

/** Keep the home pile centred and cascade later automatic piles to the left. */
export function defaultPilePosition(
  pileIndex: number,
): AutomaticPilePosition {
  const index = Number.isFinite(pileIndex)
    ? Math.max(0, Math.trunc(pileIndex))
    : 0;
  return {
    xPercent: index === 0
      ? 0
      : -index * DEFAULT_PILE_HORIZONTAL_STEP_PERCENT,
    y: 0,
  };
}

/** Return the untransformed top edge of the permanently centred Deck. */
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
  return stageHeight * DECK_CENTER_RATIO - measuredDeckHeight / 2;
}
