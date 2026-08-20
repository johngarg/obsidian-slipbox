import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_DATA,
  DEFAULT_SPREAD,
  MIN_SPREAD,
  normalizePluginData,
  normalizePluginState,
} from "../src/plugin-state.js";

describe("normalizePluginState", () => {
  test("loads valid persistent state", () => {
    assert.deepEqual(
      normalizePluginState({
        entryPoints: [{ name: " Systems ", id: "1/1" }],
        lastActiveId: "2/3a",
        bookmarks: [
          { path: "Cards/here.md", label: " Here ", color: "blue" },
        ],
        legacyDeskCards: [{ cardRef: "Ideas/one.md", x: 120, y: 240, z: 3 }],
        spread: 0.75,
      }),
      {
        entryPoints: [{ name: "Systems", id: "1/1" }],
        bookmarks: [
          { path: "Cards/here.md" },
        ],
        legacyDeskCards: [{ cardRef: "Ideas/one.md", x: 120, y: 240, z: 3 }],
        spread: 0.75,
      },
    );
  });

  test("drops malformed routes and clamps visual state", () => {
    assert.deepEqual(
      normalizePluginState({
        entryPoints: [
          { name: "", id: "1/1" },
          { name: "Bad", id: "1/01" },
          { name: "Good", id: "3/1a" },
        ],
        lastActiveId: "not-an-id",
        bookmarks: [
          { id: "bad", zettelId: "1/01", color: "infrared" },
          { path: "Cards/good.md", color: "infrared" },
        ],
        deskCards: [{ cardRef: "", x: 0, y: 0, z: 0 }],
        spread: 99,
      }),
      {
        entryPoints: [{ name: "Good", id: "3/1a" }],
        bookmarks: [
          { path: "Cards/good.md" },
        ],
        spread: 1.12,
      },
    );
  });

  test("allows a tighter spread and clamps values below it", () => {
    assert.equal(normalizePluginState({ spread: 0.2 }).spread, 0.2);
    assert.equal(normalizePluginState({ spread: 0 }).spread, MIN_SPREAD);
  });

  test("uses defaults for unknown data", () => {
    assert.deepEqual(normalizePluginState(null), {
      entryPoints: [],
      bookmarks: [],
      spread: DEFAULT_SPREAD,
    });
  });

  test("migrates v0.1 state by dropping persistent resume position", () => {
    assert.deepEqual(
      normalizePluginState({
        entryPoints: [{ name: "Start", id: "1/1" }],
        lastActiveId: "9/9",
        spread: 0.58,
      }),
      {
        entryPoints: [{ name: "Start", id: "1/1" }],
        bookmarks: [],
        spread: 0.58,
      },
    );
  });
});

describe("normalizePluginData", () => {
  test("migrates legacy flat state into versioned settings and state", () => {
    const data = normalizePluginData({
      entryPoints: [{ name: "Start", id: "1/1" }],
      bookmarks: [{ zettelId: "1/1" }],
      deskCards: [{ cardRef: "Start.md", x: 10, y: 20, z: 1 }],
      spread: 0.7,
    });
    assert.equal(data.schemaVersion, 3);
    assert.equal(data.settings.addressProperty, "zettel-id");
    assert.deepEqual(data.state.entryPoints, [{ name: "Start", id: "1/1" }]);
    assert.deepEqual(data.state.bookmarks, [{ zettelId: "1/1" }]);
    assert.deepEqual(data.state.legacyDeskCards, [
      { cardRef: "Start.md", x: 10, y: 20, z: 1 },
    ]);
    assert.equal(data.state.spread, 0.7);
  });

  test("loads current versioned settings without losing workspace state", () => {
    const data = normalizePluginData({
      schemaVersion: 1,
      settings: {
        addressProperty: "signature",
        titleSource: "frontmatter",
        titleProperty: "name",
        newCardFolder: "Cards",
        showTitleInDeck: true,
      },
      state: {
        entryPoints: [],
        bookmarks: [],
        spread: 0.42,
      },
    });
    assert.equal(data.settings.addressProperty, "signature");
    assert.equal(data.settings.titleProperty, "name");
    assert.equal(data.settings.newCardFolder, "Cards");
    assert.equal(data.settings.showTitleInDeck, true);
    assert.equal(data.settings.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(data.settings.useTemplatesForNewNotes, false);
    assert.equal(data.state.spread, 0.42);
    assert.equal("legacyDeskCards" in data.state, false);
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
  });
});
