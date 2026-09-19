import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { DeckWheelController, type DeckWheelContext } from "../src/deck-wheel.js";
import { deckHeaderDragIntent } from "../src/pointer-drag.js";

function fixture(scrollHeight = 1000) {
  const document = new Window().document as unknown as Document;
  const anchor = document.createElementNS("http://www.w3.org/1999/xhtml", "article");
  const body = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  body.className = "slipbox-card-scroll";
  anchor.append(body);
  Object.defineProperty(body, "scrollHeight", { value: scrollHeight });
  Object.defineProperty(body, "clientHeight", { value: 400 });
  const controller = new DeckWheelController();
  const context: DeckWheelContext = { anchor, editor: null, orientation: "vertical", policy: "body-first",
    allowCardScrolling: true, paneExtent: 800, now: 0 };
  const route = (deltaY: number, now: number, patch: Partial<DeckWheelContext> = {}, target: EventTarget = body, deltaMode = 0, deltaX = 0) =>
    controller.route({ deltaY, deltaX, deltaMode, composedPath: () => [target, anchor] } as unknown as WheelEvent,
      { ...context, ...patch, now });
  return { controller, context, anchor, body, route };
}

test("body-first scrolling subtracts only the remaining boundary resistance", () => {
  const { body, route } = fixture();
  assert.deepEqual(route(120, 0), { consume: false, delta: 0 });
  body.scrollTop = 600;
  assert.deepEqual(route(120, 10), { consume: true, delta: 72 });
  assert.deepEqual(route(20, 20), { consume: true, delta: 20 });
  assert.deepEqual(route(-20, 210), { consume: false, delta: 0 });
  body.scrollTop = 0;
  assert.deepEqual(route(-24, 220), { consume: true, delta: 0 });
  assert.deepEqual(route(-24, 230), { consume: true, delta: 0 });
  assert.deepEqual(route(-10, 240), { consume: true, delta: -10 });
  assert.deepEqual(route(-10, 430), { consume: true, delta: 0 });
});

test("boundary travel is independent of how a trackpad distributes its deltas", () => {
  for (const direction of [1, -1]) {
    for (const deltas of [[960, 16], [48, 928], [24, 24, 928], [24, 952]]) {
      const { body, route } = fixture();
      body.scrollTop = direction > 0 ? 600 : 0;
      const travel = deltas.reduce((sum, delta, i) => sum + route(direction * delta, i * 8).delta, 0);
      assert.equal(travel, direction * 928);
    }
  }
});

test("unreleased resistance resets on reversal and native body scrolling", () => {
  const { body, route } = fixture();
  body.scrollTop = 600;
  assert.equal(route(24, 0).delta, 0);
  assert.equal(route(-12, 8).consume, false);
  assert.equal(route(60, 16).delta, 12);
});

test("Deck gestures survive anchor changes for every route into browsing", () => {
  for (const entry of ["short", "deck", "disabled", "clipped", "boundary", "background"]) {
    const { controller, body, anchor, route } = fixture(entry === "short" ? 400 : 1000);
    const next = fixture();
    const patch: Partial<DeckWheelContext> = { anchor: next.anchor };
    if (entry === "clipped") body.classList.add("is-card-scroll-clipped");
    if (entry === "boundary") body.scrollTop = 600;
    const first = route(120, 0, {
      policy: entry === "deck" ? "deck" : "body-first",
      allowCardScrolling: entry !== "disabled",
    }, entry === "background" ? anchor : body);
    assert.equal(first.delta, entry === "boundary" ? 72 : 120, entry);
    if (entry !== "background") {
      assert.deepEqual(route(120, 8, patch), { consume: true, delta: 120 }, entry);
    }
    // A new anchor's scrollable body cannot steal the continuing gesture.
    assert.deepEqual(route(120, 16, patch, next.body), { consume: true, delta: 120 }, entry);
    assert.deepEqual(route(-20, 24, patch, next.body), { consume: true, delta: -20 }, entry);
    // A pause starts a fresh gesture, allowing the new anchor to scroll normally.
    assert.deepEqual(route(120, 205, patch, next.body), { consume: false, delta: 0 }, entry);
    controller.reset();
    assert.equal(route(120, 210, patch).consume, false, entry);
  }
});

test("Deck ownership does not capture unrelated bodies, editors or Branch View", () => {
  for (const excluded of ["unrelated", "editor", "branch"]) {
    const { body, route } = fixture(400);
    const next = fixture();
    const target = excluded === "unrelated" ? next.body : body;
    if (excluded === "branch") body.classList.add("slipbox-local-branch-scroller");
    assert.equal(route(120, 0, {}, next.anchor).delta, 120);
    assert.equal(route(120, 8, { editor: excluded === "editor" ? body : null }, target).consume, false);
    // Exclusion also ends ownership of the previous gesture.
    assert.equal(route(120, 16, { anchor: next.anchor }).consume, false);
  }
});

test("body policy, clipped cards, units, editor and Branch View ownership", () => {
  const { route, body, anchor } = fixture();
  assert.equal(route(2, 0, { policy: "deck" }, body, 1).delta, 36);
  assert.equal(route(1, 0, { allowCardScrolling: false }, body, 2).delta, 800);
  body.classList.add("is-card-scroll-clipped");
  assert.equal(route(25, 0).delta, 25);
  assert.equal(route(25, 0, { editor: body }).consume, false);
  assert.equal(route(25, 0, { anchor: null }).consume, false);
  body.classList.add("slipbox-local-branch-scroller");
  assert.equal(route(25, 0).consume, false);
  assert.equal(route(5, 0, { orientation: "horizontal" }, anchor, 0, 40).delta, 40);
  assert.equal(route(40, 0, { orientation: "horizontal" }, anchor, 0, 5).consume, false);
});

test("vertical header gestures separate Desk dragging from spatial panning", () => {
  assert.equal(deckHeaderDragIntent(true, 20, 5), "desk");
  assert.equal(deckHeaderDragIntent(true, 5, -20), "pan");
  assert.equal(deckHeaderDragIntent(true, 20, 20), "pan");
  assert.equal(deckHeaderDragIntent(false, 5, 20), "desk");
});
