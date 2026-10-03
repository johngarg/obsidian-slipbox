import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_DECK_MAP_VISIBILITY,
  deckMapIsVisible,
  toggleDeckMapVisibility,
} from "../src/deck-chrome.js";

describe("per-view Deck-map visibility", () => {
  test("starts with a nullable global-setting override", () => {
    assert.equal(DEFAULT_DECK_MAP_VISIBILITY.deckMapOverride, null);
    assert.equal(deckMapIsVisible(DEFAULT_DECK_MAP_VISIBILITY, true, 4), true);
    assert.equal(deckMapIsVisible(DEFAULT_DECK_MAP_VISIBILITY, false, 4), false);
    assert.equal(deckMapIsVisible(DEFAULT_DECK_MAP_VISIBILITY, true, 0), false);
  });

  test("allows a view to show the map over a disabled global setting", () => {
    const shown = toggleDeckMapVisibility(
      DEFAULT_DECK_MAP_VISIBILITY,
      false,
    );
    assert.deepEqual(shown, { deckMapOverride: true });
    assert.equal(deckMapIsVisible(shown, false, 3), true);
  });

  test("keeps multiple view overrides independent", () => {
    const first = toggleDeckMapVisibility(
      DEFAULT_DECK_MAP_VISIBILITY,
      true,
    );
    assert.equal(first.deckMapOverride, false);
    assert.equal(DEFAULT_DECK_MAP_VISIBILITY.deckMapOverride, null);
  });
});
