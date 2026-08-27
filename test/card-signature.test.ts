import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  CardSignatureManager,
  type CardSignatureBranch,
  type CardSignatureOverflowItem,
} from "../src/index.js";

const branch = (
  label: string,
  sourcePath = "Parent.md",
): CardSignatureBranch => ({
  label,
  sourcePath,
  sourceAddress: "1",
  sourceTitle: "Parent",
  linktext: "Parent",
});

function fixture(
  initial: readonly CardSignatureBranch[],
  interactive = true,
  showTooltips = true,
) {
  const window = new Window();
  const parent = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  let branches = initial;
  let show = true;
  let previewEnabled = false;
  const previews: string[] = [];
  const activations: string[] = [];
  let overflowItems: readonly CardSignatureOverflowItem[] = [];
  let overflowCloseCount = 0;
  const manager = new CardSignatureManager({
    showBranchLabels: () => show,
    showTooltips: () => showTooltips,
    previewLinksOnHover: () => previewEnabled,
    branchesForPath: () => branches,
    preview: (_event, _target, candidate) => previews.push(candidate.label),
    activate: (candidate) => { activations.push(candidate.sourcePath); },
    showOverflowMenu: (_target, items) => {
      overflowItems = items;
      return () => { overflowCloseCount += 1; };
    },
    runAfterEditing: (_reason, action) => void action(),
  });
  const address = manager.render(parent, {
    path: "Child.md",
    address: "1a",
    addressClass: "slipbox-card-address",
    interactive,
  });
  return {
    window,
    parent,
    manager,
    address,
    previews,
    activations,
    overflowItems: () => overflowItems,
    overflowCloseCount: () => overflowCloseCount,
    setBranches: (value: readonly CardSignatureBranch[]) => { branches = value; },
    setShow: (value: boolean) => { show = value; },
    setPreview: (value: boolean) => { previewEnabled = value; },
  };
}

