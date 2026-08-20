import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_DATA,
  DEFAULT_SPREAD,
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
          { id: "bookmark-1", zettelId: "2/3a", label: " Here ", color: "blue" },
        ],
        deskCards: [{ cardRef: "Ideas/one.md", x: 120, y: 240, z: 3 }],
        spread: 0.75,
      }),
      {
        entryPoints: [{ name: "Systems", id: "1/1" }],
        bookmarks: [
          { zettelId: "2/3a" },
        ],
        deskCards: [{ cardRef: "Ideas/one.md", x: 120, y: 240, z: 3 }],
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
          { id: "good", zettelId: "4/1", color: "infrared" },
        ],
        deskCards: [{ cardRef: "", x: 0, y: 0, z: 0 }],
        spread: 99,
      }),
      {
        entryPoints: [{ name: "Good", id: "3/1a" }],
        bookmarks: [
          { zettelId: "4/1" },
        ],
        deskCards: [],
        spread: 1.12,
      },
    );
  });

  test("uses defaults for unknown data", () => {
    assert.deepEqual(normalizePluginState(null), {
      entryPoints: [],
      bookmarks: [],
      deskCards: [],
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
        deskCards: [],
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
    assert.equal(data.schemaVersion, 1);
    assert.equal(data.settings.addressProperty, "zettel-id");
    assert.deepEqual(data.state.entryPoints, [{ name: "Start", id: "1/1" }]);
    assert.deepEqual(data.state.bookmarks, [{ zettelId: "1/1" }]);
    assert.equal(data.state.spread, 0.7);
  });

  test("loads current versioned settings without losing workspace state", () => {
    const data = normalizePluginData({
      schemaVersion: 1,
      settings: {
        addressProperty: "signature",
        titleSource: "frontmatter",
        titleProperty: "name",
        showTitleInDeck: true,
      },
      state: {
        entryPoints: [],
        bookmarks: [],
        deskCards: [],
        spread: 0.42,
      },
    });
    assert.equal(data.settings.addressProperty, "signature");
    assert.equal(data.settings.titleProperty, "name");
    assert.equal(data.settings.showTitleInDeck, true);
    assert.equal(data.settings.newNoteTimestampFormat, "YYYY-MM-DD HHmmss");
    assert.equal(data.settings.useTemplatesForNewNotes, true);
    assert.equal(data.state.spread, 0.42);
  });

  test("uses complete defaults for unknown data", () => {
    assert.deepEqual(normalizePluginData(null), DEFAULT_DATA);
  });
});
