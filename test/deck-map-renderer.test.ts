import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import { DeckMapRenderer } from "../src/deck-map-renderer.js";
import {
  bucketDeckMapLandmarks,
  buildDeckMapLandmarks,
  buildDeckMapSections,
  type DeckMapCard,
} from "../src/deck-map.js";

interface ObsidianTestWindow {
  createDiv(): HTMLElement;
}

function card(
  path: string,
  address: string,
  options: Partial<Pick<DeckMapCard, "color" | "onDesk">> = {},
): DeckMapCard {
  return {
    path,
    address,
    title: path,
    color: options.color ?? null,
    onDesk: options.onDesk ?? false,
  };
}

function subject() {
  const window = new Window();
  const document = window.document as unknown as Document;
  Object.assign(window, {
    createDiv: () => document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ),
  });
  Object.defineProperty(document, "win", { value: window });
  const obsidianWindow = document.win as unknown as ObsidianTestWindow;
  const root = obsidianWindow.createDiv();
  document.body.append(root);
  return { root, renderer: new DeckMapRenderer(root) };
}

describe("Deck-map sparse rail DOM", () => {
  test("reconciles stable exact landmarks and removes only stale identities", () => {
    const value = subject();
    const cards = [
      card("ordinary.md", "1"),
      card("bookmark.md", "2"),
      card("colour.md", "3", { color: "purple" }),
      card("desk.md", "4", { onDesk: true }),
    ];
    value.renderer.reconcileLandmarks(bucketDeckMapLandmarks(
      buildDeckMapLandmarks(cards, "ordinary.md", new Set(["bookmark.md"])),
      200,
      1,
    ));

    const active = landmark(value.root, "path:ordinary.md");
    const bookmark = landmark(value.root, "path:bookmark.md");
    const colour = landmark(value.root, "path:colour.md");
    const desk = landmark(value.root, "path:desk.md");
    assert.ok(active);
    assert.ok(bookmark);
    assert.equal(colour, null);
    assert.ok(desk);
    assert.equal(active.classList.contains("is-active"), true);
    assert.equal(bookmark.classList.contains("is-bookmarked"), true);
    assert.equal(desk.classList.contains("is-on-desk"), true);

    value.renderer.reconcileLandmarks(bucketDeckMapLandmarks(
      buildDeckMapLandmarks(
        cards.map((candidate) =>
          candidate.path === "colour.md" ? { ...candidate, color: null } : candidate
        ),
        "bookmark.md",
        new Set(["bookmark.md"]),
      ),
      200,
      1,
    ));

    assert.equal(landmark(value.root, "path:bookmark.md"), bookmark);
    assert.equal(landmark(value.root, "path:desk.md"), desk);
    assert.equal(active.isConnected, false);
    assert.equal(bookmark.classList.contains("is-active"), true);
  });

  test("composes combined states and reuses stable cluster buckets", () => {
    const value = subject();
    const cards = [
      card("one.md", "1", { color: "green", onDesk: true }),
      card("two.md", "2", { color: "blue", onDesk: true }),
      card("three.md", "3", { color: "blue", onDesk: true }),
    ];
    value.renderer.reconcileLandmarks(bucketDeckMapLandmarks(
      buildDeckMapLandmarks(cards, null, new Set()),
      1,
      1,
    ));
    const cluster = landmark(value.root, "cluster:0");
    assert.ok(cluster);
    assert.equal(cluster.dataset.slipboxDeckMapClusterCount, "3");
    assert.equal(cluster.classList.contains("is-on-desk"), true);

    value.renderer.reconcileLandmarks(bucketDeckMapLandmarks(
      buildDeckMapLandmarks(cards.slice(0, 2), null, new Set()),
      1,
      1,
    ));
    assert.equal(landmark(value.root, "cluster:0"), cluster);
    assert.equal(cluster.dataset.slipboxDeckMapClusterCount, "2");
  });

  test("keeps section nodes stable while labels respond to width", () => {
    const value = subject();
    const sections = buildDeckMapSections([
      card("a.md", "A"),
      card("b.md", "B"),
      card("c.md", "C"),
    ]);
    value.renderer.reconcileSections(sections, new Set(["a.md", "c.md"]));
    const first = value.root.querySelector<HTMLElement>(
      '[data-slipbox-deck-map-section-path="a.md"]',
    );
    const middle = value.root.querySelector<HTMLElement>(
      '[data-slipbox-deck-map-section-path="b.md"]',
    );
    assert.ok(first);
    assert.ok(middle);
    assert.equal(first.classList.contains("is-first"), true);
    assert.equal(
      middle.querySelector(".slipbox-deck-map-section-label")
        ?.classList.contains("is-hidden"),
      true,
    );

    value.renderer.reconcileSections(sections, new Set(sections.map(({ path }) => path)));
    assert.equal(
      value.root.querySelector('[data-slipbox-deck-map-section-path="a.md"]'),
      first,
    );
    assert.equal(
      middle.querySelector(".slipbox-deck-map-section-label")
        ?.classList.contains("is-hidden"),
      false,
    );
  });

  test("updates and clears the pointer readout without stale DOM", () => {
    const value = subject();
    assert.equal(value.root.querySelector(".slipbox-deck-map-viewport"), null);

    value.renderer.updateReadout({
      key: "a.md:cluster:2",
      position: 0.25,
      primary: "1 · 2 / 8",
      title: "A title",
      clusterSummary: "3 Desk landmarks",
    });
    const readout = value.root.querySelector<HTMLElement>(
      ".slipbox-deck-map-readout",
    );
    assert.ok(readout);
    assert.match(readout.textContent ?? "", /A title/u);
    assert.match(readout.textContent ?? "", /3 Desk landmarks/u);

    value.renderer.updateReadout(null);
    assert.equal(readout.classList.contains("is-hidden"), true);
    assert.equal(readout.textContent, "");
  });

  test("renders no landmark nodes for a large ordinary Deck", () => {
    const value = subject();
    const cards = Array.from({ length: 10_000 }, (_, index) =>
      card(`${index}.md`, `A-${index}`, { color: "blue" })
    );
    value.renderer.reconcileLandmarks(bucketDeckMapLandmarks(
      buildDeckMapLandmarks(cards, null, new Set()),
      1_000,
      2,
    ));
    assert.equal(
      value.root.querySelectorAll(".slipbox-deck-map-landmark").length,
      0,
    );
  });
});

function landmark(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector(
    `[data-slipbox-deck-map-landmark-id="${id}"]`,
  );
}
