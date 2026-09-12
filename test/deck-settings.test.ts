import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings, resolvedDeckKeybindings } from "../src/settings.js";
import { settingsRefreshImpact } from "../src/card-index-config.js";

test("layout settings normalize old data and invalid values without a schema migration", () => {
  const settings = normalizeSettings({ cardSpread: 0, cardTilt: Infinity, deckOrientation: "bad", deckStackModel: "bad", showLocalBranchView: false });
  assert.equal(settings.cardSpread, 0.10);
  assert.equal(normalizeSettings({ cardSpread: 0.02 }).cardSpread, 0.10);
  assert.equal(settings.cardTilt, 0);
  assert.equal(settings.deckOrientation, "horizontal");
  assert.equal(settings.deckStackModel, "drawer");
  assert.equal(settings.fanHeadersAtBottom, false);
  assert.equal(normalizeSettings({ fanHeadersAtBottom: true }).fanHeadersAtBottom, true);
  assert.equal(normalizeSettings({ fanHeadersAtBottom: "true" }).fanHeadersAtBottom, false);
  assert.equal(settings.branchViewPlacement, "hidden");
  assert.equal(normalizeSettings({ showLocalBranchView: false, branchViewPlacement: "left" }).branchViewPlacement, "left");
  assert.equal(normalizeSettings({ cardTilt: 10 }).cardTilt, 5);
  assert.equal(normalizeSettings({ cardSpread: NaN }).cardSpread, 0.58);
});

test("automatic arrow defaults round-trip while explicit and empty bindings stay fixed", () => {
  const upgraded = normalizeSettings({ deckKeybindings: DEFAULT_SETTINGS.deckKeybindings, deckOrientation: "vertical" });
  assert.deepEqual(resolvedDeckKeybindings(upgraded)["previous-card"].map((binding) => binding.key), ["ArrowUp", "k"]);
  assert.deepEqual(resolvedDeckKeybindings({ ...upgraded, deckOrientation: "horizontal" })["previous-card"].map((binding) => binding.key), ["ArrowLeft", "k"]);
  const explicit = normalizeSettings({ ...upgraded, navigationKeyOverrides: { "previous-card": true }, deckKeybindings: DEFAULT_SETTINGS.deckKeybindings });
  assert.equal(resolvedDeckKeybindings(explicit)["previous-card"][0]?.key, "ArrowLeft");
  const disabled = normalizeSettings({ deckOrientation: "vertical", deckKeybindings: { "previous-card": [] } });
  assert.deepEqual(resolvedDeckKeybindings(disabled)["previous-card"], []);
});

test("explicit keys beat automatic navigation defaults and layout changes refresh views", () => {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, deckOrientation: "vertical", deckKeybindings: {
    ...DEFAULT_SETTINGS.deckKeybindings, "open-note": [{ key: "ArrowUp", modifiers: [] }],
  } });
  assert.deepEqual(resolvedDeckKeybindings(settings)["previous-card"].map((binding) => binding.key), ["k"]);
  for (const next of [
    { ...DEFAULT_SETTINGS, deckOrientation: "vertical" as const },
    { ...DEFAULT_SETTINGS, deckStackModel: "fan" as const },
    { ...DEFAULT_SETTINGS, cardTilt: 2 },
    { ...DEFAULT_SETTINGS, fanHeadersAtBottom: true },
    { ...DEFAULT_SETTINGS, branchViewPlacement: "left" as const },
    { ...DEFAULT_SETTINGS, wheelOverCardBody: "deck" as const },
    { ...DEFAULT_SETTINGS, navigationKeyOverrides: { "previous-card": true, "next-card": false } },
  ]) assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, next), "full");
});
