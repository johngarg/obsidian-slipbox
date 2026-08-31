import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  DeckMapController,
  type DeckMapKeyboardAction,
} from "../src/deck-map-controller.js";
import type { DeckMapCard } from "../src/deck-map.js";

interface ObsidianTestWindow {
  createDiv(): HTMLElement;
}

function cards(count: number, onDesk = false): DeckMapCard[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `${index}.md`,
    address: String.fromCodePoint(65 + index),
    title: `Card ${index}`,
    color: null,
    onDesk,
  }));
}

function subject(width = 100) {
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
  const container = obsidianWindow.createDiv();
  document.body.append(container);
  const navigated: string[] = [];
  const gates: string[] = [];
  const actions: DeckMapKeyboardAction[] = [];
  const controller = new DeckMapController(container, {
    navigate: (path) => { navigated.push(path); },
    runAfterEditing: (reason, action) => {
      gates.push(reason);
      void action();
    },
    runAction: (action) => { actions.push(action); },
  });
  const rail = controller.rootElement.querySelector<HTMLElement>(
    ".slipbox-deck-map-rail",
  );
  assert.ok(rail);
  rail.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    right: width,
    bottom: 22,
    left: 0,
    width,
    height: 22,
    toJSON: () => ({}),
  });
  controller.refreshLayout();
  return { window, container, controller, navigated, gates, actions };
}

describe("Deck-map controller", () => {
  test("navigates marked and unmarked coordinates through the edit gate", () => {
    const value = subject();
    value.controller.reconcile(
      cards(5),
      "1.md",
      new Set(["0.md"]),
      { start: 0, end: 3 },
    );
    const landmarks = value.controller.rootElement.querySelectorAll(
      ".slipbox-deck-map-landmark",
    );
    assert.equal(landmarks.length, 2);

    value.controller.rootElement.dispatchEvent(new value.window.MouseEvent(
      "click",
      { clientX: 0, bubbles: true },
    ) as unknown as Event);
    value.controller.rootElement.dispatchEvent(new value.window.MouseEvent(
      "click",
      { clientX: 75, bubbles: true },
    ) as unknown as Event);
    assert.deepEqual(value.gates, ["deck-map-jump", "deck-map-jump"]);
    assert.deepEqual(value.navigated, ["0.md", "3.md"]);
  });

  test("retains slider semantics and keyboard controls", () => {
    const value = subject();
    value.controller.reconcile(
      cards(5),
      "1.md",
      new Set(["0.md", "4.md"]),
      { start: 0, end: 3 },
    );
    const root = value.controller.rootElement;
    assert.equal(root.getAttribute("role"), "slider");
    assert.equal(root.getAttribute("tabindex"), "0");
    assert.equal(root.getAttribute("aria-valuemin"), "1");
    assert.equal(root.getAttribute("aria-valuemax"), "5");
    assert.equal(root.getAttribute("aria-valuenow"), "2");
    assert.equal(
      root.getAttribute("aria-valuetext"),
      "B · 2 of 5 · Card 1; visible 1–4; 2 bookmarks",
    );

    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End", "x"]) {
      root.dispatchEvent(new value.window.KeyboardEvent(
        "keydown",
        { key, bubbles: true, cancelable: true },
      ) as unknown as Event);
    }
    assert.deepEqual(value.actions, [
      "previous-card",
      "next-card",
      "first-card",
      "last-card",
    ]);
  });

  test("prevents primary pointer focus while remaining keyboard focusable", () => {
    const value = subject();
    const event = new value.window.PointerEvent("pointerdown", {
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    assert.equal(
      value.controller.rootElement.dispatchEvent(event as unknown as Event),
      false,
    );
    assert.equal(event.defaultPrevented, true);
    assert.equal(value.controller.rootElement.tabIndex, 0);
  });

  test("shows signature and nonempty title readouts and clears them reliably", () => {
    const value = subject(1);
    value.controller.reconcile(
      cards(3, true),
      null,
      new Set(),
      { start: 0, end: 2 },
    );
    value.controller.rootElement.dispatchEvent(new value.window.PointerEvent(
      "pointermove",
      { clientX: 0.5, bubbles: true },
    ) as unknown as Event);
    const readout = value.controller.rootElement.querySelector<HTMLElement>(
      ".slipbox-deck-map-readout",
    );
    assert.ok(readout);
    assert.equal(readout.classList.contains("is-hidden"), false);
    assert.equal(readout.textContent, "B · Card 1");

    value.controller.rootElement.dispatchEvent(new value.window.PointerEvent(
      "pointerleave",
      { bubbles: true },
    ) as unknown as Event);
    assert.equal(readout.classList.contains("is-hidden"), true);

    value.controller.setVisible(false);
    assert.equal(value.controller.rootElement.hidden, true);
    value.controller.reconcile([], null, new Set(), null);
    assert.equal(value.controller.rootElement.hasAttribute("aria-valuenow"), false);
    assert.equal(value.controller.rootElement.hasAttribute("aria-valuemax"), false);

    value.controller.setVisible(true);
    value.controller.reconcile(cards(1), "0.md", new Set(), {
      start: 0,
      end: 0,
    });
    assert.equal(value.controller.rootElement.getAttribute("aria-valuemax"), "1");
    assert.equal(
      value.controller.rootElement.querySelectorAll(
        ".slipbox-deck-map-landmark",
      ).length,
      1,
    );
  });

  test("reconciles bookmark, index, and active updates without replacing peers", () => {
    const value = subject();
    const deck = cards(4);
    value.controller.reconcile(deck, "0.md", new Set(["2.md"]), {
      start: 0,
      end: 3,
    });
    const bookmark = value.controller.rootElement.querySelector<HTMLElement>(
      '[data-slipbox-deck-map-landmark-id="path:2.md"]',
    );
    assert.ok(bookmark);

    value.controller.updateActive("1.md", { start: 0, end: 3 });
    assert.equal(
      value.controller.rootElement.querySelector(
        '[data-slipbox-deck-map-landmark-id="path:2.md"]',
      ),
      bookmark,
    );
    value.controller.updateBookmarks(new Set(["2.md", "3.md"]));
    assert.equal(
      value.controller.rootElement.querySelector(
        '[data-slipbox-deck-map-landmark-id="path:2.md"]',
      ),
      bookmark,
    );
    value.controller.setVisible(false);
    value.controller.setVisible(true);
    value.controller.refreshLayout(200);
    assert.equal(
      value.controller.rootElement.querySelector(
        '[data-slipbox-deck-map-landmark-id="path:2.md"]',
      ),
      bookmark,
    );

    value.controller.reconcile(deck.slice(0, 2), "1.md", new Set(), {
      start: 0,
      end: 1,
    });
    assert.equal(bookmark.isConnected, false);
    assert.equal(
      value.controller.rootElement.querySelectorAll(
        ".slipbox-deck-map-landmark",
      ).length,
      1,
    );
  });

  test("disposes observers, listeners, and owned elements", () => {
    const value = subject();
    value.controller.reconcile(cards(2), "0.md", new Set(), {
      start: 0,
      end: 1,
    });
    const root = value.controller.rootElement;
    value.controller.dispose();
    assert.equal(root.isConnected, false);
    root.dispatchEvent(new value.window.MouseEvent(
      "click",
      { clientX: 100, bubbles: true },
    ) as unknown as Event);
    assert.deepEqual(value.navigated, []);
  });
});
