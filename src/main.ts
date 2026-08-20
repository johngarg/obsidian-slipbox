import {
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
  normalizePath,
  type WorkspaceLeaf,
} from "obsidian";

import {
  createBookmark,
  deleteBookmark,
  type DeckBookmark,
} from "./bookmarks.js";
import { DECK_VIEW_TYPE, DeckView } from "./deck-view.js";
import { DESK_VIEW_TYPE, DeskView } from "./desk-view.js";
import {
  addDeskCard,
  bringDeskCardToFront,
  moveDeskCard,
  removeDeskCard,
  removeDeskPath,
  renameDeskCard,
} from "./desk-state.js";
import { generateFiledId, generateNextSectionId } from "./zettel-id.js";
import {
  BookmarksModal,
  EntryPointsModal,
  IssuesModal,
  promptForText,
} from "./modals.js";
import {
  DEFAULT_STATE,
  normalizePluginState,
  type EntryPoint,
  type SlipboxPluginState,
} from "./plugin-state.js";
import { ZettelIndex } from "./zettel-index.js";

type CardMetadataState = "ordinary" | "unfiled" | "filed" | "invalid";

export default class SlipboxPlugin extends Plugin {
  state: SlipboxPluginState = DEFAULT_STATE;
  index!: ZettelIndex;

  private indexRefreshTimer: number | null = null;
  private spreadSaveTimer: number | null = null;
  private filingWriteInProgress = false;

