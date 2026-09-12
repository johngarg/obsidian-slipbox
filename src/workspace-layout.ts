import type { DeckOrientation } from "./settings.js";

const DEFAULT_PILE_HORIZONTAL_STEP_PERCENT = 6;
const DEFAULT_PILE_VERTICAL_STEP_PX = 36;

export type DeckPositionMode = "top" | "centered" | "bottom";

/** Keep the fixed card inside the pane, or expose the requested edge if it cannot fit. */
export function deckAnchorCenterY(
  paneHeight: number,
  cardHeight: number,
  orientation: DeckOrientation,
  mode: DeckPositionMode,
): number {
  if (!Number.isFinite(paneHeight) || !Number.isFinite(cardHeight) ||
      paneHeight <= 0 || cardHeight <= 0) return 0;
  if (mode === "centered") return paneHeight / 2;

  const halfHeight = cardHeight / 2;
  const inset = 12;
  if (cardHeight > paneHeight) {
    return mode === "top" ? halfHeight + inset : paneHeight - halfHeight - inset;
  }

  const margin = Math.min(inset, (paneHeight - cardHeight) / 2);
  const topPercent = orientation === "vertical" ? 22 : 33;
  const fraction = (mode === "top" ? topPercent : 100 - topPercent) / 100;
  return Math.max(halfHeight + margin,
    Math.min(paneHeight - halfHeight - margin, paneHeight * fraction));
}

/** Start near the bottom when the reconstructed unfiled-card pile exists. */
export function deckPositionModeForPileCount(
  pileCount: number,
): DeckPositionMode {
  return pileCount > 0 ? "bottom" : "centered";
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
