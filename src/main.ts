import {
  Menu,
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

import {
  type DeckBookmark,
} from "./bookmarks.js";
import { BookmarkService } from "./bookmark-service.js";
import {
  DECK_VIEW_TYPE,
  DeckView,
  type DeckRefreshReason,
} from "./deck-view.js";
import {
  applicableCardHeaderActions,
  type CardHeaderActionContext,
} from "./card-header-actions.js";
import { issueStatusSummary } from "./card-metadata.js";
import {
  BookmarksModal,
  IssuesModal,
  promptForCanvas,
  promptForCardLink,
  promptForNewCardTitle,
  promptForText,
} from "./modals.js";
import type { NewCardTitleMode } from "./new-note.js";
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
import { CardIndex, type FiledCard } from "./card-index.js";
import {
  cardIndexConfig,
  settingsRefreshImpact,
} from "./card-index-config.js";
import type { DeskPilePosition, DeskState } from "./desk-state.js";
import { DeskService } from "./desk-service.js";
import { formatCurrentTimestamp } from "./timestamp.js";
import { CanvasBridge } from "./canvas-bridge.js";
import { DeskCanvasService } from "./desk-canvas-service.js";
import type { FilingPreview } from "./filing-preview.js";
import type {
  InlineEditCommitRequest,
  InlineEditCommitResult,
  InlineEditSessionSnapshot,
} from "./inline-edit-session.js";
import {
  deckPositionModeForPileCount,
  type DeckPositionMode,
} from "./workspace-layout.js";
import { splitNoteBody } from "./note-body.js";
import { CardIndexRuntime } from "./card-index-runtime.js";
import type {
  AfterIndexReconcile,
  IndexRefreshReason,
} from "./index-refresh-coordinator.js";
import {
  SerializedPluginDataWriter,
  type PluginDataWriteResult,
} from "./plugin-data-writer.js";
import type { SlipboxPluginData } from "./plugin-state.js";
import {
  InlineEditRegistry,
  type DetachedInlineEditDraft,
  type DetachedInlineEditPresentation,
  type InlineEditStartData,
} from "./inline-edit-registry.js";
import { CardService } from "./card-service.js";
import {
  FilingService,
  type FileCardResult,
} from "./filing-service.js";
import { MetadataCacheWaiter } from "./metadata-cache-waiter.js";

export default class SlipboxPlugin extends Plugin {
  state: SlipboxPluginState = DEFAULT_STATE;
  override settings: SlipboxSettings = DEFAULT_SETTINGS;
  index!: CardIndex;

  private problemStatusBarItem: HTMLElement | null = null;
  private cardSpreadSaveTimer: number | null = null;
  private startupDeckMode: DeckPositionMode | null = null;
  private indexRuntime!: CardIndexRuntime;
  private dataWriter!: SerializedPluginDataWriter<SlipboxPluginData>;
  private inlineEdits!: InlineEditRegistry<DeckView>;
  private bookmarks!: BookmarkService;
  private deskService!: DeskService;
  private deskCanvas!: DeskCanvasService;
  private cardService!: CardService;
  private filingService!: FilingService;

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
    this.cardService = new CardService({
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
      promptForTitle: (placeholder) =>
        promptForNewCardTitle(this.app, placeholder),
      promptForLink: (suggestions) =>
        promptForCardLink(this.app, suggestions),
      normalizePath,
      serializeProperties: stringifyYaml,
      openFile: (file) => this.openMarkdownFile(file),
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
      cards: this.cardService,
      cacheWaiter,
      settings: () => this.settings,
      notify: (message) => { new Notice(message); },
    });
    this.bookmarks = new BookmarkService(this.state.bookmarks, {
      isAvailable: (path) => this.index.filedByPath(path) !== undefined,
      label: (path) => this.cardService.filedLabel(path),
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
    this.addSettingTab(new SlipboxSettingTab(this.app, this));

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
        tasks.addPromise(this.finishInlineEdits("quit"));
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
      void this.refreshIndex();
    });
  }

  override onunload(): void {
    void this.finishInlineEdits("plugin-unload");
    this.indexRuntime.dispose();
    if (this.cardSpreadSaveTimer !== null) {
      window.clearTimeout(this.cardSpreadSaveTimer);
      this.cardSpreadSaveTimer = null;
      void this.persistState();
    }
  }

  async openDeck(filingFile?: TFile): Promise<DeckView> {
    await this.refreshIndex();
    return this.revealDeck(filingFile);
  }

  private async revealDeck(filingFile?: TFile): Promise<DeckView> {
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
    if (filingFile !== undefined) {
      await leaf.view.startFiling(filingFile);
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

  /**
   * Open a card's note the way Obsidian itself opens a file.
   *
   * `getLeaf(false)` reuses a navigable leaf and honours pinning, so opening a
   * card matches the core New note and link-following behaviour rather than
   * always spawning a tab.
   */
  openMarkdownFile(file: TFile): Promise<void> {
    return this.app.workspace.getLeaf(false).openFile(file);
  }

  acquireInlineEdit(path: string, owner: DeckView): boolean {
    return this.inlineEdits.acquire(path, owner);
  }

  releaseInlineEdit(path: string, owner: DeckView): void {
    this.inlineEdits.release(path, owner);
  }

  renameInlineEdit(
    oldPath: string,
    newPath: string,
    owner: DeckView,
  ): boolean {
    return this.inlineEdits.rename(oldPath, newPath, owner);
  }

  async prepareInlineEdit(file: TFile): Promise<InlineEditStartData> {
    return this.inlineEdits.prepare(file);
  }

  async commitInlineEdit(
    request: InlineEditCommitRequest,
  ): Promise<InlineEditCommitResult> {
    return this.inlineEdits.commit(request);
  }

  async flushOpenTextViews(path: string): Promise<void> {
    await this.inlineEdits.flushOpenViews(path);
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

  retainDetachedInlineEdit(
    snapshot: InlineEditSessionSnapshot,
    file: TFile,
    presentation: DetachedInlineEditPresentation,
  ): void {
    this.inlineEdits.retainDetached(snapshot, file, presentation);
  }

  takeDetachedInlineEdit(): DetachedInlineEditDraft | null {
    return this.inlineEdits.takeDetached();
  }

  returnDetachedInlineEdit(draft: DetachedInlineEditDraft): void {
    this.inlineEdits.returnDetached(draft);
  }

  private async finishInlineEdits(reason: string): Promise<void> {
    await this.inlineEdits.finishAll(reason);
  }

  cardTitle(file: TFile): string {
    return this.cardService.title(file);
  }

  cardDisplayTitle(file: TFile): string | null {
    return this.cardService.displayTitle(file);
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
        await this.refreshIndex(impact);
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

  showCardContextMenu(
    event: MouseEvent,
    file: TFile,
    address: string | null,
    surface: CardHeaderActionContext["surface"],
    source: string,
    leaf: WorkspaceLeaf,
    viewedReturnSurface: CardHeaderActionContext["viewedReturnSurface"] = null,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const isBookmarked =
      address !== null && this.bookmarkAtPath(file.path) !== undefined;
    const isOnDesk = this.deskService.contains(file.path);
    const title = this.cardTitle(file);
    const menu = Menu.forEvent(event);
    const runViewAction = (action: Parameters<DeckView["runAction"]>[0]): void => {
      if (leaf.view instanceof DeckView) {
        leaf.view.runAction(action);
      }
    };

    for (const presentation of applicableCardHeaderActions({
      surface,
      viewedReturnSurface,
      filed: address !== null,
      onDesk: isOnDesk,
      bookmarked: isBookmarked,
      canMoveLeft: false,
      canMoveRight: false,
    })) {
      menu.addItem((item) => {
        item
          .setTitle(presentation.action === "delete-card"
            ? `Delete ${title}`
            : presentation.label)
          .setIcon(presentation.icon)
          .setWarning(presentation.warning === true)
          .setSection(presentation.warning === true
            ? "slipbox-card-danger"
            : "slipbox-card")
          .onClick(() => runViewAction(presentation.action));
      });
    }

    // Obsidian supplies its canonical Reveal file in navigation action along
    // with the remaining ordinary file actions and third-party contributions.
    this.app.workspace.trigger("file-menu", menu, file, source, leaf);
    menu.showAtMouseEvent(event);
  }

  async deleteCard(file: TFile): Promise<boolean> {
    return this.cardService.delete(file);
  }

  /**
   * Cards already filed at `address` when duplicates are not allowed. Always
   * empty under the permissive policy, so callers need no policy branch.
   */
  duplicateOccupants(
    address: string,
  ): readonly string[] {
    return this.filingService.duplicateOccupants(address);
  }

  async showIssues(): Promise<void> {
    await this.refreshIndex();
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
            void this.openMarkdownFile(file);
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

  showBookmarks(view: DeckView): void {
    new BookmarksModal(this.app, this.bookmarks.items, {
      currentPath: view.focusedDeckCardPath,
      isAvailable: (path) => this.index.filedByPath(path) !== undefined,
      label: (path) => this.cardService.filedLabel(path),
      visit: (path) => void view.jumpToPath(path),
      addCurrent: () => view.addBookmarkToCurrent(),
      remove: (path) => view.removeBookmark(path),
    }).open();
  }

  bookmarkAtPath(path: string): DeckBookmark | undefined {
    return this.bookmarks.at(path);
  }

  async addBookmark(path: string): Promise<void> {
    await this.bookmarks.add(path);
  }

  async toggleBookmark(path: string): Promise<void> {
    await this.bookmarks.toggle(path);
  }

  createDeskPileId(): string {
    return this.deskService.createPileId();
  }

  get desk(): DeskState {
    return this.deskService.snapshot;
  }

  async updateDesk(next: DeskState): Promise<void> {
    await this.deskService.replace(next);
  }

  async toggleFileOnDesk(file: TFile): Promise<void> {
    await this.deskService.toggleFile(file);
  }

  async putFileOnDesk(file: TFile): Promise<boolean> {
    return this.deskService.putFile(file);
  }

  isFileOnDesk(file: TFile): boolean {
    return this.deskService.contains(file.path);
  }

  async setDeskPileExpanded(pileId: string, expanded: boolean): Promise<void> {
    await this.deskService.setPileExpanded(pileId, expanded);
  }

  async clearDeskPile(pileId: string): Promise<void> {
    await this.deskService.clearPile(pileId);
  }

  async clearDesk(): Promise<void> {
    await this.deskService.clearFiledCards();
  }

  hasActiveCanvas(): boolean {
    return this.deskCanvas.hasActiveCanvas();
  }

  async layOutDeskPileOnActiveCanvas(pileId: string): Promise<void> {
    await this.deskCanvas.layoutPileOnActiveCanvas(pileId);
  }

  async layOutDeskPileOnCanvas(pileId: string): Promise<void> {
    await this.deskCanvas.layoutPileOnCanvas(pileId);
  }

  async createCanvasFromDeskPile(pileId: string): Promise<void> {
    await this.deskCanvas.createCanvasFromPile(pileId);
  }

  async beginFiling(file: TFile): Promise<void> {
    await this.refreshIndex();
    if (!this.cardService.isUnfiled(file)) {
      new Notice("Only an unfiled card can enter filing mode.");
      return;
    }
    await this.revealDeck(file);
  }

  isUnfiledCard(file: TFile): boolean {
    return this.cardService.isUnfiled(file);
  }

  filingPreviewFor(file: TFile, address: string): FilingPreview {
    return this.filingService.preview(file, address);
  }

  async fileCard(
    file: TFile,
    preview: FilingPreview,
  ): Promise<FileCardResult> {
    return this.filingService.file(file, preview);
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
      callback: () => void this.cardService.createAndOpen("default"),
    });

    this.addCommand({
      id: "new-card-with-title",
      name: "New card with title",
      callback: () => void this.cardService.createAndOpen("prompt"),
    });

    this.addCommand({
      id: "new-card-on-desk",
      name: "New card on Desk",
      callback: () => void this.cardService.createOnDesk("default"),
    });

    this.addCommand({
      id: "new-card-with-title-on-desk",
      name: "New card with title on Desk",
      callback: () => void this.cardService.createOnDesk("prompt"),
    });

    this.addCommand({
      id: "make-current-note-card",
      name: "Make active Markdown note a card",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available =
          file !== null &&
          file.extension === "md" &&
          this.cardService.metadataState(file) === "ordinary";
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          void this.cardService.makeOrdinaryNoteCard(file);
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
          file !== null && this.cardService.isUnfiled(file);
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
          void this.cardService.insertLink(editor, ctx);
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

  async createNewCardAtDeskPosition(
    position: DeskPilePosition,
    titleMode: NewCardTitleMode = "default",
  ): Promise<void> {
    await this.cardService.createAtDeskPosition(position, titleMode);
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

  async copyCardLink(card: FiledCard): Promise<void> {
    await this.cardService.copyLink(card);
  }

  async removeBookmark(path: string): Promise<void> {
    await this.bookmarks.remove(path);
  }

  private queueIndexRefresh(): void {
    this.indexRuntime.queue();
  }

  private registerIndexEvents(): void {
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.queueIndexRefresh()),
    );
    this.registerEvent(
      this.app.metadataCache.on("deleted", () => this.queueIndexRefresh()),
    );
    this.registerEvent(
      this.app.metadataCache.on("resolve", () => this.queueIndexRefresh()),
    );
    this.registerEvent(
      this.app.vault.on("create", () => this.queueIndexRefresh()),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => this.handleDeletedFile(file)),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) =>
        this.handleRenamedFile(file, oldPath)),
    );
  }

  refreshIndex(
    reason: IndexRefreshReason = "index",
    afterReconcile?: AfterIndexReconcile,
  ): Promise<void> {
    return this.indexRuntime.refresh({
      reason,
      ...(afterReconcile === undefined ? {} : { afterReconcile }),
    });
  }

  async refreshDeckViews(reason: DeckRefreshReason = "full"): Promise<void> {
    this.startupDeckMode ??= deckPositionModeForPileCount(
      this.desk.piles.length,
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
    this.queueIndexRefresh();
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
    this.queueIndexRefresh();
  }

}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
