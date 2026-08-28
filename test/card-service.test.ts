import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { App, TFile, TFolder } from "obsidian";

import type { CardIndex } from "../src/card-index.js";
import type { CardIndexRuntime } from "../src/card-index-runtime.js";
import { CardService } from "../src/card-service.js";
import type { DeskService } from "../src/desk-service.js";
import type { MetadataCacheWaiter } from "../src/metadata-cache-waiter.js";
import { DEFAULT_SETTINGS, type SlipboxSettings } from "../src/settings.js";

function file(path: string): TFile {
  const name = path.split("/").at(-1) ?? path;
  return {
    path,
    name,
    basename: name.replace(/\.md$/, ""),
    extension: "md",
  } as TFile;
}

function subject(overrides: Partial<SlipboxSettings> = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const existing = new Map<string, unknown>();
  const created: Array<{ path: string; content: string; file: TFile }> = [];
  const notices: string[] = [];
  const opened: string[] = [];
  const focused: string[] = [];
  const positioned: string[] = [];
  let queued = 0;
  let refreshed = 0;
  let openedDesk = 0;
  let waited = 0;
  let promptResult: string | null = "Title";
  let configuredFolder: TFolder | null = {
    path: "Cards",
    isRoot: () => false,
  } as TFolder;
  const root = { path: "", isRoot: () => true } as TFolder;
  const app = {
    metadataCache: { getFileCache: () => null },
    vault: {
      getAbstractFileByPath: (path: string) => existing.get(path) ?? null,
      getFolderByPath: () => configuredFolder,
      create: (path: string, content: string) => {
        const createdFile = file(path);
        created.push({ path, content, file: createdFile });
        existing.set(path, createdFile);
        return Promise.resolve(createdFile);
      },
    },
    fileManager: {
      getNewFileParent: () => root,
    },
    workspace: { getActiveFile: () => null },
  } as unknown as App;
  const runtime = {
    queue: () => { queued += 1; },
    refresh: async (request: { afterReconcile?: () => void }) => {
      request.afterReconcile?.();
      refreshed += 1;
    },
  } as unknown as CardIndexRuntime;
  const desk = {
    placeUnfiledAtPosition: (path: string) => positioned.push(path),
  } as unknown as DeskService;
  const cacheWaiter = {
    waitFor: async () => { waited += 1; return true; },
  } as unknown as MetadataCacheWaiter<TFile>;
  const service = new CardService({
    app,
    index: { snapshot: { filed: [] } } as unknown as CardIndex,
    indexRuntime: runtime,
    desk,
    cacheWaiter,
    settings: () => settings,
    timestamp: () => "20260828T120000",
    activeCreationSourcePath: () => "Source.md",
    promptForTitle: async () => promptResult,
    promptForLink: async () => null,
    normalizePath: (path) => path,
    serializeProperties: (properties) => JSON.stringify(properties),
    openFile: async (createdFile) => { opened.push(createdFile.path); },
    openDesk: async () => { openedDesk += 1; },
    focusDeskCard: (path) => focused.push(path),
    notify: (message) => notices.push(message),
    copyText: async () => undefined,
  });
  return {
    service,
    existing,
    created,
    notices,
    opened,
    focused,
    positioned,
    queued: () => queued,
    refreshed: () => refreshed,
    openedDesk: () => openedDesk,
    waited: () => waited,
    setPrompt: (value: string | null) => { promptResult = value; },
    loseFolder: () => { configuredFolder = null; },
  };
}

describe("CardService creation", () => {
  test("cancels prompted creation without side effects", async () => {
    const value = subject();
    value.setPrompt(null);
    await value.service.createAndOpen("prompt");
    assert.equal(value.created.length, 0);
    assert.deepEqual(value.opened, []);
    assert.deepEqual(value.notices, []);
  });

  test("uses Obsidian-style suffixes for filename collisions", async () => {
    const value = subject({ newCardFolder: "" });
    value.existing.set("20260828T120000.md", file("20260828T120000.md"));
    await value.service.createAndOpen("default");
    assert.equal(value.created[0]?.path, "20260828T120000 1.md");
  });

  test("reports a missing configured folder without creating a note", async () => {
    const value = subject({ newCardFolder: "Missing" });
    value.loseFolder();
    await value.service.createAndOpen("default");
    assert.equal(value.created.length, 0);
    assert.match(value.notices[0] ?? "", /configured new-card folder/);
  });

  test("opens ordinary creations but coordinates Desk creations", async () => {
    const opened = subject({ newCardFolder: "" });
    await opened.service.createAndOpen("default");
    assert.deepEqual(opened.opened, ["20260828T120000.md"]);
    assert.equal(opened.queued(), 1);
    assert.equal(opened.refreshed(), 0);

    const desk = subject({ newCardFolder: "" });
    await desk.service.createOnDesk("default");
    assert.equal(desk.openedDesk(), 1);
    assert.deepEqual(desk.opened, []);
    assert.equal(desk.waited(), 1);
    assert.equal(desk.refreshed(), 1);
    assert.deepEqual(desk.focused, ["20260828T120000.md"]);
  });

  test("places a positioned Desk creation after reconciliation", async () => {
    const value = subject({ newCardFolder: "" });
    await value.service.createAtDeskPosition({ x: 120, y: 80 });
    assert.deepEqual(value.positioned, ["20260828T120000.md"]);
  });
});
