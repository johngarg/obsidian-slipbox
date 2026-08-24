import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { cardHeaderTitle, resolveCardTitle } from "../src/card-title.js";

describe("resolveCardTitle", () => {
  test("uses the same title-visibility setting for every card header", () => {
    assert.equal(cardHeaderTitle("Systems", true), "Systems");
    assert.equal(cardHeaderTitle("Systems", false), null);
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
      resolveCardTitle("fallback", { name: "  Systems  " }, {
        titleSource: "frontmatter",
        titleProperty: "name",
      }),
      "Systems",
    );
  });

  test("falls back for missing, empty, and non-string values", () => {
    const settings = {
      titleSource: "frontmatter" as const,
      titleProperty: "slipbox-title",
    };
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
