import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cardHeaderTitle,
  resolveCardDisplayTitle,
  resolveCardTitle,
} from "../src/card-title.js";

describe("resolveCardTitle", () => {
  test("uses the same title-visibility setting for every card header", () => {
    assert.equal(cardHeaderTitle("Systems", true), "Systems");
    assert.equal(cardHeaderTitle("Systems", false), null);
    assert.equal(cardHeaderTitle(null, true), null);
  });

  test("uses the filename by default", () => {
    assert.equal(
      resolveCardTitle("20260820T010101", { "slipbox-title": "Systems" }, {
        titleSource: "filename",
        titleProperty: "slipbox-title",
      }),
      "20260820T010101",
    );
  });

  test("uses a configured non-empty frontmatter string", () => {
    assert.equal(
      resolveCardDisplayTitle("fallback", { name: "  Systems  " }, {
        titleSource: "frontmatter",
        titleProperty: "name",
      }),
      "Systems",
    );
    assert.equal(
      resolveCardTitle("fallback", { name: "  Systems  " }, {
        titleSource: "frontmatter",
        titleProperty: "name",
      }),
      "Systems",
    );
  });

  test("omits unavailable display titles but retains fallback labels", () => {
    const settings = {
      titleSource: "frontmatter" as const,
      titleProperty: "slipbox-title",
    };
    assert.equal(resolveCardDisplayTitle("fallback", {}, settings), null);
    assert.equal(
      resolveCardDisplayTitle(
        "fallback",
        { "slipbox-title": "  " },
        settings,
      ),
      null,
    );
    assert.equal(
      resolveCardDisplayTitle(
        "fallback",
        { "slipbox-title": ["Systems"] },
        settings,
      ),
      null,
    );
    assert.equal(resolveCardTitle("fallback", {}, settings), "fallback");
    assert.equal(
      resolveCardTitle("fallback", { "slipbox-title": "  " }, settings),
      "fallback",
    );
    assert.equal(
      resolveCardTitle("fallback", { "slipbox-title": ["Systems"] }, settings),
      "fallback",
    );
  });
});
