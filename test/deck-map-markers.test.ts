import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  DeckMapMarkerRenderer,
  type DeckMapMarkerCard,
} from "../src/deck-map-markers.js";

const CARDS: readonly DeckMapMarkerCard[] = [
  { path: "ordinary.md", position: 0.25, color: null, onDesk: false },
  { path: "coloured.md", position: 0.75, color: "purple", onDesk: false },
];

function subject() {
  const window = new Window();
  const document = window.document as unknown as Document;
  const dotLayer = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  );
  const bookmarkLayer = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  );
  document.body.append(dotLayer, bookmarkLayer);
  return {
    dotLayer,
    bookmarkLayer,
    renderer: new DeckMapMarkerRenderer(dotLayer, bookmarkLayer),
  };
}

describe("Deck-map marker DOM", () => {
  test("bookmark transitions retain ordinary and coloured dot presentation", () => {
    const value = subject();
    assert.equal(value.renderer.render(CARDS, [0, 1], new Set()), 0);

    const ordinary = deckMapMarker(value.dotLayer, "ordinary.md");
    const coloured = deckMapMarker(value.dotLayer, "coloured.md");
    assert.ok(ordinary);
    assert.ok(coloured);
    assert.equal(ordinary.className, "slipbox-deck-map-marker");
    assert.equal(ordinary.dataset.slipboxCardColor, undefined);
    assert.equal(coloured.className, "slipbox-deck-map-marker is-colored");
    assert.equal(coloured.dataset.slipboxCardColor, "purple");

    assert.equal(
      value.renderer.updateBookmarks(
        CARDS,
        new Set(["ordinary.md", "coloured.md"]),
      ),
      2,
    );
    assert.equal(deckMapMarker(value.dotLayer, "ordinary.md"), ordinary);
    assert.equal(deckMapMarker(value.dotLayer, "coloured.md"), coloured);
    assert.equal(ordinary.className, "slipbox-deck-map-marker");
    assert.equal(ordinary.style.background, "");
    assert.equal(coloured.className, "slipbox-deck-map-marker is-colored");
    assert.equal(coloured.dataset.slipboxCardColor, "purple");
    assert.equal(coloured.style.background, "");

    const rings = bookmarkRings(value.bookmarkLayer);
    assert.equal(rings.length, 2);
    for (const ring of rings) {
      assert.equal(ring.className, "slipbox-deck-map-bookmark-ring");
      assert.equal(ring.classList.contains("slipbox-deck-map-marker"), false);
      assert.equal(ring.classList.contains("is-bookmarked"), false);
      assert.equal(ring.dataset.slipboxCardColor, undefined);
      assert.equal(ring.style.background, "");
    }

    assert.equal(value.renderer.updateBookmarks(CARDS, new Set()), 0);
    assert.equal(deckMapMarker(value.dotLayer, "ordinary.md"), ordinary);
    assert.equal(deckMapMarker(value.dotLayer, "coloured.md"), coloured);
    assert.equal(bookmarkRings(value.bookmarkLayer).length, 0);
  });

  test("cleans untracked legacy filled markers when bookmarks change", () => {
    const value = subject();
    value.renderer.render(CARDS, [0, 1], new Set());
    const legacy = value.bookmarkLayer.ownerDocument.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    );
    legacy.className = "slipbox-deck-map-marker is-bookmarked";
    value.bookmarkLayer.append(legacy);

    value.renderer.updateBookmarks(CARDS, new Set(["ordinary.md"]));

    assert.equal(legacy.isConnected, false);
    assert.equal(value.bookmarkLayer.children.length, 1);
    assert.equal(
      value.bookmarkLayer.firstElementChild?.className,
      "slipbox-deck-map-bookmark-ring",
    );
  });

  test("uses one exact dot for sampled, coloured, and bookmark-only cards", () => {
    const value = subject();
    const cards: readonly DeckMapMarkerCard[] = [
      { path: "sampled.md", position: 0, color: null, onDesk: false },
      { path: "bookmark-only.md", position: 0.5, color: null, onDesk: false },
      { path: "coloured.md", position: 1, color: "blue", onDesk: false },
    ];
    value.renderer.render(cards, [0], new Set());
    assert.equal(value.dotLayer.children.length, 2);
    assert.equal(deckMapMarker(value.dotLayer, "bookmark-only.md"), undefined);

    value.renderer.updateBookmarks(cards, new Set(["bookmark-only.md"]));
    const bookmarkOnly = deckMapMarker(value.dotLayer, "bookmark-only.md");
    assert.ok(bookmarkOnly);
    assert.equal(bookmarkOnly.className, "slipbox-deck-map-marker");
    assert.equal(value.dotLayer.children.length, 3);
    assert.equal(bookmarkRings(value.bookmarkLayer).length, 1);

    value.renderer.updateBookmarks(cards, new Set());
    assert.equal(bookmarkOnly.isConnected, false);
    assert.equal(deckMapMarker(value.dotLayer, "bookmark-only.md"), undefined);
    assert.equal(value.dotLayer.children.length, 2);
  });

  test("rebuilds card colour while retaining a bookmark ring", () => {
    const value = subject();
    value.renderer.render(CARDS, [0, 1], new Set(["ordinary.md"]));
    const recoloured: readonly DeckMapMarkerCard[] = [
      { ...CARDS[0]!, color: "green" },
      CARDS[1]!,
    ];

    assert.equal(
      value.renderer.render(recoloured, [0, 1], new Set(["ordinary.md"])),
      1,
    );
    const marker = deckMapMarker(value.dotLayer, "ordinary.md");
    assert.ok(marker);
    assert.equal(marker.className, "slipbox-deck-map-marker is-colored");
    assert.equal(marker.dataset.slipboxCardColor, "green");
    assert.equal(bookmarkRings(value.bookmarkLayer).length, 1);
  });
});

function deckMapMarker(
  layer: HTMLElement,
  path: string,
): HTMLElement | undefined {
  return Array.from(layer.querySelectorAll<HTMLElement>(
    ".slipbox-deck-map-marker",
  )).find((marker) => marker.dataset.slipboxDeckMapPath === path);
}

function bookmarkRings(layer: HTMLElement): readonly HTMLElement[] {
  return Array.from(layer.querySelectorAll<HTMLElement>(
    ".slipbox-deck-map-bookmark-ring",
  ));
}
