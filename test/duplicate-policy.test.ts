import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_SETTINGS,
  duplicateFilingMessage,
  issueListDescription,
  issueStatusSummary,
  normalizeSettings,
} from "../src/index.js";
import type { CardIssue } from "../src/card-metadata.js";

const invalidIssue: CardIssue = {
  kind: "invalid",
  severity: "error",
  paths: ["bad.md"],
  message: "Unsupported slipbox-id 42: address must be text",
};

const duplicateIssue: CardIssue = {
  kind: "duplicate",
  severity: "warning",
  address: "A/1",
  paths: ["a.md", "b.md"],
  message: "Duplicate slipbox-id A/1",
};

describe("duplicate address policy", () => {
  test("defaults to allowing duplicates", () => {
    assert.equal(DEFAULT_SETTINGS.duplicateAddresses, "allowed");
  });

  test("normalizes unknown, missing, and legacy stored values to allowed", () => {
    assert.equal(normalizeSettings({}).duplicateAddresses, "allowed");
    assert.equal(
      normalizeSettings({ duplicateAddresses: "nonsense" }).duplicateAddresses,
      "allowed",
    );
    assert.equal(
      normalizeSettings({ duplicateAddresses: true }).duplicateAddresses,
      "allowed",
    );
    assert.equal(
      normalizeSettings({ duplicateAddresses: "problem" }).duplicateAddresses,
      "problem",
    );
  });

  test("describes only the issue kinds the list can contain", () => {
    const allowed = issueListDescription("allowed");
    assert.equal(allowed.includes("Duplicate"), false);
    assert.equal(allowed.includes("never repairs addresses automatically"), true);

    const problem = issueListDescription("problem");
    assert.equal(problem.includes("Duplicate-address cards remain"), true);
    assert.equal(problem.includes("refused"), true);
  });
});

describe("issue status summary", () => {
  test("reports nothing for a clean vault", () => {
    assert.equal(issueStatusSummary([]), null);
  });

  test("counts every issue and takes its severity from the worst kind", () => {
    const errorsAndWarnings = issueStatusSummary([
      invalidIssue,
      duplicateIssue,
    ]);
    assert.equal(errorsAndWarnings?.count, 2);
    assert.equal(errorsAndWarnings?.severity, "error");
    assert.equal(
      errorsAndWarnings?.description,
      "Slipbox Desk: 1 unfilable card, 1 duplicate address. Click to review.",
    );

    const warningsOnly = issueStatusSummary([duplicateIssue, duplicateIssue]);
    assert.equal(warningsOnly?.severity, "warning");
    assert.equal(
      warningsOnly?.description,
      "Slipbox Desk: 2 duplicate addresses. Click to review.",
    );
  });

  test("pluralizes unfilable cards", () => {
    const summary = issueStatusSummary([invalidIssue, invalidIssue]);
    assert.equal(
      summary?.description,
      "Slipbox Desk: 2 unfilable cards. Click to review.",
    );
  });
});

describe("duplicate filing message", () => {
  test("names the address and counts its occupants", () => {
    assert.equal(
      duplicateFilingMessage("A/1", 1),
      "A/1 is already used by 1 card. Duplicate addresses are not allowed.",
    );
    assert.equal(
      duplicateFilingMessage("A/1", 3),
      "A/1 is already used by 3 cards. Duplicate addresses are not allowed.",
    );
  });
});
