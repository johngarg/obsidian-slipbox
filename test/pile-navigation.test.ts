import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cyclePileFocusTarget,
  pileFocusLocationForSwap,
  rememberPileFocus,
  swapPileFocusTarget,
  wrappedPileCardNeighbour,
  type PileFocusLocation,
  type PileNavigationDirection,
} from "../src/pile-navigation.js";

const deck = (): PileFocusLocation => ({ surface: "deck" });
const pile = (pileId: string): PileFocusLocation => ({ surface: "desk", pileId });

describe("pile focus cycling", () => {
  test("has no target without Desk piles", () => {
    assert.equal(cyclePileFocusTarget([], deck(), true, 1), null);
    assert.equal(cyclePileFocusTarget([], deck(), false, -1), null);
  });

  test("cycles through one pile and the Deck in both directions", () => {
    assert.deepEqual(cyclePileFocusTarget(["one"], deck(), true, 1), pile("one"));
    assert.deepEqual(cyclePileFocusTarget(["one"], pile("one"), true, 1), deck());
    assert.deepEqual(cyclePileFocusTarget(["one"], deck(), true, -1), pile("one"));
    assert.deepEqual(cyclePileFocusTarget(["one"], pile("one"), true, -1), deck());
  });

  test("cycles through several piles and wraps across the Deck", () => {
    const ids = ["one", "two", "three"];
    assert.deepEqual(cyclePileFocusTarget(ids, deck(), true, 1), pile("one"));
    assert.deepEqual(cyclePileFocusTarget(ids, pile("one"), true, 1), pile("two"));
    assert.deepEqual(cyclePileFocusTarget(ids, pile("three"), true, 1), deck());
    assert.deepEqual(cyclePileFocusTarget(ids, deck(), true, -1), pile("three"));
    assert.deepEqual(cyclePileFocusTarget(ids, pile("one"), true, -1), deck());
  });

  test("makes forward and backward exact inverses at every position", () => {
    const ids = ["one", "two", "three"];
    const positions = [deck(), ...ids.map(pile)];
    for (const position of positions) {
      for (const direction of [-1, 1] as const satisfies readonly PileNavigationDirection[]) {
        const moved = cyclePileFocusTarget(ids, position, true, direction);
        assert.notEqual(moved, null);
        assert.deepEqual(
          cyclePileFocusTarget(ids, moved, true, direction === 1 ? -1 : 1),
          position,
        );
      }
    }
  });

  test("skips an empty Deck and wraps among piles only", () => {
    const ids = ["one", "two", "three"];
    assert.deepEqual(cyclePileFocusTarget(ids, pile("one"), false, -1), pile("three"));
    assert.deepEqual(cyclePileFocusTarget(ids, pile("three"), false, 1), pile("one"));
    assert.deepEqual(cyclePileFocusTarget(["one"], pile("one"), false, 1), pile("one"));
  });
});

describe("Deck and remembered-pile swapping", () => {
  test("treats a Deck-origin viewed card as the Deck side of a round trip", () => {
    const viewedOrigin = pileFocusLocationForSwap(
      { surface: "viewed" },
      "deck",
    );
    assert.deepEqual(viewedOrigin, deck());
    if (viewedOrigin === null) {
      assert.fail("expected Deck-origin viewed focus to resolve");
    }
    assert.deepEqual(
      swapPileFocusTarget(["one", "two"], viewedOrigin, null, true),
      pile("one"),
    );
    const deskTarget = swapPileFocusTarget(
      ["one", "two"],
      viewedOrigin,
      "two",
      true,
    );
    assert.deepEqual(deskTarget, pile("two"));
    if (deskTarget === null) {
      assert.fail("expected the remembered pile");
    }
    assert.deepEqual(
      swapPileFocusTarget(["one", "two"], deskTarget, "two", true),
      deck(),
    );
  });

  test("keeps Desk-origin viewed focus on its pile", () => {
    assert.deepEqual(
      pileFocusLocationForSwap(
        { surface: "viewed", pileId: "two" },
        "desk",
      ),
      pile("two"),
    );
  });

  test("uses the sole pile without focus history", () => {
    assert.deepEqual(swapPileFocusTarget(["one"], deck(), null, true), pile("one"));
  });

  test("defaults to the first of several piles without focus history", () => {
    assert.deepEqual(
      swapPileFocusTarget(["one", "two"], deck(), null, true),
      pile("one"),
    );
  });

  test("uses a valid remembered pile and falls back from a stale one", () => {
    const ids = ["one", "two", "three"];
    assert.deepEqual(swapPileFocusTarget(ids, deck(), "two", true), pile("two"));
    assert.deepEqual(swapPileFocusTarget(ids, deck(), "gone", true), pile("one"));
  });

  test("returns from a pile to the Deck only when a Deck target exists", () => {
    assert.deepEqual(swapPileFocusTarget(["one"], pile("one"), "one", true), deck());
    assert.equal(swapPileFocusTarget(["one"], pile("one"), "one", false), null);
  });

  test("remembers a cycled-to pile for a subsequent swap", () => {
    const ids = ["one", "two"];
    const landed = cyclePileFocusTarget(ids, deck(), true, 1);
    if (landed === null) {
      assert.fail("expected cycling to land on a pile");
    }
    const remembered = rememberPileFocus(null, landed);
    const returned = swapPileFocusTarget(ids, landed, remembered, true);
    assert.deepEqual(returned, deck());
    assert.deepEqual(swapPileFocusTarget(ids, deck(), remembered, true), pile("one"));
  });
});

describe("within-pile focus", () => {
  const cards = {
    cards: ["A.md", "B.md", "C.md"].map((cardRef) => ({ cardRef })),
  };

  test("moves in either direction and wraps at both ends", () => {
    assert.equal(wrappedPileCardNeighbour(cards, "B.md", -1), "A.md");
    assert.equal(wrappedPileCardNeighbour(cards, "B.md", 1), "C.md");
    assert.equal(wrappedPileCardNeighbour(cards, "A.md", -1), "C.md");
    assert.equal(wrappedPileCardNeighbour(cards, "C.md", 1), "A.md");
  });

  test("keeps a single-card pile stable and rejects an unknown card", () => {
    const singleton = { cards: [{ cardRef: "Only.md" }] };
    assert.equal(wrappedPileCardNeighbour(singleton, "Only.md", -1), "Only.md");
    assert.equal(wrappedPileCardNeighbour(singleton, "Only.md", 1), "Only.md");
    assert.equal(wrappedPileCardNeighbour(singleton, "Missing.md", 1), null);
    assert.equal(wrappedPileCardNeighbour({ cards: [] }, "Missing.md", 1), null);
  });
});
