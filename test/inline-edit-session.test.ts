import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  InlineEditSessionController,
  InlineEditPathLock,
  runAfterInlineEditing,
  type InlineEditCommitRequest,
  type InlineEditCommitResult,
  type InlineEditFailure,
} from "../src/inline-edit-session.js";

interface ScheduledJob {
  readonly callback: () => void;
  cancelled: boolean;
}

function harness(
  commit: (request: InlineEditCommitRequest) => Promise<InlineEditCommitResult>,
) {
  const jobs: ScheduledJob[] = [];
  const failures: InlineEditFailure[] = [];
  const flushes: string[] = [];
  const controller = new InlineEditSessionController(
    "card.md",
    "deck",
    "base",
    {
      commit,
      flushOpenViews: async (path) => {
        flushes.push(path);
      },
      schedule: (callback) => {
        const job = { callback, cancelled: false };
        jobs.push(job);
        return job;
      },
      cancelScheduled: (handle) => {
        (handle as ScheduledJob).cancelled = true;
      },
      reportFailure: (failure) => failures.push(failure),
    },
  );
  return {
    controller,
    jobs,
    failures,
    flushes,
    runNext: () => jobs.find((job) => !job.cancelled)?.callback(),
  };
}

describe("inline edit session controller", () => {
  test("debounces and advances the optimistic base after a save", async () => {
    const requests: InlineEditCommitRequest[] = [];
    const state = harness(async (request) => {
      requests.push(request);
      return { status: "saved" };
    });
    state.controller.updateDraft("first");
    state.controller.updateDraft("second");
    assert.equal(state.jobs[0]?.cancelled, true);
    state.runNext();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.draft, "second");
    assert.equal(state.controller.snapshot.baseBody, "second");
  });

  test("serializes an older debounce before the final newest draft", async () => {
    const requests: InlineEditCommitRequest[] = [];
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const state = harness(async (request) => {
      requests.push(request);
      events.push(`commit:${request.draft}`);
      if (requests.length === 1) {
        await firstBlocked;
      }
      return { status: "saved" };
    });

    state.controller.updateDraft("older");
    state.runNext();
    await new Promise((resolve) => setImmediate(resolve));
    state.controller.updateDraft("newest");
    const finish = state.controller.finish();
    assert.equal(requests.length, 1);
    releaseFirst?.();
    assert.equal(await finish, true);
    assert.deepEqual(requests.map((request) => request.draft), ["older", "newest"]);
    assert.deepEqual(requests.map((request) => request.baseBody), ["base", "older"]);
    assert.equal(requests[1]?.final, true);
    assert.deepEqual(events, ["commit:older", "commit:newest"]);
  });

  test("coalesces duplicate finalizers and flushes open views once", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let commits = 0;
    const state = harness(async () => {
      commits += 1;
      await blocked;
      return { status: "saved" };
    });
    const first = state.controller.finish();
    const second = state.controller.finish();
    assert.equal(first, second);
    release?.();
    assert.equal(await first, true);
    assert.equal(commits, 1);
    assert.deepEqual(state.flushes, ["card.md"]);
  });

  test("retains the draft after a conflict", async () => {
    let underlyingMatches = false;
    const state = harness(async () => underlyingMatches
      ? { status: "saved" }
      : {
          status: "conflict",
          message: "The note body changed elsewhere.",
        });
    state.controller.updateDraft("local draft");
    assert.equal(await state.controller.finish(), false);
    assert.equal(state.controller.snapshot.draft, "local draft");
    assert.equal(state.controller.snapshot.phase, "conflict");
    assert.equal(state.failures[0]?.kind, "conflict");
    underlyingMatches = true;
    assert.equal(await state.controller.finish(), true);
  });

  test("does not retry a hard rename-lock conflict", async () => {
    let commits = 0;
    const state = harness(async () => {
      commits += 1;
      return { status: "saved" };
    });
    state.controller.markConflict("The renamed path is locked.");
    assert.equal(await state.controller.finish(), false);
    assert.equal(commits, 0);
  });

  test("retains the draft after a write failure and permits retry", async () => {
    let fail = true;
    const state = harness(async () => {
      if (fail) {
        throw new Error("read only");
      }
      return { status: "saved" };
    });
    state.controller.updateDraft("local draft");
    assert.equal(await state.controller.finish(), false);
    assert.equal(state.controller.snapshot.draft, "local draft");
    assert.equal(state.controller.snapshot.phase, "editing");
    assert.equal(state.failures[0]?.kind, "write");
    fail = false;
    assert.equal(await state.controller.finish(), true);
  });

  test("tracks a renamed path for the final flush and commit", async () => {
    const requests: InlineEditCommitRequest[] = [];
    const state = harness(async (request) => {
      requests.push(request);
      return { status: "saved" };
    });
    state.controller.renamePath("renamed.md");
    assert.equal(await state.controller.finish(), true);
    assert.equal(requests[0]?.path, "renamed.md");
    assert.deepEqual(state.flushes, ["renamed.md"]);
  });
});

describe("inline edit path lock", () => {
  test("allows one owner per exact path while duplicate addresses remain irrelevant", () => {
    const lock = new InlineEditPathLock<object>();
    const first = {};
    const second = {};
    assert.equal(lock.acquire("duplicate-one.md", first), true);
    assert.equal(lock.acquire("duplicate-one.md", second), false);
    assert.equal(lock.acquire("duplicate-two.md", second), true);
    assert.equal(lock.ownerAt("duplicate-one.md"), first);
    assert.equal(lock.ownerAt("duplicate-two.md"), second);
  });

  test("moves ownership on rename and rejects a locked destination", () => {
    const lock = new InlineEditPathLock<object>();
    const first = {};
    const second = {};
    lock.acquire("first.md", first);
    lock.acquire("second.md", second);
    assert.equal(lock.rename("first.md", "second.md", first), false);
    assert.equal(lock.rename("first.md", "renamed.md", first), true);
    assert.equal(lock.ownerAt("first.md"), undefined);
    assert.equal(lock.ownerAt("renamed.md"), first);
    lock.release("renamed.md", second);
    assert.equal(lock.ownerAt("renamed.md"), first);
    lock.release("renamed.md", first);
    assert.equal(lock.ownerAt("renamed.md"), undefined);
  });
});

describe("inline action gate", () => {
  test("runs an action only after a successful final save", async () => {
    const events: string[] = [];
    assert.equal(await runAfterInlineEditing(
      async () => {
        events.push("save");
        return true;
      },
      () => {
        events.push("action");
      },
    ), true);
    assert.deepEqual(events, ["save", "action"]);
  });

  test("cancels an action after a failed final save", async () => {
    let actions = 0;
    assert.equal(await runAfterInlineEditing(
      async () => false,
      () => {
        actions += 1;
      },
    ), false);
    assert.equal(actions, 0);
  });
});
