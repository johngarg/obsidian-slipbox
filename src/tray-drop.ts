import type { TrayPilePosition } from "./tray-state.js";

export interface DeskDropBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface DeskPilePlacementGeometry {
  readonly baseYRatio: number;
  readonly baseYOffsetPx: number;
  readonly cardHalfHeightPx: number;
}

/**
 * Resolve the pile beneath a dragged card. The transparent body of the source
 * expanded pile is workspace, while one of its remaining cards is a reorder
 * target. Other piles retain their complete drop region.
 */
export function cardDropTargetPile(
  elements: readonly Element[],
  sourcePileId: string,
): HTMLElement | null {
  const targetCard = elements.find((element) =>
    element.matches(".slipbox-tray-card:not(.is-dragging)")
  );
  const cardPile = targetCard?.closest<HTMLElement>(".slipbox-tray-pile");
  if (cardPile?.dataset.pileId !== undefined) {
    return cardPile;
  }

  const pile = elements.find((element) =>
    element.matches(".slipbox-tray-pile")
  ) as HTMLElement | undefined;
  return pile?.dataset.pileId !== undefined &&
      pile.dataset.pileId !== sourcePileId
    ? pile
    : null;
}

/** Convert a visible workspace point into the translated Desk coordinate space. */
export function pilePositionAtWorkspacePoint(
  x: number,
  y: number,
  coordinateBounds: DeskDropBounds,
  workspaceBounds: DeskDropBounds,
  geometry: DeskPilePlacementGeometry,
): TrayPilePosition | null {
  if (
    x < workspaceBounds.left || x > workspaceBounds.right ||
    y < workspaceBounds.top || y > workspaceBounds.bottom
  ) {
    return null;
  }
  return {
    x: x - (coordinateBounds.left + coordinateBounds.width / 2),
    y: y - (
      coordinateBounds.top +
      coordinateBounds.height * geometry.baseYRatio -
      geometry.baseYOffsetPx
    ) - geometry.cardHalfHeightPx,
  };
}
