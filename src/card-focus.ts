export type CardFocusSurface = "deck" | "desk" | "viewed";

export interface CardFocus {
  readonly surface: CardFocusSurface;
  readonly path: string;
  readonly pileId?: string;
}

export function deckCardFocus(path: string): CardFocus {
  return { surface: "deck", path };
}

export function deskCardFocus(path: string, pileId: string): CardFocus {
  return { surface: "desk", path, pileId };
}

export function viewedCardFocus(path: string, pileId?: string): CardFocus {
  return pileId === undefined
    ? { surface: "viewed", path }
    : { surface: "viewed", path, pileId };
}

/** Redirect focus from either placeholder to the card's viewed presentation. */
export function redirectViewedCardGhostFocus(
  focus: CardFocus | null,
  viewedPath: string | null,
  viewedPileId?: string,
): CardFocus | null {
  if (
    focus === null ||
    viewedPath === null ||
    focus.path !== viewedPath
  ) {
    return focus;
  }
  if (focus.surface === "viewed" && focus.pileId === viewedPileId) {
    return focus;
  }
  return viewedCardFocus(viewedPath, viewedPileId);
}

export function moveDeckFocusWithAnchor(
  focus: CardFocus | null,
  path: string,
): CardFocus | null {
  return focus?.surface === "deck" ? deckCardFocus(path) : focus;
}

export function renameCardFocus(
  focus: CardFocus | null,
  oldPath: string,
  newPath: string,
): CardFocus | null {
  if (focus === null) {
    return null;
  }
  if (focus.path === oldPath) {
    return { ...focus, path: newPath };
  }
  const prefix = `${oldPath.replace(/\/$/, "")}/`;
  return focus.path.startsWith(prefix)
    ? { ...focus, path: `${newPath}${focus.path.slice(oldPath.length)}` }
    : focus;
}

export function cardFocusDeleted(
  focus: CardFocus | null,
  deletedPath: string,
): boolean {
  if (focus === null) {
    return false;
  }
  const prefix = `${deletedPath.replace(/\/$/, "")}/`;
  return focus.path === deletedPath || focus.path.startsWith(prefix);
}
