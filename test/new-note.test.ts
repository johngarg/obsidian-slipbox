import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  newCardBasename,
  newCardFrontmatterTitle,
  newNoteBasename,
  safeNoteBasename,
} from "../src/new-note.js";

describe("new-note filenames", () => {
  test("uses a trimmed title when one is supplied", () => {
    assert.equal(
      newNoteBasename("  Renormalisation group flow  ", "2026-08-20 151726"),
      "Renormalisation group flow",
    );
  });

  test("uses the formatted timestamp when the title is blank", () => {
    assert.equal(
      newNoteBasename("   ", "2026-08-20 151726"),
      "2026-08-20 151726",
    );
  });

  test("uses the title as the filename only for filename-derived titles", () => {
    assert.equal(
      newCardBasename("Renormalisation", "20260820T163727", "filename"),
      "Renormalisation",
    );
    assert.equal(
      newCardBasename("Renormalisation", "20260820T163727", "frontmatter"),
      "20260820T163727",
    );
  });

  test("writes even a blank title only for frontmatter-derived titles", () => {
    assert.equal(newCardFrontmatterTitle("  Renormalisation  ", "frontmatter"), "Renormalisation");
    assert.equal(newCardFrontmatterTitle("   ", "frontmatter"), "");
    assert.equal(newCardFrontmatterTitle("Renormalisation", "filename"), null);
  });

  test("replaces filename-unsafe characters without changing display text", () => {
    assert.equal(safeNoteBasename('Fields: UV/IR? "Both"'), "Fields- UV-IR- -Both-");
  });

  test("has a final fallback when a format produces no usable filename", () => {
    assert.equal(newNoteBasename("", "///"), "Untitled");
  });
});
