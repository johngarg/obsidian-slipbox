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
        spread: 0.75,
      }),
      {
        entryPoints: [{ name: "Systems", id: "1/1" }],
        lastActiveId: "2/3a",
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
        spread: 99,
      }),
      {
        entryPoints: [{ name: "Good", id: "3/1a" }],
        lastActiveId: null,
        spread: 1.12,
      },
    );
  });

  test("uses defaults for unknown data", () => {
    assert.deepEqual(normalizePluginState(null), {
      entryPoints: [],
      lastActiveId: null,
      spread: DEFAULT_SPREAD,
    });
  });
});