describe("card branch signatures", () => {
  test("keeps the canonical address node separate and unchanged during refresh", () => {
    const subject = fixture([branch("a")]);
    const signature = subject.parent.querySelector(".slipbox-card-signature");
    assert.equal(subject.address.textContent, "1a");
    assert.equal(subject.address.className, "slipbox-card-address");
    assert.equal(signature?.firstElementChild, subject.address);
    assert.equal(
      subject.parent.querySelector(".slipbox-card-signature-content")?.textContent,
      "a",
    );

    subject.setBranches([branch("b"), branch("γ", "Other.md")]);
    subject.manager.refreshBranches();
    assert.equal(subject.parent.querySelector(".slipbox-card-address"), subject.address);
    assert.equal(
      subject.parent.querySelector(".slipbox-card-signature-content")?.textContent,
      "b·γ",
    );
  });

  test("provides accessible structural buttons and hides labels independently", () => {
    const subject = fixture([branch("a")]);
    const signature = subject.parent.querySelector<HTMLElement>(
      ".slipbox-card-signature",
    );
    const button = subject.parent.querySelector<HTMLButtonElement>("button");
    assert.equal(button?.getAttribute("aria-label"), "Branch a from 1 · Parent");
    assert.equal(button?.getAttribute("title"), null);
    assert.equal(button?.getAttribute("data-tooltip-position"), "bottom");
    assert.equal(button?.tabIndex, 0);
    assert.equal(signature?.classList.contains("has-branch-annotations"), true);
    assert.equal(
      signature?.querySelector(".is-address-separator")?.textContent,
      "·",
    );
    subject.setShow(false);
    subject.manager.refreshBranches();
    assert.equal(subject.address.textContent, "1a");
    assert.equal(signature?.classList.contains("has-branch-annotations"), false);
    assert.equal(signature?.querySelector(".is-address-separator"), null);
    assert.equal(
      subject.parent.querySelector<HTMLElement>(".slipbox-card-signature-branches")?.hidden,
      true,
    );
  });

  test("hides branch tooltips while retaining accessible labels", () => {
    const subject = fixture([branch("a")], true, false);
    const button = subject.parent.querySelector<HTMLButtonElement>("button");
    assert.equal(button?.getAttribute("aria-label"), null);
    assert.equal(button?.getAttribute("title"), null);
    assert.equal(button?.getAttribute("data-tooltip-position"), null);
    const labelId = button?.getAttribute("aria-labelledby") ?? "";
    assert.equal(
      button?.querySelector(`#${labelId}`)?.textContent,
      "Branch a from 1 · Parent",
    );
  });

  test("includes the address separator only while annotations are present", () => {
    const subject = fixture([]);
    const signature = subject.parent.querySelector<HTMLElement>(
      ".slipbox-card-signature",
    );
    assert.equal(subject.address.textContent, "1a");
    assert.equal(
      signature?.querySelector(".is-address-separator"),
      null,
    );

    subject.setBranches([branch("a")]);
    subject.manager.refreshBranches();
    assert.equal(
      signature?.querySelector(".is-address-separator")?.textContent,
      "·",
    );
    assert.equal(
      signature?.querySelector(".slipbox-card-signature-content")?.textContent,
      "a",
    );

    subject.setBranches([]);
    subject.manager.refreshBranches();
    assert.equal(subject.address.textContent, "1a");
    assert.equal(
      signature?.querySelector(".is-address-separator"),
      null,
    );
  });

  test("sizes annotated signatures from stable intrinsic content", () => {
    const subject = fixture([branch("a")]);
    const signature = subject.parent.querySelector<HTMLElement>(
      ".slipbox-card-signature",
    );
    const sizer = subject.parent.querySelector<HTMLElement>(
      ".slipbox-card-signature-intrinsic-sizer",
    );
    assert.notEqual(signature, null);
    assert.notEqual(sizer, null);
    Object.defineProperty(sizer, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 86.2 } as DOMRect),
    });
    subject.manager.layoutNow();
    assert.equal(
      signature?.style.getPropertyValue(
        "--slipbox-card-signature-intrinsic-width",
      ),
      "87px",
    );

    subject.setBranches([]);
    subject.manager.refreshBranches();
    assert.equal(
      signature?.style.getPropertyValue(
        "--slipbox-card-signature-intrinsic-width",
      ),
      "",
    );
  });

  test("gates hover by preview policy but always structurally activates", () => {
    const subject = fixture([branch("a")]);
    const button = subject.parent.querySelector<HTMLButtonElement>("button");
    assert.notEqual(button, null);
    button?.dispatchEvent(new subject.window.MouseEvent("mouseover", {
      bubbles: true,
    }) as unknown as Event);
    assert.deepEqual(subject.previews, []);
    subject.setPreview(true);
    button?.dispatchEvent(new subject.window.MouseEvent("mouseover", {
      bubbles: true,
    }) as unknown as Event);
    button?.dispatchEvent(new subject.window.MouseEvent("click", {
      bubbles: true,
      metaKey: true,
    }) as unknown as Event);
    button?.dispatchEvent(new subject.window.MouseEvent("auxclick", {
      bubbles: true,
      button: 1,
    }) as unknown as Event);
    assert.deepEqual(subject.previews, ["a"]);
    assert.deepEqual(subject.activations, ["Parent.md", "Parent.md"]);
  });

  test("retains visible but inert metadata until the card becomes active", () => {
    const subject = fixture([branch("a")], false);
    let button = subject.parent.querySelector<HTMLButtonElement>("button");
    assert.equal(button?.disabled, true);
    assert.equal(button?.tabIndex, -1);
    button?.click();
    assert.deepEqual(subject.activations, []);

    subject.manager.setInteractive(subject.parent, true);
    button = subject.parent.querySelector<HTMLButtonElement>("button");
    assert.equal(button?.disabled, false);
    button?.click();
    assert.deepEqual(subject.activations, ["Parent.md"]);
  });

  test("fits complete labels and opens hidden annotations from +N", () => {
    const subject = fixture([
      branch("A long branch annotation", "Long.md"),
      branch("b", "Short.md"),
    ]);
    const content = subject.parent.querySelector<HTMLElement>(
      ".slipbox-card-signature-content",
    );
    const measure = subject.parent.querySelector<HTMLElement>(
      ".slipbox-card-signature-measure",
    );
    assert.notEqual(content, null);
    assert.notEqual(measure, null);
    Object.defineProperty(content, "clientWidth", {
      configurable: true,
      value: 18,
    });
    const measuredLabels = measure?.querySelectorAll<HTMLElement>(
      ".slipbox-card-branch-label",
    ) ?? [];
    const measuredSeparator = measure?.querySelector<HTMLElement>(
      ".slipbox-card-signature-separator",
    );
    const measuredOverflow = measure?.querySelector<HTMLElement>(
      ".slipbox-card-branch-overflow",
    );
    for (const [index, label] of Array.from(measuredLabels).entries()) {
      Object.defineProperty(label, "getBoundingClientRect", {
        value: () => ({ width: index === 0 ? 80 : 10 } as DOMRect),
      });
    }
    Object.defineProperty(measuredSeparator, "getBoundingClientRect", {
      value: () => ({ width: 3 } as DOMRect),
    });
    Object.defineProperty(measuredOverflow, "getBoundingClientRect", {
      value: () => ({ width: 12 } as DOMRect),
    });

    subject.manager.layoutNow();
    assert.equal(content?.textContent, "+2");
    const overflow = content?.querySelector<HTMLButtonElement>(
      ".slipbox-card-branch-overflow",
    );
    assert.equal(overflow?.getAttribute("aria-label"), "Show 2 more branch annotations");
    assert.equal(overflow?.getAttribute("data-tooltip-position"), "bottom");
    overflow?.click();
    assert.deepEqual(
      subject.overflowItems().map((item) => item.title.textContent),
      ["A long branch annotation", "b"],
    );
    subject.overflowItems()[0]?.activate(new subject.window.MouseEvent("click") as unknown as MouseEvent);
    assert.deepEqual(subject.activations, ["Long.md"]);
    assert.equal(subject.overflowCloseCount(), 1);
  });
});
