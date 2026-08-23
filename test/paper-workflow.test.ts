import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  applyTextReplacement,
  beforeInputCandidate,
  isStandaloneCardLink,
  normalizeEditorLineEndings,
  preservesProtectedText,
  restrictViewedCardPaste,
} from "../src/paper-workflow.js";

describe("restricted viewed-card paste", () => {
  test("pastes one trimmed non-whitespace token without special URL handling", () => {
    assert.deepEqual(restrictViewedCardPaste("  original  "), {
      text: "original",
      truncated: false,
    });
    assert.deepEqual(restrictViewedCardPaste("https://example.org/a?q=1"), {
      text: "https://example.org/a?q=1",
      truncated: false,
    });
    assert.deepEqual(restrictViewedCardPaste("  \n\t"), {
      text: "",
      truncated: false,
    });
  });

  test("truncates prose at the first Unicode whitespace", () => {
    assert.deepEqual(restrictViewedCardPaste("Some copied prose"), {
      text: "Some",
      truncated: true,
    });
    assert.deepEqual(restrictViewedCardPaste("alpha\u00a0beta"), {
      text: "alpha",
      truncated: true,
    });
    assert.deepEqual(restrictViewedCardPaste("first\nsecond"), {
      text: "first",
      truncated: true,
    });
  });

  test("accepts one complete Wiki link or embed", () => {
    const links = [
      "[[some title|16.4/a]]",
      "[[some title#A heading]]",
      "[[some title#^block id]]",
      "![[diagram with spaces.png]]",
    ];
    for (const link of links) {
      assert.equal(isStandaloneCardLink(link), true, link);
      assert.deepEqual(restrictViewedCardPaste(` ${link} `), {
        text: link,
        truncated: false,
      });
    }
  });

  test("accepts inline and reference-style Markdown links and images", () => {
    const links = [
      "[paper title](https://example.org/paper)",
      "![figure caption](Attachments/figure.png)",
      "[nested [label]](target_(one) \"Optional title\")",
      "[angle destination](<target with spaces> 'Optional title')",
      "[paper title][smith 2025]",
      "[paper title][]",
      "![figure caption][figure id]",
      String.raw`[escaped \] label](target\))`,
    ];
    for (const link of links) {
      assert.equal(isStandaloneCardLink(link), true, link);
      assert.equal(restrictViewedCardPaste(link).text, link);
      assert.equal(restrictViewedCardPaste(link).truncated, false);
    }
  });

  test("rejects malformed, shortcut, multiline, surrounding, and multiple links", () => {
    const rejected = [
      "[[some title]",
      "[[first]] [[second]]",
      "[multi word shortcut]",
      "[paper label](missing",
      "[paper label](target \"unfinished title)",
      "[paper label][   ]",
      "See [[some title]]",
      "[line\nbreak](target)",
    ];
    for (const value of rejected) {
      assert.equal(isStandaloneCardLink(value), false, value);
      assert.equal(restrictViewedCardPaste(value).truncated, true, value);
    }
    assert.equal(restrictViewedCardPaste("[[first]] [[second]]").text, "[[first]]");
    assert.equal(restrictViewedCardPaste("[multi word shortcut]").text, "[multi");
  });
});

describe("protected viewed-card text", () => {
  test("allows insertions and Markdown wrappers around protected text", () => {
    const protectedBody = "First line\nSecond text";
    for (const draft of [
      `Before ${protectedBody}`,
      `${protectedBody} after`,
      "First expanded line\nSecond text",
      "**First line**\n==Second text==",
      "First line\n_Second text_",
    ]) {
      assert.equal(preservesProtectedText(protectedBody, draft), true, draft);
    }
  });

  test("rejects deletion, replacement, and reordering", () => {
    assert.equal(preservesProtectedText("alpha beta", "alpha bet"), false);
    assert.equal(preservesProtectedText("alpha beta", "alpha zeta"), false);
    assert.equal(preservesProtectedText("alpha beta", "beta alpha"), false);
  });

  test("allows current-session additions to be edited or removed", () => {
    const protectedBody = "fixed";
    assert.equal(preservesProtectedText(protectedBody, "fixed draft"), true);
    assert.equal(preservesProtectedText(protectedBody, "fixed revised"), true);
    assert.equal(preservesProtectedText(protectedBody, "fixed"), true);
  });

  test("handles empty bodies, repeated characters, Unicode, and line endings", () => {
    assert.equal(preservesProtectedText(null, "anything"), true);
    assert.equal(preservesProtectedText("", "anything"), true);
    assert.equal(preservesProtectedText("aba", "a-b-a"), true);
    assert.equal(preservesProtectedText("😀 note", "**😀** note"), true);
    assert.equal(preservesProtectedText("one\r\ntwo\r", "one\ntwo\n"), true);
    assert.equal(normalizeEditorLineEndings("a\r\nb\rc"), "a\nb\nc");
  });
});

describe("textarea mutation candidates", () => {
  test("applies selection replacements", () => {
    assert.equal(applyTextReplacement({
      value: "one two",
      selectionStart: 4,
      selectionEnd: 7,
      replacement: "three",
    }), "one three");
  });

  test("predicts insertions and code-point deletions", () => {
    assert.equal(beforeInputCandidate("ab", 1, 1, "insertText", "X"), "aXb");
    assert.equal(beforeInputCandidate("ab", 1, 1, "insertLineBreak", null), "a\nb");
    assert.equal(beforeInputCandidate("a😀b", 3, 3, "deleteContentBackward", null), "ab");
    assert.equal(beforeInputCandidate("a😀b", 1, 1, "deleteContentForward", null), "ab");
    assert.equal(beforeInputCandidate("fixed new", 6, 9, "deleteByCut", null), "fixed ");
    assert.equal(beforeInputCandidate("fixed", 2, 2, "historyUndo", null), null);
  });
});
