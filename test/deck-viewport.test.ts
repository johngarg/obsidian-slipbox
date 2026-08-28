import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DeckViewport,
  type DeckViewportCards,
} from "../src/deck-viewport.js";

function cards(...paths: string[]): DeckViewportCards {
  return paths.map((path) => ({ path }));
}

const TEN_CARDS = cards(
  "0.md",
  "1.md",
  "2.md",
  "3.md",
  "4.md",
  "5.md",
  "6.md",
  "7.md",
  "8.md",
  "9.md",
);

describe("DeckViewport", () => {
  test("starts empty, reconciles to the first card, and resets", () => {
    const viewport = new DeckViewport();
    assert.deepEqual(viewport.snapshot, {
      anchorPath: null,
      anchorOffset: 0,
      positionModeOverride: null,
      renderedWindow: null,
    });

    assert.equal(viewport.reconcile(cards(), false), false);
    assert.equal(viewport.reconcile(TEN_CARDS, false), true);
    assert.equal(viewport.anchorPath, "0.md");
    assert.equal(viewport.position(TEN_CARDS), 0);

    viewport.setPositionMode("lowered");
    assert.equal(viewport.snapshot.positionModeOverride, "lowered");
    viewport.recordRenderedWindow(TEN_CARDS, 1);
    viewport.reset();
    assert.deepEqual(viewport.snapshot, {
      anchorPath: null,
      anchorOffset: 0,
      positionModeOverride: null,
      renderedWindow: null,
    });
  });

  test("navigates to available cards and rejects missing paths", () => {
    const viewport = new DeckViewport();
    viewport.reconcile(TEN_CARDS, false);

    assert.equal(viewport.navigate("4.md", TEN_CARDS), true);
    assert.equal(viewport.anchorPath, "4.md");
    assert.equal(viewport.position(TEN_CARDS), 4);
    assert.equal(viewport.navigate("missing.md", TEN_CARDS), false);
    assert.equal(viewport.anchorPath, "4.md");
  });

  test("selects another anchor without moving the physical viewport", () => {
    const viewport = new DeckViewport();
    viewport.navigate("4.md", TEN_CARDS);
    viewport.placeAt(2.75, TEN_CARDS);

    assert.equal(viewport.selectWithoutMoving("2.md", TEN_CARDS), true);
    assert.equal(viewport.anchorPath, "2.md");
    assert.equal(viewport.position(TEN_CARDS), 2.75);
    assert.equal(viewport.snapshot.anchorOffset, 0.75);
  });

  test("moves the anchor discretely, clamps boundaries, then centres", () => {
    const viewport = new DeckViewport();
    viewport.navigate("4.md", TEN_CARDS);
    viewport.placeAt(3.5, TEN_CARDS);

    assert.equal(viewport.moveBy(2, TEN_CARDS), true);
    assert.equal(viewport.anchorPath, "6.md");
    assert.equal(viewport.position(TEN_CARDS), 3.5);
    viewport.centre(TEN_CARDS);
    assert.equal(viewport.position(TEN_CARDS), 6);

    assert.equal(viewport.moveBy(20, TEN_CARDS), true);
    assert.equal(viewport.anchorPath, "9.md");
    assert.equal(viewport.moveBy(1, TEN_CARDS), false);
    assert.equal(viewport.anchorPath, "9.md");
  });

  test("pans continuously with clamping and anchor hysteresis", () => {
    const viewport = new DeckViewport();
    viewport.navigate("0.md", TEN_CARDS);

    assert.equal(viewport.panTo(0.55, TEN_CARDS), false);
    assert.equal(viewport.anchorPath, "0.md");
    assert.equal(viewport.panTo(0.57, TEN_CARDS), true);
    assert.equal(viewport.anchorPath, "1.md");
    assert.equal(viewport.panTo(0.45, TEN_CARDS), false);
    assert.equal(viewport.anchorPath, "1.md");
    assert.equal(viewport.panTo(0.43, TEN_CARDS), true);
    assert.equal(viewport.anchorPath, "0.md");

    assert.equal(viewport.panTo(7.8, TEN_CARDS), true);
    assert.equal(viewport.anchorPath, "8.md");
    viewport.panTo(40, TEN_CARDS);
    assert.equal(viewport.anchorPath, "9.md");
    assert.equal(viewport.position(TEN_CARDS), 9);
  });

  test("places animation frames without changing the anchor", () => {
    const viewport = new DeckViewport();
    viewport.navigate("6.md", TEN_CARDS);

    viewport.placeAt(3.25, TEN_CARDS);
    assert.equal(viewport.anchorPath, "6.md");
    assert.equal(viewport.position(TEN_CARDS), 3.25);
    viewport.placeAt(-10, TEN_CARDS);
    assert.equal(viewport.anchorPath, "6.md");
    assert.equal(viewport.position(TEN_CARDS), 0);
  });

  test("preserves ordinary refreshes and resets ordering changes", () => {
    const viewport = new DeckViewport();
    viewport.navigate("4.md", TEN_CARDS);
    viewport.placeAt(4.75, TEN_CARDS);
    const inserted = cards(
      "new.md",
      ...TEN_CARDS.map((card) => card.path),
    );

    assert.equal(viewport.reconcile(inserted, false), false);
    assert.equal(viewport.anchorPath, "4.md");
    assert.equal(viewport.position(inserted), 5.75);
    viewport.reconcile(inserted, true);
    assert.equal(viewport.position(inserted), 5);

    const withoutAnchor = cards("7.md", "8.md");
    assert.equal(viewport.reconcile(withoutAnchor, false), true);
    assert.equal(viewport.anchorPath, "7.md");
    assert.equal(viewport.position(withoutAnchor), 0);
    assert.equal(viewport.reconcile(cards(), false), true);
    assert.equal(viewport.anchorPath, null);

    viewport.navigate("4.md", TEN_CARDS);
    viewport.selectWithoutMoving("0.md", TEN_CARDS);
    const shortened = cards("0.md", "1.md");
    viewport.reconcile(shortened, false);
    assert.equal(viewport.anchorPath, "0.md");
    assert.equal(viewport.position(shortened), 1);
  });

  test("follows renames and clears an anchor affected by deletion", () => {
    const viewport = new DeckViewport();
    const original = cards("Cards/one.md", "Cards/two.md");
    viewport.navigate("Cards/one.md", original);

    assert.equal(viewport.renamePath("Other", "Archive"), false);
    assert.equal(
      viewport.renamePath("Cards/one.md", "Cards/renamed.md"),
      true,
    );
    assert.equal(viewport.anchorPath, "Cards/renamed.md");
    assert.equal(viewport.renamePath("Cards", "Archive"), true);
    assert.equal(viewport.anchorPath, "Archive/renamed.md");
    assert.equal(viewport.deletePath("Other"), false);
    assert.equal(viewport.deletePath("Archive"), true);
    assert.equal(viewport.anchorPath, null);
    assert.equal(viewport.snapshot.anchorOffset, 0);
  });

  test("records bounded render windows for varied card spreads", () => {
    const paths = Array.from({ length: 24 }, (_, index) => `${index}.md`);
    const deck = cards(...paths);
    const viewport = new DeckViewport();
    viewport.navigate("10.md", deck);

    assert.deepEqual(viewport.recordRenderedWindow(deck, 1), {
      start: 7,
      end: 13,
    });
    assert.deepEqual(viewport.recordRenderedWindow(deck, 0.2), {
      start: 3,
      end: 17,
    });
    assert.deepEqual(viewport.recordRenderedWindow(deck, 0.05), {
      start: 2,
      end: 18,
    });

    viewport.navigate("0.md", deck);
    assert.deepEqual(viewport.recordRenderedWindow(deck, 1), {
      start: 0,
      end: 3,
    });
    viewport.navigate("23.md", deck);
    assert.deepEqual(viewport.recordRenderedWindow(deck, 1), {
      start: 20,
      end: 23,
    });
  });

  test("requests a new render window only near a mounted edge", () => {
    const paths = Array.from({ length: 24 }, (_, index) => `${index}.md`);
    const deck = cards(...paths);
    const viewport = new DeckViewport();
    viewport.navigate("10.md", deck);
    viewport.recordRenderedWindow(deck, 1);

    assert.equal(viewport.needsRenderWindowRefresh(deck), false);
    viewport.placeAt(9, deck);
    assert.equal(viewport.needsRenderWindowRefresh(deck), true);
    viewport.placeAt(10, deck);
    assert.equal(viewport.needsRenderWindowRefresh(deck), false);
    viewport.placeAt(11, deck);
    assert.equal(viewport.needsRenderWindowRefresh(deck), true);
  });
});
