import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  addDeskCard,
  bringDeskCardToFront,
  moveDeskCard,
  normalizeDeskCards,
  removeDeskCard,
  renameDeskCard,
} from "../src/desk-state.js";

describe("Desk state", () => {
  test("adds each note once and permits overlap", () => {
    let cards = addDeskCard([], "one.md", { x: 100, y: 100 });
    cards = addDeskCard(cards, "one.md", { x: 500, y: 500 });
    cards = addDeskCard(cards, "two.md", { x: 100, y: 100 });
    assert.equal(cards.length, 2);
    assert.deepEqual(cards.map(({ x, y }) => ({ x, y })), [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ]);
  });

  test("moves, raises, removes, and renames cards", () => {
    let cards = addDeskCard([], "one.md", { x: 0, y: 0 });
    cards = addDeskCard(cards, "two.md", { x: 20, y: 20 });
    cards = moveDeskCard(cards, "one.md", { x: 300, y: 400 });
    cards = bringDeskCardToFront(cards, "one.md");
    assert.deepEqual(cards.find((card) => card.cardRef === "one.md"), {
      cardRef: "one.md",
      x: 300,
      y: 400,
      z: 3,
    });
    cards = renameDeskCard(cards, "one.md", "renamed.md");
    assert.equal(cards.some((card) => card.cardRef === "renamed.md"), true);
    assert.deepEqual(removeDeskCard(cards, "two.md").map((card) => card.cardRef), [
      "renamed.md",
    ]);
  });

  test("normalizes persisted coordinates and ignores malformed duplicates", () => {
    assert.deepEqual(
      normalizeDeskCards([
        { cardRef: "one.md", x: -20, y: 90, z: 1.4 },
        { cardRef: "one.md", x: 200, y: 200, z: 2 },
        { cardRef: "bad.md", x: "left", y: 0, z: 0 },
      ]),
      [{ cardRef: "one.md", x: 0, y: 90, z: 1 }],
    );
  });

  test("filing status changes do not affect path-keyed layout", () => {
    const cards = addDeskCard([], "unfiled.md", { x: 55, y: 77 });
    assert.deepEqual(cards[0], { cardRef: "unfiled.md", x: 55, y: 77, z: 1 });
  });
});
