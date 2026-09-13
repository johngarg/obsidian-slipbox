import { deckRenderWindow, type DeckRenderTransition } from "./deck-render-window.js";
import type { DeckGeometry } from "./deck-motion.js";
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
import type { DeckPositionMode, DeckPositionTarget, HorizontalDeckPositionMode } from "./deck-position.js";

export interface DeckViewportCard {
  readonly path: string;
}

/** Immutable ordered snapshot; cached identity is held only weakly. */
export type DeckViewportCards = readonly DeckViewportCard[];

export interface DeckRenderWindow {
  readonly start: number;
  readonly end: number;
}

export interface DeckViewportSnapshot {
  readonly anchorPath: string | null;
  readonly anchorOffset: number;
  readonly positionModeOverride: DeckPositionMode | null;
  readonly horizontalPositionModeOverride: HorizontalDeckPositionMode | null;
  readonly renderedWindow: DeckRenderWindow | null;
}

const RENDER_EDGE_BUFFER = 2;

/** Owns Deck navigation state without rendering or scheduling work. */
export class DeckViewport {
  private anchor: string | null = null;
  private offset = 0;
  private mode: DeckPositionMode | null = null;
  private horizontalMode: HorizontalDeckPositionMode | null = null;
  private renderedWindow: DeckRenderWindow | null = null;
  private cachedCards: WeakRef<DeckViewportCards> | null = null;
  private cachedPath: string | null = null;
  private cachedIndex = -1;

  private anchorIndex(cards: DeckViewportCards): number {
    if (this.cachedCards?.deref() === cards && this.cachedPath === this.anchor) {
      return this.cachedIndex;
    }
    const index = cardIndex(cards, this.anchor);
    this.cacheIndex(cards, index);
    return index;
  }

  private cacheIndex(cards: DeckViewportCards, index: number): void {
    if (this.cachedCards?.deref() !== cards) {
      this.cachedCards = new WeakRef(cards);
    }
    this.cachedPath = this.anchor;
    this.cachedIndex = index;
  }

  private invalidateIndex(): void {
    this.cachedCards = null;
    this.cachedPath = null;
    this.cachedIndex = -1;
  }

  get snapshot(): DeckViewportSnapshot {
    return {
      anchorPath: this.anchor,
      anchorOffset: this.offset,
      positionModeOverride: this.mode,
      horizontalPositionModeOverride: this.horizontalMode,
      renderedWindow: this.renderedWindow,
    };
  }

  get anchorPath(): string | null {
    return this.anchor;
  }

  get positionModeOverride(): DeckPositionMode | null {
    return this.mode;
  }

  get horizontalPositionModeOverride(): HorizontalDeckPositionMode | null {
    return this.horizontalMode;
  }

  position(cards: DeckViewportCards): number {
    const anchorIndex = this.anchorIndex(cards);
    return anchorIndex < 0 ? 0 : anchorIndex + this.offset;
  }

  reconcile(cards: DeckViewportCards, resetPosition: boolean): boolean {
    const previousAnchor = this.anchor;
    const anchorIndex = this.anchorIndex(cards);
    if (anchorIndex < 0) {
      this.anchor = cards[0]?.path ?? null;
      this.cacheIndex(cards, this.anchor === null ? -1 : 0);
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
    const index = path === this.anchor ? this.anchorIndex(cards) : cardIndex(cards, path);
    if (index < 0) {
      return false;
    }
    const changed = this.anchor !== path;
    this.anchor = path;
    this.cacheIndex(cards, index);
    this.offset = 0;
    return changed;
  }

  selectWithoutMoving(path: string, cards: DeckViewportCards): boolean {
    const targetIndex = cardIndex(cards, path);
    if (targetIndex < 0) {
      return false;
    }
    return this.selectIndexWithoutMoving(targetIndex, cards);
  }

  private selectIndexWithoutMoving(targetIndex: number, cards: DeckViewportCards): boolean {
    const path = cards[targetIndex]?.path;
    if (path === undefined) {
      return false;
    }
    const previousIndex = this.anchorIndex(cards);
    const changed = this.anchor !== path;
    this.offset = stationarySelectionOffset(
      previousIndex,
      targetIndex,
      this.offset,
    );
    this.anchor = path;
    this.cacheIndex(cards, targetIndex);
    return changed;
  }

  moveBy(delta: number, cards: DeckViewportCards): boolean {
    const anchorIndex = this.anchorIndex(cards);
    const targetIndex = deckIndexByDelta(
      anchorIndex,
      delta,
      cards.length,
    );
    const target = cards[targetIndex];
    return target !== undefined && target.path !== this.anchor
      ? this.selectIndexWithoutMoving(targetIndex, cards)
      : false;
  }

  panTo(position: number, cards: DeckViewportCards): boolean {
    const previousIndex = this.anchorIndex(cards);
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
    this.cacheIndex(cards, anchorIndex);
    this.offset = viewportPosition - anchorIndex;
    return changed;
  }

  placeAt(position: number, cards: DeckViewportCards): void {
    const anchorIndex = this.anchorIndex(cards);
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
    this.placeAt(this.anchorIndex(cards), cards);
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
    this.invalidateIndex();
    return true;
  }

  deletePath(deletedPath: string): boolean {
    if (this.anchor === null || !pathIsAtOrBelow(this.anchor, deletedPath)) {
      return false;
    }
    this.anchor = null;
    this.invalidateIndex();
    this.offset = 0;
    return true;
  }

  setPositionMode(target: DeckPositionTarget): void {
    if (target === "left" || target === "right" || target === "centered") {
      this.horizontalMode = target;
    }
    if (target === "top" || target === "bottom" || target === "centered") {
      this.mode = target;
    }
  }

  recordRenderedWindow(
    cards: DeckViewportCards,
    geometry: DeckGeometry,
    transition?: DeckRenderTransition,
  ): DeckRenderWindow | null {
    const anchorIndex = this.anchorIndex(cards);
    if (anchorIndex < 0 || cards.length === 0) {
      this.renderedWindow = null;
      return null;
    }
    this.renderedWindow = deckRenderWindow(cards.length, geometry, transition);
    return this.renderedWindow;
  }

  needsRenderWindowRefresh(cards: DeckViewportCards): boolean {
    const rendered = this.renderedWindow;
    const anchorIndex = this.anchorIndex(cards);
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
    this.invalidateIndex();
    this.offset = 0;
    this.mode = null;
    this.horizontalMode = null;
    this.renderedWindow = null;
  }
}

function cardIndex(cards: DeckViewportCards, path: string | null): number {
  return path === null
    ? -1
    : cards.findIndex((card) => card.path === path);
}
