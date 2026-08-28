import {
  activeIndexForViewport,
  clampViewportPosition,
  deckIndexByDelta,
  stationarySelectionOffset,
} from "./deck-motion.js";
import {
  pathIsAtOrBelow,
  renamePathReference,
} from "./path-reference.js";
import type { DeckPositionMode } from "./workspace-layout.js";

export interface DeckViewportCard {
  readonly path: string;
}

/** Ordered card records read for one operation and never retained. */
export type DeckViewportCards = readonly DeckViewportCard[];

export interface DeckRenderWindow {
  readonly start: number;
  readonly end: number;
}

export interface DeckViewportSnapshot {
  readonly anchorPath: string | null;
  readonly anchorOffset: number;
  readonly positionModeOverride: DeckPositionMode | null;
  readonly renderedWindow: DeckRenderWindow | null;
}

const RENDER_EDGE_BUFFER = 2;

/** Owns Deck navigation state without rendering or scheduling work. */
export class DeckViewport {
  private anchor: string | null = null;
  private offset = 0;
  private mode: DeckPositionMode | null = null;
  private renderedWindow: DeckRenderWindow | null = null;

  get snapshot(): DeckViewportSnapshot {
    return {
      anchorPath: this.anchor,
      anchorOffset: this.offset,
      positionModeOverride: this.mode,
      renderedWindow: this.renderedWindow,
    };
  }

  get anchorPath(): string | null {
    return this.anchor;
  }

  get positionModeOverride(): DeckPositionMode | null {
    return this.mode;
  }

  position(cards: DeckViewportCards): number {
    const anchorIndex = cardIndex(cards, this.anchor);
    return anchorIndex < 0 ? 0 : anchorIndex + this.offset;
  }

  reconcile(cards: DeckViewportCards, resetPosition: boolean): boolean {
    const previousAnchor = this.anchor;
    const anchorIndex = cardIndex(cards, this.anchor);
    if (anchorIndex < 0) {
      this.anchor = cards[0]?.path ?? null;
      this.offset = 0;
      if (this.anchor === null) {
        this.renderedWindow = null;
      }
      return this.anchor !== previousAnchor;
    }

    if (resetPosition) {
      this.offset = 0;
    } else {
      const position = clampViewportPosition(
        anchorIndex + this.offset,
        cards.length,
      );
      this.offset = position - anchorIndex;
    }
    return false;
  }

  navigate(path: string, cards: DeckViewportCards): boolean {
    if (cardIndex(cards, path) < 0) {
      return false;
    }
    const changed = this.anchor !== path;
    this.anchor = path;
    this.offset = 0;
    return changed;
  }

  selectWithoutMoving(path: string, cards: DeckViewportCards): boolean {
    const targetIndex = cardIndex(cards, path);
    if (targetIndex < 0) {
      return false;
    }
    const previousIndex = cardIndex(cards, this.anchor);
    const changed = this.anchor !== path;
    this.offset = stationarySelectionOffset(
      previousIndex,
      targetIndex,
      this.offset,
    );
    this.anchor = path;
    return changed;
  }

  moveBy(delta: number, cards: DeckViewportCards): boolean {
    const anchorIndex = cardIndex(cards, this.anchor);
    const targetIndex = deckIndexByDelta(
      anchorIndex,
      delta,
      cards.length,
    );
    const target = cards[targetIndex];
    return target !== undefined && target.path !== this.anchor
      ? this.selectWithoutMoving(target.path, cards)
      : false;
  }

  panTo(position: number, cards: DeckViewportCards): boolean {
    const previousIndex = cardIndex(cards, this.anchor);
    if (previousIndex < 0) {
      return false;
    }
    const viewportPosition = clampViewportPosition(
      position,
      cards.length,
    );
    const anchorIndex = activeIndexForViewport(
      viewportPosition,
      previousIndex,
      cards.length,
    );
    const anchor = cards[anchorIndex];
    if (anchor === undefined) {
      return false;
    }
    const changed = anchor.path !== this.anchor;
    this.anchor = anchor.path;
    this.offset = viewportPosition - anchorIndex;
    return changed;
  }

  placeAt(position: number, cards: DeckViewportCards): void {
    const anchorIndex = cardIndex(cards, this.anchor);
    if (anchorIndex < 0) {
      this.offset = 0;
      return;
    }
    this.offset = clampViewportPosition(
      position,
      cards.length,
    ) - anchorIndex;
  }

  centre(cards: DeckViewportCards): void {
    this.placeAt(cardIndex(cards, this.anchor), cards);
  }

  renamePath(oldPath: string, newPath: string): boolean {
    if (this.anchor === null) {
      return false;
    }
    const renamed = renamePathReference(this.anchor, oldPath, newPath);
    if (renamed === this.anchor) {
      return false;
    }
    this.anchor = renamed;
    return true;
  }

  deletePath(deletedPath: string): boolean {
    if (this.anchor === null || !pathIsAtOrBelow(this.anchor, deletedPath)) {
      return false;
    }
    this.anchor = null;
    this.offset = 0;
    return true;
  }

  setPositionMode(mode: DeckPositionMode): void {
    this.mode = mode;
  }

  recordRenderedWindow(
    cards: DeckViewportCards,
    cardSpread: number,
  ): DeckRenderWindow | null {
    const anchorIndex = cardIndex(cards, this.anchor);
    if (anchorIndex < 0 || cards.length === 0) {
      this.renderedWindow = null;
      return null;
    }
    const viewportIndex = Math.round(anchorIndex + this.offset);
    const radius = Math.min(
      8,
      Math.max(3, Math.ceil(1 / cardSpread) + 2),
    );
    this.renderedWindow = {
      start: Math.max(0, viewportIndex - radius),
      end: Math.min(cards.length - 1, viewportIndex + radius),
    };
    return this.renderedWindow;
  }

  needsRenderWindowRefresh(cards: DeckViewportCards): boolean {
    const rendered = this.renderedWindow;
    const anchorIndex = cardIndex(cards, this.anchor);
    if (rendered === null || anchorIndex < 0) {
      return false;
    }
    const viewportIndex = Math.round(anchorIndex + this.offset);
    return (
      rendered.start > 0 &&
      viewportIndex <= rendered.start + RENDER_EDGE_BUFFER
    ) || (
      rendered.end < cards.length - 1 &&
      viewportIndex >= rendered.end - RENDER_EDGE_BUFFER
    );
  }

  reset(): void {
    this.anchor = null;
    this.offset = 0;
    this.mode = null;
    this.renderedWindow = null;
  }
}

function cardIndex(cards: DeckViewportCards, path: string | null): number {
  return path === null
    ? -1
    : cards.findIndex((card) => card.path === path);
}
