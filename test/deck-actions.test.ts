import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canRunDeckAction, type DeckActionContext } from "../src/deck-actions.js";

const READY: DeckActionContext = {
  hasActiveCard: true,
  hasPreviousCard: true,
  hasNextCard: true,
  canGoBack: true,
  canGoForward: true,
  hasProblems: true,
  filing: true,
};

describe("Deck action availability", () => {
  test("enables stable actions when their context is available", () => {
    assert.equal(canRunDeckAction("previous-card", READY), true);
    assert.equal(canRunDeckAction("open-note", READY), true);
    assert.equal(canRunDeckAction("toggle-tray", READY), true);
    assert.equal(canRunDeckAction("back", READY), true);
    assert.equal(canRunDeckAction("problems", READY), true);
    assert.equal(canRunDeckAction("file-here", READY), true);
    assert.equal(canRunDeckAction("cancel-filing", READY), true);
  });

  test("disables card, history, diagnostic, and filing actions independently", () => {
    const unavailable: DeckActionContext = {
      hasActiveCard: false,
      hasPreviousCard: false,
      hasNextCard: false,
      canGoBack: false,
      canGoForward: false,
      hasProblems: false,
      filing: false,
    };
    assert.equal(canRunDeckAction("next-card", unavailable), false);
    assert.equal(canRunDeckAction("toggle-bookmark", unavailable), false);
    assert.equal(canRunDeckAction("toggle-tray", unavailable), false);
    assert.equal(canRunDeckAction("forward", unavailable), false);
    assert.equal(canRunDeckAction("problems", unavailable), false);
    assert.equal(canRunDeckAction("file-here", unavailable), false);
    assert.equal(canRunDeckAction("cancel-filing", unavailable), false);
    assert.equal(canRunDeckAction("entry-points", unavailable), true);
    assert.equal(canRunDeckAction("new-section", unavailable), true);
  });
});
