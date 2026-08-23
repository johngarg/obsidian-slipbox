const DEFAULT_PILE_HORIZONTAL_STEP_PERCENT = 6;
const DEFAULT_PILE_VERTICAL_STEP_PX = 36;

export type DeckPositionMode = "startup-centered" | "lowered";

/** Lower the Deck after the first pile appears and keep it there for the session. */
export function deckPositionModeAfterPileCount(
  current: DeckPositionMode,
  pileCount: number,
): DeckPositionMode {
  return current === "lowered" || pileCount > 0
    ? "lowered"
    : "startup-centered";
}

export interface AutomaticPilePosition {
  readonly xPercent: number;
  readonly y: number;
}

/** Keep the home pile centred and expose each later pile's preceding header. */
export function defaultPilePosition(
  pileIndex: number,
): AutomaticPilePosition {
  const index = Number.isFinite(pileIndex)
    ? Math.max(0, Math.trunc(pileIndex))
    : 0;
  return {
    xPercent: index * DEFAULT_PILE_HORIZONTAL_STEP_PERCENT,
    y: index * DEFAULT_PILE_VERTICAL_STEP_PX,
  };
}

/** Return the untransformed top edge of the fixed Deck footprint. */
export function deckTopForPileAnchor(
  deckCenterY: number,
  measuredDeckHeight: number,
): number | null {
  if (
    !Number.isFinite(deckCenterY) ||
    !Number.isFinite(measuredDeckHeight) ||
    deckCenterY < 0 ||
    measuredDeckHeight <= 0
  ) {
    return null;
  }
  return deckCenterY - measuredDeckHeight / 2;
}
