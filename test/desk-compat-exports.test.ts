import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_DESK,
  EMPTY_TRAY,
  reconcileDesk,
  reconcileTray,
  type DeskState,
  type TrayState,
} from "../src/index.js";

test("deprecated Tray exports resolve to the canonical Desk implementation", () => {
  const legacyState: TrayState = EMPTY_TRAY;
  const canonicalState: DeskState = legacyState;
  assert.equal(canonicalState, EMPTY_DESK);
  assert.equal(EMPTY_TRAY, EMPTY_DESK);
  assert.equal(reconcileTray, reconcileDesk);
});
