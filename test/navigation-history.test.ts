import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { NavigationHistory } from "../src/navigation-history.js";

describe("NavigationHistory", () => {
  test("starts empty or at an initial location", () => {
    const empty = new NavigationHistory<string>();
    assert.equal(empty.current(), undefined);
    assert.equal(empty.canBack(), false);
    assert.equal(empty.canForward(), false);

    const history = new NavigationHistory("21/3b");
    assert.equal(history.current(), "21/3b");
    assert.deepEqual(history.snapshot(), { entries: ["21/3b"], index: 0 });
  });

  test("supports repeated jumps, Back, and Forward", () => {
    const history = new NavigationHistory("21/3b");
    history.jump("37/2a");
    history.jump("9/4c1");
    assert.equal(history.back(), "37/2a");
    assert.equal(history.back(), "21/3b");
    assert.equal(history.back(), undefined);
    assert.equal(history.forward(), "37/2a");
    assert.equal(history.forward(), "9/4c1");
    assert.equal(history.forward(), undefined);
  });

  test("a new jump after Back replaces the forward branch", () => {
    const history = new NavigationHistory("21/3b");
    history.jump("37/2a");
    history.jump("9/4c1");
    history.back();
    history.jump("44/1b");
    assert.deepEqual(history.snapshot(), {
      entries: ["21/3b", "37/2a", "44/1b"],
      index: 2,
    });
    assert.equal(history.canForward(), false);
  });

  test("jumping to the current card does not add a duplicate", () => {
    const history = new NavigationHistory("21/3b");
    history.jump("21/3b");
    assert.deepEqual(history.snapshot(), { entries: ["21/3b"], index: 0 });
  });

  test("sequential movement becomes the Back source of the next jump", () => {
    const history = new NavigationHistory("21/3b");
    history.replaceCurrent("21/3c");
    history.replaceCurrent("21/3d");
    history.replaceCurrent("21/4");
    history.jump("84/2a");
    assert.equal(history.back(), "21/4");
    assert.equal(history.canBack(), false);
  });
});
