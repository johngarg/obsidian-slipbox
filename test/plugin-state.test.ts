import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_DATA,
  loadPluginData,
  normalizePluginState,
} from "../src/plugin-state.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";

describe("normalizePluginState", () => {
  test("loads unique path bookmarks and drops every other state field", () => {
    assert.deepEqual(normalizePluginState({
      bookmarks: [
        { path: "Cards/here.md", label: "Old label" },
        { path: "Cards/here.md" },
        { zettelId: "8a" },
        { path: "Cards/there.md" },
      ],
      legacyDeskCards: [{ cardRef: "Cards/here.md", x: 1, y: 2, z: 3 }],
      entryPoints: [{ name: "Start", id: "8" }],
    }), {
      bookmarks: [
        { path: "Cards/here.md" },
        { path: "Cards/there.md" },
      ],
    });
  });

  test("uses empty state for unknown data", () => {
    assert.deepEqual(normalizePluginState(null), { bookmarks: [] });
  });
});

describe("loadPluginData", () => {
  test("uses defaults without a reset notice for a new installation", () => {
    assert.deepEqual(loadPluginData(null), {
      data: DEFAULT_DATA,
      reset: false,
    });
  });

  test("loads and normalizes only canonical schema-14 fields", () => {
    const loaded = loadPluginData({
      schemaVersion: 14,
      settings: {
        ...DEFAULT_SETTINGS,
        addressProperty: " signature ",
        deskCardSize: "large",
        showTooltips: true,
      },
      state: {
        bookmarks: [{ path: "Cards/here.md" }, { zettelId: "8a" }],
        legacyDeskCards: [{ cardRef: "Cards/here.md", x: 1, y: 2, z: 3 }],
      },
    });

    assert.equal(loaded.reset, false);
    assert.equal(loaded.data.settings.addressProperty, "signature");
    assert.equal(loaded.data.settings.deskCardSize, "large");
    assert.equal(loaded.data.settings.showTooltips, true);
    assert.deepEqual(loaded.data.state, {
      bookmarks: [{ path: "Cards/here.md" }],
    });
  });

  test("resets released beta schemas but salvages nested path bookmarks", () => {
    for (const schemaVersion of [11, 12, 13]) {
      const loaded = loadPluginData({
        schemaVersion,
        settings: {
          addressProperty: "signature",
          trayCardSize: "large",
          showCardTooltips: true,
          deckKeybindings: {
            "toggle-tray": [{ key: "q", modifiers: ["Alt"] }],
            "toggle-tray-without-focus": [{ key: "w", modifiers: ["Alt"] }],
          },
        },
        state: {
          bookmarks: [
            { path: "Cards/here.md" },
            { zettelId: "8a" },
            { path: "Cards/here.md" },
          ],
          legacyDeskCards: [{ cardRef: "Cards/here.md", x: 1, y: 2, z: 3 }],
        },
      });

      assert.equal(loaded.reset, true);
      assert.equal(loaded.data.settings, DEFAULT_SETTINGS);
      assert.deepEqual(loaded.data.state, {
        bookmarks: [{ path: "Cards/here.md" }],
      });
      assert.equal(loaded.data.schemaVersion, 14);
    }
  });

  test("discards flat pre-schema data and all of its state", () => {
    const loaded = loadPluginData({
      addressProperty: "signature",
      bookmarks: [{ path: "Cards/here.md" }],
      deskCards: [{ cardRef: "Cards/here.md", x: 1, y: 2, z: 3 }],
    });

    assert.equal(loaded.reset, true);
    assert.equal(loaded.data.settings, DEFAULT_SETTINGS);
    assert.deepEqual(loaded.data.state, { bookmarks: [] });
  });

  test("normalizes malformed current values instead of invoking a migration", () => {
    const loaded = loadPluginData({
      schemaVersion: 14,
      settings: {
        addressProperty: "",
        deskCardSize: "huge",
        showTooltips: "yes",
      },
      state: { bookmarks: "invalid" },
    });

    assert.equal(loaded.reset, false);
    assert.equal(loaded.data.settings.addressProperty, DEFAULT_SETTINGS.addressProperty);
    assert.equal(loaded.data.settings.deskCardSize, DEFAULT_SETTINGS.deskCardSize);
    assert.equal(loaded.data.settings.showTooltips, DEFAULT_SETTINGS.showTooltips);
    assert.deepEqual(loaded.data.state, { bookmarks: [] });
  });
});
