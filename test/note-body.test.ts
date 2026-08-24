import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  NoteBodyConflictError,
  replaceNoteBody,
  replaceNoteBodyIfUnchanged,
  splitNoteBody,
} from "../src/note-body.js";

interface Fixture {
  readonly name: string;
  readonly prefix: string;
  readonly body: string;
}

const fixtures: readonly Fixture[] = [
  {
    name: "comments, order, unusual spacing, and a custom address property",
    prefix: "---\n# retained comment\ntitle :  Example\naddress-key: A/1\ntags: [x, y]\n---\n",
    body: "First body\n\n---\nBody delimiter-like line\n",
  },
  {
    name: "CRLF source",
    prefix: "---\r\nslipbox-id: A/2\r\n# comment\r\n---\r\n",
    body: "Line one\r\nLine two\r\n",
  },
  {
    name: "empty frontmatter and empty body",
    prefix: "---\n---\n",
    body: "",
  },
  {
    name: "frontmatter without a final body newline",
    prefix: "---\nslipbox-id: Z\n---\n",
    body: "body",
  },
  {
    name: "no frontmatter",
    prefix: "",
    body: "# Ordinary Markdown\n---\nnot frontmatter\n",
  },
];

describe("exact note-body replacement", () => {
  for (const fixture of fixtures) {
    test(fixture.name, () => {
      const source = fixture.prefix + fixture.body;
      const parts = splitNoteBody(source, fixture.prefix.length);
      assert.equal(parts.prefix, fixture.prefix);
      assert.equal(parts.body, fixture.body);

      const replacement = "Replacement\n\n---\nStill body\n";
      const updated = replaceNoteBody(source, fixture.prefix.length, replacement);
      assert.equal(updated, fixture.prefix + replacement);
      assert.equal(updated.slice(0, fixture.prefix.length), fixture.prefix);
      assert.deepEqual(
        splitNoteBody(updated, fixture.prefix.length),
        { prefix: fixture.prefix, body: replacement },
      );
    });
  }

  test("rejects invalid body offsets", () => {
    assert.throws(() => splitNoteBody("abc", -1), RangeError);
    assert.throws(() => splitNoteBody("abc", 4), RangeError);
    assert.throws(() => splitNoteBody("abc", 1.5), RangeError);
  });

  test("preserves a concurrent frontmatter-only change", () => {
    const originalBody = "Original body\n";
    const latestPrefix = "---\n# added elsewhere\nslipbox-id: A/1\n---\n";
    const latest = latestPrefix + originalBody;

    assert.equal(
      replaceNoteBodyIfUnchanged(
        latest,
        latestPrefix.length,
        originalBody,
        "Inline draft\n",
      ),
      latestPrefix + "Inline draft\n",
    );
  });

  test("rejects a concurrent body change", () => {
    const prefix = "---\nslipbox-id: A/1\n---\n";
    assert.throws(
      () => replaceNoteBodyIfUnchanged(
        prefix + "Changed elsewhere\n",
        prefix.length,
        "Original body\n",
        "Inline draft\n",
      ),
      NoteBodyConflictError,
    );
  });
});
