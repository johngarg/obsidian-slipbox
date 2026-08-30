import {
  addUniqueCardToPile,
  placeFiledCardAtPosition,
  type DeskPile,
  type DeskPilePosition,
  type DeskState,
} from "./desk-state.js";

export interface DeskDropBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export const DECK_CARD_HEADER_ANCHOR_OFFSET_PX = 16;

export type DeckCardDropTarget =
  | { readonly kind: "pile"; readonly pile: HTMLElement }
  | { readonly kind: "workspace" };

export type DeckCardPlacementTarget =
  | { readonly kind: "pile"; readonly pileId: string }
  | {
    readonly kind: "workspace";
    readonly pileId: string;
    readonly position: DeskPilePosition;
  };

export interface ResolvedDeckCardDrop {
  readonly state: DeskState;
  readonly focusPath: string;
  readonly pileId: string;
}

const INTERACTIVE_DROP_BLOCKER =
  ".slipbox-card-actions, .slipbox-desk-card-actions, " +
  "button, a, input, textarea, select, [contenteditable='true']";

const COVERED_DESK_DRAG_BLOCKER =
  "button, a, input, textarea, select, [contenteditable='true']";

export type CoveredDeskDragTarget =
  | { readonly kind: "card"; readonly card: HTMLElement }
  | {
    readonly kind: "pile";
    readonly pile: HTMLElement;
    readonly dragSurface: HTMLElement;
  };

/** Prefer any ordinary Desk drag surface beneath transparent Branch content. */
export function coveredDeskDragTarget(
  elements: readonly Element[],
): CoveredDeskDragTarget | null {
  for (const element of elements) {
    const handle = element.closest<HTMLElement>(
      "button.slipbox-desk-pile-handle",
    );
    const pile = element.closest<HTMLElement>(".slipbox-desk-pile");
    if (
      handle !== null &&
      pile?.classList.contains("is-expanded") === true
    ) {
      return { kind: "pile", pile, dragSurface: handle };
    }
    if (pile === null) {
      continue;
    }
    const blocker = element.closest(COVERED_DESK_DRAG_BLOCKER);
    if (blocker !== null && pile.contains(blocker)) {
      return null;
    }
    if (pile.classList.contains("is-collapsed")) {
      return { kind: "pile", pile, dragSurface: pile };
    }
    const card = element.closest<HTMLElement>(
      ".slipbox-desk-card:not(.is-viewed-ghost)",
    );
    if (card !== null && pile.classList.contains("is-expanded")) {
      return { kind: "card", card };
    }
    return null;
  }
  return null;
}

/** Resolve a Deck-card drop without treating covered cards or controls as free space. */
export function deckCardDropTarget(
  elements: readonly Element[],
): DeckCardDropTarget | null {
  for (const element of elements) {
    if (element.closest(INTERACTIVE_DROP_BLOCKER) !== null) {
      return null;
    }
    const pile = element.closest<HTMLElement>(".slipbox-desk-pile");
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
  pile: Pick<DeskPile, "cards">,
  cardRef: string,
  expanded: boolean,
): string {
  return expanded ? cardRef : pile.cards[0]?.cardRef ?? cardRef;
}

/** Place one filed Deck card and resolve the visible post-drop focus target. */
export function resolveDeckCardDrop(
  state: DeskState,
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
    element.matches(".slipbox-desk-card:not(.is-dragging)")
  );
  const cardPile = targetCard?.closest<HTMLElement>(".slipbox-desk-pile");
  if (cardPile?.dataset.pileId !== undefined) {
    return cardPile;
  }

  const pile = elements.find((element) =>
    element.matches(".slipbox-desk-pile")
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
  anchorBounds: DeskDropBounds,
  workspaceBounds: DeskDropBounds,
): DeskPilePosition | null {
  if (
    x < workspaceBounds.left || x > workspaceBounds.right ||
    y < workspaceBounds.top || y > workspaceBounds.bottom
  ) {
    return null;
  }
  return {
    x: x - (anchorBounds.left + anchorBounds.width / 2),
    y: y - (anchorBounds.top + anchorBounds.height / 2),
  };
}

/** Position a pile so the release point lands within its card header. */
export function pileHeaderPositionAtWorkspacePoint(
  x: number,
  y: number,
  anchorBounds: DeskDropBounds,
  workspaceBounds: DeskDropBounds,
  headerAnchorOffsetPx = DECK_CARD_HEADER_ANCHOR_OFFSET_PX,
): DeskPilePosition | null {
  const position = pilePositionAtWorkspacePoint(
    x,
    y,
    anchorBounds,
    workspaceBounds,
  );
  if (
    position === null ||
    !Number.isFinite(anchorBounds.height) ||
    anchorBounds.height <= 0 ||
    !Number.isFinite(headerAnchorOffsetPx)
  ) {
    return null;
  }
  return {
    x: position.x,
    y: position.y + anchorBounds.height / 2 - headerAnchorOffsetPx,
  };
}
