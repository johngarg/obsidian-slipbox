import type { DeckAction } from "./settings.js";

export interface DeckActionContext {
  readonly hasActiveCard: boolean;
  readonly hasPreviousCard: boolean;
  readonly hasNextCard: boolean;
  readonly hasPreviousBookmark: boolean;
  readonly hasNextBookmark: boolean;
  readonly hasProblems: boolean;
  readonly filing: boolean;
  readonly hasFocusedCard: boolean;
  readonly focusedCardFiled: boolean;
  readonly focusedCardUnfiled: boolean;
  readonly focusedSurface: "deck" | "desk" | "viewed" | null;
  readonly viewedReturnSurface: "deck" | "desk" | null;
  readonly focusedCardOnDesk: boolean;
  readonly canMoveDeskCardLeft: boolean;
  readonly canMoveDeskCardRight: boolean;
  readonly hasDeskPiles: boolean;
  readonly hasExpandedPiles: boolean;
  readonly hasFiledDeskCards: boolean;
}

export function trayToggleLabel(
  inTray: boolean,
): "Return from Desk" | "Put on Desk" {
  return inTray ? "Return from Desk" : "Put on Desk";
}

export type DeskToggleFocusTarget = "deck" | "desk" | "preserve";

/**
 * Decide where card focus belongs after a Desk toggle. Ordinary pulls move
 * focus with the card; the background variant deliberately preserves Deck
 * focus. Returning a viewed card also closes that view so an unpulled card is
 * never left open in Slipbox.
 */
export function deskToggleFocusTarget(
  surface: DeckActionContext["focusedSurface"],
  onDesk: boolean,
  focusPulledCard: boolean,
): DeskToggleFocusTarget {
  if (!focusPulledCard) {
    return "preserve";
  }
  if (!onDesk && surface === "deck") {
    return "desk";
  }
  if (onDesk && (surface === "desk" || surface === "viewed")) {
    return "deck";
  }
  return "preserve";
}

export function canRunDeckAction(
  action: DeckAction,
  context: DeckActionContext,
): boolean {
  switch (action) {
    case "previous-card":
      return context.hasPreviousCard;
    case "next-card":
      return context.hasNextCard;
    case "previous-bookmark":
      return context.hasPreviousBookmark;
    case "next-bookmark":
      return context.hasNextBookmark;
    case "forward-ten-cards":
    case "backward-ten-cards":
      return context.hasActiveCard;
    case "centre-card":
    case "find-address-first":
      return context.hasActiveCard;
    case "open-note":
    case "delete-card":
      return context.hasFocusedCard;
    case "edit-card":
      return context.hasFocusedCard && context.focusedSurface !== "deck";
    case "copy-link":
    case "toggle-tray":
    case "pull-into-pile":
      return context.focusedCardFiled;
    case "toggle-tray-without-focus":
      return context.focusedCardFiled && context.focusedSurface === "deck";
    case "toggle-bookmark":
      return context.focusedCardFiled && context.focusedSurface === "deck";
    case "show-card-in-deck":
      return context.focusedCardFiled && context.focusedSurface !== "deck";
    case "toggle-viewed-card":
      return context.hasFocusedCard && (
        context.focusedSurface === "desk" || context.focusedSurface === "viewed"
      );
    case "file-card":
      return context.focusedCardUnfiled && context.focusedSurface !== "deck";
    case "move-desk-card-left":
      return context.canMoveDeskCardLeft;
    case "move-desk-card-right":
      return context.canMoveDeskCardRight;
    case "next-pile":
    case "previous-pile":
      return context.hasDeskPiles &&
        (context.focusedSurface !== "viewed" || context.focusedCardOnDesk);
    case "swap-deck-pile":
      return context.hasDeskPiles &&
        context.hasActiveCard &&
        (
          context.focusedSurface !== "viewed" ||
          context.focusedCardOnDesk ||
          context.viewedReturnSurface === "deck"
        );
    case "toggle-pile":
    case "previous-card-in-pile":
    case "next-card-in-pile":
      return context.hasDeskPiles && context.focusedSurface === "desk";
    case "collapse-all-piles":
      return context.hasExpandedPiles;
    case "return-all-filed-cards":
      return context.hasFiledDeskCards;
    case "first-card":
    case "last-card":
      return context.hasActiveCard;
    case "problems":
      return context.hasProblems;
    case "confirm-filing":
      return context.filing;
    case "cancel-filing":
      return context.filing;
    case "bookmarks":
    case "toggle-deck-map":
      return true;
  }
}
