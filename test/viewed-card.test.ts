import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ViewedCardSession,
} from "../src/viewed-card.js";

describe("ViewedCardSession", () => {
  test("opens, preserves a repeated open, replaces, and resets", () => {
    const session = new ViewedCardSession();
    assert.equal(session.isActive, false);

    assert.equal(session.open("Cards/one.md", { surface: "deck" }), true);
    assert.deepEqual(session.snapshot, {
      path: "Cards/one.md",
      returnTarget: { surface: "deck" },
      x: 0,
      y: 0,
      scrollTop: 0,
    });
    session.setScrollTop("Cards/one.md", 42);
    assert.equal(session.open("Cards/one.md", {
      surface: "desk",
      pileId: "pile-1",
    }), false);
    assert.equal(session.snapshot?.scrollTop, 42);
    assert.deepEqual(session.snapshot?.returnTarget, { surface: "deck" });

    assert.equal(session.open("Cards/two.md", {
      surface: "desk",
      pileId: "pile-2",
    }), true);
    assert.deepEqual(session.snapshot, {
      path: "Cards/two.md",
      returnTarget: { surface: "desk", pileId: "pile-2" },
      x: 0,
      y: 0,
      scrollTop: 0,
    });
    session.reset();
    assert.equal(session.snapshot, null);
  });

  test("retargets without losing position or scroll", () => {
    const session = new ViewedCardSession();
    session.open("Cards/one.md", { surface: "deck" });
    const origin = session.capturePosition();
    assert.notEqual(origin, null);
    if (origin === null) {
      return;
    }
    session.moveFrom(origin, 30, -20, bounds());
    session.setScrollTop("Cards/one.md", 42);

    assert.equal(session.retarget({ surface: "desk", pileId: "pile-2" }), true);
    assert.deepEqual(session.snapshot, {
      path: "Cards/one.md",
      returnTarget: { surface: "desk", pileId: "pile-2" },
      x: 30,
      y: -20,
      scrollTop: 42,
    });
    assert.equal(session.retarget({ surface: "desk", pileId: "pile-2" }), false);
  });

  test("closes to the original surface with the other surface as fallback", () => {
    const session = new ViewedCardSession();
    session.open("Cards/deck.md", { surface: "deck" });
    assert.deepEqual(session.close({
      deckAvailable: true,
      deskPileId: "pile-1",
    }), {
      path: "Cards/deck.md",
      returnTarget: { surface: "deck" },
    });
    assert.equal(session.snapshot, null);

    session.open("Cards/deck.md", { surface: "deck" });
    assert.deepEqual(session.close({
      deckAvailable: false,
      deskPileId: "pile-1",
    })?.returnTarget, { surface: "desk", pileId: "pile-1" });
    session.open("Cards/deck.md", { surface: "deck" });
    assert.equal(session.close({ deckAvailable: false })?.returnTarget, null);

    session.open("Cards/desk.md", { surface: "desk", pileId: "original" });
    assert.deepEqual(session.close({
      deckAvailable: true,
      deskPileId: "current",
    })?.returnTarget, { surface: "desk", pileId: "current" });
    session.open("Cards/desk.md", { surface: "desk", pileId: "original" });
    assert.deepEqual(session.close({ deckAvailable: true })?.returnTarget, {
      surface: "deck",
    });
    session.open("Cards/desk.md", { surface: "desk", pileId: "original" });
    assert.equal(session.close({ deckAvailable: false })?.returnTarget, null);
    assert.equal(session.close({ deckAvailable: true }), null);
  });

  test("renames exact paths and folders without changing presentation", () => {
    const session = new ViewedCardSession();
    session.open("Cards/Old/one.md", { surface: "deck" });
    session.setScrollTop("Cards/Old/one.md", 12);

    assert.equal(session.renamePath("Elsewhere", "Archive"), null);
    assert.equal(
      session.renamePath("Cards/Old", "Cards/New"),
      "Cards/New/one.md",
    );
    assert.deepEqual(session.snapshot, {
      path: "Cards/New/one.md",
      returnTarget: { surface: "deck" },
      x: 0,
      y: 0,
      scrollTop: 12,
    });
    assert.equal(
      session.renamePath("Cards/New/one.md", "Cards/two.md"),
      "Cards/two.md",
    );
  });

  test("deletes affected presentations except the active editing path", () => {
    const session = new ViewedCardSession();
    session.open("Cards/Folder/one.md", { surface: "deck" });
    assert.equal(session.deletePath("Other", null), null);
    assert.equal(session.isActive, true);
    assert.equal(session.deletePath("Cards/Folder", "Cards/Folder/one.md"), null);
    assert.equal(session.isActive, true);
    assert.equal(
      session.deletePath("Cards/Folder", null)?.path,
      "Cards/Folder/one.md",
    );
    assert.equal(session.isActive, false);
  });

  test("reconciles missing paths and removes only the expected workflow card", () => {
    const session = new ViewedCardSession();
    session.open("Cards/one.md", { surface: "deck" });
    assert.equal(session.reconcileAvailability(true), null);
    assert.equal(session.remove("Cards/two.md"), null);
    assert.equal(session.isViewing("Cards/one.md"), true);
    assert.equal(session.reconcileAvailability(false)?.path, "Cards/one.md");

    session.open("Cards/replacement.md", { surface: "deck" });
    assert.equal(session.remove("Cards/one.md"), null);
    assert.equal(session.isViewing("Cards/replacement.md"), true);
    assert.equal(session.remove("Cards/replacement.md")?.path, "Cards/replacement.md");
  });

  test("clamps scrolling and rejects stale scroll events", () => {
    const session = new ViewedCardSession();
    session.open("Cards/one.md", { surface: "deck" });
    assert.equal(session.setScrollTop("Cards/one.md", -12), false);
    assert.equal(session.setScrollTop("Cards/one.md", 42), true);
    assert.equal(session.setScrollTop("Cards/two.md", 100), false);
    assert.equal(session.snapshot?.scrollTop, 42);
  });

  test("constrains movement and centres cards larger than the stage", () => {
    const session = new ViewedCardSession();
    session.open("Cards/one.md", { surface: "deck" });
    const origin = session.capturePosition();
    assert.notEqual(origin, null);
    if (origin === null) {
      return;
    }
    session.moveFrom(origin, 900, -900, bounds());
    assert.equal(session.snapshot?.x, 184);
    assert.equal(session.snapshot?.y, -134);

    assert.equal(session.constrain({
      stageWidth: 320,
      stageHeight: 240,
      cardWidth: 500,
      cardHeight: 300,
    }), true);
    assert.equal(session.snapshot?.x, 0);
    assert.equal(session.snapshot?.y, 0);
  });

  test("rejects stale drag origins and restores a cancelled drag", () => {
    const session = new ViewedCardSession();
    session.open("Cards/one.md", { surface: "deck" });
    const origin = session.capturePosition();
    assert.notEqual(origin, null);
    if (origin === null) {
      return;
    }
    assert.equal(session.moveFrom(origin, 30, 40, bounds()), true);
    assert.equal(session.restorePosition(origin), true);
    assert.equal(session.snapshot?.x, 0);
    assert.equal(session.snapshot?.y, 0);

    session.open("Cards/two.md", { surface: "deck" });
    assert.equal(session.moveFrom(origin, 10, 10, bounds()), false);
    assert.equal(session.restorePosition(origin), false);
    assert.equal(session.snapshot?.path, "Cards/two.md");
  });
});

function bounds() {
  return {
    stageWidth: 1_000,
    stageHeight: 700,
    cardWidth: 600,
    cardHeight: 400,
  };
}
