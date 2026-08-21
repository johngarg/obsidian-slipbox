import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  DEFAULT_DECK_CHROME_VISIBILITY,
  applyDeckChromeVisibility,
  deckMapIsVisible,
  toolbarIsVisible,
  toggleDeckMapVisibility,
  toggleToolbarVisibility,
} from "../src/deck-chrome.js";

describe("per-view Deck chrome", () => {
  test("starts with nullable global-setting overrides", () => {
    assert.equal(DEFAULT_DECK_CHROME_VISIBILITY.toolbarOverride, null);
    assert.equal(DEFAULT_DECK_CHROME_VISIBILITY.deckMapOverride, null);
    assert.equal(toolbarIsVisible(DEFAULT_DECK_CHROME_VISIBILITY, true), true);
    assert.equal(toolbarIsVisible(DEFAULT_DECK_CHROME_VISIBILITY, false), false);
    assert.equal(deckMapIsVisible(DEFAULT_DECK_CHROME_VISIBILITY, true, 4), true);
    assert.equal(deckMapIsVisible(DEFAULT_DECK_CHROME_VISIBILITY, false, 4), false);
    assert.equal(deckMapIsVisible(DEFAULT_DECK_CHROME_VISIBILITY, true, 0), false);
  });

  test("allows a view to show the map over a disabled global setting", () => {
    const shown = toggleDeckMapVisibility(
      DEFAULT_DECK_CHROME_VISIBILITY,
      false,
    );
    assert.deepEqual(shown, { toolbarOverride: null, deckMapOverride: true });
    assert.equal(deckMapIsVisible(shown, false, 3), true);
  });

  test("allows a view to show the toolbar over a disabled global setting", () => {
    const shown = toggleToolbarVisibility(
      DEFAULT_DECK_CHROME_VISIBILITY,
      false,
    );
    assert.deepEqual(shown, { toolbarOverride: true, deckMapOverride: null });
    assert.equal(toolbarIsVisible(shown, false), true);
  });

  test("keeps multiple view overrides independent", () => {
    const first = toggleToolbarVisibility(
      DEFAULT_DECK_CHROME_VISIBILITY,
      true,
    );
    const second = toggleDeckMapVisibility(
      DEFAULT_DECK_CHROME_VISIBILITY,
      true,
    );
    assert.equal(first.toolbarOverride, false);
    assert.equal(first.deckMapOverride, null);
    assert.equal(second.toolbarOverride, null);
    assert.equal(second.deckMapOverride, false);
  });

  test("removes hidden chrome without replacing Markdown-card DOM", () => {
    const window = new Window();
    const toolbar = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    const map = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    const card = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "article",
    );
    const markdown = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    markdown.className = "markdown-rendered";
    card.append(markdown);
    const originalMarkdown = card.firstElementChild;

    const hidden = toggleDeckMapVisibility(
      toggleToolbarVisibility(DEFAULT_DECK_CHROME_VISIBILITY, true),
      true,
    );
    applyDeckChromeVisibility(
      toolbar as unknown as HTMLElement,
      map as unknown as HTMLElement,
      hidden,
      true,
      true,
      3,
    );

    assert.equal(toolbar.hidden, true);
    assert.equal(map.hidden, true);
    assert.equal(card.firstElementChild, originalMarkdown);
    assert.equal(card.querySelector(".markdown-rendered"), markdown);
  });
});
