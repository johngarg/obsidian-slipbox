import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EMPTY_TRAY,
  addUniqueCardToPile,
  cardPosition,
  clearFiledCardsFromPile,
  clearFiledCardsFromTray,
  createPile,
  initialTrayFromUnfiled,
  insertionIndexForPoint,
  mergePiles,
  moveCardBetweenPiles,
  moveCardWithinPile,
  pruneTrayCards,
  reconcileTray,
  removeCard,
  removeTrayPath,
  renameTrayPath,
  reorderPiles,
  setExpandedPile,
  splitCardIntoNewPile,
  toggleFiledCard,
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
    expandedPileId: null,
    unfiledPileId: piles.length > 0 ? "pile-1" : null,
  };
}

describe("session Tray piles", () => {
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
      expandedPileId: null,
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

  test("pulls into a singleton or the expanded pile and toggles back to Deck", () => {
    let state = toggleFiledCard(EMPTY_TRAY, filed("A.md"), "one");
    state = setExpandedPile(state, "one");
    state = toggleFiledCard(state, filed("B.md"), "unused");
    assert.deepEqual(state.piles[0]?.cards.map((card) => card.cardRef), ["A.md", "B.md"]);
    state = toggleFiledCard(state, filed("A.md"), "unused");
    assert.deepEqual(state.piles[0]?.cards.map((card) => card.cardRef), ["B.md"]);
  });

  test("moves cards in both directions within a pile", () => {
    const state = tray([filed("A.md"), filed("B.md"), filed("C.md")]);
    const right = moveCardWithinPile(state, "pile-1", 0, 2);
    assert.deepEqual(right.piles[0]?.cards.map((card) => card.cardRef), ["B.md", "C.md", "A.md"]);
    const left = moveCardWithinPile(right, "pile-1", 2, 0);
    assert.deepEqual(left.piles[0]?.cards.map((card) => card.cardRef), ["A.md", "B.md", "C.md"]);
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
    const state = setExpandedPile(
      tray([filed("A.md")], [filed("B.md"), filed("C.md")], [filed("D.md")]),
      "pile-2",
    );
    const merged = mergePiles(state, "pile-2", "pile-1");
    assert.deepEqual(merged.piles[0]?.cards.map((card) => card.cardRef), [
      "A.md", "B.md", "C.md",
    ]);
    assert.equal(merged.expandedPileId, "pile-1");
    const reordered = reorderPiles(merged, 1, 0);
    assert.deepEqual(reordered.piles.map((pile) => pile.id), ["pile-3", "pile-1"]);
  });

  test("clears only filed cards from a pile or the complete Tray", () => {
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
      expandedPileId: "two",
      unfiledPileId: "one",
    };
    const next = pruneTrayCards(state, [filed("U.md"), filed("A.md")]);
    assert.deepEqual(next.piles, [{ id: "one", cards: [filed("A.md")] }]);
    assert.equal(next.expandedPileId, null);
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
});
