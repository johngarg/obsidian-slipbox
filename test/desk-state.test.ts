import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  normalizeDeskCards,
  removeDeskPath,
  renameDeskCard,
} from "../src/desk-state.js";

describe("legacy Desk migration state", () => {
  test("normalizes persisted coordinates and ignores malformed duplicates", () => {
    assert.deepEqual(
      normalizeDeskCards([
        { cardRef: "one.md", x: -20, y: 90, z: 1.4 },
        { cardRef: "one.md", x: 200, y: 200, z: 2 },
        { cardRef: "bad.md", x: "left", y: 0, z: 0 },
      ]),
      [{ cardRef: "one.md", x: 0, y: 90, z: 1 }],
    );
  });

  test("renames and deletes Desk references beneath moved folders", () => {
    const cards = renameDeskCard([
      { cardRef: "Ideas/one.md", x: 10, y: 20, z: 1 },
      { cardRef: "Ideas/Nested/two.md", x: 30, y: 40, z: 2 },
      { cardRef: "Elsewhere/three.md", x: 50, y: 60, z: 3 },
    ], "Ideas", "Archive/Ideas");
    assert.deepEqual(cards.map((card) => card.cardRef), [
      "Archive/Ideas/one.md",
      "Archive/Ideas/Nested/two.md",
      "Elsewhere/three.md",
    ]);
    assert.deepEqual(
      removeDeskPath(cards, "Archive/Ideas").map((card) => card.cardRef),
      ["Elsewhere/three.md"],
    );
  });
});
