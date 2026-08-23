import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_DATA,
  hasRemovedEntryPointData,
  hasTitleAddressCollisionData,
  needsPluginDataMigration,
  normalizePluginData,
  normalizePluginState,
} from "../src/plugin-state.js";
import { MAX_CARD_SPREAD, MIN_CARD_SPREAD } from "../src/settings.js";

describe("normalizePluginState", () => {
  test("loads valid persistent workspace state and drops retired fields", () => {
    assert.deepEqual(
      normalizePluginState({
        entryPoints: [{ name: " Systems ", id: "1/1" }],
        lastActiveId: "2/3a",
        history: { entries: ["Cards/here.md"], index: 0 },
        toolbarOverride: false,
        bookmarks: [
          { path: "Cards/here.md", label: " Here ", color: "blue" },
        ],
        legacyDeskCards: [{ cardRef: "Ideas/one.md", x: 120, y: 240, z: 3 }],
        spread: 0.75,
      }),
      {
        bookmarks: [
          { path: "Cards/here.md" },
        ],
        legacyDeskCards: [{ cardRef: "Ideas/one.md", x: 120, y: 240, z: 3 }],
      },
    );
  });

  test("drops removed entry points and malformed Desk data", () => {
    assert.deepEqual(
      normalizePluginState({
        entryPoints: [
          { name: "", id: "1/1" },
          { name: "Bad", id: " A/1" },
          { name: "Good", id: "3/1a" },
        ],
        lastActiveId: "not-an-id",
        bookmarks: [
          { id: "bad", zettelId: " A/1", color: "infrared" },
          { path: "Cards/good.md", color: "infrared" },
        ],
        deskCards: [{ cardRef: "", x: 0, y: 0, z: 0 }],
        spread: 99,
      }),
      {
        bookmarks: [
          { path: "Cards/good.md" },
        ],
      },
    );
  });

  test("uses defaults for unknown data", () => {
    assert.deepEqual(normalizePluginState(null), { bookmarks: [] });
  });
});

