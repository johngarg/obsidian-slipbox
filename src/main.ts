import {
  Notice,
  Plugin,
  TFile,
  normalizePath,
  type WorkspaceLeaf,
} from "obsidian";

import { DECK_VIEW_TYPE, DeckView } from "./deck-view.js";
import { generateFiledId, generateNextSectionId } from "./zettel-id.js";
import {
  DeskModal,
  EntryPointsModal,
  IssuesModal,
  promptForText,
} from "./modals.js";
import {
  DEFAULT_STATE,
  normalizePluginState,
  type EntryPoint,
  type ZettelkastenPluginState,
} from "./plugin-state.js";
import { ZettelIndex } from "./zettel-index.js";

type CardMetadataState = "ordinary" | "unfiled" | "filed" | "invalid";

export default class ZettelkastenPlugin extends Plugin {
  state: ZettelkastenPluginState = DEFAULT_STATE;
  index!: ZettelIndex;

  private indexRefreshTimer: number | null = null;
  private spreadSaveTimer: number | null = null;
  private filingWriteInProgress = false;

  async onload(): Promise<void> {
    this.state = normalizePluginState(await this.loadData());
    this.index = new ZettelIndex(this.app);
    this.index.refresh();

    this.registerView(
      DECK_VIEW_TYPE,
      (leaf) => new DeckView(leaf, this),
    );

    this.addRibbonIcon("archive", "Open Zettelkasten Deck", () => {
      void this.openDeck();
    });

    this.registerCommands();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.queueIndexRefresh()),
    );
    this.registerEvent(
      this.app.metadataCache.on("deleted", () => this.queueIndexRefresh()),
    );
    this.registerEvent(
      this.app.vault.on("create", () => this.queueIndexRefresh()),
    );
    this.registerEvent(
      this.app.vault.on("delete", () => this.queueIndexRefresh()),
    );
    this.registerEvent(
      this.app.vault.on("rename", () => this.queueIndexRefresh()),
    );
    this.app.workspace.onLayoutReady(() => void this.refreshIndex());
  }

  onunload(): void {
    if (this.indexRefreshTimer !== null) {
      window.clearTimeout(this.indexRefreshTimer);
    }
    if (this.spreadSaveTimer !== null) {
      window.clearTimeout(this.spreadSaveTimer);
    }
    this.app.workspace.detachLeavesOfType(DECK_VIEW_TYPE);
  }

  async openDeck(filingFile?: TFile): Promise<DeckView> {
    await this.refreshIndex();
    let leaf: WorkspaceLeaf;
    const existing = this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)[0];
    if (existing === undefined) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: DECK_VIEW_TYPE, active: true });
    } else {
      leaf = existing;
    }

    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof DeckView)) {
      throw new Error("Obsidian did not create the Zettelkasten Deck view");
    }
    if (filingFile !== undefined) {
      await leaf.view.startFiling(filingFile);
    }
    return leaf.view;
  }

  async rememberActiveCard(id: string): Promise<void> {
    if (this.state.lastActiveId === id) {
      return;
    }
    this.state = { ...this.state, lastActiveId: id };
    await this.persistState();
  }

  setSpread(value: number): void {
    const spread = Math.min(1.12, Math.max(0.28, value));
    this.state = { ...this.state, spread };
    if (this.spreadSaveTimer !== null) {
      window.clearTimeout(this.spreadSaveTimer);
    }
    this.spreadSaveTimer = window.setTimeout(() => {
      this.spreadSaveTimer = null;
      void this.persistState();
    }, 160);
  }

  openMarkdownFile(file: TFile): void {
    void this.app.workspace.getLeaf("tab").openFile(file);
  }

  showDesk(): void {
    this.index.refresh();
    new DeskModal(this.app, this.index.snapshot.unfiled, {
      open: (file) => this.openMarkdownFile(file),
      file: (file) => void this.beginFiling(file),
    }).open();
  }

  showIssues(): void {
    this.index.refresh();
    new IssuesModal(this.app, this.index.snapshot, {
      open: (path) => {
        const file = this.index.fileAtPath(path);
        if (file === undefined) {
          new Notice(`Could not find ${path}.`);
        } else {
          this.openMarkdownFile(file);
        }
      },
    }).open();
  }

  showEntryPoints(view: DeckView): void {
    const entries = this.state.entryPoints;
    new EntryPointsModal(this.app, entries, {
      currentId: view.activeCard?.id ?? null,
      isAvailable: (id) => this.index.filedById(id) !== undefined,
      visit: (id) => void view.goToId(id),
      addCurrent: () => view.addCurrentAsEntryPoint(),
      rename: (index) => this.renameEntryPoint(index),
      remove: (index) => this.removeEntryPoint(index),
    }).open();
  }

  async addEntryPoint(id: string): Promise<void> {
    if (this.index.filedById(id) === undefined) {
      new Notice(`Card ${id} is not available in Deck.`);
      return;
    }
    if (this.state.entryPoints.some((entry) => entry.id === id)) {
      new Notice(`${id} is already an entry point.`);
      return;
    }

    const name = await promptForText(
      this.app,
      "Name this entry point",
      "e.g. Communication",
    );
    if (name === null) {
      return;
    }

    this.state = {
      ...this.state,
      entryPoints: [...this.state.entryPoints, { name, id }],
    };
    await this.persistState();
    new Notice(`Added entry point “${name}”.`);
  }

  async createNewSection(): Promise<void> {
    try {
      this.index.refresh();
      const id = generateNextSectionId(this.index.snapshot.allValidIds);
      const file = await this.createCardFile(id);
      this.openMarkdownFile(file);
      this.queueIndexRefresh();
    } catch (error) {
      new Notice(`Could not create a section: ${errorMessage(error)}`);
    }
  }

  async fileCard(file: TFile, attachmentId: string): Promise<string | null> {
    this.filingWriteInProgress = true;
    try {
      this.index.refresh();
      if (this.index.filedById(attachmentId) === undefined) {
        throw new Error(
          `Attachment ${attachmentId} is missing, invalid, or duplicated`,
        );
      }
      const newId = generateFiledId(
        attachmentId,
        this.index.snapshot.allValidIds,
      );

      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const hasId = Object.prototype.hasOwnProperty.call(
          frontmatter,
          "zettel-id",
        );
        const current = frontmatter["zettel-id"];
        if (!hasId || !(current === "" || current === null || current === undefined)) {
          throw new Error(
            "The card is no longer unfiled; its zettel-id was not changed",
          );
        }
        frontmatter["zettel-id"] = newId;
      });

      await this.waitForCachedId(file, newId);
      this.index.refresh();
      await this.rememberActiveCard(newId);
      new Notice(`Filed ${file.basename} as ${newId}.`);
      return newId;
    } catch (error) {
      new Notice(`Could not file the card: ${errorMessage(error)}`);
      return null;
    } finally {
      this.filingWriteInProgress = false;
    }
  }

  private registerCommands(): void {
    this.addCommand({
      id: "open-deck",
      name: "Open Deck",
      callback: () => void this.openDeck(),
    });

    this.addCommand({
      id: "new-card",
      name: "New card",
      callback: () => void this.createNewCard(),
    });

    this.addCommand({
      id: "make-current-note-card",
      name: "Make current note a card",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available =
          file !== null &&
          file.extension === "md" &&
          this.cardMetadataState(file) === "ordinary";
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          void this.makeNoteCard(file);
        }
        return available;
      },
    });

    this.addCommand({
      id: "file-current-unfiled-card",
      name: "File current unfiled card",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available =
          file !== null && this.cardMetadataState(file) === "unfiled";
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          void this.beginFiling(file);
        }
        return available;
      },
    });

    this.addCommand({
      id: "new-section",
      name: "New section",
      callback: () => void this.createNewSection(),
    });

    this.addCommand({
      id: "hold-place",
      name: "Hold place",
      checkCallback: (checking) => {
        const view = this.currentDeckView();
        const available = view?.activeCard !== null && view !== null;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          view.holdPlace();
        }
        return available;
      },
    });

    this.addCommand({
      id: "add-current-card-entry-point",
      name: "Add current card as entry point",
      checkCallback: (checking) => {
        const deckView = this.app.workspace.getActiveViewOfType(DeckView);
        const deckId = deckView?.activeCard?.id;
        const activeFile = this.app.workspace.getActiveFile();
        const fileId = activeFile === null
          ? undefined
          : this.index.filedByFile(activeFile)?.id;
        const id = deckId ?? fileId;
        const available = id !== undefined;
        if (checking) {
          return available;
        }
        if (id !== undefined) {
          void this.addEntryPoint(id);
        }
        return available;
      },
    });
  }

  private async createNewCard(): Promise<void> {
    try {
      const file = await this.createCardFile(null);
      this.openMarkdownFile(file);
      this.queueIndexRefresh();
    } catch (error) {
      new Notice(`Could not create a card: ${errorMessage(error)}`);
    }
  }

  private async makeNoteCard(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (Object.prototype.hasOwnProperty.call(frontmatter, "zettel-id")) {
          throw new Error("This note already has a zettel-id property");
        }
        frontmatter["zettel-id"] = "";
      });
      this.queueIndexRefresh();
      new Notice(`${file.basename} is now an unfiled card.`);
    } catch (error) {
      new Notice(`Could not make this note a card: ${errorMessage(error)}`);
    }
  }

  private async beginFiling(file: TFile): Promise<void> {
    this.index.refresh();
    if (this.cardMetadataState(file) !== "unfiled") {
      new Notice("Only an unfiled card can enter Filing Mode.");
      return;
    }
    await this.openDeck(file);
  }

  private async createCardFile(id: string | null): Promise<TFile> {
    const activePath = this.app.workspace.getActiveFile()?.path ?? "";
    const basename = this.timestampBasename();
    const parent = this.app.fileManager.getNewFileParent(
      activePath,
      `${basename}.md`,
    );
    const prefix = parent.isRoot() ? "" : `${parent.path}/`;
    let sequence = 0;
    let path: string;

    do {
      const suffix = sequence === 0 ? "" : ` ${sequence + 1}`;
      path = normalizePath(`${prefix}${basename}${suffix}.md`);
      sequence += 1;
    } while (this.app.vault.getAbstractFileByPath(path) !== null);

    const yamlValue = id === null ? '""' : `"${id}"`;
    return this.app.vault.create(
      path,
      `---\nzettel-id: ${yamlValue}\n---\n\n`,
    );
  }

  private timestampBasename(): string {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const time = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    return `Zettel ${date} ${time}`;
  }

  private cardMetadataState(file: TFile): CardMetadataState {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (
      frontmatter === undefined ||
      !Object.prototype.hasOwnProperty.call(frontmatter, "zettel-id")
    ) {
      return "ordinary";
    }
    const value = frontmatter["zettel-id"];
    if (value === "" || value === null || value === undefined) {
      return "unfiled";
    }
    if (typeof value !== "string") {
      return "invalid";
    }
    return this.index.snapshot.allValidIds.includes(value) ? "filed" : "invalid";
  }

  private currentDeckView(): DeckView | null {
    const active = this.app.workspace.getActiveViewOfType(DeckView);
    if (active !== null) {
      return active;
    }
    const leaf = this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)[0];
    return leaf?.view instanceof DeckView ? leaf.view : null;
  }

  private async renameEntryPoint(index: number): Promise<void> {
    const entry = this.state.entryPoints[index];
    if (entry === undefined) {
      return;
    }
    const name = await promptForText(
      this.app,
      "Rename entry point",
      "Entry point name",
      entry.name,
    );
    if (name === null) {
      return;
    }
    const entries = [...this.state.entryPoints];
    entries[index] = { ...entry, name };
    this.state = { ...this.state, entryPoints: entries };
    await this.persistState();
  }

  private async removeEntryPoint(index: number): Promise<void> {
    const entries = [...this.state.entryPoints];
    const removed = entries.splice(index, 1)[0];
    if (removed === undefined) {
      return;
    }
    this.state = { ...this.state, entryPoints: entries };
    await this.persistState();
    new Notice(`Deleted entry point “${removed.name}”.`);
  }

  private queueIndexRefresh(): void {
    if (this.filingWriteInProgress) {
      return;
    }
    if (this.indexRefreshTimer !== null) {
      window.clearTimeout(this.indexRefreshTimer);
    }
    this.indexRefreshTimer = window.setTimeout(() => {
      this.indexRefreshTimer = null;
      void this.refreshIndex();
    }, 80);
  }

  private async refreshIndex(): Promise<void> {
    this.index.refresh();
    const refreshes = this.app.workspace
      .getLeavesOfType(DECK_VIEW_TYPE)
      .flatMap((leaf) =>
        leaf.view instanceof DeckView ? [leaf.view.refresh()] : [],
      );
    await Promise.all(refreshes);
  }

  private async persistState(): Promise<void> {
    try {
      await this.saveData(this.state);
    } catch (error) {
      new Notice(`Could not save Zettelkasten state: ${errorMessage(error)}`);
    }
  }

  private async waitForCachedId(file: TFile, expectedId: string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const value =
        this.app.metadataCache.getFileCache(file)?.frontmatter?.["zettel-id"];
      if (value === expectedId) {
        return;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type { EntryPoint };
