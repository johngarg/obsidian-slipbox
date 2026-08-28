import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { TFile } from "obsidian";

import {
  FilingSession,
  type FilingResolution,
} from "../src/filing-session.js";
import { createFilingPreview } from "../src/filing-preview.js";

interface MutableFile {
  path: string;
}

function harness(path = "source.md") {
  const mutableFile: MutableFile = { path };
  const file = mutableFile as TFile;
  let indexedFile: TFile | null = file;
  let sourceStatus: "unfiled" | "not-unfiled" = "unfiled";
  let filed: readonly { readonly path: string; readonly address: string }[] = [
    { path: "a.md", address: "A/10" },
    { path: "z.md", address: "A/20" },
  ];
  let duplicatePaths: readonly string[] = [];
  let duplicatesBlocked = false;
  const session = new FilingSession({
    resolve: (candidate, sourcePath, address): FilingResolution => {
      if (candidate.path !== sourcePath || indexedFile !== candidate) {
        return { kind: "missing" };
      }
      if (sourceStatus === "not-unfiled") {
        return { kind: "not-unfiled" };
      }
      return {
        kind: "ready",
        preview: createFilingPreview(
          filed,
          { path: sourcePath, address },
          "Source",
          "natural",
        ),
        duplicatePaths,
        duplicatesBlocked,
      };
    },
  });
  return {
    session,
    file,
    mutableFile,
    setIndexedFile: (next: TFile | null) => {
      indexedFile = next;
    },
    setSourceStatus: (next: "unfiled" | "not-unfiled") => {
      sourceStatus = next;
    },
    setFiled: (next: typeof filed) => {
      filed = next;
    },
    setDuplicates: (paths: readonly string[], blocked: boolean) => {
      duplicatePaths = paths;
      duplicatesBlocked = blocked;
    },
  };
}