  async onload(): Promise<void> {
    this.state = normalizePluginState(await this.loadData());
    this.index = new ZettelIndex(this.app);
    this.index.refresh();
    await this.persistState();

    this.registerView(
      DECK_VIEW_TYPE,
      (leaf) => new DeckView(leaf, this),
    );
    this.registerView(
      DESK_VIEW_TYPE,
      (leaf) => new DeskView(leaf, this),
    );

    this.addRibbonIcon("archive", "Open Slipbox Deck", () => {
      void this.openDeck();
    });

    this.registerCommands();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.queueIndexRefresh()),
    );
    this.registerEvent(
      this.app.metadataCache.on("deleted", () => this.queueIndexRefresh()),
    );
    this.registerEvent(this.app.vault.on("create", () => this.queueIndexRefresh()));
    this.registerEvent(
      this.app.vault.on("delete", (file) => this.handleDeletedFile(file)),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => this.handleRenamedFile(file, oldPath)),
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
    this.app.workspace.detachLeavesOfType(DESK_VIEW_TYPE);
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
      throw new Error("Obsidian did not create the Slipbox Deck view");
    }
    if (filingFile !== undefined) {
      await leaf.view.startFiling(filingFile);
    }
    return leaf.view;
  }

  async openDesk(): Promise<DeskView> {
    await this.refreshIndex();
    let leaf: WorkspaceLeaf;
    const existing = this.app.workspace.getLeavesOfType(DESK_VIEW_TYPE)[0];
    if (existing === undefined) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: DESK_VIEW_TYPE, active: true });
    } else {
      leaf = existing;
    }
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof DeskView)) {
      throw new Error("Obsidian did not create the Slipbox Desk view");
    }
    return leaf.view;
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
    void this.openDesk();
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
      visit: (id) => void view.jumpToId(id),
      addCurrent: () => view.addCurrentAsEntryPoint(),
      rename: (index) => this.renameEntryPoint(index),
      remove: (index) => this.removeEntryPoint(index),
    }).open();
  }

  showBookmarks(view: DeckView): void {
    new BookmarksModal(this.app, this.state.bookmarks, {
      currentId: view.activeCard?.id ?? null,
      isAvailable: (id) => this.index.filedById(id) !== undefined,
      visit: (id) => void view.jumpToId(id),
      addCurrent: () => view.addBookmarkToCurrent(),
      remove: (zettelId) => view.removeBookmark(zettelId),
    }).open();
  }

  bookmarkAt(zettelId: string): DeckBookmark | undefined {
    return this.state.bookmarks.find((bookmark) => bookmark.zettelId === zettelId);
  }

  async addBookmark(zettelId: string): Promise<void> {
    if (this.index.filedById(zettelId) === undefined) {
      new Notice("Only an available filed card can be bookmarked.");
      return;
    }
    if (this.bookmarkAt(zettelId) !== undefined) {
      new Notice(`${zettelId} already has a bookmark.`);
      return;
    }
    try {
      this.state = {
        ...this.state,
        bookmarks: createBookmark(this.state.bookmarks, zettelId),
      };
      await this.persistStateAndRefreshViews();
      new Notice(`Bookmarked ${zettelId}.`);
    } catch (error) {
      new Notice(`Could not add bookmark: ${errorMessage(error)}`);
    }
  }

  async toggleBookmark(zettelId: string): Promise<void> {
    if (this.bookmarkAt(zettelId) === undefined) {
      await this.addBookmark(zettelId);
    } else {
      await this.removeBookmark(zettelId);
    }
  }

  async putFileOnDesk(file: TFile): Promise<void> {
    this.index.refresh();
    const metadataState = this.cardMetadataState(file);
    if (metadataState !== "filed" && metadataState !== "unfiled") {
      new Notice("Only a filed or unfiled Slipbox card can be placed on Desk.");
      return;
    }
    if (this.state.deskCards.some((card) => card.cardRef === file.path)) {
      new Notice(`${file.basename} is already on Desk.`);
      await this.openDesk();
      return;
    }
    const position = this.nextDeskPosition();
    this.state = {
      ...this.state,
      deskCards: addDeskCard(this.state.deskCards, file.path, position),
    };
    await this.persistStateAndRefreshViews();
    await this.openDesk();
  }

  async removeFromDesk(cardRef: string): Promise<void> {
    if (!this.state.deskCards.some((card) => card.cardRef === cardRef)) {
      return;
    }
    const next = removeDeskCard(this.state.deskCards, cardRef);
    this.state = { ...this.state, deskCards: next };
    await this.persistStateAndRefreshViews();
  }

  nextDeskZ(): number {
    return this.state.deskCards.reduce((maximum, card) => Math.max(maximum, card.z), 0) + 1;
  }

  async updateDeskCardLayout(
    cardRef: string,
    x: number,
    y: number,
    bringToFront: boolean,
  ): Promise<void> {
    let cards = moveDeskCard(this.state.deskCards, cardRef, { x, y });
    if (bringToFront) {
      cards = bringDeskCardToFront(cards, cardRef);
    }
    this.state = { ...this.state, deskCards: cards };
    await this.persistState();
  }

  async raiseDeskCard(cardRef: string): Promise<void> {
    this.state = {
      ...this.state,
      deskCards: bringDeskCardToFront(this.state.deskCards, cardRef),
    };
    await this.persistState();
  }

  async beginFiling(file: TFile): Promise<void> {
    this.index.refresh();
    if (this.cardMetadataState(file) !== "unfiled") {
      new Notice("Only an unfiled card can enter Filing Mode.");
      return;
    }
    await this.openDeck(file);
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
      await this.refreshViews();
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
      id: "open-desk",
      name: "Open Desk",
      callback: () => void this.openDesk(),
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

    this.addCommand({
      id: "put-current-card-on-desk",
      name: "Put current card on Desk",
      checkCallback: (checking) => {
        const file = this.currentCardFile();
        const available = file !== null && !this.state.deskCards.some(
          (card) => card.cardRef === file.path,
        );
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          void this.putFileOnDesk(file);
        }
        return available;
      },
    });

    this.addCommand({
      id: "add-bookmark-current-card",
      name: "Add bookmark to current card",
      checkCallback: (checking) => {
        const id = this.currentFiledId();
        const available = id !== null && this.bookmarkAt(id) === undefined;
        if (checking) {
          return available;
        }
        if (available && id !== null) {
          void this.addBookmark(id);
        }
        return available;
      },
    });

    this.addCommand({
      id: "history-back",
      name: "Back",
      checkCallback: (checking) => {
        const view = this.currentDeckView();
        const available = view?.canGoBack ?? false;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          void view.goBack();
        }
        return available;
      },
    });

    this.addCommand({
      id: "history-forward",
      name: "Forward",
      checkCallback: (checking) => {
        const view = this.currentDeckView();
        const available = view?.canGoForward ?? false;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          void view.goForward();
        }
        return available;
      },
    });
  }

  private async createNewCard(): Promise<void> {
    try {
      const placeOnDesk = this.app.workspace.getActiveViewOfType(DeskView) !== null;
      const file = await this.createCardFile(null);
      if (placeOnDesk) {
        this.state = {
          ...this.state,
          deskCards: addDeskCard(
            this.state.deskCards,
            file.path,
            this.nextDeskPosition(),
          ),
        };
        await this.persistState();
      }
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

  private currentFiledId(): string | null {
    const deckId = this.app.workspace.getActiveViewOfType(DeckView)?.activeCard?.id;
    if (deckId !== undefined) {
      return deckId;
    }
    const activeFile = this.app.workspace.getActiveFile();
    return activeFile === null ? null : this.index.filedByFile(activeFile)?.id ?? null;
  }

  private currentCardFile(): TFile | null {
    const deckFile = this.app.workspace.getActiveViewOfType(DeckView)?.activeCard?.file;
    if (deckFile !== undefined) {
      return deckFile;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile === null) {
      return null;
    }
    const state = this.cardMetadataState(activeFile);
    return state === "filed" || state === "unfiled" ? activeFile : null;
  }

  async removeBookmark(zettelId: string): Promise<void> {
    if (this.bookmarkAt(zettelId) === undefined) {
      return;
    }
    this.state = {
      ...this.state,
      bookmarks: deleteBookmark(this.state.bookmarks, zettelId),
    };
    await this.persistStateAndRefreshViews();
    new Notice(`Deleted bookmark at ${zettelId}.`);
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
    await this.refreshViews();
  }

  private async refreshViews(): Promise<void> {
    const refreshes = this.app.workspace
      .getLeavesOfType(DECK_VIEW_TYPE)
      .flatMap((leaf) =>
        leaf.view instanceof DeckView ? [leaf.view.refresh()] : [],
      );
    refreshes.push(
      ...this.app.workspace
        .getLeavesOfType(DESK_VIEW_TYPE)
        .flatMap((leaf) =>
          leaf.view instanceof DeskView ? [leaf.view.refresh()] : [],
        ),
    );
    await Promise.all(refreshes);
  }

  private async persistStateAndRefreshViews(): Promise<void> {
    await this.persistState();
    await this.refreshViews();
  }

  private async persistState(): Promise<void> {
    try {
      await this.saveData(this.state);
    } catch (error) {
      new Notice(`Could not save Slipbox state: ${errorMessage(error)}`);
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

  private nextDeskPosition(): Readonly<{ x: number; y: number }> {
    const index = this.state.deskCards.length;
    return {
      x: 90 + (index % 4) * 110,
      y: 90 + (Math.floor(index / 4) % 4) * 90,
    };
  }

  private handleDeletedFile(file: TAbstractFile): void {
    const prefix = `${file.path.replace(/\/$/, "")}/`;
    if (this.state.deskCards.some(
      (card) => card.cardRef === file.path || card.cardRef.startsWith(prefix),
    )) {
      this.state = {
        ...this.state,
        deskCards: removeDeskPath(this.state.deskCards, file.path),
      };
      void this.persistState();
    }
    this.queueIndexRefresh();
  }

  private handleRenamedFile(file: TAbstractFile, oldPath: string): void {
    const prefix = `${oldPath.replace(/\/$/, "")}/`;
    if (this.state.deskCards.some(
      (card) => card.cardRef === oldPath || card.cardRef.startsWith(prefix),
    )) {
      this.state = {
        ...this.state,
        deskCards: renameDeskCard(this.state.deskCards, oldPath, file.path),
      };
      void this.persistState();
    }
    this.queueIndexRefresh();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type { EntryPoint };
