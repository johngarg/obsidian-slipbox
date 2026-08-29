import { applyCardColor, type CardColor } from "./card-color.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

export interface DeckMapMarkerCard {
  readonly path: string;
  readonly position: number;
  readonly color: CardColor | null;
  readonly onDesk: boolean;
}

/**
 * Own the Deck-map dot and bookmark layers without sharing their primitives.
 *
 * Sampled and coloured dots persist independently of bookmark state. A
 * bookmark outside the sampled set receives an exact neutral or card-coloured
 * dot for as long as the ring exists.
 */
export class DeckMapMarkerRenderer {
  private readonly dotEls = new Map<string, HTMLElement>();
  private readonly bookmarkOnlyDotPaths = new Set<string>();

  constructor(
    private readonly dotLayer: HTMLElement,
    private readonly bookmarkLayer: HTMLElement,
  ) {}

  render(
    cards: readonly DeckMapMarkerCard[],
    sampledIndices: Iterable<number>,
    bookmarkedPaths: ReadonlySet<string>,
  ): number {
    this.dotLayer.replaceChildren();
    this.bookmarkLayer.replaceChildren();
    this.dotEls.clear();
    this.bookmarkOnlyDotPaths.clear();

    const sampled = new Set(sampledIndices);
    for (const [index, card] of cards.entries()) {
      if (!sampled.has(index) && card.color === null) {
        continue;
      }
      this.appendDot(card);
    }

    return this.updateBookmarks(cards, bookmarkedPaths);
  }

  updateBookmarks(
    cards: readonly DeckMapMarkerCard[],
    bookmarkedPaths: ReadonlySet<string>,
  ): number {
    const resolvedPaths = new Set<string>();
    for (const card of cards) {
      if (bookmarkedPaths.has(card.path)) {
        resolvedPaths.add(card.path);
      }
    }

    for (const path of this.bookmarkOnlyDotPaths) {
      if (resolvedPaths.has(path)) {
        continue;
      }
      this.dotEls.get(path)?.remove();
      this.dotEls.delete(path);
      this.bookmarkOnlyDotPaths.delete(path);
    }

    // The bookmark layer contains rings only, so replace every child rather
    // than relying on a separate cache of rendered elements.
    this.bookmarkLayer.replaceChildren();
    let ringCount = 0;
    for (const card of cards) {
      if (!resolvedPaths.has(card.path)) {
        continue;
      }
      if (!this.dotEls.has(card.path)) {
        this.appendDot(card);
        this.bookmarkOnlyDotPaths.add(card.path);
      }
      this.bookmarkLayer.append(this.createRing(card));
      ringCount += 1;
    }
    return ringCount;
  }

  private appendDot(card: DeckMapMarkerCard): void {
    const marker = this.createSpan();
    marker.className = "slipbox-deck-map-marker";
    marker.dataset.slipboxDeckMapPath = card.path;
    marker.classList.toggle("is-colored", card.color !== null);
    marker.classList.toggle("is-on-desk", card.onDesk);
    applyCardColor(marker, card.color);
    marker.style.setProperty(
      "--slipbox-deck-map-position",
      String(card.position),
    );
    this.dotLayer.append(marker);
    this.dotEls.set(card.path, marker);
  }

  private createRing(card: DeckMapMarkerCard): HTMLElement {
    const ring = this.createSpan();
    ring.className = "slipbox-deck-map-bookmark-ring";
    ring.dataset.slipboxDeckMapPath = card.path;
    ring.style.setProperty(
      "--slipbox-deck-map-position",
      String(card.position),
    );
    return ring;
  }

  private createSpan(): HTMLElement {
    return this.dotLayer.ownerDocument.createElementNS(
      HTML_NAMESPACE,
      "span",
    );
  }
}
