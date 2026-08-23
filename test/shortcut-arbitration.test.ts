import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  arbitrateShortcut,
  classifyShortcutClaim,
  ShortcutCommandTracker,
} from "../src/shortcut-arbitration.js";

describe("Slipbox shortcut arbitration", () => {
  test("associates a dispatched command with the observed key event", () => {
    const tracker = new ShortcutCommandTracker<object, string>();
    const observedEvent = {};
    const staleLastEvent = {};
    tracker.observe(observedEvent);
    assert.equal(
      tracker.record("centre-card", staleLastEvent),
      observedEvent,
    );
    assert.equal(tracker.take(observedEvent), "centre-card");
    assert.equal(tracker.take(staleLastEvent), undefined);
  });

  test("falls back to Obsidian's last event outside an observed shortcut", () => {
    const tracker = new ShortcutCommandTracker<object, string>();
    const lastEvent = {};
    assert.equal(tracker.record("centre-card", lastEvent), lastEvent);
    assert.equal(tracker.take(lastEvent), "centre-card");
  });

  test("lets a customized Obsidian hotkey win and reports the conflict", () => {
    let runs = 0;
    let warnings = 0;
    assert.equal(arbitrateShortcut(
      "other-command",
      () => { runs += 1; },
      () => { warnings += 1; },
    ), "conflict");
    assert.equal(runs, 0);
    assert.equal(warnings, 1);
  });

  test("does not rerun an action already dispatched as an Obsidian command", () => {
    let runs = 0;
    let warnings = 0;
    assert.equal(arbitrateShortcut(
      "same-slipbox-command",
      () => { runs += 1; },
      () => { warnings += 1; },
    ), "command");
    assert.equal(runs, 0);
    assert.equal(warnings, 0);
  });

  test("classifies a different Slipbox command as an Obsidian conflict", () => {
    assert.equal(classifyShortcutClaim(
      false,
      "move-desk-card-left",
      "centre-card",
    ), "other-command");
  });

  test("classifies the matching Slipbox command without treating it as a conflict", () => {
    assert.equal(classifyShortcutClaim(
      true,
      "centre-card",
      "centre-card",
    ), "same-slipbox-command");
  });

  test("classifies a prevented core Obsidian hotkey as a conflict", () => {
    assert.equal(classifyShortcutClaim(
      true,
      "move-desk-card-left",
    ), "other-command");
  });

  test("classifies an untouched key event as unclaimed", () => {
    assert.equal(classifyShortcutClaim(
      false,
      "move-desk-card-left",
    ), "unclaimed");
  });

  test("runs the configured Slipbox shortcut when Obsidian leaves it unclaimed", () => {
    let runs = 0;
    assert.equal(arbitrateShortcut(
      "unclaimed",
      () => { runs += 1; },
      () => assert.fail("unexpected conflict"),
    ), "slipbox");
    assert.equal(runs, 1);
  });
});
