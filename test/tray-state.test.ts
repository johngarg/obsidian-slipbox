import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EMPTY_TRAY,
  addUniqueCardToPile,
  cardPosition,
  collapseAllPiles,
  clearFiledCardsFromPile,
  clearFiledCardsFromTray,
  createPile,
  cyclePileTopCard,
  deskCardPrimaryClickIntent,
  initialTrayFromUnfiled,
  insertionIndexForPoint,
  mergePiles,
  moveCardBetweenPiles,
  moveCardWithinPile,
  placeUnfiledCardAtPosition,
  placeFiledCardInPileOrdinal,
  pruneTrayCards,
  reconcileTray,
  removeCard,
  removeTrayPath,
  renameTrayPath,
  reorderPiles,
  setPilePosition,
  setPileExpanded,
  splitCardIntoNewPile,
  toggleFiledCard,
  trayHasFiledCards,
  trayStackJitter,
  type TrayCard,
  type TrayCardCandidate,
  type TrayState,
} from "../src/tray-state.js";

const unfiled = (cardRef: string, modifiedTime = 0): TrayCardCandidate => ({
  cardRef,
  kind: "unfiled",
  modifiedTime,
});
const filed = (cardRef: string): TrayCard => ({ cardRef, kind: "filed" });

function tray(...piles: readonly TrayCard[][]): TrayState {
  return {
    piles: piles.map((cards, index) => ({ id: `pile-${index + 1}`, cards })),
    expandedPileIds: [],
    unfiledPileId: piles.length > 0 ? "pile-1" : null,
  };
}

