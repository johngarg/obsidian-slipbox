import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  canRunDeckAction,
  trayToggleLabel,
  type DeckActionContext,
} from "../src/deck-actions.js";
import { DECK_ACTION_DEFINITIONS } from "../src/settings.js";

const READY: DeckActionContext = {
  hasActiveCard: true,
  hasPreviousCard: true,
  hasNextCard: true,
  hasPreviousBookmark: true,
  hasNextBookmark: true,
  hasProblems: true,
  filing: true,
  hasFocusedCard: true,
  focusedCardFiled: true,
  focusedCardUnfiled: false,
  focusedSurface: "desk",
  canMoveDeskCardLeft: true,
  canMoveDeskCardRight: true,
  hasDeskPiles: true,
  hasExpandedPiles: true,
  hasFiledDeskCards: true,
};

describe("Deck action availability", () => {
  test("enables stable actions when their context is available", () => {
    assert.equal(canRunDeckAction("previous-card", READY), true);
    assert.equal(canRunDeckAction("previous-bookmark", READY), true);
    assert.equal(canRunDeckAction("next-bookmark", READY), true);
    assert.equal(canRunDeckAction("open-note", READY), true);
    assert.equal(canRunDeckAction("copy-link", READY), true);
    assert.equal(canRunDeckAction("toggle-tray", READY), true);
    assert.equal(canRunDeckAction("problems", READY), true);
    assert.equal(canRunDeckAction("confirm-filing", READY), true);
    assert.equal(canRunDeckAction("cancel-filing", READY), true);
  });

  test("disables card, diagnostic, and filing actions independently", () => {
    const unavailable: DeckActionContext = {
      hasActiveCard: false,
      hasPreviousCard: false,
      hasNextCard: false,
      hasPreviousBookmark: false,
      hasNextBookmark: false,
      hasProblems: false,
      filing: false,
      hasFocusedCard: false,
      focusedCardFiled: false,
      focusedCardUnfiled: false,
      focusedSurface: null,
      canMoveDeskCardLeft: false,
      canMoveDeskCardRight: false,
      hasDeskPiles: false,
      hasExpandedPiles: false,
      hasFiledDeskCards: false,
    };
    assert.equal(canRunDeckAction("next-card", unavailable), false);
    assert.equal(canRunDeckAction("previous-bookmark", unavailable), false);
    assert.equal(canRunDeckAction("next-bookmark", unavailable), false);
    assert.equal(canRunDeckAction("forward-ten-cards", unavailable), false);
    assert.equal(canRunDeckAction("toggle-bookmark", unavailable), false);
    assert.equal(canRunDeckAction("copy-link", unavailable), false);
    assert.equal(canRunDeckAction("toggle-tray", unavailable), false);
    assert.equal(canRunDeckAction("problems", unavailable), false);
    assert.equal(canRunDeckAction("confirm-filing", unavailable), false);
    assert.equal(canRunDeckAction("cancel-filing", unavailable), false);
    assert.equal(canRunDeckAction("toggle-deck-map", unavailable), true);
  });

  test("allows bookmarking only with a filed Deck card focused", () => {
    assert.equal(canRunDeckAction("toggle-bookmark", READY), false);
    assert.equal(canRunDeckAction("toggle-bookmark", {
      ...READY,
      focusedSurface: "viewed",
    }), false);
    assert.equal(canRunDeckAction("toggle-bookmark", {
      ...READY,
      focusedSurface: "deck",
    }), true);
    assert.equal(canRunDeckAction("toggle-bookmark", {
      ...READY,
      focusedSurface: "deck",
      focusedCardFiled: false,
    }), false);
  });

  test("guards pile navigation by Desk, Deck, and focus state", () => {
    for (const action of ["next-pile", "previous-pile"] as const) {
      assert.equal(canRunDeckAction(action, READY), true);
      assert.equal(canRunDeckAction(action, { ...READY, hasDeskPiles: false }), false);
      assert.equal(canRunDeckAction(action, { ...READY, focusedSurface: "viewed" }), false);
    }
    assert.equal(canRunDeckAction("swap-deck-pile", READY), true);
    assert.equal(canRunDeckAction("swap-deck-pile", {
      ...READY,
      hasActiveCard: false,
    }), false);
    assert.equal(canRunDeckAction("swap-deck-pile", {
      ...READY,
      hasDeskPiles: false,
    }), false);
    assert.equal(canRunDeckAction("swap-deck-pile", {
      ...READY,
      focusedSurface: "viewed",
    }), false);
    for (const action of [
      "toggle-pile",
      "previous-card-in-pile",
      "next-card-in-pile",
    ] as const) {
      assert.equal(canRunDeckAction(action, READY), true);
      assert.equal(canRunDeckAction(action, { ...READY, focusedSurface: "deck" }), false);
      assert.equal(canRunDeckAction(action, { ...READY, focusedSurface: "viewed" }), false);
      assert.equal(canRunDeckAction(action, { ...READY, hasDeskPiles: false }), false);
    }
  });

  test("does not expose removed creation actions or reuse the a shortcut", () => {
    const definitions = DECK_ACTION_DEFINITIONS as readonly {
      readonly id: string;
      readonly defaultBindings: readonly { readonly key: string }[];
    }[];
    assert.equal(definitions.some((definition) => definition.id === "add-card"), false);
    assert.equal(definitions.some((definition) => definition.id === "new-section"), false);
    assert.equal(definitions.some((definition) => definition.id === "file-here"), false);
    assert.equal(definitions.some((definition) => definition.id === "entry-points"), false);
    assert.equal(
      definitions.some((definition) =>
        definition.defaultBindings.some((binding) => binding.key === "a")),
      false,
    );
  });

  test("does not expose browser history or toolbar actions and leaves H, L, and t free", () => {
    const retiredIds = new Set(["back", "forward", "toggle-toolbar"]);
    const retiredCommands = new Set([
      "history-back",
      "history-forward",
      "toggle-toolbar-visibility",
    ]);
    assert.equal(
      DECK_ACTION_DEFINITIONS.some((definition) => retiredIds.has(definition.id)),
      false,
    );
    assert.equal(
      DECK_ACTION_DEFINITIONS.some((definition) =>
        retiredCommands.has(definition.commandId)),
      false,
    );
    assert.equal(
      DECK_ACTION_DEFINITIONS.some((definition) =>
        definition.defaultBindings.some((binding) =>
          (binding.key === "h" && binding.modifiers.includes("Shift")) ||
          (binding.key === "l" && binding.modifiers.includes("Shift")) ||
          (binding.key === "t" && binding.modifiers.length === 0)
        )),
      false,
    );
  });

  test("uses y as the Deck-scoped copy-link shortcut", () => {
    const copy = DECK_ACTION_DEFINITIONS.find(
      (definition) => definition.id === "copy-link",
    );
    assert.deepEqual(copy?.defaultBindings, [{ key: "y", modifiers: [] }]);
  });

  test("registers Enter only for Show in Deck and e only for focused editing", () => {
    const show = DECK_ACTION_DEFINITIONS.find(
      (definition) => definition.id === "show-card-in-deck",
    );
    const edit = DECK_ACTION_DEFINITIONS.find(
      (definition) => definition.id === "edit-card",
    );
    assert.deepEqual(show?.defaultBindings, [{ key: "Enter", modifiers: [] }]);
    assert.deepEqual(edit?.defaultBindings, [{ key: "e", modifiers: [] }]);
    assert.equal(show?.target, "focused-card");
    assert.equal(show?.scope, "active-view");
    assert.equal(
      DECK_ACTION_DEFINITIONS.filter((definition) =>
        definition.defaultBindings.some((binding) => binding.key === "Enter")
      ).length,
      1,
    );
  });

  test("shows only a filed non-Deck focus in the Deck", () => {
    assert.equal(canRunDeckAction("show-card-in-deck", READY), true);
    assert.equal(canRunDeckAction("show-card-in-deck", {
      ...READY,
      focusedSurface: "deck",
    }), false);
    assert.equal(canRunDeckAction("show-card-in-deck", {
      ...READY,
      focusedCardFiled: false,
      focusedCardUnfiled: true,
    }), false);
    assert.equal(canRunDeckAction("edit-card", READY), true);
  });

  test("marks held ten-card motion repeatable and prefixes discrete", () => {
    assert.equal(
      DECK_ACTION_DEFINITIONS.find((definition) =>
        definition.id === "forward-ten-cards")?.repeatable,
      true,
    );
    assert.equal(
      DECK_ACTION_DEFINITIONS.find((definition) =>
        definition.id === "backward-ten-cards")?.repeatable,
      true,
    );
    for (const action of [
      "find-address-forward",
      "find-address-backward",
      "find-address-first",
      "pull-into-pile",
    ]) {
      assert.equal(
        DECK_ACTION_DEFINITIONS.find((definition) =>
          definition.id === action)?.repeatable,
        false,
      );
    }
  });

  test("uses concise state-dependent wording in shared card actions", () => {
    assert.equal(trayToggleLabel(false), "Put on Desk");
    assert.equal(trayToggleLabel(true), "Return from Desk");
  });
});
