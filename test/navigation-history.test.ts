import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { NavigationHistory } from "../src/navigation-history.js";

describe("NavigationHistory", () => {
  test("starts empty or at an initial location", () => {
    const empty = new NavigationHistory<string>();
    assert.equal(empty.current(), undefined);
    assert.equal(empty.canBack(), false);
    assert.equal(empty.canForward(), false);

    const history = new NavigationHistory("Cards/a.md");
    assert.equal(history.current(), "Cards/a.md");
    assert.deepEqual(history.snapshot(), { entries: ["Cards/a.md"], index: 0 });
  });

  test("supports repeated jumps, Back, and Forward", () => {
    const history = new NavigationHistory("Cards/a.md");
    history.jump("Cards/duplicate-a.md");
    history.jump("Cards/duplicate-b.md");
    assert.equal(history.back(), "Cards/duplicate-a.md");
    assert.equal(history.back(), "Cards/a.md");
    assert.equal(history.back(), undefined);
    assert.equal(history.forward(), "Cards/duplicate-a.md");
    assert.equal(history.forward(), "Cards/duplicate-b.md");
    assert.equal(history.forward(), undefined);
  });

  test("a new jump after Back replaces the forward branch", () => {
    const history = new NavigationHistory("Cards/a.md");
    history.jump("Cards/b.md");
    history.jump("Cards/c.md");
    history.back();
    history.jump("Cards/d.md");
    assert.deepEqual(history.snapshot(), {
      entries: ["Cards/a.md", "Cards/b.md", "Cards/d.md"],
      index: 2,
    });
    assert.equal(history.canForward(), false);
  });

  test("jumping to the current card does not add a duplicate", () => {
    const history = new NavigationHistory("Cards/a.md");
    history.jump("Cards/a.md");
    assert.deepEqual(history.snapshot(), { entries: ["Cards/a.md"], index: 0 });
  });

  test("sequential movement becomes the Back source of the next jump", () => {
    const history = new NavigationHistory("Cards/a.md");
    history.replaceCurrent("Cards/b.md");
    history.replaceCurrent("Cards/c.md");
    history.replaceCurrent("Cards/d.md");
    history.jump("Other/jump.md");
    assert.equal(history.back(), "Cards/d.md");
    assert.equal(history.canBack(), false);
  });

  test("rewrites folder renames and removes only deleted path destinations", () => {
    const history = new NavigationHistory("Cards/a.md");
    history.jump("Cards/duplicate-a.md");
    history.jump("Cards/duplicate-b.md");
    history.transform((path) => path.replace(/^Cards\//, "Archive/"));
    assert.deepEqual(history.snapshot(), {
      entries: [
        "Archive/a.md",
        "Archive/duplicate-a.md",
        "Archive/duplicate-b.md",
      ],
      index: 2,
    });
    history.transform((path) =>
      path === "Archive/duplicate-a.md" ? undefined : path
    );
    assert.deepEqual(history.snapshot(), {
      entries: ["Archive/a.md", "Archive/duplicate-b.md"],
      index: 1,
    });
  });
});
