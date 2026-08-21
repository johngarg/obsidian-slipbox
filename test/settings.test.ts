import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DECK_ACTION_DEFINITIONS,
  DEFAULT_SETTINGS,
  formatKeyBinding,
  keyBindingFromKeyboardEvent,
  keyBindingConflict,
  normalizeDeckKeybindings,
  normalizeKeyBinding,
  normalizeCardSize,
  normalizeFolderPath,
  normalizeSettings,
  settingsForPersistence,
} from "../src/settings.js";

describe("Slipbox settings", () => {
  test("uses the complete default settings for unknown input", () => {
    assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
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
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["copy-link"], [
      { key: "y", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["back"], [
      { key: "h", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["forward"], [
      { key: "l", modifiers: ["Shift"] },
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
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["find-address-forward"], [
      { key: "f", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["find-address-backward"], [
      { key: "f", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["find-address-first"], [
      { key: "g", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["pull-into-pile"], [
      { key: "p", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-toolbar"], [
      { key: "t", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-deck-map"], [
      { key: "m", modifiers: [] },
    ]);
    assert.equal(DEFAULT_SETTINGS.deckHeaderButtons["copy-link"], true);
    assert.equal(DEFAULT_SETTINGS.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(DEFAULT_SETTINGS.newCardFolder, "");
    assert.equal(DEFAULT_SETTINGS.useTemplatesForNewNotes, false);
    assert.equal(DEFAULT_SETTINGS.newNoteTemplatePath, "");
    assert.equal(DEFAULT_SETTINGS.mainCardSize, "medium");
    assert.equal(DEFAULT_SETTINGS.trayCardSize, "medium");
    assert.equal(DEFAULT_SETTINGS.deckOrdering, "natural");
    assert.equal(DEFAULT_SETTINGS.showDeckToolbar, true);
    assert.equal(DEFAULT_SETTINGS.showDeckMap, true);
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
      useTemplatesForNewNotes: false,
      newNoteTemplatePath: " Templates/Zettel.md ",
      showTitleInDeck: true,
      showDeckToolbar: false,
      showDeckMap: false,
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
    assert.equal(settings.useTemplatesForNewNotes, false);
    assert.equal(settings.newNoteTemplatePath, "Templates/Zettel.md");
    assert.equal(settings.showTitleInDeck, true);
    assert.equal(settings.showDeckToolbar, false);
    assert.equal(settings.showDeckMap, false);
    assert.equal(settings.deckHeaderButtons.bookmark, false);
    assert.equal(settings.deckHeaderButtons.tray, false);
    assert.equal("desk" in settings.deckHeaderButtons, false);
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
    assert.equal(settings.deckHeaderButtons["copy-link"], true);
  });

  test("preserves customized and deliberately empty copy-link settings", () => {
    const customized = normalizeSettings({
      deckHeaderButtons: { "copy-link": false },
      deckKeybindings: {
        "copy-link": [{ key: "L", modifiers: ["Mod"] }],
      },
    });
    assert.equal(customized.deckHeaderButtons["copy-link"], false);
    assert.deepEqual(customized.deckKeybindings["copy-link"], [{
      key: "l",
      modifiers: ["Mod"],
    }]);

    const empty = normalizeSettings({
      deckKeybindings: { "copy-link": [] },
    });
    assert.deepEqual(empty.deckKeybindings["copy-link"], []);
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
      { key: "g", modifiers: [] },
    ]);
    assert.deepEqual(withNewCustomization["toggle-toolbar"], []);
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
    assert.deepEqual(normalized.back, []);
    assert.deepEqual(normalized.forward, [{ key: "r", modifiers: ["Alt"] }]);
    assert.deepEqual(normalized["toggle-bookmark"], []);
    assert.deepEqual(normalized["find-address-first"], []);
    assert.deepEqual(normalized["find-address-backward"], [{
      key: "f",
      modifiers: ["Shift"],
    }]);
    assert.deepEqual(normalized["toggle-toolbar"], [{ key: "t", modifiers: [] }]);
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
    assert.deepEqual(normalized["toggle-toolbar"], []);
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
      deckKeybindings: {
        "removed-action": [{ key: "q", modifiers: [] }],
      },
    };
    const persisted = settingsForPersistence(raw, DEFAULT_SETTINGS);
    const bindings = persisted.deckKeybindings as Record<string, unknown>;
    assert.deepEqual(bindings["removed-action"], [{ key: "q", modifiers: [] }]);
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

  test("defaults older Deck chrome settings on while preserving explicit disablement", () => {
    assert.equal(normalizeSettings({}).showDeckToolbar, true);
    assert.equal(normalizeSettings({ showDeckToolbar: "no" }).showDeckToolbar, true);
    const toolbarDisabled = normalizeSettings({ showDeckToolbar: false });
    assert.equal(toolbarDisabled.showDeckToolbar, false);
    assert.equal(
      settingsForPersistence({}, toolbarDisabled).showDeckToolbar,
      false,
    );
    assert.equal(normalizeSettings({}).showDeckMap, true);
    assert.equal(normalizeSettings({ showDeckMap: "no" }).showDeckMap, true);
    const disabled = normalizeSettings({ showDeckMap: false });
    assert.equal(disabled.showDeckMap, false);
    assert.equal(
      settingsForPersistence({}, disabled).showDeckMap,
      false,
    );
  });

  test("purges entry-point shortcuts while preserving other removed settings", () => {
    const raw = {
      addressProperty: "zettel-id",
      unknownFutureKey: { retained: true },
      deckHeaderButtons: { "add-card": false, bookmark: false },
      deckKeybindings: {
        "add-card": [{ key: "a", modifiers: [] }],
        "new-section": [{ key: "n", modifiers: [] }],
        "entry-points": [{ key: "e", modifiers: [] }],
      },
    };
    const settings = normalizeSettings(raw);
    assert.equal("add-card" in settings.deckHeaderButtons, false);
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
    assert.equal(
      (persisted.deckHeaderButtons as Record<string, unknown>)["add-card"],
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
      useTemplatesForNewNotes: "yes",
      newNoteTemplatePath: 42,
      showDeckToolbar: "yes",
      showDeckMap: "yes",
    });
    assert.equal(settings.addressProperty, "zettel-id");
    assert.equal(settings.titleSource, "filename");
    assert.equal(settings.titleProperty, "title");
    assert.equal(settings.mainCardSize, "medium");
    assert.equal(settings.trayCardSize, "medium");
    assert.equal(settings.newCardFolder, "");
    assert.equal(settings.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(settings.useTemplatesForNewNotes, false);
    assert.equal(settings.newNoteTemplatePath, "");
    assert.equal(settings.showDeckToolbar, true);
    assert.equal(settings.showDeckMap, true);
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
