import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createViewedCardState,
  moveViewedCardState,
  renameViewedCardState,
  resolveViewedCardReturnTarget,
  retargetViewedCardState,
  scrollViewedCardState,
} from "../src/viewed-card.js";

describe("viewed card state", () => {
  test("starts centred and preserves one card identity", () => {
    const state = createViewedCardState("Cards/one.md", {
      surface: "desk",
      pileId: "pile-1",
    });
    assert.deepEqual(state, {
      path: "Cards/one.md",
      returnTarget: { surface: "desk", pileId: "pile-1" },
      x: 0,
      y: 0,
      scrollTop: 0,
    });
    assert.deepEqual(renameViewedCardState(state, "Cards/two.md"), {
      ...state,
      path: "Cards/two.md",
    });
  });

  test("constrains movement to the visible stage", () => {
    const state = createViewedCardState("Cards/one.md", { surface: "deck" });
    const moved = moveViewedCardState(state, 900, -900, {
      stageWidth: 1_000,
      stageHeight: 700,
      cardWidth: 600,
      cardHeight: 400,
      margin: 20,
    });
    assert.equal(moved.x, 180);
    assert.equal(moved.y, -130);
    assert.equal(moved.returnTarget, state.returnTarget);
  });

  test("centres cards too large for the stage and clamps scroll", () => {
    const state = createViewedCardState("Cards/one.md", { surface: "deck" });
    assert.deepEqual(moveViewedCardState(state, 30, 40, {
      stageWidth: 320,
      stageHeight: 240,
      cardWidth: 500,
      cardHeight: 300,
    }), state);
    assert.equal(scrollViewedCardState(state, -12).scrollTop, 0);
    const scrolled = scrollViewedCardState(state, 42);
    assert.equal(scrolled.scrollTop, 42);
    assert.equal(scrolled.returnTarget, state.returnTarget);
  });

  test("returns to the opening surface with the other surface as fallback", () => {
    const fromDeck = createViewedCardState("Cards/one.md", { surface: "deck" });
    assert.deepEqual(
      resolveViewedCardReturnTarget(fromDeck, true, "pile-1"),
      { surface: "deck" },
    );
    assert.deepEqual(
      resolveViewedCardReturnTarget(fromDeck, false, "pile-1"),
      { surface: "desk", pileId: "pile-1" },
    );
    assert.equal(resolveViewedCardReturnTarget(fromDeck, false), null);

    const fromDesk = createViewedCardState("Cards/two.md", {
      surface: "desk",
      pileId: "original-pile",
    });
    assert.deepEqual(
      resolveViewedCardReturnTarget(fromDesk, true, "current-pile"),
      { surface: "desk", pileId: "current-pile" },
    );
    assert.deepEqual(
      resolveViewedCardReturnTarget(fromDesk, true),
      { surface: "deck" },
    );
    assert.equal(resolveViewedCardReturnTarget(fromDesk, false), null);
  });

  test("retargets a viewed Deck card to its exact Desk pile before editing", () => {
    const fromDeck = moveViewedCardState(
      scrollViewedCardState(
        createViewedCardState("Cards/one.md", { surface: "deck" }),
        42,
      ),
      30,
      -20,
      {
        stageWidth: 1_000,
        stageHeight: 700,
        cardWidth: 600,
        cardHeight: 400,
      },
    );
    const onDesk = retargetViewedCardState(fromDeck, {
      surface: "desk",
      pileId: "pile-2",
    });
    assert.deepEqual(onDesk, {
      ...fromDeck,
      returnTarget: { surface: "desk", pileId: "pile-2" },
    });
    assert.equal(
      retargetViewedCardState(onDesk, onDesk.returnTarget),
      onDesk,
    );
  });
});
