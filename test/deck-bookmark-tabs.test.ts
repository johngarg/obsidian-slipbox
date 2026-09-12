import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { DeckBookmarkTabs, type DeckBookmarkTab } from "../src/deck-bookmark-tabs.js";

function subject() {
  const window = new Window();
  const document = window.document as unknown as Document;
  const stage = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  document.body.append(stage);
  const cleaned: HTMLElement[] = [];
  const activated: string[] = [];
  const tabs = new DeckBookmarkTabs((element) => { cleaned.push(element); });
  const create = (target: DeckBookmarkTab) => {
    const button = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
    button.textContent = target.address;
    button.addEventListener("click", () => { activated.push(target.path); });
    stage.append(button);
    return button;
  };
  return { stage, document, cleaned, activated, tabs, create };
}
const before: DeckBookmarkTab = { direction: "before", path: "a.md", address: "1", vertical: true, showTooltips: true };
const after: DeckBookmarkTab = { ...before, direction: "after", path: "b.md", address: "2" };

test("unchanged edge targets retain buttons, focus, and their exact navigation action", () => {
  const value = subject();
  value.tabs.reconcile(value.stage, [before, after], value.create);
  const button = value.stage.firstElementChild as HTMLButtonElement;
  button.focus();
  for (let frame = 0; frame < 100; frame++) value.tabs.reconcile(value.stage, [{ ...before }, { ...after }], value.create);
  assert.equal(value.stage.firstElementChild, button);
  assert.equal(value.document.activeElement, button);
  button.click();
  assert.deepEqual(value.activated, ["a.md"]);
  assert.equal(value.cleaned.length, 0);
});

test("target, orientation, label, and tooltip changes replace only the affected edge", () => {
  const value = subject();
  value.tabs.reconcile(value.stage, [before, after], value.create);
  const stable = value.stage.lastElementChild;
  for (const next of [{ ...before, path: "c.md" }, { ...before, vertical: false }, { ...before, address: "new" }, { ...before, showTooltips: false }]) {
    value.tabs.reconcile(value.stage, [next, after], value.create);
    assert.ok(stable?.isConnected);
    assert.equal(value.stage.children.length, 2);
  }
  assert.equal(value.cleaned.length, 4);
  value.tabs.reconcile(value.stage, [after], value.create);
  assert.equal(value.stage.firstElementChild, stable);
  value.tabs.clear();
  assert.equal(value.stage.children.length, 0);
});

test("a rebuilt stage releases old edge buttons and clear is idempotent", () => {
  const value = subject();
  value.tabs.reconcile(value.stage, [before], value.create);
  const nextStage = value.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  value.tabs.reconcile(nextStage, [after], (target) => {
    const button = value.document.createElementNS("http://www.w3.org/1999/xhtml", "button");
    button.textContent = target.address;
    nextStage.append(button);
    return button;
  });
  assert.equal(value.stage.children.length, 0);
  assert.equal(nextStage.children.length, 1);
  value.tabs.clear(); value.tabs.clear();
  assert.equal(nextStage.children.length, 0);
  assert.equal(value.cleaned.length, 2);
});
