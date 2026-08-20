import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_SPREAD,
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
          { id: "bookmark-1", zettelId: "2/3a", label: "Here" },
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
          { id: "good", zettelId: "4/1", label: "" },
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
