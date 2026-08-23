import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  PROTECTED_TEXT_MESSAGE,
  RESTRICTED_PASTE_MESSAGE,
  attachPaperWorkflowTextarea,
} from "../src/paper-workflow-dom.js";
import { preservesProtectedText } from "../src/paper-workflow.js";

function pasteEvent(window: Window, text: string) {
  const event = new window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: () => text },
  });
  return event;
}

function protectedTextarea(restrictPaste = true, protectedBody: string | null = "fixed") {
  const window = new Window();
  const textarea = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "textarea",
  );
  textarea.value = "fixed new";
  window.document.body.append(textarea);
  let currentDraft = textarea.value;
  const messages: string[] = [];
  let accepted = 0;
  attachPaperWorkflowTextarea(textarea as unknown as HTMLTextAreaElement, {
    restrictPaste,
    acceptsDraft: (draft) => preservesProtectedText(protectedBody, draft),
    updateDraft: (draft) => {
      if (!preservesProtectedText(protectedBody, draft)) {
        return false;
      }
      currentDraft = draft;
      return true;
    },
    currentDraft: () => currentDraft,
    accepted: () => {
      accepted += 1;
    },
    message: (message) => messages.push(message),
  });
  return {
    window,
    textarea,
    messages,
    accepted: () => accepted,
    currentDraft: () => currentDraft,
  };
}

describe("paper-workflow textarea interactions", () => {
  test("blocks predictable protected deletion before browser mutation", () => {
    const { window, textarea, messages } = protectedTextarea();
    textarea.setSelectionRange(5, 5);
    const deletion = new window.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    });
    textarea.dispatchEvent(deletion);

    assert.equal(deletion.defaultPrevented, true);
    assert.equal(textarea.value, "fixed new");
    assert.equal(textarea.selectionStart, 5);
    assert.equal(textarea.selectionEnd, 5);
    assert.deepEqual(messages, [PROTECTED_TEXT_MESSAGE]);
  });

  test("allows deletion of current-session text", () => {
    const { window, textarea, messages, accepted, currentDraft } = protectedTextarea();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    const before = new window.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    });
    textarea.dispatchEvent(before);
    assert.equal(before.defaultPrevented, false);

    textarea.value = "fixed ne";
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
    assert.equal(currentDraft(), "fixed ne");
    assert.equal(accepted(), 1);
    assert.deepEqual(messages, []);
  });

  test("restores the last accepted draft after an unpredictable invalid input", () => {
    const { window, textarea, messages, currentDraft } = protectedTextarea();
    textarea.setSelectionRange(4, 4);
    textarea.dispatchEvent(new window.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "historyUndo",
    }));
    textarea.value = "fixe new";
    textarea.setSelectionRange(4, 4);
    textarea.dispatchEvent(new window.InputEvent("input", { bubbles: true }));

    assert.equal(textarea.value, "fixed new");
    assert.equal(currentDraft(), "fixed new");
    assert.equal(textarea.selectionStart, 4);
    assert.deepEqual(messages, [PROTECTED_TEXT_MESSAGE]);
  });

  test("truncates multi-word paste and preserves normal insertion", () => {
    const { window, textarea, messages, currentDraft } = protectedTextarea();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    const paste = pasteEvent(window, "Some copied prose");
    textarea.dispatchEvent(paste);

    assert.equal(paste.defaultPrevented, true);
    assert.equal(textarea.value, "fixed newSome");
    assert.equal(currentDraft(), "fixed newSome");
    assert.deepEqual(messages, [RESTRICTED_PASTE_MESSAGE]);
  });

  test("blocks paste replacement that would remove protected text", () => {
    const { window, textarea, messages } = protectedTextarea();
    textarea.setSelectionRange(0, 5);
    const paste = pasteEvent(window, "[paper title](target)");
    textarea.dispatchEvent(paste);

    assert.equal(paste.defaultPrevented, true);
    assert.equal(textarea.value, "fixed new");
    assert.deepEqual(messages, [PROTECTED_TEXT_MESSAGE]);
  });

  test("leaves ordinary paste untouched when the restriction is disabled", () => {
    const { window, textarea, messages } = protectedTextarea(false);
    const paste = pasteEvent(window, "Some copied prose");
    textarea.dispatchEvent(paste);
    assert.equal(paste.defaultPrevented, false);
    assert.deepEqual(messages, []);
  });

  test("still blocks protected selection replacement when paste restriction is off", () => {
    const { window, textarea, messages } = protectedTextarea(false);
    textarea.setSelectionRange(0, 5);
    const paste = pasteEvent(window, "replacement prose");
    textarea.dispatchEvent(paste);
    assert.equal(paste.defaultPrevented, true);
    assert.equal(textarea.value, "fixed new");
    assert.deepEqual(messages, [PROTECTED_TEXT_MESSAGE]);
  });

  test("allows unrestricted editing when no protected baseline applies", () => {
    const { window, textarea, messages, currentDraft } = protectedTextarea(
      false,
      null,
    );
    textarea.setSelectionRange(0, 5);
    const before = new window.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteByCut",
    });
    textarea.dispatchEvent(before);
    assert.equal(before.defaultPrevented, false);

    textarea.value = " new";
    textarea.setSelectionRange(0, 0);
    textarea.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
    assert.equal(currentDraft(), " new");
    assert.deepEqual(messages, []);
  });
});
