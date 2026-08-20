import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { resolveCardTitle } from "../src/card-title.js";

describe("resolveCardTitle", () => {
  test("uses the filename by default", () => {
    assert.equal(
      resolveCardTitle("20260820T010101", { title: "Systems" }, {
        titleSource: "filename",
        titleProperty: "title",
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
    const settings = { titleSource: "frontmatter" as const, titleProperty: "title" };
    assert.equal(resolveCardTitle("fallback", {}, settings), "fallback");
    assert.equal(resolveCardTitle("fallback", { title: "  " }, settings), "fallback");
    assert.equal(resolveCardTitle("fallback", { title: ["Systems"] }, settings), "fallback");
  });
});
