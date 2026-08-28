import {
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
  TextFileView,
  getFrontMatterInfo,
  moment,
  normalizePath,
  setIcon,
  setTooltip,
  stringifyYaml,
  type WorkspaceLeaf,
} from "obsidian";

import { BookmarkService } from "./bookmark-service.js";
import {
  DECK_VIEW_TYPE,
  DeckView,
  type DeckRefreshReason,
} from "./deck-view.js";
import { issueStatusSummary } from "./card-metadata.js";
import {
  IssuesModal,
  promptForCanvas,
  promptForCardLink,
  promptForText,
} from "./modals.js";
import { promptForNewCardOptions } from "./new-card-modal.js";
import {
  DEFAULT_STATE,
  loadPluginData,
  type SlipboxPluginState,
} from "./plugin-state.js";
import {
  DEFAULT_SETTINGS,
  normalizeCardSpread,
  SLIPBOX_DATA_SCHEMA_VERSION,
  normalizeSettings,
  SLIPBOX_ACTION_DEFINITIONS,
  type SlipboxActionDefinition,
  type SlipboxSettings,
} from "./settings.js";
import { SlipboxSettingTab } from "./settings-tab.js";
import { CardIndex } from "./card-index.js";
import {
  cardIndexConfig,
  settingsRefreshImpact,
} from "./card-index-config.js";
import { DeskService } from "./desk-service.js";
import { formatCurrentTimestamp } from "./timestamp.js";
import { CanvasBridge } from "./canvas-bridge.js";
import { DeskCanvasService } from "./desk-canvas-service.js";
import {
  deckPositionModeForPileCount,
  type DeckPositionMode,
} from "./workspace-layout.js";
import { splitNoteBody } from "./note-body.js";
import { CardIndexRuntime } from "./card-index-runtime.js";
import {
  SerializedPluginDataWriter,
  type PluginDataWriteResult,
} from "./plugin-data-writer.js";
import type { SlipboxPluginData } from "./plugin-state.js";
import { InlineEditRegistry } from "./inline-edit-registry.js";
import { CardService } from "./card-service.js";
import { FilingService } from "./filing-service.js";
import { MetadataCacheWaiter } from "./metadata-cache-waiter.js";

export default class SlipboxPlugin extends Plugin {
  state: SlipboxPluginState = DEFAULT_STATE;
  override settings: SlipboxSettings = DEFAULT_SETTINGS;
  index!: CardIndex;

  private problemStatusBarItem: HTMLElement | null = null;
  private cardSpreadSaveTimer: number | null = null;
  private startupDeckMode: DeckPositionMode | null = null;
  indexRuntime!: CardIndexRuntime;
  private dataWriter!: SerializedPluginDataWriter<SlipboxPluginData>;
  inlineEdits!: InlineEditRegistry<DeckView>;
  bookmarks!: BookmarkService;
  deskService!: DeskService;
  deskCanvas!: DeskCanvasService;
  cards!: CardService;
  filingService!: FilingService;

