import type { DeckAction } from "./settings.js";

export interface DeckActionContext {
  readonly hasActiveCard: boolean;
  readonly hasPreviousCard: boolean;
  readonly hasNextCard: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly hasProblems: boolean;
  readonly filing: boolean;
}

export function trayToggleLabel(
  inTray: boolean,
): "Return" | "Pull out" {
  return inTray ? "Return" : "Pull out";
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
    case "centre-card":
    case "open-note":
    case "add-card":
    case "toggle-tray":
    case "toggle-bookmark":
      return context.hasActiveCard;
    case "first-card":
    case "last-card":
      return context.hasActiveCard;
    case "back":
      return context.canGoBack;
    case "forward":
      return context.canGoForward;
    case "problems":
      return context.hasProblems;
    case "file-here":
      return context.filing && context.hasActiveCard;
    case "cancel-filing":
      return context.filing;
    case "entry-points":
    case "bookmarks":
    case "new-section":
      return true;
  }
}