describe("normalizePluginData", () => {
  test("migrates legacy flat state into schema-10 settings and state", () => {
    const data = normalizePluginData({
      entryPoints: [{ name: "Start", id: "1/1" }],
      bookmarks: [{ zettelId: "1/1" }],
      deskCards: [{ cardRef: "Start.md", x: 10, y: 20, z: 1 }],
      spread: 0.7,
    });
    assert.equal(data.schemaVersion, 10);
    assert.equal(data.settings.restrictViewedCardPaste, false);
    assert.equal(data.settings.previewLinksOnHover, true);
    assert.equal(data.settings.followLinksFromCards, true);
    assert.equal(data.settings.protectFiledCardText, false);
    assert.equal(data.settings.addressProperty, "zettel-id");
    assert.equal(data.settings.deckOrdering, "natural");
    assert.equal(data.settings.showDeckMap, true);
    assert.equal(data.settings.cardSpread, 0.7);
    assert.equal("entryPoints" in data.state, false);
    assert.equal("spread" in data.state, false);
    assert.deepEqual(data.state.bookmarks, [{ zettelId: "1/1" }]);
    assert.deepEqual(data.state.legacyDeskCards, [
      { cardRef: "Start.md", x: 10, y: 20, z: 1 },
    ]);
  });

  test("migrates schema 7 spread and removes history, toolbar, and template settings", () => {
    const data = normalizePluginData({
      schemaVersion: 7,
      settings: {
        addressProperty: "signature",
        titleSource: "frontmatter",
        titleProperty: "name",
        newCardFolder: "Cards",
        showTitleInDeck: true,
        showDeckToolbar: false,
        showDeckMap: false,
        useTemplatesForNewNotes: true,
        newNoteTemplatePath: "Templates/Zettel.md",
        deckKeybindings: {
          back: [{ key: "h", modifiers: ["Shift"] }],
          forward: [{ key: "r", modifiers: ["Alt"] }],
          "toggle-toolbar": [],
          "open-note": [{ key: "o", modifiers: [] }],
        },
      },
      state: {
        bookmarks: [{ path: "Cards/here.md" }],
        spread: 0.42,
        history: { entries: ["Cards/here.md"], index: 0 },
      },
    });
    assert.equal(data.schemaVersion, 10);
    assert.equal(data.settings.addressProperty, "signature");
    assert.equal(data.settings.titleProperty, "name");
    assert.equal(data.settings.newCardFolder, "Cards");
    assert.equal(data.settings.showTitleInDeck, true);
    assert.equal(data.settings.showDeckMap, false);
    assert.equal(data.settings.cardSpread, 0.42);
    assert.equal("showDeckToolbar" in data.settings, false);
    assert.equal("useTemplatesForNewNotes" in data.settings, false);
    assert.equal("newNoteTemplatePath" in data.settings, false);
    assert.equal("back" in data.settings.deckKeybindings, false);
    assert.equal("forward" in data.settings.deckKeybindings, false);
    assert.equal("toggle-toolbar" in data.settings.deckKeybindings, false);
    assert.deepEqual(data.settings.deckKeybindings["open-note"], [
      { key: "o", modifiers: [] },
    ]);
    assert.deepEqual(data.state.bookmarks, [{ path: "Cards/here.md" }]);
    assert.equal("spread" in data.state, false);
    assert.equal("history" in data.state, false);
  });

  test("prefers current cardSpread and clamps migrated legacy spread", () => {
    const current = normalizePluginData({
      schemaVersion: 8,
      settings: { cardSpread: 0.63 },
      state: { spread: 0.2 },
    });
    assert.equal(current.settings.cardSpread, 0.63);
    assert.equal("spread" in current.state, false);

    const low = normalizePluginData({
      schemaVersion: 7,
      settings: {},
      state: { spread: 0 },
    });
    const high = normalizePluginData({
      schemaVersion: 7,
      settings: {},
      state: { spread: 99 },
    });
    assert.equal(low.settings.cardSpread, MIN_CARD_SPREAD);
    assert.equal(high.settings.cardSpread, MAX_CARD_SPREAD);
  });

  test("normalizes current legacy migration data and removes empty Desk fields", () => {
    const populated = normalizePluginData({
      schemaVersion: 2,
      state: {
        legacyDeskCards: [{ cardRef: "one.md", x: 1, y: 2, z: 3 }],
      },
    });
    assert.deepEqual(populated.state.legacyDeskCards, [
      { cardRef: "one.md", x: 1, y: 2, z: 3 },
    ]);

    const empty = normalizePluginData({
      schemaVersion: 1,
      state: { deskCards: [] },
    });
    assert.equal("deskCards" in empty.state, false);
    assert.equal("legacyDeskCards" in empty.state, false);
  });

  test("uses complete defaults for unknown data", () => {
    assert.deepEqual(normalizePluginData(null), DEFAULT_DATA);
    assert.equal(DEFAULT_DATA.settings.restrictViewedCardPaste, true);
    assert.equal(DEFAULT_DATA.settings.previewLinksOnHover, false);
    assert.equal(DEFAULT_DATA.settings.followLinksFromCards, false);
    assert.equal(DEFAULT_DATA.settings.protectFiledCardText, true);
  });

  test("preserves permissive paper-workflow behavior for existing data", () => {
    for (const existing of [
      {},
      { schemaVersion: 9, settings: {}, state: {} },
      { schemaVersion: 9, settings: { showDeckMap: false }, state: {} },
    ]) {
      const data = normalizePluginData(existing);
      assert.equal(data.settings.restrictViewedCardPaste, false);
      assert.equal(data.settings.previewLinksOnHover, true);
      assert.equal(data.settings.followLinksFromCards, true);
      assert.equal(data.settings.protectFiledCardText, false);
    }

    const explicit = normalizePluginData({
      schemaVersion: 9,
      settings: {
        restrictViewedCardPaste: true,
        previewLinksOnHover: false,
        followLinksFromCards: false,
        protectFiledCardText: true,
      },
      state: {},
    });
    assert.equal(explicit.settings.restrictViewedCardPaste, true);
    assert.equal(explicit.settings.previewLinksOnHover, false);
    assert.equal(explicit.settings.followLinksFromCards, false);
    assert.equal(explicit.settings.protectFiledCardText, true);
  });

  test("uses paper defaults for schema-10 data with missing or invalid values", () => {
    const data = normalizePluginData({
      schemaVersion: 10,
      settings: {
        restrictViewedCardPaste: "yes",
        previewLinksOnHover: null,
        followLinksFromCards: 1,
        protectFiledCardText: {},
      },
      state: {},
    });
    assert.equal(data.settings.restrictViewedCardPaste, true);
    assert.equal(data.settings.previewLinksOnHover, false);
    assert.equal(data.settings.followLinksFromCards, false);
    assert.equal(data.settings.protectFiledCardText, true);
  });

  test("detects removed entry-point data for eager persistence cleanup", () => {
    assert.equal(hasRemovedEntryPointData({ entryPoints: [] }), true);
    assert.equal(hasRemovedEntryPointData({
      state: { entryPoints: [{ name: "Start", address: "1/1" }] },
    }), true);
    assert.equal(hasRemovedEntryPointData({
      settings: { deckKeybindings: { "entry-points": [] } },
      state: {},
    }), true);
    assert.equal(hasRemovedEntryPointData({
      settings: { deckKeybindings: { bookmarks: [] } },
      state: { bookmarks: [] },
    }), false);
  });

  test("detects schema and title-key migrations", () => {
    const collision = {
      schemaVersion: 5,
      settings: {
        addressProperty: "zettel-id",
        titleSource: "frontmatter",
        titleProperty: "zettel-id",
      },
      state: {},
    };
    assert.equal(needsPluginDataMigration(collision), true);
    assert.equal(hasTitleAddressCollisionData(collision), true);
    assert.equal(normalizePluginData(collision).schemaVersion, 10);
    assert.equal(normalizePluginData(collision).settings.titleSource, "filename");
    assert.equal(needsPluginDataMigration({ ...collision, schemaVersion: 8 }), true);
    assert.equal(needsPluginDataMigration({ ...collision, schemaVersion: 9 }), true);
    assert.equal(needsPluginDataMigration({ ...collision, schemaVersion: 10 }), false);
    assert.equal(hasTitleAddressCollisionData(null), false);
  });
});
