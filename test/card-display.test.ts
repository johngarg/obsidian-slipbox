import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  CLIPPED_CARD_BODY_CLASS,
  configureRenderedCardBody,
  shouldRenderAutomaticBacklinks,
} from "../src/card-display.js";

describe("paper-style card display", () => {
  test("shows automatic backlinks only for enabled filed cards", () => {
    assert.equal(shouldRenderAutomaticBacklinks(true, true), true);
    assert.equal(shouldRenderAutomaticBacklinks(false, true), false);
    assert.equal(shouldRenderAutomaticBacklinks(true, false), false);
  });

  test("restores scrolling or clips a rendered body at the top", () => {
    const window = new Window();
    const body = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as unknown as HTMLElement;

    assert.equal(configureRenderedCardBody(body, true, 42), 42);
    assert.equal(body.scrollTop, 42);
    assert.equal(body.classList.contains(CLIPPED_CARD_BODY_CLASS), false);

    assert.equal(configureRenderedCardBody(body, false, 42), 0);
    assert.equal(body.scrollTop, 0);
    assert.equal(body.classList.contains(CLIPPED_CARD_BODY_CLASS), true);

    assert.equal(configureRenderedCardBody(body, true, -12), 0);
    assert.equal(body.classList.contains(CLIPPED_CARD_BODY_CLASS), false);
  });
});
