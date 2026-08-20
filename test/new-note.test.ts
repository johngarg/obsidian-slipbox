import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { newNoteBasename, safeNoteBasename } from "../src/new-note.js";

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

  test("replaces filename-unsafe characters without changing display text", () => {
    assert.equal(safeNoteBasename('Fields: UV/IR? "Both"'), "Fields- UV-IR- -Both-");
  });

  test("has a final fallback when a format produces no usable filename", () => {
    assert.equal(newNoteBasename("", "///"), "Untitled");
  });
});