describe("working piles", () => {
  test("uses primary clicks only for focus or collapsed-pile expansion", () => {
    assert.equal(deskCardPrimaryClickIntent(true), "focus-only");
    assert.equal(deskCardPrimaryClickIntent(false), "expand-pile");
  });

  test("constructs one deterministic newest-first pile from unfiled cards", () => {
    const state = initialTrayFromUnfiled([
      unfiled("B.md", 20),
      unfiled("C.md", 30),
      unfiled("A.md", 20),
    ], "startup");
    assert.deepEqual(state, {
      piles: [{
        id: "startup",
        cards: [unfiled("C.md"), unfiled("A.md"), unfiled("B.md")].map(
          ({ cardRef, kind }) => ({ cardRef, kind }),
        ),
      }],
      expandedPileIds: [],
      unfiledPileId: "startup",
    });
  });

  test("creates piles and enforces unique card membership", () => {
    let state = createPile(EMPTY_TRAY, "one", [filed("A.md"), filed("A.md")]);
    state = createPile(state, "two", [filed("A.md"), filed("B.md")]);
    state = addUniqueCardToPile(state, "one", filed("B.md"));
    assert.deepEqual(state.piles.map((pile) => pile.cards.map((card) => card.cardRef)), [
      ["A.md"],
      ["B.md"],
    ]);
  });

  test("places a new unfiled card in its own positioned pile", () => {
    const state = initialTrayFromUnfiled([
      unfiled("Existing.md", 1),
      unfiled("New.md", 2),
    ], "home");
    const next = placeUnfiledCardAtPosition(
      state,
      "New.md",
      "placed",
      { x: 125, y: -48 },
    );

    assert.deepEqual(next.piles, [
      {
        id: "home",
        cards: [{ cardRef: "Existing.md", kind: "unfiled" }],
      },
      {
        id: "placed",
        cards: [{ cardRef: "New.md", kind: "unfiled" }],
        position: { x: 125, y: -48 },
      },
    ]);
    assert.equal(next.unfiledPileId, "home");
  });

  test("pulls into a singleton or the expanded pile and toggles back to Deck", () => {
    let state = toggleFiledCard(EMPTY_TRAY, filed("A.md"), "one");
    state = setPileExpanded(state, "one", true);
    state = toggleFiledCard(state, filed("B.md"), "unused");
    assert.deepEqual(state.piles[0]?.cards.map((card) => card.cardRef), ["A.md", "B.md"]);
    state = toggleFiledCard(state, filed("A.md"), "unused");
    assert.deepEqual(state.piles[0]?.cards.map((card) => card.cardRef), ["B.md"]);
  });

  test("expands piles independently and pulls into the most recently expanded pile", () => {
    let state = tray([filed("A.md")], [filed("B.md")]);
    state = setPileExpanded(state, "pile-1", true);
    state = setPileExpanded(state, "pile-2", true);
    assert.deepEqual(state.expandedPileIds, ["pile-1", "pile-2"]);

    state = toggleFiledCard(state, filed("C.md"), "unused");
    assert.deepEqual(state.piles[1]?.cards.map((card) => card.cardRef), ["B.md", "C.md"]);

    state = setPileExpanded(state, "pile-1", false);
    assert.deepEqual(state.expandedPileIds, ["pile-2"]);
    state = setPileExpanded(state, "pile-2", false);
    assert.deepEqual(state.expandedPileIds, []);
  });

  test("collapses every expanded pile at once", () => {
    let state = tray([filed("A.md")], [filed("B.md")]);
    assert.equal(collapseAllPiles(state), state);
    state = setPileExpanded(state, "pile-1", true);
    state = setPileExpanded(state, "pile-2", true);
    const collapsed = collapseAllPiles(state);
    assert.deepEqual(collapsed.expandedPileIds, []);
    assert.equal(collapsed.piles, state.piles);
  });

  test("moves cards in both directions within a pile", () => {
    const state = tray([filed("A.md"), filed("B.md"), filed("C.md")]);
    const right = moveCardWithinPile(state, "pile-1", 0, 2);
    assert.deepEqual(right.piles[0]?.cards.map((card) => card.cardRef), ["B.md", "C.md", "A.md"]);
    const left = moveCardWithinPile(right, "pile-1", 2, 0);
    assert.deepEqual(left.piles[0]?.cards.map((card) => card.cardRef), ["A.md", "B.md", "C.md"]);
  });

  test("cycles the visible top card in either direction", () => {
    const state = tray([filed("A.md"), filed("B.md"), filed("C.md")]);
    const next = cyclePileTopCard(state, "pile-1", 1);
    assert.deepEqual(next.piles[0]?.cards.map((card) => card.cardRef), [
      "B.md", "C.md", "A.md",
    ]);
    const previous = cyclePileTopCard(next, "pile-1", -1);
    assert.deepEqual(previous.piles[0]?.cards.map((card) => card.cardRef), [
      "A.md", "B.md", "C.md",
    ]);
    assert.equal(cyclePileTopCard(state, "missing", 1), state);
    const singleton = tray([filed("Only.md")]);
    assert.equal(cyclePileTopCard(singleton, "pile-1", 1), singleton);
  });

  test("moves cards between piles and removes an emptied source", () => {
    const state = tray([filed("A.md")], [filed("B.md")]);
    const next = moveCardBetweenPiles(state, "A.md", "pile-2", 0);
    assert.deepEqual(next.piles, [{
      id: "pile-2",
      cards: [filed("A.md"), filed("B.md")],
    }]);
    assert.equal(next.unfiledPileId, null);
  });

  test("adds a filed card to an existing numbered pile without creating one", () => {
    const state = tray([filed("A.md")], [filed("B.md")]);
    const next = placeFiledCardInPileOrdinal(state, "C.md", 2);
    assert.deepEqual(next.piles.map((pile) => pile.cards), [
      [filed("A.md")],
      [filed("B.md"), filed("C.md")],
    ]);
    assert.equal(next.piles.length, 2);
  });

  test("moves a filed card to another numbered pile", () => {
    const state = tray([filed("A.md"), filed("B.md")], [filed("C.md")]);
    const next = placeFiledCardInPileOrdinal(state, "A.md", 2);
    assert.deepEqual(next.piles.map((pile) => pile.cards), [
      [filed("B.md")],
      [filed("C.md"), filed("A.md")],
    ]);
  });

  test("returns the same state when the card is already in the selected pile", () => {
    const state = tray([filed("A.md")], [filed("B.md")]);
    assert.equal(placeFiledCardInPileOrdinal(state, "B.md", 2), state);
  });

  test("rejects empty, zero, fractional, and nonexistent pile ordinals", () => {
    const state = tray([filed("A.md")], [filed("B.md")]);
    assert.equal(placeFiledCardInPileOrdinal(state, "C.md", 0), state);
    assert.equal(placeFiledCardInPileOrdinal(state, "C.md", -1), state);
    assert.equal(placeFiledCardInPileOrdinal(state, "C.md", 1.5), state);
    assert.equal(placeFiledCardInPileOrdinal(state, "C.md", 3), state);
    assert.equal(placeFiledCardInPileOrdinal(state, "", 1), state);
  });

  test("resolves pile ordinals from the current reordered pile sequence", () => {
    const state = reorderPiles(
      tray([filed("A.md")], [filed("B.md")], [filed("C.md")]),
      2,
      0,
    );
    assert.deepEqual(state.piles.map((pile) => pile.id), [
      "pile-3", "pile-1", "pile-2",
    ]);
    const next = placeFiledCardInPileOrdinal(state, "D.md", 1);
    assert.deepEqual(next.piles[0]?.cards, [filed("C.md"), filed("D.md")]);
  });

  test("splits a card into a new pile and maintains positions", () => {
    const state = tray([filed("A.md"), filed("B.md")], [filed("C.md")]);
    const next = splitCardIntoNewPile(state, "B.md", "split");
    assert.deepEqual(next.piles.map((pile) => [
      pile.id,
      pile.cards.map((card) => card.cardRef),
    ]), [
      ["pile-1", ["A.md"]],
      ["split", ["B.md"]],
      ["pile-2", ["C.md"]],
    ]);
    assert.deepEqual(cardPosition(next, "B.md"), {
      pileId: "split",
      pileIndex: 1,
      cardIndex: 0,
      pileSize: 1,
    });
  });

  test("merges piles by appending the source order and reorders piles", () => {
    let state = setPileExpanded(
      tray([filed("A.md")], [filed("B.md"), filed("C.md")], [filed("D.md")]),
      "pile-2",
      true,
    );
    state = setPileExpanded(state, "pile-3", true);
    const merged = mergePiles(state, "pile-2", "pile-1");
    assert.deepEqual(merged.piles[0]?.cards.map((card) => card.cardRef), [
      "A.md", "B.md", "C.md",
    ]);
    assert.deepEqual(merged.expandedPileIds, ["pile-1", "pile-3"]);
    const reordered = reorderPiles(merged, 1, 0);
    assert.deepEqual(reordered.piles.map((pile) => pile.id), ["pile-3", "pile-1"]);
  });

  test("moves a pile within the session workspace without disturbing its cards", () => {
    const state = tray([filed("A.md")], [filed("B.md"), filed("C.md")]);
    const next = setPilePosition(state, "pile-2", { x: 42.5, y: -18 });
    assert.deepEqual(next.piles[1], {
      id: "pile-2",
      cards: [filed("B.md"), filed("C.md")],
      position: { x: 42.5, y: -18 },
    });
    assert.deepEqual(next.piles[0], state.piles[0]);
    assert.equal(
      setPilePosition(next, "pile-2", { x: Number.NaN, y: 0 }),
      next,
    );
  });

  test("returns only filed cards from one pile or all piles", () => {
    const state = tray(
      [filed("A.md"), unfiled("U.md")],
      [filed("B.md")],
      [unfiled("V.md")],
    );
    const one = clearFiledCardsFromPile(state, "pile-1");
    assert.deepEqual(one.piles[0]?.cards.map((card) => card.cardRef), ["U.md"]);
    const all = clearFiledCardsFromTray(state);
    assert.deepEqual(all.piles.map((pile) => pile.cards.map((card) => card.cardRef)), [
      ["U.md"],
      ["V.md"],
    ]);
    assert.equal(trayHasFiledCards(state), true);
    assert.equal(trayHasFiledCards(all), false);
  });

  test("follows exact and descendant renames and deletions", () => {
    const state = tray([
      filed("Folder/A.md"),
      unfiled("Folder/Nested/B.md"),
      filed("Elsewhere.md"),
    ]);
    const renamed = renameTrayPath(state, "Folder", "Cards");
    assert.deepEqual(renamed.piles[0]?.cards.map((card) => card.cardRef), [
      "Cards/A.md", "Cards/Nested/B.md", "Elsewhere.md",
    ]);
    const removed = removeTrayPath(renamed, "Cards/Nested");
    assert.deepEqual(removed.piles[0]?.cards.map((card) => card.cardRef), [
      "Cards/A.md", "Elsewhere.md",
    ]);
  });

  test("prunes ineligible and duplicate cards and removes a newly filed card", () => {
    const state: TrayState = {
      piles: [
        { id: "one", cards: [unfiled("U.md"), filed("A.md"), filed("Gone.md")] },
        { id: "two", cards: [filed("A.md")] },
      ],
      expandedPileIds: ["two"],
      unfiledPileId: "one",
    };
    const next = pruneTrayCards(state, [filed("U.md"), filed("A.md")]);
    assert.deepEqual(next.piles, [{ id: "one", cards: [filed("A.md")] }]);
    assert.deepEqual(next.expandedPileIds, []);
  });

  test("adds newly discovered unfiled cards to the home pile without reordering it", () => {
    const state = initialTrayFromUnfiled([unfiled("Old.md", 1)], "home");
    const next = reconcileTray(state, [
      unfiled("Newest.md", 3),
      unfiled("Middle.md", 2),
      unfiled("Old.md", 1),
    ], "unused");
    assert.deepEqual(next.piles[0]?.cards.map((card) => card.cardRef), [
      "Newest.md", "Middle.md", "Old.md",
    ]);
  });

  test("creates a new unfiled pile after the original has disappeared", () => {
    const withoutHome = removeCard(
      initialTrayFromUnfiled([unfiled("Old.md", 1)], "home"),
      "Old.md",
    );
    const next = reconcileTray(withoutHome, [unfiled("New.md", 2)], "replacement");
    assert.deepEqual(next.piles, [{
      id: "replacement",
      cards: [{ cardRef: "New.md", kind: "unfiled" }],
    }]);
    assert.equal(next.unfiledPileId, "replacement");
  });

  test("calculates insertion gaps from item centres", () => {
    assert.equal(insertionIndexForPoint(5, [10, 20, 30]), 0);
    assert.equal(insertionIndexForPoint(15, [10, 20, 30]), 1);
    assert.equal(insertionIndexForPoint(35, [10, 20, 30]), 3);
  });

  test("gives stacked cards stable, bounded, varied visual jitter", () => {
    const first = trayStackJitter("Cards/A.md", 2);
    assert.deepEqual(trayStackJitter("Cards/A.md", 2), first);
    assert.notDeepEqual(trayStackJitter("Cards/B.md", 2), first);
    assert.ok(first.rotationDegrees >= -2 && first.rotationDegrees <= 2);
    assert.ok(first.offsetX >= -4 && first.offsetX <= 4);
    assert.ok(first.offsetY >= 3 && first.offsetY <= 5);
  });
});
