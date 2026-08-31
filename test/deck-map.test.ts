import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  bucketDeckMapLandmarks,
  buildDeckMapLandmarks,
  buildDeckMapSections,
  deckMapAriaValueText,
  deckMapCoordinate,
  deckMapIndexAtOffset,
  deckMapPhysicalPixelBucket,
  deckMapPhysicalPixelWidth,
  deckMapReadout,
  deckMapSectionLabel,
  deckMapViewportRange,
  preventPrimaryDeckMapPointerFocus,
  visibleDeckMapSectionLabels,
  type DeckMapCard,
  type DeckMapClusterLandmark,
} from "../src/deck-map.js";

function card(
  path: string,
  address: string,
  options: Partial<Pick<DeckMapCard, "title" | "color" | "onDesk">> = {},
): DeckMapCard {
  return {
    path,
    address,
    title: options.title ?? path.replace(/\.md$/u, ""),
    color: options.color ?? null,
    onDesk: options.onDesk ?? false,
  };
}

describe("Deck map", () => {
  test("prevents only primary pointer focus", () => {
    let prevented = 0;
    preventPrimaryDeckMapPointerFocus({
      button: 0,
      preventDefault: () => { prevented += 1; },
    });
    preventPrimaryDeckMapPointerFocus({
      button: 1,
      preventDefault: () => { prevented += 1; },
    });
    assert.equal(prevented, 1);
  });

  test("maps empty, single, first, middle, and last coordinates exactly", () => {
    assert.equal(deckMapCoordinate(0, 0), null);
    assert.equal(deckMapCoordinate(0, 1), 0.5);
    assert.equal(deckMapCoordinate(0, 5), 0);
    assert.equal(deckMapCoordinate(2, 5), 0.5);
    assert.equal(deckMapCoordinate(4, 5), 1);
    assert.equal(deckMapCoordinate(-1, 5), null);
    assert.equal(deckMapCoordinate(5, 5), null);
    assert.equal(deckMapCoordinate(0.5, 5), null);
  });

  test("derives proportional consecutive sections without deeper invention", () => {
    const sections = buildDeckMapSections([
      card("one.md", "1/1"),
      card("two.md", "1/2"),
      card("ten-decimal.md", "10,5/3t"),
      card("ten.md", "10/2a"),
      card("alpha.md", "A/1"),
      card("alpha-child.md", "A/1a"),
      card("beta.md", "B/1"),
    ]);
    assert.deepEqual(sections, [
      {
        path: "one.md",
        label: "1",
        startOrdinal: 1,
        endOrdinal: 2,
        startPosition: 0,
        endPosition: 1 / 6,
      },
      {
        path: "ten-decimal.md",
        label: "10",
        startOrdinal: 3,
        endOrdinal: 4,
        startPosition: 1 / 3,
        endPosition: 0.5,
      },
      {
        path: "alpha.md",
        label: "A",
        startOrdinal: 5,
        endOrdinal: 6,
        startPosition: 2 / 3,
        endPosition: 5 / 6,
      },
      {
        path: "beta.md",
        label: "B",
        startOrdinal: 7,
        endOrdinal: 7,
        startPosition: 1,
        endPosition: 1,
      },
    ]);
    assert.deepEqual(buildDeckMapSections([
      card("a.md", "A/1"),
      card("b.md", "A/2"),
    ]).map(({ label }) => label), ["A"]);
  });

  test("retains section semantics and collision-aware labels", () => {
    assert.equal(deckMapSectionLabel("10/2a"), "10");
    assert.equal(deckMapSectionLabel("10,5/3t"), "10");
    assert.equal(deckMapSectionLabel("A/1"), "A");
    assert.equal(deckMapSectionLabel("α/12"), "α");
    assert.equal(deckMapSectionLabel(""), "");

    const sections = buildDeckMapSections([
      card("a.md", "A"),
      card("b.md", "B"),
      card("b2.md", "B2"),
      card("c.md", "C"),
      card("c2.md", "C2"),
      card("c3.md", "C3"),
    ]);
    assert.deepEqual(
      visibleDeckMapSectionLabels(sections, 50, 14)
        .map(({ label }) => label),
      ["A", "C"],
    );
  });

  test("updates section identity deterministically after index changes", () => {
    const original = [card("a.md", "A/1"), card("b.md", "B/1")];
    const inserted = [
      card("new.md", "A/0"),
      ...original,
      card("c.md", "C/1"),
    ];
    assert.deepEqual(
      buildDeckMapSections(original).map(({ path, label }) => [path, label]),
      [["a.md", "A"], ["b.md", "B"]],
    );
    assert.deepEqual(
      buildDeckMapSections(inserted).map(({ path, label }) => [path, label]),
      [["new.md", "A"], ["b.md", "B"], ["c.md", "C"]],
    );
    assert.deepEqual(
      buildDeckMapSections([
        card("renamed.md", "A/1"),
        card("b.md", "C/1"),
      ]).map(({ path, label }) => [path, label]),
      [["renamed.md", "A"], ["b.md", "C"]],
    );
  });

  test("keeps exact viewport endpoints for accessibility without visual state", () => {
    const middle = deckMapViewportRange({ start: 5, end: 5 }, 11);
    assert.deepEqual(middle, {
      startOrdinal: 6,
      endOrdinal: 6,
      startPosition: 0.5,
      endPosition: 0.5,
    });
    const first = deckMapViewportRange({ start: 0, end: 0 }, 11);
    const last = deckMapViewportRange({ start: 10, end: 10 }, 11);
    assert.equal(first?.startPosition, 0);
    assert.equal(last?.endPosition, 1);
    assert.equal(deckMapViewportRange(null, 10), null);
    assert.equal(deckMapViewportRange({ start: 0, end: 10 }, 10), null);
  });

  test("emits only meaningful exact-path landmarks and composes states", () => {
    const cards = [
      card("ordinary.md", "1"),
      card("bookmark.md", "1a"),
      card("colour.md", "1b", { color: "purple" }),
      card("desk.md", "1c", { onDesk: true }),
      card("combined-one.md", "2", { color: "green", onDesk: true }),
      card("combined-two.md", "2", { color: "blue", onDesk: true }),
    ];
    const landmarks = buildDeckMapLandmarks(
      cards,
      "combined-two.md",
      new Set(["bookmark.md", "combined-two.md"]),
    );
    assert.deepEqual(landmarks.map(({ path }) => path), [
      "bookmark.md",
      "desk.md",
      "combined-one.md",
      "combined-two.md",
    ]);
    assert.deepEqual(
      landmarks.find(({ path }) => path === "combined-two.md"),
      {
        path: "combined-two.md",
        address: "2",
        title: "combined-two",
        ordinal: 6,
        position: 1,
        active: true,
        bookmarked: true,
        onDesk: true,
      },
    );
    assert.equal(landmarks.some(({ path }) => path === "ordinary.md"), false);
    assert.equal(landmarks.some(({ path }) => path === "colour.md"), false);
  });

  test("retains exact active and bookmarks while clustering lower states", () => {
    const cards = [
      card("colour-a.md", "1", { color: "red" }),
      card("bookmark.md", "2", { color: "red" }),
      card("desk-a.md", "3", { onDesk: true }),
      card("desk-b.md", "4", { color: "blue", onDesk: true }),
      card("active.md", "5", { onDesk: true }),
    ];
    const landmarks = buildDeckMapLandmarks(
      cards,
      "active.md",
      new Set(["bookmark.md"]),
    );
    const rendered = bucketDeckMapLandmarks(landmarks, 2, 1);
    assert.deepEqual(
      rendered.filter(({ kind }) => kind === "exact")
        .map(({ id }) => id),
      ["path:bookmark.md", "path:active.md"],
    );
    const clusters = rendered.filter(
      (landmark): landmark is DeckMapClusterLandmark =>
        landmark.kind === "cluster",
    );
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters.map((cluster) => ({
      id: cluster.id,
      count: cluster.count,
      onDeskCount: cluster.onDeskCount,
    })), [
      { id: "cluster:1", count: 2, onDeskCount: 2 },
    ]);
  });

  test("recomputes deterministic physical-pixel buckets for display geometry", () => {
    assert.equal(deckMapPhysicalPixelWidth(100, 2), 200);
    assert.equal(deckMapPhysicalPixelBucket(0, 200), 0);
    assert.equal(deckMapPhysicalPixelBucket(0.5, 200), 100);
    assert.equal(deckMapPhysicalPixelBucket(1, 200), 199);
    const cards = [
      card("a.md", "1", { color: "red", onDesk: true }),
      card("b.md", "2", { color: "blue", onDesk: true }),
      card("c.md", "3", { onDesk: true }),
    ];
    const landmarks = buildDeckMapLandmarks(cards, null, new Set());
    assert.deepEqual(
      bucketDeckMapLandmarks(landmarks, 1, 1).map(({ id }) => id),
      ["cluster:0"],
    );
    assert.deepEqual(
      bucketDeckMapLandmarks(landmarks, 100, 2).map(({ id }) => id),
      ["path:a.md", "path:b.md", "path:c.md"],
    );
    assert.deepEqual(
      bucketDeckMapLandmarks(landmarks, 1, 1),
      bucketDeckMapLandmarks(landmarks, 1, 1),
    );
  });

  test("keeps ordinary-card output constant from hundreds to 10,000", () => {
    const makeCards = (count: number): DeckMapCard[] =>
      Array.from({ length: count }, (_, index) =>
        card(`${index}.md`, `A-${index}`)
      );
    assert.equal(buildDeckMapLandmarks(makeCards(100), null, new Set()).length, 0);
    assert.equal(
      buildDeckMapLandmarks(makeCards(10_000), null, new Set()).length,
      0,
    );
    assert.equal(
      buildDeckMapLandmarks(
        makeCards(10_000).map((candidate) => ({
          ...candidate,
          color: "blue",
        })),
        null,
        new Set(),
      ).length,
      0,
    );
  });

  test("formats candidate, cluster, and accessible position readouts", () => {
    const candidate = card("a.md", "17,3,9", { title: "A title" });
    assert.deepEqual(deckMapReadout(candidate, 411, 1_009, null), {
      key: "a.md:card",
      position: 411 / 1_008,
      primary: "17,3,9 · 412 / 1,009",
      title: "A title",
      clusterSummary: "",
    });
    const active = buildDeckMapLandmarks(
      [candidate],
      "a.md",
      new Set(["a.md"]),
    )[0] ?? null;
    assert.equal(
      deckMapAriaValueText(
        active,
        1,
        deckMapViewportRange({ start: 0, end: 0 }, 1),
        1,
      ),
      "17,3,9 · 1 of 1 · A title; visible 1–1; 1 bookmark",
    );
  });

  test("resolves navigation to the nearest complete-Deck coordinate", () => {
    assert.equal(deckMapIndexAtOffset(0, 100, 5), 0);
    assert.equal(deckMapIndexAtOffset(24, 100, 5), 1);
    assert.equal(deckMapIndexAtOffset(76, 100, 5), 3);
    assert.equal(deckMapIndexAtOffset(100, 100, 5), 4);
    assert.equal(deckMapIndexAtOffset(-20, 100, 5), 0);
    assert.equal(deckMapIndexAtOffset(120, 100, 5), 4);
    assert.equal(deckMapIndexAtOffset(20, 100, 1), 0);
    assert.equal(deckMapIndexAtOffset(0, 0, 5), null);
  });
});
