import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  canRunDeckAction,
  deskToggleFocusTarget,
  deskToggleLabel,
  type DeckActionContext,
} from "../src/deck-actions.js";
import { SLIPBOX_ACTION_DEFINITIONS } from "../src/settings.js";

const READY: DeckActionContext = {
  hasActiveCard: true,
  hasPreviousCard: true,
  hasNextCard: true,
  hasInferredParent: true,
  hasForwardInferredSiblingCycle: true,
  hasBackwardInferredSiblingCycle: true,
  hasLocalBranchTarget: true,
  hasPreviousBookmark: true,
  hasNextBookmark: true,
  hasProblems: true,
  filing: true,
  hasFocusedCard: true,
  focusedCardFiled: true,
  focusedCardUnfiled: false,
  focusedSurface: "desk",
  viewedReturnSurface: null,
  focusedCardOnDesk: true,
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
    assert.equal(canRunDeckAction("jump-inferred-parent", READY), true);
    assert.equal(canRunDeckAction("cycle-forward-inferred-siblings", READY), true);
    assert.equal(canRunDeckAction("cycle-backward-inferred-siblings", READY), true);
    assert.equal(canRunDeckAction("open-note", READY), true);
    assert.equal(canRunDeckAction("copy-link", READY), true);
    assert.equal(canRunDeckAction("toggle-desk", READY), true);
    assert.equal(canRunDeckAction("toggle-desk-without-focus", READY), false);
    assert.equal(canRunDeckAction("problems", READY), true);
    assert.equal(canRunDeckAction("confirm-filing", READY), true);
    assert.equal(canRunDeckAction("cancel-filing", READY), true);
  });

  test("disables card, diagnostic, and filing actions independently", () => {
    const unavailable: DeckActionContext = {
      hasActiveCard: false,
      hasPreviousCard: false,
      hasNextCard: false,
      hasInferredParent: false,
      hasForwardInferredSiblingCycle: false,
      hasBackwardInferredSiblingCycle: false,
      hasLocalBranchTarget: false,
      hasPreviousBookmark: false,
      hasNextBookmark: false,
      hasProblems: false,
      filing: false,
      hasFocusedCard: false,
      focusedCardFiled: false,
      focusedCardUnfiled: false,
      focusedSurface: null,
      viewedReturnSurface: null,
      focusedCardOnDesk: false,
      canMoveDeskCardLeft: false,
      canMoveDeskCardRight: false,
      hasDeskPiles: false,
      hasExpandedPiles: false,
      hasFiledDeskCards: false,
    };
    assert.equal(canRunDeckAction("next-card", unavailable), false);
    assert.equal(canRunDeckAction("previous-bookmark", unavailable), false);
    assert.equal(canRunDeckAction("next-bookmark", unavailable), false);
    assert.equal(canRunDeckAction("jump-inferred-parent", unavailable), false);
    assert.equal(canRunDeckAction("cycle-forward-inferred-siblings", unavailable), false);
    assert.equal(canRunDeckAction("cycle-backward-inferred-siblings", unavailable), false);
    assert.equal(canRunDeckAction("forward-ten-cards", unavailable), false);
    assert.equal(canRunDeckAction("toggle-bookmark", unavailable), false);
    assert.equal(canRunDeckAction("copy-link", unavailable), false);
    assert.equal(canRunDeckAction("toggle-desk", unavailable), false);
    assert.equal(canRunDeckAction("toggle-desk-without-focus", unavailable), false);
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
      assert.equal(canRunDeckAction(action, { ...READY, focusedSurface: "viewed" }), true);
      assert.equal(canRunDeckAction(action, {
        ...READY,
        focusedSurface: "viewed",
        focusedCardOnDesk: false,
      }), false);
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
    }), true);
    assert.equal(canRunDeckAction("swap-deck-pile", {
      ...READY,
      focusedSurface: "viewed",
      focusedCardOnDesk: false,
    }), false);
    assert.equal(canRunDeckAction("swap-deck-pile", {
      ...READY,
      focusedSurface: "viewed",
      viewedReturnSurface: "deck",
      focusedCardOnDesk: false,
    }), true);
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

  test("does not expose removed creation or directional address-search actions", () => {
    const definitions = SLIPBOX_ACTION_DEFINITIONS as readonly {
      readonly id: string;
      readonly defaultBindings: readonly { readonly key: string }[];
    }[];
    assert.equal(definitions.some((definition) => definition.id === "add-card"), false);
    assert.equal(definitions.some((definition) => definition.id === "new-section"), false);
    assert.equal(definitions.some((definition) => definition.id === "file-here"), false);
    assert.equal(definitions.some((definition) => definition.id === "entry-points"), false);
    assert.equal(
      definitions.some((definition) => definition.id === "find-address-forward"),
      false,
    );
    assert.equal(
      definitions.some((definition) => definition.id === "find-address-backward"),
      false,
    );
    assert.equal(
      definitions.some((definition) =>
        definition.defaultBindings.some((binding) => binding.key === "a")),
      false,
    );
  });

  test("exposes only parent and wrapped sibling actions for inferred navigation", () => {
    const expected = [
      {
        id: "jump-inferred-parent",
        label: "Move Deck anchor to inferred parent",
        repeatable: false,
        defaultBindings: [{ key: "-", modifiers: [] }],
      },
      {
        id: "cycle-forward-inferred-siblings",
        label: "Cycle Deck anchor forward through inferred siblings",
        repeatable: true,
        defaultBindings: [{ key: "n", modifiers: [] }],
      },
      {
        id: "cycle-backward-inferred-siblings",
        label: "Cycle Deck anchor backward through inferred siblings",
        repeatable: true,
        defaultBindings: [{ key: "n", modifiers: ["Shift"] }],
      },
    ] as const;
    for (const expectedAction of expected) {
      const definition = SLIPBOX_ACTION_DEFINITIONS.find(
        (candidate) => candidate.id === expectedAction.id,
      );
      assert.equal(definition?.label, expectedAction.label);
      assert.equal(definition?.repeatable, expectedAction.repeatable);
      assert.deepEqual(
        definition?.defaultBindings,
        expectedAction.defaultBindings,
      );
      assert.equal(definition?.target, "deck-anchor");
    }
    for (const removed of [
      "jump-previous-inferred-peer",
      "jump-next-inferred-peer",
      "jump-past-inferred-descendants",
      "jump-first-inferred-child",
    ]) {
      assert.equal(
        SLIPBOX_ACTION_DEFINITIONS.some((definition) => definition.id === removed),
        false,
      );
    }
  });

  test("registers six non-wrapping local Branch View actions unbound", () => {
    const expected = [
      "move-backward-local-strand",
      "move-forward-local-strand",
      "move-to-local-strand-beginning",
      "enter-address-inferred-strand",
      "enter-explicit-supplementary-strand",
      "move-to-higher-strand",
    ] as const;
    for (const id of expected) {
      const definition = SLIPBOX_ACTION_DEFINITIONS.find((candidate) =>
        candidate.id === id
      );
      assert.notEqual(definition, undefined);
      assert.deepEqual(definition?.defaultBindings, []);
      assert.equal(definition?.target, "deck-anchor");
      assert.equal(canRunDeckAction(id, READY), true);
      assert.equal(canRunDeckAction(id, {
        ...READY,
        hasLocalBranchTarget: false,
      }), false);
    }
  });

  test("does not expose browser history or toolbar actions and leaves H, L, and t free", () => {
    const retiredIds = new Set(["back", "forward", "toggle-toolbar"]);
    const retiredCommands = new Set([
      "history-back",
      "history-forward",
      "toggle-toolbar-visibility",
    ]);
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.some((definition) => retiredIds.has(definition.id)),
      false,
    );
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.some((definition) =>
        retiredCommands.has(definition.commandId)),
      false,
    );
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.some((definition) =>
        definition.defaultBindings.some((binding) =>
          (binding.key === "h" && binding.modifiers.includes("Shift")) ||
          (binding.key === "l" && binding.modifiers.includes("Shift")) ||
          (binding.key === "t" && binding.modifiers.length === 0)
        )),
      false,
    );
  });

  test("uses y as the Deck-scoped copy-link shortcut", () => {
    const copy = SLIPBOX_ACTION_DEFINITIONS.find(
      (definition) => definition.id === "copy-link",
    );
    assert.deepEqual(copy?.defaultBindings, [{ key: "y", modifiers: [] }]);
  });

  test("leaves the Deck-only background toggle unbound by default", () => {
    const backgroundToggle = SLIPBOX_ACTION_DEFINITIONS.find(
      (definition) => definition.id === "toggle-desk-without-focus",
    );
    assert.deepEqual(backgroundToggle?.defaultBindings, []);
    assert.equal(backgroundToggle?.target, "focused-card");
    assert.equal(canRunDeckAction("toggle-desk-without-focus", {
      ...READY,
      focusedSurface: "deck",
      focusedCardOnDesk: false,
    }), true);
    assert.equal(canRunDeckAction("toggle-desk-without-focus", {
      ...READY,
      focusedSurface: "deck",
      focusedCardOnDesk: true,
    }), true);
    assert.equal(canRunDeckAction("toggle-desk-without-focus", {
      ...READY,
      focusedSurface: "viewed",
    }), false);
  });

  test("moves ordinary pull focus with the card but preserves background focus", () => {
    assert.equal(deskToggleFocusTarget("deck", false, true), "desk");
    assert.equal(deskToggleFocusTarget("desk", true, true), "deck");
    assert.equal(deskToggleFocusTarget("viewed", true, true), "deck");
    assert.equal(deskToggleFocusTarget("deck", false, false), "preserve");
    assert.equal(deskToggleFocusTarget("deck", true, false), "preserve");
  });

  test("registers Enter only for Show in Deck and e only for focused editing", () => {
    const show = SLIPBOX_ACTION_DEFINITIONS.find(
      (definition) => definition.id === "show-card-in-deck",
    );
    const edit = SLIPBOX_ACTION_DEFINITIONS.find(
      (definition) => definition.id === "edit-card",
    );
    assert.deepEqual(show?.defaultBindings, [{ key: "Enter", modifiers: [] }]);
    assert.deepEqual(edit?.defaultBindings, [{ key: "e", modifiers: [] }]);
    assert.equal(edit?.label, "Edit focused card on Desk");
    assert.equal(show?.target, "focused-card");
    assert.equal(show?.scope, "active-view");
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.filter((definition) =>
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

  test("edits and views cards only after focus has moved off the Deck", () => {
    for (const focusedSurface of ["desk", "viewed"] as const) {
      assert.equal(canRunDeckAction("edit-card", {
        ...READY,
        focusedSurface,
      }), true);
      assert.equal(canRunDeckAction("toggle-viewed-card", {
        ...READY,
        focusedSurface,
      }), true);
    }
    assert.equal(canRunDeckAction("edit-card", {
      ...READY,
      focusedSurface: "deck",
      focusedCardOnDesk: false,
    }), false);
    assert.equal(canRunDeckAction("toggle-viewed-card", {
      ...READY,
      focusedSurface: "deck",
      focusedCardOnDesk: false,
    }), false);
    assert.equal(canRunDeckAction("edit-card", {
      ...READY,
      focusedSurface: "deck",
      focusedCardOnDesk: true,
    }), false);
    assert.equal(canRunDeckAction("toggle-viewed-card", {
      ...READY,
      focusedSurface: "deck",
      focusedCardOnDesk: true,
    }), false);
    assert.equal(canRunDeckAction("toggle-viewed-card", {
      ...READY,
      hasFocusedCard: false,
      focusedSurface: "deck",
    }), false);
  });

  test("marks held ten-card motion repeatable and prefixes discrete", () => {
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.find((definition) =>
        definition.id === "forward-ten-cards")?.repeatable,
      true,
    );
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.find((definition) =>
        definition.id === "backward-ten-cards")?.repeatable,
      true,
    );
    for (const action of [
      "find-address-first",
      "pull-into-pile",
    ]) {
      assert.equal(
        SLIPBOX_ACTION_DEFINITIONS.find((definition) =>
          definition.id === action)?.repeatable,
        false,
      );
    }
  });

  test("uses concise state-dependent wording in shared card actions", () => {
    assert.equal(deskToggleLabel(false), "Put on Desk");
    assert.equal(deskToggleLabel(true), "Return from Desk");
  });
});
