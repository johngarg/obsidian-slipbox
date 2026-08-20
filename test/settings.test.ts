import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_SETTINGS,
  formatKeyBinding,
  keyBindingConflict,
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
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["open-note"], [
      { key: "o", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-tray"], [
      { key: "p", modifiers: [] },
    ]);
    assert.equal(DEFAULT_SETTINGS.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(DEFAULT_SETTINGS.newCardFolder, "");
    assert.equal(DEFAULT_SETTINGS.useTemplatesForNewNotes, false);
    assert.equal(DEFAULT_SETTINGS.newNoteTemplatePath, "");
    assert.equal(DEFAULT_SETTINGS.mainCardSize, "medium");
    assert.equal(DEFAULT_SETTINGS.trayCardSize, "medium");
    assert.equal(DEFAULT_SETTINGS.deckOrdering, "natural");
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
  });

  test("ignores removed settings at runtime but preserves them on save", () => {
    const raw = {
      addressProperty: "zettel-id",
      unknownFutureKey: { retained: true },
      deckHeaderButtons: { "add-card": false, bookmark: false },
      deckKeybindings: {
        "add-card": [{ key: "a", modifiers: [] }],
        "new-section": [{ key: "n", modifiers: [] }],
      },
    };
    const settings = normalizeSettings(raw);
    assert.equal("add-card" in settings.deckHeaderButtons, false);
    assert.equal("add-card" in settings.deckKeybindings, false);
    assert.equal("new-section" in settings.deckKeybindings, false);
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
      "last-card",
    );
    assert.equal(formatKeyBinding(binding), "Shift+g");
  });
});
