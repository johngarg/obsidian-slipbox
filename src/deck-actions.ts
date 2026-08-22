import type { DeckAction } from "./settings.js";

export interface DeckActionContext {
  readonly hasActiveCard: boolean;
  readonly hasPreviousCard: boolean;
  readonly hasNextCard: boolean;
  readonly hasPreviousBookmark: boolean;
  readonly hasNextBookmark: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly hasProblems: boolean;
  readonly filing: boolean;
  readonly hasFocusedCard: boolean;
  readonly focusedCardFiled: boolean;
  readonly focusedCardUnfiled: boolean;
  readonly focusedSurface: "deck" | "desk" | "viewed" | null;
  readonly canMoveDeskCardLeft: boolean;
  readonly canMoveDeskCardRight: boolean;
  readonly hasExpandedPiles: boolean;
  readonly hasFiledDeskCards: boolean;
}

export function trayToggleLabel(
  inTray: boolean,
): "Return from Desk" | "Put on Desk" {
  return inTray ? "Return from Desk" : "Put on Desk";
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
    case "find-address-forward":
    case "find-address-backward":
    case "find-address-first":
      return context.hasActiveCard;
    case "open-note":
    case "edit-card":
    case "delete-card":
      return context.hasFocusedCard;
    case "copy-link":
    case "toggle-tray":
    case "toggle-bookmark":
    case "pull-into-pile":
      return context.focusedCardFiled;
    case "show-card-in-deck":
      return context.focusedCardFiled && context.focusedSurface !== "deck";
    case "toggle-viewed-card":
      return context.focusedSurface === "desk" || context.focusedSurface === "viewed";
    case "file-card":
      return context.focusedCardUnfiled && context.focusedSurface !== "deck";
    case "move-desk-card-left":
      return context.canMoveDeskCardLeft;
    case "move-desk-card-right":
      return context.canMoveDeskCardRight;
    case "collapse-all-piles":
      return context.hasExpandedPiles;
    case "return-all-filed-cards":
      return context.hasFiledDeskCards;
    case "first-card":
    case "last-card":
      return context.hasActiveCard;
    case "back":
      return context.canGoBack;
    case "forward":
      return context.canGoForward;
    case "problems":
      return context.hasProblems;
    case "confirm-filing":
      return context.filing;
    case "cancel-filing":
      return context.filing;
    case "bookmarks":
    case "toggle-toolbar":
    case "toggle-deck-map":
      return true;
  }
}
