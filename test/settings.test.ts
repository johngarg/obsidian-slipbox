import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_SETTINGS,
  formatKeyBinding,
  keyBindingConflict,
  normalizeSettings,
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
    assert.equal(DEFAULT_SETTINGS.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(DEFAULT_SETTINGS.useTemplatesForNewNotes, false);
    assert.equal(DEFAULT_SETTINGS.newNoteTemplatePath, "");
  });

  test("normalizes property names, buttons, and configured shortcuts", () => {
    const settings = normalizeSettings({
      addressProperty: " signature ",
      titleSource: "frontmatter",
      titleProperty: " display-name ",
      newNoteTimestampFormat: " YYYYMMDD-HHmmss ",
      useTemplatesForNewNotes: false,
      newNoteTemplatePath: " Templates/Zettel.md ",
      showTitleInDeck: true,
      showTitleInDesk: false,
      deckHeaderButtons: { bookmark: false },
      deskHeaderButtons: { remove: false },
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
    assert.equal(settings.titleSource, "frontmatter");
    assert.equal(settings.titleProperty, "display-name");
    assert.equal(settings.newNoteTimestampFormat, "YYYYMMDD-HHmmss");
    assert.equal(settings.useTemplatesForNewNotes, false);
    assert.equal(settings.newNoteTemplatePath, "Templates/Zettel.md");
    assert.equal(settings.showTitleInDeck, true);
    assert.equal(settings.showTitleInDesk, false);
    assert.equal(settings.deckHeaderButtons.bookmark, false);
    assert.equal(settings.deckHeaderButtons.desk, true);
    assert.equal(settings.deskHeaderButtons.remove, false);
    assert.deepEqual(settings.deckKeybindings["previous-card"], [
      { key: "k", modifiers: [] },
    ]);
    assert.deepEqual(settings.deckKeybindings["next-card"], []);
    assert.deepEqual(settings.deckKeybindings["open-note"], []);
  });

  test("falls back from invalid property settings", () => {
    const settings = normalizeSettings({
      addressProperty: "   ",
      titleSource: "unknown",
      titleProperty: 42,
      newNoteTimestampFormat: "   ",
      useTemplatesForNewNotes: "yes",
      newNoteTemplatePath: 42,
    });
    assert.equal(settings.addressProperty, "zettel-id");
    assert.equal(settings.titleSource, "filename");
    assert.equal(settings.titleProperty, "title");
    assert.equal(settings.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(settings.useTemplatesForNewNotes, false);
    assert.equal(settings.newNoteTemplatePath, "");
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
