import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { DeckWheelController, type DeckWheelContext } from "../src/deck-wheel.js";
import { deckHeaderDragIntent } from "../src/pointer-drag.js";

function fixture() {
  const document = new Window().document as unknown as Document;
  const anchor = document.createElementNS("http://www.w3.org/1999/xhtml", "article");
  const body = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  body.className = "slipbox-card-scroll";
  anchor.append(body);
  Object.defineProperty(body, "scrollHeight", { value: 1000 });
  Object.defineProperty(body, "clientHeight", { value: 400 });
  const controller = new DeckWheelController();
  const context: DeckWheelContext = { anchor, editor: null, orientation: "vertical", policy: "body-first",
    allowCardScrolling: true, paneExtent: 800, now: 0 };
  const route = (deltaY: number, now: number, patch: Partial<DeckWheelContext> = {}, target: EventTarget = body, deltaMode = 0, deltaX = 0) =>
    controller.route({ deltaY, deltaX, deltaMode, composedPath: () => [target, anchor] } as unknown as WheelEvent,
      { ...context, ...patch, now });
  return { controller, context, anchor, body, route };
}

test("body-first scrolling chains after resistance without passing threshold excess", () => {
  const { body, route } = fixture();
  assert.deepEqual(route(120, 0), { consume: false, delta: 0 });
  body.scrollTop = 600;
  assert.deepEqual(route(120, 10), { consume: true, delta: 0 });
  assert.deepEqual(route(20, 20), { consume: true, delta: 20 });
  assert.deepEqual(route(-20, 30), { consume: false, delta: 0 });
  body.scrollTop = 0;
  assert.deepEqual(route(-24, 40), { consume: true, delta: 0 });
  assert.deepEqual(route(-24, 50), { consume: true, delta: 0 });
  assert.deepEqual(route(-10, 60), { consume: true, delta: -10 });
  assert.deepEqual(route(-10, 300), { consume: true, delta: 0 });
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