describe("FilingSession", () => {
  test("starts idle and derives a valid preview from edited input", () => {
    const state = harness();
    assert.equal(state.session.isActive, false);

    state.session.start(state.file, "desk", "");
    assert.equal(state.session.snapshot?.message, "Enter an address.");
    assert.equal(state.session.snapshot?.invalid, false);
    assert.equal(state.session.canCancel, true);
    assert.equal(state.session.canConfirm, false);

    assert.equal(state.session.updateInput(" A/12 "), true);
    assert.equal(state.session.snapshot?.value, " A/12 ");
    assert.equal(state.session.snapshot?.preview?.address, "A/12");
    assert.equal(state.session.snapshot?.preview?.previousPath, "a.md");
    assert.equal(state.session.canConfirm, true);
  });

  test("reports invalid input and current source eligibility", () => {
    const state = harness();
    state.session.start(state.file, "viewed", "A/12");

    state.session.updateInput("bad\naddress");
    assert.equal(state.session.snapshot?.invalid, true);
    assert.match(state.session.snapshot?.message ?? "", /one line/);

    state.session.updateInput("A/12");
    state.setSourceStatus("not-unfiled");
    state.session.refresh();
    assert.equal(
      state.session.snapshot?.message,
      "The source card is no longer unfiled.",
    );
    assert.equal(state.session.canConfirm, false);
  });

  test("keeps source validity ahead of address validation", () => {
    const state = harness();
    state.session.start(state.file, "desk", "bad\naddress");
    state.setIndexedFile(null);
    state.session.refresh();

    assert.equal(
      state.session.snapshot?.message,
      "The source card no longer exists.",
    );
  });

  test("shows permitted duplicates and blocks confirmation under strict policy", () => {
    const state = harness();
    state.setDuplicates(["a.md", "z.md"], false);
    state.session.start(state.file, "desk", "A/10");
    assert.deepEqual(state.session.snapshot?.duplicatePaths, ["a.md", "z.md"]);
    assert.equal(state.session.snapshot?.invalid, false);
    assert.equal(state.session.canConfirm, true);

    state.setDuplicates(["a.md", "z.md"], true);
    state.session.refresh();
    assert.equal(state.session.snapshot?.invalid, true);
    assert.match(state.session.snapshot?.message ?? "", /already used by 2 cards/);
    assert.equal(state.session.canConfirm, false);
    assert.equal(state.session.beginConfirmation(), null);
  });

  test("locks input and cancellation during confirmation, then resumes", () => {
    const state = harness();
    state.session.start(state.file, "viewed", "A/12");
    const request = state.session.beginConfirmation();
    assert.equal(request?.file, state.file);
    assert.equal(request?.sourcePath, "source.md");
    assert.equal(request?.sourceSurface, "viewed");
    assert.equal(state.session.snapshot?.phase, "confirming");
    assert.equal(state.session.canConfirm, false);
    assert.equal(state.session.canCancel, false);
    assert.equal(state.session.beginConfirmation(), null);
    assert.equal(state.session.updateInput("A/13"), false);
    assert.equal(state.session.cancel(), null);

    state.session.finishConfirmation();
    assert.equal(state.session.snapshot?.phase, "editing");
    assert.equal(state.session.canConfirm, true);
    assert.deepEqual(state.session.cancel(), {
      sourcePath: "source.md",
      sourceSurface: "viewed",
    });
    assert.equal(state.session.snapshot, null);
  });

  test("freezes confirmation state and recalculates after a failed write", () => {
    const state = harness();
    state.session.start(state.file, "desk", "A/12");
    const captured = state.session.beginConfirmation();
    assert.equal(captured?.preview.previousPath, "a.md");

    state.setFiled([
      { path: "a.md", address: "A/10" },
      { path: "new.md", address: "A/11" },
      { path: "z.md", address: "A/20" },
    ]);
    state.session.refresh();
    assert.equal(state.session.snapshot?.preview?.previousPath, "a.md");

    state.session.finishConfirmation();
    assert.equal(state.session.snapshot?.phase, "editing");
    assert.equal(state.session.snapshot?.preview?.previousPath, "new.md");
    assert.equal(state.session.canConfirm, true);
  });

  test("recalculates a changed placement before a confirmation retry", () => {
    const state = harness();
    state.session.start(state.file, "desk", "A/12");
    assert.equal(state.session.beginConfirmation()?.preview.previousPath, "a.md");

    state.setFiled([
      { path: "a.md", address: "A/10" },
      { path: "new.md", address: "A/11" },
      { path: "z.md", address: "A/20" },
    ]);
    state.session.finishConfirmation();
    assert.equal(state.session.snapshot?.preview?.previousPath, "new.md");
    assert.equal(state.session.beginConfirmation()?.preview.previousPath, "new.md");
    state.session.complete();
    assert.equal(state.session.isActive, false);
  });

  test("follows renames but never transfers to a same-path replacement", () => {
    const state = harness("Cards/source.md");
    state.session.start(state.file, "desk", "A/12");
    state.mutableFile.path = "Archive/source.md";
    state.setIndexedFile(null);
    state.session.renamePath("Cards/source.md", "Archive/source.md");
    assert.equal(state.session.snapshot?.sourcePath, "Archive/source.md");
    assert.equal(state.session.canConfirm, false);

    state.setIndexedFile(state.file);
    state.session.refresh();
    assert.equal(state.session.canConfirm, true);

    const replacement = { path: "Archive/source.md" } as TFile;
    state.setIndexedFile(replacement);
    state.session.refresh();
    assert.equal(
      state.session.snapshot?.message,
      "The source card no longer exists.",
    );
    assert.equal(state.session.canConfirm, false);
  });

  test("keeps a deleted source invalid even if its path reappears", () => {
    const state = harness("Cards/source.md");
    state.session.start(state.file, "desk", "A/12");
    state.session.deletePath("Other");
    assert.equal(state.session.canConfirm, true);

    state.session.deletePath("Cards");
    assert.equal(
      state.session.snapshot?.message,
      "The source card no longer exists.",
    );
    state.setIndexedFile(state.file);
    state.session.refresh();
    assert.equal(state.session.canConfirm, false);
    assert.equal(state.session.canCancel, true);

    state.session.reset();
    assert.equal(state.session.snapshot, null);
  });
});
