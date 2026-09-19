import type { DeckPositionMode } from "./deck-position.js";
import type { DeskPilePosition } from "./desk-state.js";

const DEFAULT_PILE_HORIZONTAL_STEP_PERCENT = 6;
const DEFAULT_PILE_VERTICAL_STEP_PX = 36;

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

interface PileLayoutBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Resolve the automatic cascade once, without retaining its moving origin. */
export function automaticPileWorkspacePosition(
  pileIndex: number,
  guide: PileLayoutBounds,
  workspaceAnchor: PileLayoutBounds,
): DeskPilePosition | null {
  for (const bounds of [guide, workspaceAnchor]) {
    if (
      ![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) ||
      bounds.width <= 0 || bounds.height <= 0
    ) return null;
  }
  const offset = defaultPilePosition(pileIndex);
  return {
    x: guide.left + guide.width / 2 + guide.width * offset.xPercent / 100 -
      (workspaceAnchor.left + workspaceAnchor.width / 2),
    y: guide.top + guide.height / 2 + offset.y -
      (workspaceAnchor.top + workspaceAnchor.height / 2),
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