  override async onload(): Promise<void> {
    const loadedData: unknown = await this.loadData();
    const { data, reset } = loadPluginData(loadedData);
    this.settings = data.settings;
    this.state = data.state;
    this.index = new CardIndex(this.app, cardIndexConfig(this.settings));
    this.indexRuntime = new CardIndexRuntime(this.index, {
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelScheduled: (handle) => window.clearTimeout(handle as number),
      reconcile: (snapshot) => this.deskService.reconcile(snapshot),
      publish: (reason) => this.refreshDeckViews(reason),
      reportBackgroundError: (error) => {
        new Notice(`Could not refresh the card index: ${errorMessage(error)}`);
      },
    });
    this.dataWriter = new SerializedPluginDataWriter({
      write: (pluginData) => this.saveData(pluginData),
      reportError: (error) => {
        new Notice(`Could not save Slipbox Desk state: ${errorMessage(error)}`);
      },
    });
    this.deskService = new DeskService({
      indexRuntime: this.indexRuntime,
      refreshViews: () => this.refreshDeckViews(),
      notify: (message) => { new Notice(message); },
    });
    const cacheWaiter = new MetadataCacheWaiter<TFile>({
      current: (file, property) => {
        const value: unknown =
          this.app.metadataCache.getFileCache(file)?.frontmatter?.[property];
        return value;
      },
      subscribe: (callback) => {
        const eventRef = this.app.metadataCache.on("changed", callback);
        return () => this.app.metadataCache.offref(eventRef);
      },
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelScheduled: (handle) => window.clearTimeout(handle as number),
    });
    this.cards = new CardService({
      app: this.app,
      index: this.index,
      indexRuntime: this.indexRuntime,
      desk: this.deskService,
      cacheWaiter,
      settings: () => this.settings,
      timestamp: () => formatCurrentTimestamp(
        moment,
        this.settings.newNoteTimestampFormat,
      ),
      activeCreationSourcePath: () =>
        this.app.workspace.getActiveViewOfType(DeckView)?.activeCard?.file.path ??
        this.app.workspace.getActiveFile()?.path,
      promptForNewCardOptions: (placeholder) =>
        promptForNewCardOptions(this.app, placeholder),
      promptForLink: (suggestions) =>
        promptForCardLink(this.app, suggestions),
      normalizePath,
      serializeProperties: stringifyYaml,
      openFile: (file) => this.app.workspace.getLeaf(false).openFile(file),
      openDesk: async () => { await this.openDeck(); },
      focusDeskCard: (path) => this.focusDeskCardInViews(path),
      notify: (message) => { new Notice(message); },
      copyText: (value) => navigator.clipboard.writeText(value),
    });
    this.filingService = new FilingService({
      app: this.app,
      index: this.index,
      indexRuntime: this.indexRuntime,
      desk: this.deskService,
      cards: this.cards,
      cacheWaiter,
      settings: () => this.settings,
      notify: (message) => { new Notice(message); },
    });
    this.bookmarks = new BookmarkService(this.state.bookmarks, {
      isAvailable: (path) => this.index.filedByPath(path) !== undefined,
      label: (path) => this.cards.filedLabel(path),
      changed: (bookmarks) => {
        this.state = { bookmarks };
        this.refreshBookmarkUi();
      },
      persist: () => this.persistState(),
      notify: (message) => { new Notice(message); },
    });
    this.inlineEdits = new InlineEditRegistry({
      fileAtPath: (path) => this.app.vault.getFileByPath(path),
      read: (file) => this.app.vault.read(file),
      process: async (file, update) => {
        await this.app.vault.process(file, update);
      },
      contentStart: (source) => getFrontMatterInfo(source).contentStart,
      body: (source, contentStart) => splitNoteBody(source, contentStart).body,
      flushOpenViews: (path) => this.flushObsidianTextViews(path),
      revealOwner: (owner) => this.app.workspace.revealLeaf(owner.leaf),
      notify: (message) => { new Notice(message); },
    });
    const canvas = new CanvasBridge(this.app);
    this.deskCanvas = new DeskCanvasService({
      pathsInPile: (pileId) => this.deskService.pathsInPile(pileId),
      hasActiveCanvas: () => canvas.hasActiveCanvas(),
      canvasFiles: () => canvas.canvasFiles(),
      chooseCanvas: (files) => promptForCanvas(this.app, files),
      promptPath: () => promptForText(
        this.app,
        "Create Canvas from pile",
        "Canvas filename or vault path",
      ),
      layoutActive: (paths) => canvas.layoutFilesOnActiveCanvas(paths),
      layout: (file, paths) => canvas.layoutFilesOnCanvas(file, paths),
      create: (path, paths) => canvas.createCanvas(path, paths),
      notify: (message) => { new Notice(message); },
    });
    this.addSettingTab(new SlipboxSettingTab(this.app, this, this));

    this.registerView(
      DECK_VIEW_TYPE,
      (leaf) => new DeckView(leaf, this),
    );
    this.registerHoverLinkSource(DECK_VIEW_TYPE, {
      display: "Slipbox Desk",
      defaultMod: false,
    });
    this.registerEvent(
      this.app.workspace.on("quit", (tasks) => {
        tasks.addPromise(this.inlineEdits.finishAll("quit"));
      }),
    );

    this.addRibbonIcon("archive", "Open Slipbox Desk", () => {
      void this.openDeck();
    });

    this.problemStatusBarItem = this.addStatusBarItem();
    this.problemStatusBarItem.addClass("mod-clickable");
    this.registerDomEvent(this.problemStatusBarItem, "click", () => {
      void this.showIssues();
    });
    this.updateProblemStatusBarItem();

    this.registerCommands();
    if (reset) {
      new Notice(
        "Slipbox Desk reset settings from an earlier beta format. Path bookmarks were kept; review Slipbox settings and Obsidian hotkeys.",
      );
      void this.persistState();
    }
    this.app.workspace.onLayoutReady(() => {
      this.registerIndexEvents();
      void this.indexRuntime.refresh();
    });
  }

