import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { App, TFile } from "obsidian";

import type { CardIndex, FiledCard, VaultCardIndex } from "../src/card-index.js";
import type { CardIndexRuntime } from "../src/card-index-runtime.js";
import type { CardService } from "../src/card-service.js";
import type { DeskService } from "../src/desk-service.js";
import { FilingService } from "../src/filing-service.js";
import type { MetadataCacheWaiter } from "../src/metadata-cache-waiter.js";
import { DEFAULT_SETTINGS, type SlipboxSettings } from "../src/settings.js";

const SOURCE = {
  path: "Source.md",
  name: "Source.md",
  basename: "Source",
  extension: "md",
} as TFile;

function filed(path: string, address: string): FiledCard {
  return { path, address, file: { ...SOURCE, path } };
}

function snapshot(cards: readonly FiledCard[]): VaultCardIndex {
  return { filed: cards } as unknown as VaultCardIndex;
}

function subject(options: {
  readonly settings?: Partial<SlipboxSettings>;
  readonly builds?: readonly VaultCardIndex[];
  readonly cacheReady?: boolean;
  readonly writeError?: Error;
} = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const shared = snapshot([]);
  const builds = [...(options.builds ?? [snapshot([]), snapshot([])])];
  const notices: string[] = [];
  const removed: string[] = [];
  let currentFile: TFile = SOURCE;
  let writes = 0;
  let frontmatter: Record<string, unknown> = {
    [settings.addressProperty]: "",
  };
  const app = {
    vault: {
      getAbstractFileByPath: () => currentFile,
    },
    fileManager: {
      processFrontMatter: async (
        _file: TFile,
        update: (value: Record<string, unknown>) => void,
      ) => {
        writes += 1;
        if (options.writeError !== undefined) {
          throw options.writeError;
        }
        update(frontmatter);
      },
    },
  } as unknown as App;
  const index = {
    snapshot: shared,
    buildSnapshot: () => builds.shift() ?? snapshot([]),
  } as unknown as CardIndex;
  const runtime = {
    suppressQueuedRefresh: <T>(operation: () => Promise<T>) => operation(),
  } as unknown as CardIndexRuntime;
  const cards = {
    isUnfiled: () => true,
    title: () => "Source",
  } as unknown as CardService;
  const service = new FilingService({
    app,
    index,
    indexRuntime: runtime,
    desk: { removePath: (path: string) => removed.push(path) } as unknown as DeskService,
    cards,
    cacheWaiter: {
      waitFor: async () => options.cacheReady ?? true,
    } as unknown as MetadataCacheWaiter<TFile>,
    settings: () => settings,
    notify: (message) => notices.push(message),
  });
  return {
    service,
    notices,
    removed,
    writes: () => writes,
    frontmatter: () => frontmatter,
    replaceSource: () => { currentFile = { ...SOURCE }; },
    setFrontmatter: (value: Record<string, unknown>) => { frontmatter = value; },
  };
}

describe("FilingService", () => {
  test("rejects a replaced source identity", async () => {
    const value = subject();
    const preview = value.service.preview(SOURCE, "A/1");
    value.replaceSource();
    assert.equal((await value.service.file(SOURCE, preview)).status, "failed");
    assert.equal(value.writes(), 0);
    assert.match(value.notices[0] ?? "", /source path/);
  });

  test("detects a stale preview before the write", async () => {
    const value = subject({ builds: [snapshot([filed("Earlier.md", "A/0")])] });
    const preview = value.service.preview(SOURCE, "A/1");
    assert.equal(
      (await value.service.file(SOURCE, preview)).status,
      "preview-changed",
    );
    assert.equal(value.writes(), 0);
  });

  test("detects a stale preview during the frontmatter write", async () => {
    const value = subject({
      builds: [snapshot([]), snapshot([filed("Earlier.md", "A/0")])],
    });
    const preview = value.service.preview(SOURCE, "A/1");
    assert.equal(
      (await value.service.file(SOURCE, preview)).status,
      "preview-changed",
    );
    assert.equal(value.writes(), 1);
  });

  test("blocks a duplicate that appears during the write", async () => {
    const value = subject({
      settings: { duplicateAddresses: "problem" },
      builds: [snapshot([]), snapshot([filed("Race.md", "A/1")])],
    });
    const preview = value.service.preview(SOURCE, "A/1");
    assert.equal((await value.service.file(SOURCE, preview)).status, "failed");
    assert.match(value.notices[0] ?? "", /A\/1 is already used/);
  });

  test("reports failed writes without mutating Desk state", async () => {
    const value = subject({ writeError: new Error("disk full") });
    const preview = value.service.preview(SOURCE, "A/1");
    assert.equal((await value.service.file(SOURCE, preview)).status, "failed");
    assert.deepEqual(value.removed, []);
    assert.match(value.notices[0] ?? "", /disk full/);
  });

  test("files successfully and describes delayed cache publication", async () => {
    const value = subject({ cacheReady: false });
    const preview = value.service.preview(SOURCE, "A/1");
    assert.equal((await value.service.file(SOURCE, preview)).status, "filed");
    assert.equal(value.frontmatter()[DEFAULT_SETTINGS.addressProperty], "A/1");
    assert.deepEqual(value.removed, [SOURCE.path]);
    assert.match(value.notices[0] ?? "", /finishes indexing/);
  });
});
