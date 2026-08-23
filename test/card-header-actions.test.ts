import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  CARD_BUTTON_DEFINITIONS,
  CARD_BUTTON_ORDER,
  applicableCardHeaderActions,
  cardHeaderActionPresentation,
  cardHeaderButtonDefinitionsForSurface,
  cardHeaderVisibleActionCount,
  enabledCardHeaderActions,
} from "../src/card-header-actions.js";
import { DEFAULT_CARD_HEADER_BUTTONS } from "../src/settings.js";

const FILED_DESK = {
  surface: "desk",
  viewedReturnSurface: null,
  filed: true,
  onDesk: true,
  bookmarked: false,
  canMoveLeft: true,
  canMoveRight: false,
} as const;

describe("card header action presentation", () => {
  test("defines each button action once and orders only supported surfaces", () => {
    const actions = CARD_BUTTON_DEFINITIONS.map(({ action }) => action);
    assert.equal(new Set(actions).size, actions.length);
    for (const surface of ["deck", "desk", "viewed"] as const) {
      const definitions = cardHeaderButtonDefinitionsForSurface(surface);
      assert.deepEqual(
        definitions.map(({ action }) => action),
        CARD_BUTTON_ORDER[surface],
      );
      assert.equal(
        definitions.every(({ surfaces }) => surfaces.includes(surface)),
        true,
      );
    }
    assert.equal(
      cardHeaderButtonDefinitionsForSurface("deck")
        .some(({ action }) => action === "toggle-viewed-card"),
      false,
    );
  });

  test("uses the distinct edit, open, view, and Desk icons", () => {
    assert.deepEqual(cardHeaderActionPresentation("edit-card", FILED_DESK), {
      action: "edit-card",
      icon: "file-pen-line",
      label: "Edit card",
    });
    assert.equal(cardHeaderActionPresentation("edit-card", {
      ...FILED_DESK,
      surface: "deck",
    }), null);
    assert.deepEqual(cardHeaderActionPresentation("edit-card", {
      ...FILED_DESK,
      surface: "deck",
      onDesk: false,
    }), {
      action: "edit-card",
      icon: "file-pen-line",
      label: "Edit on Desk",
    });
    assert.deepEqual(cardHeaderActionPresentation("edit-card", {
      ...FILED_DESK,
      surface: "viewed",
      viewedReturnSurface: "deck",
    }), {
      action: "edit-card",
      icon: "file-pen-line",
      label: "Edit on Desk",
    });
    assert.deepEqual(cardHeaderActionPresentation("open-note", FILED_DESK), {
      action: "open-note",
      icon: "file-text",
      label: "Open Markdown note",
    });
    assert.deepEqual(cardHeaderActionPresentation("toggle-viewed-card", FILED_DESK), {
      action: "toggle-viewed-card",
      icon: "maximize-2",
      label: "View",
    });
    assert.deepEqual(cardHeaderActionPresentation("toggle-tray", FILED_DESK), {
      action: "toggle-tray",
      icon: "undo-2",
      label: "Return from Desk",
      pressed: true,
    });
    assert.deepEqual(cardHeaderActionPresentation("toggle-tray", {
      ...FILED_DESK,
      surface: "deck",
      onDesk: false,
    }), {
      action: "toggle-tray",
      icon: "bring-to-front",
      label: "Put on Desk",
      pressed: false,
    });
  });

  test("switches filed and viewed actions without exposing invalid targets", () => {
    const unfiledViewed = {
      ...FILED_DESK,
      surface: "viewed",
      filed: false,
      onDesk: true,
    } as const;
    const actions = applicableCardHeaderActions(unfiledViewed);
    assert.equal(actions.some(({ action }) => action === "file-card"), true);
    assert.equal(actions.some(({ action }) => action === "show-card-in-deck"), false);
    assert.equal(actions.some(({ action }) => action === "copy-link"), false);
    assert.deepEqual(
      actions.find(({ action }) => action === "toggle-viewed-card"),
      { action: "toggle-viewed-card", icon: "minimize-2", label: "Return to Desk" },
    );

    const deckOriginViewed = {
      ...FILED_DESK,
      surface: "viewed",
      viewedReturnSurface: "deck",
    } as const;
    assert.deepEqual(
      cardHeaderActionPresentation("toggle-viewed-card", deckOriginViewed),
      { action: "toggle-viewed-card", icon: "minimize-2", label: "Return to Deck" },
    );
    assert.equal(
      cardHeaderActionPresentation("toggle-viewed-card", {
        ...FILED_DESK,
        surface: "deck",
      }),
      null,
    );
  });

  test("offers bookmarking only on filed Deck cards", () => {
    assert.equal(cardHeaderActionPresentation("toggle-bookmark", FILED_DESK), null);
    assert.equal(cardHeaderActionPresentation("toggle-bookmark", {
      ...FILED_DESK,
      surface: "viewed",
    }), null);
    assert.deepEqual(cardHeaderActionPresentation("toggle-bookmark", {
      ...FILED_DESK,
      surface: "deck",
      onDesk: false,
      bookmarked: true,
    }), {
      action: "toggle-bookmark",
      icon: "bookmark",
      label: "Remove bookmark",
      pressed: true,
    });
  });

  test("applies surface settings without changing conditional availability", () => {
    assert.deepEqual(
      enabledCardHeaderActions(DEFAULT_CARD_HEADER_BUTTONS, FILED_DESK)
        .map(({ action }) => action),
      [
        "toggle-viewed-card",
        "edit-card",
        "open-note",
        "show-card-in-deck",
        "toggle-tray",
      ],
    );
    assert.equal(
      enabledCardHeaderActions(DEFAULT_CARD_HEADER_BUTTONS, FILED_DESK)
        .some(({ action }) => action === "delete-card"),
      false,
    );
  });

  test("offers Desk movement only in available directions", () => {
    assert.equal(
      applicableCardHeaderActions(FILED_DESK)
        .some(({ action }) => action === "move-desk-card-left"),
      true,
    );
    assert.equal(
      applicableCardHeaderActions(FILED_DESK)
        .some(({ action }) => action === "move-desk-card-right"),
      false,
    );
  });

  test("keeps a fitting prefix and reserves the More button on overflow", () => {
    assert.equal(cardHeaderVisibleActionCount([24, 24, 24], 24, 2, 76), 3);
    assert.equal(cardHeaderVisibleActionCount([24, 24, 24], 24, 2, 75), 1);
    assert.equal(cardHeaderVisibleActionCount([24, 24], 24, 2, 49), 0);
    assert.equal(cardHeaderVisibleActionCount([], 24, 2, 0), 0);
  });
});
