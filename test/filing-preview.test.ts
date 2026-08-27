import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  attachUnfiledAddressFiling,
  cardComparatorFor,
  createFilingPreview,
  filingPlacementMatches,
  filingPreviewFocusPath,
  initialFilingAddress,
  renderInlineFilingEditor,
  updateInlineFilingEditor,
} from "../src/index.js";
import {
  filingEditorMatchesSource,
  handleFilingEscape,
  shouldSuspendDeckShortcut,
} from "../src/filing-editor.js";
import { filingPreviewGuidance } from "../src/filing-preview.js";

const filed = [
  { address: "A/2", path: "one.md" },
  { address: "A/10", path: "a.md" },
  { address: "A/10", path: "z.md" },
  { address: "A/20", path: "last.md" },
] as const;

describe("filing placement preview", () => {
  test("seeds filing from the focused card address", () => {
    assert.equal(initialFilingAddress(filed[2]), "A/10");
    assert.equal(initialFilingAddress(null), "");
  });

  test("calculates beginning, middle, end, and empty Deck positions", () => {
    const beginning = createFilingPreview(
      filed,
      { address: "A/1", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(beginning.insertionIndex, 0);
    assert.equal(beginning.previousPath, null);
    assert.equal(beginning.nextPath, "one.md");

    const middle = createFilingPreview(
      filed,
      { address: "A/12", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(middle.insertionIndex, 3);
    assert.equal(middle.previousPath, "z.md");
    assert.equal(middle.nextPath, "last.md");

    const end = createFilingPreview(
      filed,
      { address: "Z", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(end.insertionIndex, filed.length);
    assert.equal(end.nextPath, null);

    const empty = createFilingPreview(
      [],
      { address: "Anything", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(empty.insertionIndex, 0);
    assert.equal(empty.previousPath, null);
    assert.equal(empty.nextPath, null);
  });

  test("places a duplicate exactly by source path", () => {
    const preview = createFilingPreview(
      filed,
      { address: "A/10", path: "m.md" },
      "Duplicate",
      "natural",
    );
    assert.equal(preview.insertionIndex, 2);
    assert.equal(preview.previousPath, "a.md");
    assert.equal(preview.nextPath, "z.md");
  });

  test("focuses the real card immediately before the candidate", () => {
    const middle = createFilingPreview(
      filed,
      { address: "A/12", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(filingPreviewFocusPath(middle), "z.md");
    assert.equal(middle.insertionIndex, 3);

    const beginning = createFilingPreview(
      filed,
      { address: "A/1", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(filingPreviewFocusPath(beginning), "one.md");
    assert.equal(beginning.insertionIndex, 0);

    const end = createFilingPreview(
      filed,
      { address: "Z", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(filingPreviewFocusPath(end), "last.md");

    const empty = createFilingPreview(
      [],
      { address: "A/1", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(filingPreviewFocusPath(empty), null);
  });

  test("describes invalid, before-first, after-card, and empty-Deck previews", () => {
    assert.match(filingPreviewGuidance(null), /Enter a valid address/);
    assert.match(
      filingPreviewGuidance(createFilingPreview(
        filed,
        { address: "A/1", path: "source.md" },
        "Source",
        "natural",
      )),
      /filed before it/,
    );
    assert.match(
      filingPreviewGuidance(createFilingPreview(
        filed,
        { address: "A/12", path: "source.md" },
        "Source",
        "natural",
      )),
      /filed after/,
    );
    assert.match(
      filingPreviewGuidance(createFilingPreview(
        [],
        { address: "A/1", path: "source.md" },
        "Source",
        "natural",
      )),
      /Deck is empty/,
    );
  });

  test("the eventual card sort index equals the preview index", () => {
    const candidate = { address: "A/10", path: "m.md" };
    const preview = createFilingPreview(
      filed,
      candidate,
      "Duplicate",
      "natural",
    );
    const final = [...filed, candidate].sort(cardComparatorFor("natural"));
    assert.equal(
      final.findIndex((card) => card.path === candidate.path),
      preview.insertionIndex,
    );
  });

  test("changes the placement signature after concurrent movement", () => {
    const preview = createFilingPreview(
      filed,
      { address: "A/12", path: "source.md" },
      "Source",
      "natural",
    );
    const changed = createFilingPreview(
      [
        ...filed.slice(0, 3),
        { address: "A/11", path: "new.md" },
        filed[3],
      ],
      { address: "A/12", path: "source.md" },
      "Source",
      "natural",
    );
    assert.notEqual(changed.placementSignature, preview.placementSignature);
    assert.equal(changed.previousPath, "new.md");
    assert.equal(
      filingPlacementMatches(
        filed,
        { address: "A/12", path: "source.md" },
        "natural",
        preview,
      ),
      true,
    );
    assert.equal(
      filingPlacementMatches(
        [
          ...filed.slice(0, 3),
          { address: "A/11", path: "new.md" },
          filed[3],
        ],
        { address: "A/12", path: "source.md" },
        "natural",
        preview,
      ),
      false,
    );
    assert.equal(
      filingPlacementMatches(
        filed,
        { address: "A/12", path: "source.md" },
        "lexicographic",
        preview,
      ),
      false,
    );
  });
});

describe("inline filing editor DOM", () => {
  test("mounts the editor only on its remembered source surface", () => {
    assert.equal(
      filingEditorMatchesSource("source.md", "viewed", "source.md", "viewed"),
      true,
    );
    assert.equal(
      filingEditorMatchesSource("source.md", "viewed", "source.md", "desk"),
      false,
    );
    assert.equal(
      filingEditorMatchesSource("source.md", "desk", "other.md", "desk"),
      false,
    );
  });

  test("suspends Deck letter shortcuts while the filing input has focus", () => {
    const window = new Window();
    const input = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "input",
    );
    const deck = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    const textarea = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "textarea",
    );
    const select = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "select",
    );
    const button = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    );
    const link = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "a",
    );

    assert.equal(shouldSuspendDeckShortcut(
      deck as unknown as EventTarget,
      true,
    ), true);
    assert.equal(shouldSuspendDeckShortcut(
      input as unknown as EventTarget,
      false,
    ), true);
    assert.equal(shouldSuspendDeckShortcut(
      textarea as unknown as EventTarget,
      false,
    ), true);
    assert.equal(shouldSuspendDeckShortcut(
      select as unknown as EventTarget,
      false,
    ), true);
    assert.equal(shouldSuspendDeckShortcut(
      button as unknown as EventTarget,
      false,
    ), true);
    assert.equal(shouldSuspendDeckShortcut(
      link as unknown as EventTarget,
      false,
    ), true);
    assert.equal(shouldSuspendDeckShortcut(
      deck as unknown as EventTarget,
      false,
    ), false);

    deck.contentEditable = "true";
    assert.equal(shouldSuspendDeckShortcut(
      deck as unknown as EventTarget,
      false,
    ), true);
  });

  test("cancels filing from Escape outside the address input", () => {
    const window = new Window();
    let cancelCount = 0;
    const escape = new window.KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });

    assert.equal(handleFilingEscape(
      escape as unknown as KeyboardEvent,
      true,
      () => cancelCount += 1,
    ), true);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(cancelCount, 1);

    const inactiveEscape = new window.KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    assert.equal(handleFilingEscape(
      inactiveEscape as unknown as KeyboardEvent,
      false,
      () => cancelCount += 1,
    ), false);
    assert.equal(inactiveEscape.defaultPrevented, false);
    assert.equal(cancelCount, 1);
  });

  test("keeps unfiled-address pointer events away from tray dragging", () => {
    const window = new Window();
    const parent = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    const address = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    );
    parent.append(address);
    window.document.body.append(parent);

    const bubbled: string[] = [];
    let beginCount = 0;
    parent.addEventListener("pointerdown", () => bubbled.push("pointerdown"));
    parent.addEventListener("click", () => bubbled.push("click"));
    parent.addEventListener("dblclick", () => bubbled.push("dblclick"));
    attachUnfiledAddressFiling(
      address as unknown as HTMLElement,
      () => beginCount += 1,
    );

    address.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
    address.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const doubleClick = new window.MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    });
    address.dispatchEvent(doubleClick);

    assert.deepEqual(bubbled, []);
    assert.equal(beginCount, 1);
    assert.equal(doubleClick.defaultPrevented, true);
  });

  test("renders inline, updates feedback, and dispatches filing controls", () => {
    const window = new Window();
    const happyCard = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    const happyAddress = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    );
    happyCard.append(happyAddress);
    window.document.body.append(happyCard);
    const card = happyCard as unknown as HTMLElement;
    const address = happyAddress as unknown as HTMLElement;
    const events: string[] = [];
    const focusChanges: boolean[] = [];
    let changedValue = "";
    const editor = renderInlineFilingEditor(
      address,
      card,
      {
        value: "A/12",
        address: "A/12",
        message: "",
        invalid: false,
        confirmationInProgress: false,
        duplicatePaths: ["a.md", "z.md"],
      },
      {
        showTooltips: false,
        onInput: (value) => {
          changedValue = value;
        },
        onConfirm: () => events.push("confirm"),
        onCancel: () => events.push("cancel"),
        onPreview: () => events.push("preview"),
        onFocusChange: (focused) => focusChanges.push(focused),
      },
    );
    assert.equal(address.querySelector("input"), editor.input);
    assert.equal(editor.input.value, "A/12");
    assert.equal(card.querySelectorAll(".slipbox-tray-filing-input").length, 1);
    assert.match(editor.feedback.textContent ?? "", /a\.md/);
    assert.match(editor.feedback.textContent ?? "", /z\.md/);

    editor.input.dispatchEvent(
      new window.FocusEvent("focus") as unknown as Event,
    );
    editor.input.dispatchEvent(
      new window.FocusEvent("blur") as unknown as Event,
    );
    assert.deepEqual(focusChanges, [true, false]);

    editor.input.value = "Project-17";
    editor.input.dispatchEvent(new window.Event("input") as unknown as Event);
    assert.equal(changedValue, "Project-17");
    editor.input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Tab" }) as unknown as Event,
    );
    editor.input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter" }) as unknown as Event,
    );
    editor.input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape" }) as unknown as Event,
    );
    assert.deepEqual(events, ["preview", "confirm", "cancel"]);

    updateInlineFilingEditor(
      editor,
      {
        value: "bad\naddress",
        address: null,
        message: "Address must be a single line.",
        invalid: true,
        confirmationInProgress: false,
        duplicatePaths: [],
      },
    );
    assert.equal(editor.input.getAttribute("aria-invalid"), "true");
    assert.equal(editor.feedback.querySelector("details"), null);
    assert.equal(editor.feedback.textContent, "Address must be a single line.");
  });
});
