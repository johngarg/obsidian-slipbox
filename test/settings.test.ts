import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DECK_ACTION_DEFINITIONS,
  DEFAULT_CARD_SPREAD,
  MAX_CARD_SPREAD,
  MIN_CARD_SPREAD,
  DEFAULT_SETTINGS,
  formatKeyBinding,
  hasTitleAddressPropertyCollision,
  keyBindingFromKeyboardEvent,
  keyBindingConflict,
  metadataPropertyError,
  normalizeDeckKeybindings,
  normalizeKeyBinding,
  normalizeCardSize,
  normalizeCardSpread,
  normalizeFolderPath,
  normalizeSettings,
  settingsForPersistence,
} from "../src/settings.js";

describe("Slipbox settings", () => {
  test("validates metadata property names independently of the settings UI", () => {
    assert.equal(
      metadataPropertyError("", null),
      "A non-empty top-level property name is required.",
    );
    assert.equal(
      metadataPropertyError("title", "title"),
      "The title and address properties must use different keys.",
    );
    assert.equal(metadataPropertyError("signature", "title"), null);
  });

  test("uses the complete default settings for unknown input", () => {
    assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
    assert.equal(DEFAULT_SETTINGS.addressProperty, "slipbox-id");
    assert.equal(DEFAULT_SETTINGS.titleProperty, "slipbox-title");
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["previous-card"], [
      { key: "ArrowLeft", modifiers: [] },
      { key: "k", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["previous-bookmark"], [
      { key: "[", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["next-bookmark"], [
      { key: "]", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["open-note"], [
      { key: "o", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-tray"], [
      { key: "p", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-tray-without-focus"], []);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["copy-link"], [
      { key: "y", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["edit-card"], [
      { key: "e", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["show-card-in-deck"], [
      { key: "Enter", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-viewed-card"], [
      { key: "v", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["first-card"], [
      { key: "0", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["last-card"], [
      { key: "$", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["forward-ten-cards"], [
      { key: "d", modifiers: ["Ctrl"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["backward-ten-cards"], [
      { key: "u", modifiers: ["Ctrl"] },
    ]);
    assert.equal("find-address-forward" in DEFAULT_SETTINGS.deckKeybindings, false);
    assert.equal("find-address-backward" in DEFAULT_SETTINGS.deckKeybindings, false);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["find-address-first"], [
      { key: "g", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["pull-into-pile"], [
      { key: "p", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["next-pile"], [
      { key: "}", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["previous-pile"], [
      { key: "{", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["swap-deck-pile"], [
      { key: "%", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-pile"], [
      { key: " ", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["previous-card-in-pile"], [
      { key: "h", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["next-card-in-pile"], [
      { key: "l", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-deck-map"], [
      { key: "m", modifiers: [] },
    ]);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.deck["copy-link"], true);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.deck["edit-card"], false);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.deck["toggle-viewed-card"], false);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.deck["delete-card"], false);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.desk["show-card-in-deck"], true);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.viewed["toggle-viewed-card"], true);
    assert.equal(DEFAULT_SETTINGS.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(DEFAULT_SETTINGS.newCardFolder, "");
    assert.equal(DEFAULT_SETTINGS.mainCardSize, "medium");
    assert.equal(DEFAULT_SETTINGS.trayCardSize, "medium");
    assert.equal(DEFAULT_SETTINGS.deckOrdering, "natural");
    assert.equal(DEFAULT_SETTINGS.showTooltips, false);
    assert.equal(DEFAULT_SETTINGS.showDeckMap, true);
    assert.equal(DEFAULT_SETTINGS.restrictViewedCardPaste, true);
    assert.equal(DEFAULT_SETTINGS.previewLinksOnHover, false);
    assert.equal(DEFAULT_SETTINGS.followLinksFromCards, false);
    assert.equal(DEFAULT_SETTINGS.protectFiledCardText, true);
    assert.equal(DEFAULT_SETTINGS.showAutomaticBacklinks, true);
    assert.equal(DEFAULT_SETTINGS.allowCardScrolling, true);
    assert.equal(DEFAULT_SETTINGS.cardSpread, DEFAULT_CARD_SPREAD);
  });

  test("normalizes property names, buttons, and configured shortcuts", () => {
    const settings = normalizeSettings({
      addressProperty: " signature ",
      deckOrdering: "lexicographic",
      titleSource: "frontmatter",
      titleProperty: " display-name ",
      mainCardSize: "large",
      trayCardSize: "small",
      newCardFolder: " /Cards\\Slipbox/ ",
      newNoteTimestampFormat: " YYYYMMDD-HHmmss ",
      showTitleInDeck: true,
      showTooltips: true,
      showDeckMap: false,
      cardSpread: 0.73,
      deckHeaderButtons: { bookmark: false, tray: false },
      deckKeybindings: {
        "previous-card": [
          { key: "K", modifiers: [] },
          { key: "k", modifiers: [] },
        ],
        "next-card": [{ key: "K", modifiers: [] }],
        "open-note": [],
      },
    });

    assert.equal(settings.addressProperty, "signature");
    assert.equal(settings.deckOrdering, "lexicographic");
    assert.equal(settings.titleSource, "frontmatter");
    assert.equal(settings.titleProperty, "display-name");
    assert.equal(settings.mainCardSize, "large");
    assert.equal(settings.trayCardSize, "small");
    assert.equal(settings.newCardFolder, "Cards/Slipbox");
    assert.equal(settings.newNoteTimestampFormat, "YYYYMMDD-HHmmss");
    assert.equal(settings.showTitleInDeck, true);
    assert.equal(settings.showTooltips, true);
    assert.equal(settings.showDeckMap, false);
    assert.equal(settings.cardSpread, 0.73);
    assert.equal(settings.cardHeaderButtons.deck["toggle-bookmark"], false);
    assert.equal(settings.cardHeaderButtons.deck["toggle-tray"], false);
    assert.equal("desk" in settings.cardHeaderButtons, true);
    assert.equal("showTitleInDesk" in settings, false);
    assert.equal("deskHeaderButtons" in settings, false);
    assert.deepEqual(settings.deckKeybindings["previous-card"], [
      { key: "k", modifiers: [] },
    ]);
    assert.deepEqual(settings.deckKeybindings["next-card"], []);
    assert.deepEqual(settings.deckKeybindings["open-note"], []);
    assert.deepEqual(settings.deckKeybindings["copy-link"], [
      { key: "y", modifiers: [] },
    ]);
    assert.equal(settings.cardHeaderButtons.deck["copy-link"], true);
  });

  test("falls back to filename titles when title and address keys collide", () => {
    const raw = {
      addressProperty: " card-key ",
      titleSource: "frontmatter",
      titleProperty: "card-key",
    };
    assert.equal(hasTitleAddressPropertyCollision(raw), true);
    const normalized = normalizeSettings(raw);
    assert.equal(normalized.addressProperty, "card-key");
    assert.equal(normalized.titleProperty, "card-key");
    assert.equal(normalized.titleSource, "filename");
    assert.equal(hasTitleAddressPropertyCollision({
      ...raw,
      titleSource: "filename",
    }), false);
  });

  test("gives every registered action a unique command and target", () => {
    const commandIds = DECK_ACTION_DEFINITIONS.map((definition) =>
      definition.commandId
    );
    assert.equal(new Set(commandIds).size, commandIds.length);
    assert.equal(
      DECK_ACTION_DEFINITIONS.every((definition) =>
        definition.commandName !== "" && definition.target !== undefined
      ),
      true,
    );
    for (const action of ["next-pile", "previous-pile", "swap-deck-pile"] as const) {
      const definition = DECK_ACTION_DEFINITIONS.find((candidate) =>
        candidate.id === action
      );
      assert.equal(definition?.scope, "active-view");
      assert.equal(definition?.target, "view");
    }
    for (const action of [
      "toggle-pile",
      "previous-card-in-pile",
      "next-card-in-pile",
    ] as const) {
      const definition = DECK_ACTION_DEFINITIONS.find((candidate) =>
        candidate.id === action
      );
      assert.equal(definition?.scope, "active-view");
      assert.equal(definition?.target, "focused-card");
    }
  });

  test("preserves customized and deliberately empty copy-link settings", () => {
    const customized = normalizeSettings({
      deckHeaderButtons: { "copy-link": false },
      deckKeybindings: {
        "copy-link": [{ key: "L", modifiers: ["Mod"] }],
      },
    });
    assert.equal(customized.cardHeaderButtons.deck["copy-link"], false);
    assert.deepEqual(customized.deckKeybindings["copy-link"], [{
      key: "l",
      modifiers: ["Mod"],
    }]);

    const empty = normalizeSettings({
      deckKeybindings: { "copy-link": [] },
    });
    assert.deepEqual(empty.deckKeybindings["copy-link"], []);
  });

  test("does not let new pile-navigation defaults displace existing bindings", () => {
    const settings = normalizeSettings({
      deckKeybindings: {
        "open-note": [{ key: "h", modifiers: [] }],
        "toggle-tray": [{ key: " ", modifiers: [] }],
      },
    });
    assert.deepEqual(settings.deckKeybindings["open-note"], [{
      key: "h",
      modifiers: [],
    }]);
    assert.deepEqual(settings.deckKeybindings["toggle-tray"], [{
      key: " ",
      modifiers: [],
    }]);
    assert.deepEqual(settings.deckKeybindings["previous-card-in-pile"], []);
    assert.deepEqual(settings.deckKeybindings["toggle-pile"], []);
  });

  test("keeps background pull unbound unless it was explicitly configured", () => {
    const normalized = normalizeDeckKeybindings({
      "open-note": [{ key: "p", modifiers: ["Alt"] }],
    });
    assert.deepEqual(normalized["open-note"], [{
      key: "p",
      modifiers: ["Alt"],
    }]);
    assert.deepEqual(normalized["toggle-tray-without-focus"], []);

    const configured = normalizeDeckKeybindings({
      "toggle-tray-without-focus": [{ key: "q", modifiers: ["Alt"] }],
    });
    assert.deepEqual(configured["toggle-tray-without-focus"], [{
      key: "q",
      modifiers: ["Alt"],
    }]);
  });

  test("formats shifted pile-navigation symbols without redundant Shift text", () => {
    for (const key of ["$", "%", "{", "}"]) {
      assert.equal(formatKeyBinding({ key, modifiers: ["Shift"] }), key);
    }
    assert.equal(formatKeyBinding({ key: " ", modifiers: [] }), "Space");
  });

  test("normalizes per-surface button settings and preserves explicit false", () => {
    const settings = normalizeSettings({
      cardHeaderButtons: {
        deck: { "edit-card": false, "unknown-action": true },
        desk: { "show-card-in-deck": false, "delete-card": true },
        viewed: { "toggle-viewed-card": false },
      },
    });
    assert.equal(settings.cardHeaderButtons.deck["edit-card"], false);
    assert.equal(settings.cardHeaderButtons.deck["open-note"], true);
    assert.equal(settings.cardHeaderButtons.desk["show-card-in-deck"], false);
    assert.equal(settings.cardHeaderButtons.desk["delete-card"], true);
    assert.equal(settings.cardHeaderButtons.viewed["toggle-viewed-card"], false);
    assert.equal("unknown-action" in settings.cardHeaderButtons.deck, false);
  });

  test("makes Enter wholly configurable through Show focused card in Deck", () => {
    const removed = normalizeSettings({
      deckKeybindings: { "show-card-in-deck": [] },
    });
    assert.deepEqual(removed.deckKeybindings["show-card-in-deck"], []);
    assert.equal(
      Object.values(removed.deckKeybindings).flat().some(
        (binding) => binding.key === "Enter",
      ),
      false,
    );

    const rebound = normalizeSettings({
      deckKeybindings: {
        "show-card-in-deck": [{ key: "s", modifiers: ["Mod"] }],
      },
    });
    assert.deepEqual(rebound.deckKeybindings["show-card-in-deck"], [{
      key: "s",
      modifiers: ["Mod"],
    }]);
  });

  test("upgrades the complete previously shipped default map as one unit", () => {
    const previous = {
      "previous-card": [
        { key: "ArrowLeft", modifiers: [] },
        { key: "k", modifiers: [] },
      ],
      "next-card": [
        { key: "ArrowRight", modifiers: [] },
        { key: "j", modifiers: [] },
      ],
      "centre-card": [{ key: "c", modifiers: [] }],
      "first-card": [{ key: "g", modifiers: [] }],
      "last-card": [{ key: "g", modifiers: ["Shift"] }],
      "open-note": [{ key: "o", modifiers: [] }],
      "toggle-tray": [{ key: "p", modifiers: [] }],
      "toggle-bookmark": [{ key: "b", modifiers: [] }],
      back: [],
      forward: [],
      bookmarks: [],
      problems: [],
      "confirm-filing": [],
      "cancel-filing": [],
      "copy-link": [{ key: "y", modifiers: [] }],
    };
    assert.deepEqual(normalizeDeckKeybindings(previous), DEFAULT_SETTINGS.deckKeybindings);
    const withNewCustomization = normalizeDeckKeybindings({
      ...previous,
      "toggle-toolbar": [],
    });
    assert.deepEqual(withNewCustomization["first-card"], [
      { key: "0", modifiers: [] },
    ]);
    assert.equal("toggle-toolbar" in withNewCustomization, false);
  });

  test("preserves every non-default legacy array and protects legacy g", () => {
    const normalized = normalizeDeckKeybindings({
      "first-card": [{ key: "g", modifiers: [] }],
      "last-card": [{ key: "g", modifiers: ["Shift"] }],
      back: [],
      forward: [{ key: "r", modifiers: ["Alt"] }],
      "toggle-bookmark": [],
    });
    assert.deepEqual(normalized["first-card"], [{ key: "g", modifiers: [] }]);
    assert.deepEqual(normalized["last-card"], [{ key: "g", modifiers: ["Shift"] }]);
    assert.equal("back" in normalized, false);
    assert.equal("forward" in normalized, false);
    assert.deepEqual(normalized["toggle-bookmark"], []);
    assert.deepEqual(normalized["find-address-first"], []);
    assert.equal("find-address-forward" in normalized, false);
    assert.equal("find-address-backward" in normalized, false);
    assert.equal("toggle-toolbar" in normalized, false);
  });

  test("supplies missing defaults only when existing bindings do not conflict", () => {
    const normalized = normalizeDeckKeybindings({
      bookmarks: [
        { key: "t", modifiers: [] },
        { key: "d", modifiers: ["Ctrl"] },
      ],
    });
    assert.deepEqual(normalized.bookmarks, [
      { key: "t", modifiers: [] },
      { key: "d", modifiers: ["Ctrl"] },
    ]);
    assert.deepEqual(normalized["forward-ten-cards"], []);
    assert.deepEqual(normalized["backward-ten-cards"], [{
      key: "u",
      modifiers: ["Ctrl"],
    }]);
  });

  test("normalizes, captures, and displays shifted and literal Ctrl bindings", () => {
    assert.deepEqual(normalizeKeyBinding({ key: "H", modifiers: ["Shift"] }), {
      key: "h",
      modifiers: ["Shift"],
    });
    assert.deepEqual(normalizeKeyBinding({ key: "$", modifiers: ["Shift"] }), {
      key: "$",
      modifiers: ["Shift"],
    });
    assert.equal(formatKeyBinding({ key: "$", modifiers: ["Shift"] }), "$");
    assert.equal(formatKeyBinding({ key: "h", modifiers: ["Shift"] }), "Shift+h");

    const base = { metaKey: false, altKey: false };
    assert.deepEqual(keyBindingFromKeyboardEvent({
      ...base,
      key: "d",
      ctrlKey: true,
      shiftKey: false,
    }, true), { key: "d", modifiers: ["Ctrl"] });
    assert.deepEqual(keyBindingFromKeyboardEvent({
      ...base,
      key: "d",
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
    }, true), { key: "d", modifiers: ["Mod"] });
    assert.deepEqual(keyBindingFromKeyboardEvent({
      ...base,
      key: "$",
      ctrlKey: false,
      shiftKey: true,
    }, true), { key: "$", modifiers: ["Shift"] });
  });

  test("persists revised bindings and preserves opaque legacy actions", () => {
    const raw = {
      showDeckToolbar: false,
      deckKeybindings: {
        "removed-action": [{ key: "q", modifiers: [] }],
        back: [{ key: "h", modifiers: ["Shift"] }],
        forward: [{ key: "r", modifiers: ["Alt"] }],
        "toggle-toolbar": [],
        "find-address-forward": [{ key: "f", modifiers: [] }],
        "find-address-backward": [{ key: "f", modifiers: ["Shift"] }],
      },
    };
    const persisted = settingsForPersistence(raw, DEFAULT_SETTINGS);
    const bindings = persisted.deckKeybindings as Record<string, unknown>;
    assert.deepEqual(bindings["removed-action"], [{ key: "q", modifiers: [] }]);
    assert.equal("back" in bindings, false);
    assert.equal("forward" in bindings, false);
    assert.equal("toggle-toolbar" in bindings, false);
    assert.equal("find-address-forward" in bindings, false);
    assert.equal("find-address-backward" in bindings, false);
    assert.equal("showDeckToolbar" in persisted, false);
    assert.deepEqual(bindings["last-card"], [{ key: "$", modifiers: ["Shift"] }]);
    assert.deepEqual(bindings["forward-ten-cards"], [{ key: "d", modifiers: ["Ctrl"] }]);
  });

  test("all action resets point at their revised definition defaults", () => {
    for (const definition of DECK_ACTION_DEFINITIONS) {
      assert.deepEqual(
        DEFAULT_SETTINGS.deckKeybindings[definition.id],
        definition.defaultBindings,
      );
    }
  });

  test("defaults Deck-map visibility and card spread while preserving valid values", () => {
    assert.equal(normalizeSettings({}).showDeckMap, true);
    assert.equal(normalizeSettings({ showDeckMap: "no" }).showDeckMap, true);
    const disabled = normalizeSettings({ showDeckMap: false });
    assert.equal(disabled.showDeckMap, false);
    assert.equal(
      settingsForPersistence({}, disabled).showDeckMap,
      false,
    );
    assert.equal(normalizeSettings({}).cardSpread, DEFAULT_CARD_SPREAD);
    assert.equal(normalizeSettings({ cardSpread: 0.42 }).cardSpread, 0.42);
    assert.equal(normalizeSettings({ cardSpread: 0 }).cardSpread, MIN_CARD_SPREAD);
    assert.equal(normalizeSettings({ cardSpread: 99 }).cardSpread, MAX_CARD_SPREAD);
  });

  test("migrates the card-tooltip preference to the view-wide setting", () => {
    assert.equal(normalizeSettings({ showCardTooltips: true }).showTooltips, true);
    assert.equal(normalizeSettings({
      showCardTooltips: true,
      showTooltips: false,
    }).showTooltips, false);

    const persisted = settingsForPersistence(
      { showCardTooltips: true, unknownFutureKey: "kept" },
      normalizeSettings({ showCardTooltips: true }),
    );
    assert.equal(persisted.showTooltips, true);
    assert.equal("showCardTooltips" in persisted, false);
    assert.equal(persisted.unknownFutureKey, "kept");
  });

  test("normalizes and persists paper-workflow settings", () => {
    const permissive = normalizeSettings({
      restrictViewedCardPaste: false,
      previewLinksOnHover: true,
      followLinksFromCards: true,
      protectFiledCardText: false,
      showAutomaticBacklinks: false,
      allowCardScrolling: false,
    });
    assert.equal(permissive.restrictViewedCardPaste, false);
    assert.equal(permissive.previewLinksOnHover, true);
    assert.equal(permissive.followLinksFromCards, true);
    assert.equal(permissive.protectFiledCardText, false);
    assert.equal(permissive.showAutomaticBacklinks, false);
    assert.equal(permissive.allowCardScrolling, false);

    const persisted = settingsForPersistence({}, permissive);
    assert.equal(persisted.restrictViewedCardPaste, false);
    assert.equal(persisted.previewLinksOnHover, true);
    assert.equal(persisted.followLinksFromCards, true);
    assert.equal(persisted.protectFiledCardText, false);
    assert.equal(persisted.showAutomaticBacklinks, false);
    assert.equal(persisted.allowCardScrolling, false);
  });

  test("purges entry-point shortcuts while preserving other removed settings", () => {
    const raw = {
      addressProperty: "slipbox-id",
      unknownFutureKey: { retained: true },
      deckHeaderButtons: { "add-card": false, bookmark: false },
      deckKeybindings: {
        "add-card": [{ key: "a", modifiers: [] }],
        "new-section": [{ key: "n", modifiers: [] }],
        "entry-points": [{ key: "e", modifiers: [] }],
        back: [],
        forward: [{ key: "r", modifiers: ["Alt"] }],
        "toggle-toolbar": [{ key: "t", modifiers: [] }],
      },
    };
    const settings = normalizeSettings(raw);
    assert.equal("add-card" in settings.cardHeaderButtons.deck, false);
    assert.equal("add-card" in settings.deckKeybindings, false);
    assert.equal("new-section" in settings.deckKeybindings, false);
    assert.equal("entry-points" in settings.deckKeybindings, false);
    assert.equal(
      Object.values(settings.deckKeybindings).flat().some(
        (binding) => binding.key === "a",
      ),
      false,
    );

    const persisted = settingsForPersistence(raw, settings);
    assert.deepEqual(persisted.unknownFutureKey, { retained: true });
    assert.equal("deckHeaderButtons" in persisted, false);
    assert.equal(
      "add-card" in (
        (persisted.cardHeaderButtons as Record<string, unknown>).deck as Record<string, unknown>
      ),
      false,
    );
    assert.deepEqual(
      (persisted.deckKeybindings as Record<string, unknown>)["add-card"],
      [{ key: "a", modifiers: [] }],
    );
    assert.equal(
      "entry-points" in (persisted.deckKeybindings as Record<string, unknown>),
      false,
    );
    assert.equal("back" in (persisted.deckKeybindings as Record<string, unknown>), false);
    assert.equal("forward" in (persisted.deckKeybindings as Record<string, unknown>), false);
    assert.equal(
      "toggle-toolbar" in (persisted.deckKeybindings as Record<string, unknown>),
      false,
    );
  });

  test("purges the retired template settings without touching other keys", () => {
    const raw = {
      useTemplatesForNewNotes: true,
      newNoteTemplatePath: "Templates/Zettel.md",
      newCardFolder: "Cards",
      unknownFutureKey: { retained: true },
    };
    const settings = normalizeSettings(raw);
    assert.equal("useTemplatesForNewNotes" in settings, false);
    assert.equal("newNoteTemplatePath" in settings, false);

    const persisted = settingsForPersistence(raw, settings);
    assert.equal("useTemplatesForNewNotes" in persisted, false);
    assert.equal("newNoteTemplatePath" in persisted, false);
    assert.equal(persisted.newCardFolder, "Cards");
    assert.deepEqual(persisted.unknownFutureKey, { retained: true });
  });

  test("falls back from invalid property settings", () => {
    const settings = normalizeSettings({
      addressProperty: "   ",
      titleSource: "unknown",
      titleProperty: 42,
      mainCardSize: "huge",
      trayCardSize: null,
      newCardFolder: 42,
      newNoteTimestampFormat: "   ",
      showDeckMap: "yes",
      cardSpread: "wide",
    });
    assert.equal(settings.addressProperty, "slipbox-id");
    assert.equal(settings.titleSource, "filename");
    assert.equal(settings.titleProperty, "slipbox-title");
    assert.equal(settings.mainCardSize, "medium");
    assert.equal(settings.trayCardSize, "medium");
    assert.equal(settings.newCardFolder, "");
    assert.equal(settings.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(settings.showDeckMap, true);
    assert.equal(settings.cardSpread, DEFAULT_CARD_SPREAD);
  });

  test("normalizes vault folder paths and rejects traversal", () => {
    assert.equal(normalizeFolderPath(" /Cards//Slipbox/ "), "Cards/Slipbox");
    assert.equal(normalizeFolderPath("Cards/../Archive"), "");
    assert.equal(normalizeFolderPath(null), "");
  });

  test("normalizes the three card-size presets", () => {
    assert.equal(normalizeCardSize("small"), "small");
    assert.equal(normalizeCardSize("medium"), "medium");
    assert.equal(normalizeCardSize("large"), "large");
    assert.equal(normalizeCardSize("oversized"), "medium");
  });

  test("normalizes card spread to finite configured bounds", () => {
    assert.equal(normalizeCardSpread(0.18), 0.18);
    assert.equal(normalizeCardSpread(1.12), 1.12);
    assert.equal(normalizeCardSpread(-1), MIN_CARD_SPREAD);
    assert.equal(normalizeCardSpread(2), MAX_CARD_SPREAD);
    assert.equal(normalizeCardSpread(Number.NaN), DEFAULT_CARD_SPREAD);
  });

  test("detects cross-action conflicts and formats modifiers", () => {
    const binding = { key: "g", modifiers: ["Shift"] as const };
    assert.equal(
      keyBindingConflict(DEFAULT_SETTINGS.deckKeybindings, "open-note", binding),
      null,
    );
    assert.equal(
      keyBindingConflict(
        DEFAULT_SETTINGS.deckKeybindings,
        "open-note",
        { key: "y", modifiers: [] },
      ),
      "copy-link",
    );
    assert.equal(formatKeyBinding(binding), "Shift+g");
    assert.equal(
      keyBindingConflict(
        DEFAULT_SETTINGS.deckKeybindings,
        "open-note",
        { key: "g", modifiers: [] },
      ),
      "find-address-first",
    );
    assert.equal(
      keyBindingConflict(
        DEFAULT_SETTINGS.deckKeybindings,
        "open-note",
        { key: "d", modifiers: ["Ctrl"] },
      ),
      "forward-ten-cards",
    );
  });
});