  override onunload(): void {
    void this.inlineEdits.finishAll("plugin-unload");
    this.indexRuntime.dispose();
    if (this.cardSpreadSaveTimer !== null) {
      window.clearTimeout(this.cardSpreadSaveTimer);
      this.cardSpreadSaveTimer = null;
      void this.persistState();
    }
  }

  async openDeck(): Promise<DeckView> {
    await this.indexRuntime.refresh();
    return this.revealDeck();
  }

  private async revealDeck(): Promise<DeckView> {
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
      throw new Error("Obsidian did not create the Slipbox Desk view");
    }
    return leaf.view;
  }

  setCardSpread(value: number): void {
    const cardSpread = normalizeCardSpread(value);
    if (cardSpread === this.settings.cardSpread) {
      return;
    }
    this.settings = { ...this.settings, cardSpread };
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handleCardSpreadChanged();
      }
    }
    if (this.cardSpreadSaveTimer !== null) {
      window.clearTimeout(this.cardSpreadSaveTimer);
    }
    this.cardSpreadSaveTimer = window.setTimeout(() => {
      this.cardSpreadSaveTimer = null;
      void this.persistState();
    }, 160);
  }

  private async flushObsidianTextViews(path: string): Promise<void> {
    const saves: Promise<void>[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof TextFileView && view.file?.path === path) {
        saves.push(view.save());
      }
    });
    await Promise.all(saves);
  }

  async updateSettings(value: SlipboxSettings): Promise<void> {
    const previousSettings = this.settings;
    this.settings = normalizeSettings(value);
    const nextIndexConfig = cardIndexConfig(this.settings);
    const impact = settingsRefreshImpact(previousSettings, this.settings);
    // Keep settings and index config aligned before persistence yields to events.
    this.indexRuntime.configure(nextIndexConfig);
    await this.persistState();
    switch (impact) {
      case "none":
        return;
      case "index":
      case "ordering":
        await this.indexRuntime.refresh({ reason: impact });
        return;
      case "branch-presentation":
        for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
          if (leaf.view instanceof DeckView) {
            leaf.view.refreshBranchPresentation();
          }
        }
        return;
      case "full":
        await this.refreshDeckViews();
    }
  }

  async showIssues(): Promise<void> {
    await this.indexRuntime.refresh();
    new IssuesModal(
      this.app,
      this.index.snapshot,
      this.settings.duplicateAddresses,
      {
        open: (path) => {
          const file = this.index.fileAtPath(path);
          if (file === undefined) {
            new Notice(`Could not find ${path}.`);
          } else {
            void this.cards.open(file);
          }
        },
      },
    ).open();
  }

  /**
   * Reflect the current issue count in the status bar. The item is hidden
   * entirely when the vault is clean, so a healthy vault shows no chrome.
   */
  private updateProblemStatusBarItem(): void {
    const item = this.problemStatusBarItem;
    if (item === null) {
      return;
    }
    const summary = issueStatusSummary(this.index.snapshot.issues);
    item.replaceChildren();
    if (summary === null) {
      item.hide();
      return;
    }
    item.show();
    item.toggleClass("is-error", summary.severity === "error");
    item.toggleClass("is-warning", summary.severity === "warning");
    const icon = item.createSpan({ cls: "slipbox-status-bar-icon" });
    setIcon(
      icon,
      summary.severity === "error" ? "alert-triangle" : "alert-circle",
    );
    item.createSpan({
      cls: "slipbox-status-bar-count",
      text: String(summary.count),
    });
    item.setAttr("aria-label", summary.description);
    setTooltip(item, summary.description, { placement: "top" });
  }

  private async beginFiling(file: TFile): Promise<void> {
    await this.indexRuntime.refresh();
    if (!this.cards.isUnfiled(file)) {
      new Notice("Only an unfiled card can enter filing mode.");
      return;
    }
    const view = await this.revealDeck();
    await view.startFiling(file);
  }

  private registerCommands(): void {
    this.addCommand({
      id: "open-deck",
      name: "Open",
      callback: () => void this.openDeck(),
    });

    this.addCommand({
      id: "new-card",
      name: "New card",
      callback: () => void this.cards.createAndOpen("quick"),
    });

    this.addCommand({
      id: "new-card-with-title",
      name: "New card with options",
      callback: () => void this.cards.createAndOpen("options"),
    });

    this.addCommand({
      id: "new-card-on-desk",
      name: "New card on Desk",
      callback: () => void this.cards.createOnDesk("quick"),
    });

    this.addCommand({
      id: "new-card-with-title-on-desk",
      name: "New card with options on Desk",
      callback: () => void this.cards.createOnDesk("options"),
    });

    this.addCommand({
      id: "make-current-note-card",
      name: "Make active Markdown note a card",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available =
          file !== null &&
          file.extension === "md" &&
          this.cards.metadataState(file) === "ordinary";
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          void this.cards.makeOrdinaryNoteCard(file);
        }
        return available;
      },
    });

    this.addCommand({
      id: "file-current-unfiled-card",
      name: "File active unfiled Markdown note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available =
          file !== null && this.cards.isUnfiled(file);
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
      id: "insert-card-link",
      name: "Insert link to card…",
      editorCheckCallback: (checking, editor, ctx) => {
        const available = this.index.snapshot.filed.length > 0;
        if (checking) {
          return available;
        }
        if (available) {
          void this.cards.insertLink(editor, ctx);
        }
        return available;
      },
    });

    for (const definition of SLIPBOX_ACTION_DEFINITIONS) {
      this.registerSlipboxActionCommand(definition);
    }
  }

  private registerSlipboxActionCommand(
    definition: SlipboxActionDefinition,
  ): void {
    const command = {
      id: definition.commandId,
      name: definition.commandName,
      repeatable: definition.repeatable,
    };
    if (definition.id === "bookmarks") {
      this.addCommand({
        ...command,
        callback: () => void this.openDeck().then((view) => {
          view.runAction(definition.id);
        }),
      });
      return;
    }
    if (definition.id === "problems") {
      this.addCommand({
        ...command,
        checkCallback: (checking) => {
          const available = this.index.snapshot.issues.length > 0;
          if (!checking && available) {
            void this.showIssues();
          }
          return available;
        },
      });
      return;
    }
    this.addCommand({
      ...command,
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(DeckView);
        const available = view?.canRunCommandAction(definition.id) ?? false;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          view.runCommandAction(definition.id);
        }
        return available;
      },
    });
  }

  /**
   * Focus a newly placed Desk card in every Slipbox view.
   *
   * The Desk is shared plugin state rendered per view, while card focus is per
   * view, so each view focuses the card it has just rendered. Both Desk
   * creation paths leave the new card at the top of its pile, so focus
   * survives later reconciliation.
   */
  private focusDeskCardInViews(path: string): void {
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.focusDeskCardAtPath(path);
      }
    }
  }

  private registerIndexEvents(): void {
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.indexRuntime.queue()),
    );
    this.registerEvent(
      this.app.metadataCache.on("deleted", () => this.indexRuntime.queue()),
    );
    this.registerEvent(
      this.app.metadataCache.on("resolve", () => this.indexRuntime.queue()),
    );
    this.registerEvent(
      this.app.vault.on("create", () => this.indexRuntime.queue()),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => this.handleDeletedFile(file)),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) =>
        this.handleRenamedFile(file, oldPath)),
    );
  }

  private async refreshDeckViews(
    reason: DeckRefreshReason = "full",
  ): Promise<void> {
    this.startupDeckMode ??= deckPositionModeForPileCount(
      this.deskService.snapshot.piles.length,
    );
    this.updateProblemStatusBarItem();
    await Promise.all(
      this.app.workspace
        .getLeavesOfType(DECK_VIEW_TYPE)
        .flatMap((leaf) =>
          leaf.view instanceof DeckView ? [leaf.view.refresh(reason)] : [],
        ),
    );
  }

  get startupDeckPositionMode(): DeckPositionMode {
    return this.startupDeckMode ?? "centered";
  }

  private refreshBookmarkUi(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handleBookmarksChanged();
      }
    }
  }

  private persistState(): Promise<PluginDataWriteResult> {
    return this.dataWriter.save({
      schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
      settings: this.settings,
      state: this.state,
    });
  }

  private handleDeletedFile(file: TAbstractFile): void {
    this.inlineEdits.handlePathDeletion(file.path);
    this.deskService.removePath(file.path);
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handlePathDeletion(file.path);
      }
    }
    void this.bookmarks.handlePathDeletion(file.path);
    this.indexRuntime.queue();
  }

  private handleRenamedFile(file: TAbstractFile, oldPath: string): void {
    this.inlineEdits.handlePathRename(oldPath, file.path);
    this.deskService.renamePath(oldPath, file.path);
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handlePathRename(oldPath, file.path);
      }
    }
    void this.bookmarks.handlePathRename(oldPath, file.path);
    this.indexRuntime.queue();
  }

}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
