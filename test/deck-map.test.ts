import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildDeckMapModel,
  buildDeckMapSectionMarkers,
  deckMapCoordinate,
  deckMapIndexAtOffset,
  sampleDeckMapIndices,
  visibleDeckMapSectionMarkers,
} from "../src/deck-map.js";

describe("Deck map", () => {
  test("returns an empty model for an empty Deck", () => {
    assert.deepEqual(buildDeckMapModel([], null, []), {
      cardCount: 0,
      active: null,
      bookmarks: [],
    });
    assert.equal(deckMapCoordinate(0, 0), null);
  });

  test("centres the only filed card", () => {
    assert.deepEqual(buildDeckMapModel(["only.md"], "only.md", ["only.md"]), {
      cardCount: 1,
      active: { path: "only.md", ordinal: 1, position: 0.5 },
      bookmarks: [{ path: "only.md", ordinal: 1, position: 0.5 }],
    });
  });

  test("places endpoints and interior cards proportionally", () => {
    const paths = ["a.md", "b.md", "c.md", "d.md", "e.md"];
    assert.equal(buildDeckMapModel(paths, "a.md", []).active?.position, 0);
    assert.equal(buildDeckMapModel(paths, "c.md", []).active?.position, 0.5);
    assert.equal(buildDeckMapModel(paths, "e.md", []).active?.position, 1);
  });

  test("omits unresolved active and bookmark paths", () => {
    assert.deepEqual(
      buildDeckMapModel(["a.md", "b.md"], "missing.md", [
        "b.md",
        "missing.md",
      ]),
      {
        cardCount: 2,
        active: null,
        bookmarks: [{ path: "b.md", ordinal: 2, position: 1 }],
      },
    );
  });

  test("keeps exact paths distinct and deduplicates bookmark input", () => {
    const model = buildDeckMapModel(
      ["Duplicate/one.md", "Duplicate/two.md", "other.md"],
      "Duplicate/two.md",
      ["Duplicate/one.md", "Duplicate/two.md", "Duplicate/one.md"],
    );
    assert.deepEqual(model.bookmarks, [
      { path: "Duplicate/one.md", ordinal: 1, position: 0 },
      { path: "Duplicate/two.md", ordinal: 2, position: 0.5 },
    ]);
    assert.deepEqual(model.active, {
      path: "Duplicate/two.md",
      ordinal: 2,
      position: 0.5,
    });
  });

  test("derives every position from the supplied Deck order", () => {
    const natural = buildDeckMapModel(
      ["A-2.md", "A-10.md"],
      "A-2.md",
      ["A-10.md"],
    );
    const lexicographic = buildDeckMapModel(
      ["A-10.md", "A-2.md"],
      "A-2.md",
      ["A-10.md"],
    );
    assert.equal(natural.active?.position, 0);
    assert.equal(natural.bookmarks[0]?.position, 1);
    assert.equal(lexicographic.active?.position, 1);
    assert.equal(lexicographic.bookmarks[0]?.position, 0);
  });

  test("rejects invalid direct coordinate requests", () => {
    assert.equal(deckMapCoordinate(-1, 3), null);
    assert.equal(deckMapCoordinate(3, 3), null);
    assert.equal(deckMapCoordinate(0.5, 3), null);
  });

  test("marks the first card whenever the first address character changes", () => {
    assert.deepEqual(buildDeckMapSectionMarkers([
      { path: "one.md", address: "1/1" },
      { path: "two.md", address: "1/2" },
      { path: "alpha.md", address: "A/1" },
      { path: "alpha-child.md", address: "A/1a" },
      { path: "beta.md", address: "B/1" },
    ]), [
      { path: "one.md", ordinal: 1, position: 0, label: "1" },
      { path: "alpha.md", ordinal: 3, position: 0.5, label: "A" },
      { path: "beta.md", ordinal: 5, position: 1, label: "B" },
    ]);
  });

  test("keeps the first section label when later labels would overlap", () => {
    const sections = buildDeckMapSectionMarkers([
      { path: "a.md", address: "A" },
      { path: "b.md", address: "B" },
      { path: "b2.md", address: "B2" },
      { path: "c.md", address: "C" },
      { path: "c2.md", address: "C2" },
      { path: "c3.md", address: "C3" },
    ]);
    assert.deepEqual(
      visibleDeckMapSectionMarkers(sections, 50, 14).map(({ label }) => label),
      ["A", "C"],
    );
  });

  test("resolves clicks to the nearest filed-card dot", () => {
    assert.equal(deckMapIndexAtOffset(0, 100, 5), 0);
    assert.equal(deckMapIndexAtOffset(24, 100, 5), 1);
    assert.equal(deckMapIndexAtOffset(76, 100, 5), 3);
    assert.equal(deckMapIndexAtOffset(100, 100, 5), 4);
    assert.equal(deckMapIndexAtOffset(-20, 100, 5), 0);
    assert.equal(deckMapIndexAtOffset(120, 100, 5), 4);
    assert.equal(deckMapIndexAtOffset(20, 100, 1), 0);
    assert.equal(deckMapIndexAtOffset(0, 0, 5), null);
  });

  test("bounds dense map markers while retaining evenly spaced endpoints", () => {
    assert.deepEqual(sampleDeckMapIndices(5, 10), [0, 1, 2, 3, 4]);
    assert.deepEqual(sampleDeckMapIndices(10_000, 5), [0, 2500, 5000, 7499, 9999]);
    assert.equal(sampleDeckMapIndices(100_000, 512).length, 512);
    assert.deepEqual(sampleDeckMapIndices(10, 1), [4]);
    assert.deepEqual(sampleDeckMapIndices(0, 10), []);
    assert.deepEqual(sampleDeckMapIndices(10, 0), []);
  });
});
