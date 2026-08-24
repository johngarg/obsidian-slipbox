import {
  addUniqueCardToPile,
  placeFiledCardAtPosition,
  type TrayPile,
  type TrayPilePosition,
  type TrayState,
} from "./tray-state.js";

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

export const DESK_PILE_PLACEMENT_GEOMETRY: DeskPilePlacementGeometry = {
  baseYRatio: 0.31,
  baseYOffsetPx: 126,
  cardHalfHeightPx: 58,
};

export type DeckCardDropTarget =
  | { readonly kind: "pile"; readonly pile: HTMLElement }
  | { readonly kind: "workspace" };

export type DeckCardPlacementTarget =
  | { readonly kind: "pile"; readonly pileId: string }
  | {
    readonly kind: "workspace";
    readonly pileId: string;
    readonly position: TrayPilePosition;
  };

export interface ResolvedDeckCardDrop {
  readonly state: TrayState;
  readonly focusPath: string;
  readonly pileId: string;
}

const INTERACTIVE_DROP_BLOCKER =
  ".slipbox-card-actions, .slipbox-tray-card-actions, " +
  "button, a, input, textarea, select, [contenteditable='true']";

/** Resolve a Deck-card drop without treating covered cards or controls as free space. */
export function deckCardDropTarget(
  elements: readonly Element[],
): DeckCardDropTarget | null {
  for (const element of elements) {
    if (element.closest(INTERACTIVE_DROP_BLOCKER) !== null) {
      return null;
    }
    const pile = element.closest<HTMLElement>(".slipbox-tray-pile");
    if (pile?.dataset.pileId !== undefined) {
      return { kind: "pile", pile };
    }
    if (
      element.closest(".slipbox-deck-map") !== null ||
      element.closest(".slipbox-card") !== null
    ) {
      return null;
    }
    if (element.matches(".slipbox-deck-stage")) {
      return { kind: "workspace" };
    }
  }
  return null;
}

/** Match Shift+P focus: hidden appended cards resolve to the visible pile top. */
export function deckCardPileDropFocusPath(
  pile: Pick<TrayPile, "cards">,
  cardRef: string,
  expanded: boolean,
): string {
  return expanded ? cardRef : pile.cards[0]?.cardRef ?? cardRef;
}

/** Place one filed Deck card and resolve the visible post-drop focus target. */
export function resolveDeckCardDrop(
  state: TrayState,
  cardRef: string,
  target: DeckCardPlacementTarget,
): ResolvedDeckCardDrop | null {
  if (target.kind === "workspace") {
    const next = placeFiledCardAtPosition(
      state,
      cardRef,
      target.pileId,
      target.position,
    );
    return next === state
      ? null
      : {
        state: next,
        focusPath: cardRef,
        pileId: target.pileId,
      };
  }

  const pile = state.piles.find((candidate) => candidate.id === target.pileId);
  if (pile === undefined) {
    return null;
  }
  const next = addUniqueCardToPile(state, target.pileId, {
    cardRef,
    kind: "filed",
  });
  return next === state
    ? null
    : {
      state: next,
      focusPath: deckCardPileDropFocusPath(
        pile,
        cardRef,
        state.expandedPileIds.includes(target.pileId),
      ),
      pileId: target.pileId,
    };
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
