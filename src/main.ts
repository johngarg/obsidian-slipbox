import {
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
  TextFileView,
  getFrontMatterInfo,
  moment,
  normalizePath,
  setIcon,
  setTooltip,
  stringifyYaml,
  type Editor,
  type EventRef,
  type MarkdownFileInfo,
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
import { deleteCardWithConfirmation } from "./card-deletion.js";
import { validateAddress } from "./address-order.js";
import { issueStatusSummary } from "./card-metadata.js";
import {
  BookmarksModal,
  IssuesModal,
  promptForCanvas,
  promptForCardLink,
  promptForNewCardTitle,
  promptForText,
} from "./modals.js";
import {
  buildCardLinkSuggestions,
  type CardLinkSuggestion,
} from "./card-link-suggestions.js";
import {
  newCardBasename,
  newCardFrontmatterTitle,
  newCardTitlePlaceholder,
  newNoteBasename,
  resolveNewCardTitle,
  type NewCardTitleMode,
} from "./new-note.js";
import {
  DEFAULT_STATE,
  loadPluginData,
  type SlipboxPluginState,
} from "./plugin-state.js";
import {
  resolveCardDisplayTitle,
  resolveCardTitle,
} from "./card-title.js";
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
import { generateFiledCardLink } from "./card-links.js";
import {
  createFilingPreview,
  duplicateFilingMessage,
  filingPlacementMatches,
  type FilingPreview,
} from "./filing-preview.js";
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

type CardMetadataState = "ordinary" | "unfiled" | "filed" | "invalid";

export type FileCardResult =
  | { readonly status: "filed" }
  | { readonly status: "preview-changed" }
  | { readonly status: "failed" };

/** Where a newly created card goes, and whether its note is opened. */
type NewCardPlacement =
  | { readonly kind: "open" }
  | { readonly kind: "desk"; readonly position?: DeskPilePosition };

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
    this.bookmarks = new BookmarkService(this.state.bookmarks, {
      isAvailable: (path) => this.index.filedByPath(path) !== undefined,
      label: (path) => this.filedCardLabel(path),
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
    return resolveCardTitle(
      file.basename,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.settings,
    );
  }

  cardDisplayTitle(file: TFile): string | null {
    return resolveCardDisplayTitle(
      file.basename,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.settings,
    );
  }

  private filedCardLabel(path: string): string {
    const card = this.index.filedByPath(path);
    return card === undefined
      ? path
      : `${card.address} · ${this.cardTitle(card.file)}`;
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
    try {
      return await deleteCardWithConfirmation(this.app.fileManager, file);
    } catch (error) {
      new Notice(`Could not delete ${this.cardTitle(file)}: ${errorMessage(error)}`);
      return false;
    }
  }

  /**
   * Cards already filed at `address` when duplicates are not allowed. Always
   * empty under the permissive policy, so callers need no policy branch.
   */
  duplicateOccupants(
    address: string,
    index: CardIndex = this.index,
  ): readonly string[] {
    if (this.settings.duplicateAddresses !== "problem") {
      return [];
    }
    return index.filedAtAddress(address).map((card) => card.path);
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
      label: (path) => this.filedCardLabel(path),
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
    if (this.cardMetadataState(file) !== "unfiled") {
      new Notice("Only an unfiled card can enter filing mode.");
      return;
    }
    await this.revealDeck(file);
  }

  isUnfiledCard(file: TFile): boolean {
    return this.cardMetadataState(file) === "unfiled";
  }

  filingPreviewFor(file: TFile, address: string): FilingPreview {
    return createFilingPreview(
      this.index.snapshot.filed,
      { path: file.path, address },
      this.cardTitle(file),
      this.settings.deckOrdering,
    );
  }

  async fileCard(
    file: TFile,
    preview: FilingPreview,
  ): Promise<FileCardResult> {
    return this.indexRuntime.suppressQueuedRefresh(async () => {
      let placementChanged = false;
      let transactionIndex = this.freshCardIndex();
      try {
      this.assertFilingSource(file, preview.sourcePath);
      if (this.cardMetadataState(file) !== "unfiled") {
        throw new Error("The source card is no longer unfiled");
      }
      if (!this.filingPreviewMatches(file, preview, transactionIndex)) {
        return { status: "preview-changed" };
      }
      // Duplicates can also appear between preview and write, so the policy is
      // enforced here rather than only in the inline editor.
      const occupants = this.duplicateOccupants(
        preview.address,
        transactionIndex,
      );
      if (occupants.length > 0) {
        new Notice(duplicateFilingMessage(preview.address, occupants.length));
        return { status: "failed" };
      }

      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter: Record<string, unknown>) => {
          const property = this.settings.addressProperty;
          const hasAddress = Object.prototype.hasOwnProperty.call(
            frontmatter,
            property,
          );
          const current = frontmatter[property];
          if (
            !hasAddress ||
            !(current === "" || current === null || current === undefined)
          ) {
            throw new Error(
              `The card is no longer unfiled; its ${property} was not changed`,
            );
          }
          transactionIndex = this.freshCardIndex();
          this.assertFilingSource(file, preview.sourcePath);
          if (!this.filingPreviewMatches(file, preview, transactionIndex)) {
            placementChanged = true;
            throw new Error("The previewed filing position changed");
          }
          frontmatter[property] = preview.address;
        },
      );

      const cacheReady = await this.waitForCachedAddress(file, preview.address);
      this.deskService.removePath(file.path);
      new Notice(
        cacheReady
          ? `Filed ${this.cardTitle(file)} as ${preview.address}.`
          : `Filed ${this.cardTitle(file)} as ${preview.address}. Slipbox Desk will refresh when Obsidian finishes indexing it.`,
      );
      return { status: "filed" };
    } catch (error) {
      if (placementChanged) {
        return { status: "preview-changed" };
      }
      new Notice(`Could not file the card: ${errorMessage(error)}`);
      return { status: "failed" };
      }
    });
  }

  private assertFilingSource(file: TFile, expectedPath: string): void {
    if (
      file.path !== expectedPath ||
      this.app.vault.getAbstractFileByPath(expectedPath) !== file
    ) {
      throw new Error("The source path no longer identifies the intended card");
    }
  }

  private filingPreviewMatches(
    file: TFile,
    preview: FilingPreview,
    index: CardIndex = this.index,
  ): boolean {
    if (
      preview.ordering !== this.settings.deckOrdering ||
      !validateAddress(preview.address).valid
    ) {
      return false;
    }
    return filingPlacementMatches(
      index.snapshot.filed,
      { path: file.path, address: preview.address },
      this.settings.deckOrdering,
      preview,
    );
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
      callback: () => void this.createNewCard("default"),
    });

    this.addCommand({
      id: "new-card-with-title",
      name: "New card with title",
      callback: () => void this.createNewCard("prompt"),
    });

    this.addCommand({
      id: "new-card-on-desk",
      name: "New card on Desk",
      callback: () => void this.createNewCardOnDesk("default"),
    });

    this.addCommand({
      id: "new-card-with-title-on-desk",
      name: "New card with title on Desk",
      callback: () => void this.createNewCardOnDesk("prompt"),
    });

    this.addCommand({
      id: "make-current-note-card",
      name: "Make active Markdown note a card",
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
      name: "File active unfiled Markdown note",
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
      id: "insert-card-link",
      name: "Insert link to card…",
      editorCheckCallback: (checking, editor, ctx) => {
        const available = this.index.snapshot.filed.length > 0;
        if (checking) {
          return available;
        }
        if (available) {
          void this.insertCardLink(editor, ctx);
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
    await this.createNewCard(titleMode, { kind: "desk", position });
  }

  /** Create an unfiled card on the Desk without opening its note. */
  private async createNewCardOnDesk(
    titleMode: NewCardTitleMode,
  ): Promise<void> {
    await this.openDeck();
    await this.createNewCard(titleMode, { kind: "desk" });
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

  private async createNewCard(
    titleMode: NewCardTitleMode,
    placement: NewCardPlacement = { kind: "open" },
  ): Promise<void> {
    try {
      const file = await this.createCardFile(
        titleMode,
        placement.kind === "open",
      );
      if (file === null) {
        return;
      }
      if (placement.kind === "desk") {
        await this.waitForCachedAddress(file, "");
        const position = placement.position;
        await this.refreshIndex("index", position === undefined
          ? undefined
          : () => {
            this.deskService.placeUnfiledAtPosition(file.path, position);
          });
        this.focusDeskCardInViews(file.path);
      } else {
        this.queueIndexRefresh();
      }
    } catch (error) {
      new Notice(`Could not create a card: ${errorMessage(error)}`);
    }
  }

  private async makeNoteCard(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter: Record<string, unknown>) => {
          const property = this.settings.addressProperty;
          if (Object.prototype.hasOwnProperty.call(frontmatter, property)) {
            throw new Error(`This note already has a ${property} property`);
          }
          frontmatter[property] = "";
        },
      );
      this.queueIndexRefresh();
      new Notice(`${this.cardTitle(file)} is now an unfiled card.`);
    } catch (error) {
      new Notice(`Could not make this note a card: ${errorMessage(error)}`);
    }
  }

  private async createCardFile(
    titleMode: NewCardTitleMode,
    open: boolean,
    sourcePath?: string,
  ): Promise<TFile | null> {
    const timestamp = newNoteBasename(
      "",
      formatCurrentTimestamp(moment, this.settings.newNoteTimestampFormat),
    );
    const title = await resolveNewCardTitle(
      titleMode,
      () => promptForNewCardTitle(
        this.app,
        newCardTitlePlaceholder(timestamp, this.settings.titleSource),
      ),
    );
    if (title === null) {
      return null;
    }
    const basename = newCardBasename(
      title,
      timestamp,
      this.settings.titleSource,
    );
    const parent = this.newCardParent(
      sourcePath ?? this.activeCreationSourcePath(),
    );
    const prefix = parent.isRoot() ? "" : `${parent.path}/`;
    let sequence = 0;
    let path: string;

    // Numbering starts at 1 to match Obsidian's own collision suffixes.
    do {
      const suffix = sequence === 0 ? "" : ` ${sequence}`;
      path = normalizePath(`${prefix}${basename}${suffix}.md`);
      sequence += 1;
    } while (this.app.vault.getAbstractFileByPath(path) !== null);

    const properties: Record<string, string> = {
      [this.settings.addressProperty]: "",
    };
    const frontmatterTitle = newCardFrontmatterTitle(
      title,
      this.settings.titleSource,
    );
    if (frontmatterTitle !== null) {
      properties[this.settings.titleProperty] = frontmatterTitle;
    }
    const frontmatter = stringifyYaml(properties);
    const file = await this.app.vault.create(
      path,
      `---\n${frontmatter}---\n\n`,
    );
    if (open) {
      await this.openMarkdownFile(file);
    }
    return file;
  }

  private activeCreationSourcePath(): string | undefined {
    return this.app.workspace.getActiveViewOfType(DeckView)
      ?.activeCard?.file.path ??
      this.app.workspace.getActiveFile()?.path;
  }

  /**
   * Resolve the folder a new card belongs in.
   *
   * An empty setting defers to Obsidian's own Default location for new notes.
   * Slipbox supplies the source path so that the Same folder as current file
   * option resolves against the Deck's active card, not only the active note.
   */
  private newCardParent(sourcePath: string | undefined): TFolder {
    const path = this.settings.newCardFolder;
    if (path === "") {
      return this.app.fileManager.getNewFileParent(sourcePath ?? "");
    }
    const folder = this.app.vault.getFolderByPath(path);
    if (folder === null) {
      throw new Error(
        `The configured new-card folder “${path}” is not a folder in this vault`,
      );
    }
    return folder;
  }

  private cardMetadataState(file: TFile): CardMetadataState {
    const rawFrontmatter: unknown =
      this.app.metadataCache.getFileCache(file)?.frontmatter;
    const frontmatter = isRecord(rawFrontmatter) ? rawFrontmatter : undefined;
    if (
      frontmatter === undefined ||
      !Object.prototype.hasOwnProperty.call(
        frontmatter,
        this.settings.addressProperty,
      )
    ) {
      return "ordinary";
    }
    const value = frontmatter[this.settings.addressProperty];
    if (value === "" || value === null || value === undefined) {
      return "unfiled";
    }
    if (typeof value !== "string") {
      return "invalid";
    }
    return validateAddress(value).valid ? "filed" : "invalid";
  }

  private cardLinkSuggestions(): readonly CardLinkSuggestion[] {
    return buildCardLinkSuggestions(
      this.index.snapshot.filed.map((card) => ({
        path: card.path,
        address: card.address,
        title: this.cardTitle(card.file),
      })),
    );
  }

  /**
   * Insert a link to a filed card at the cursor of a Markdown editor.
   *
   * This is an editor command, so it reaches ordinary notes and Canvas card
   * editors, but deliberately not the Slipbox inline card editor, which is a
   * plain textarea rather than an Obsidian editor.
   */
  private async insertCardLink(
    editor: Editor,
    ctx: MarkdownView | MarkdownFileInfo,
  ): Promise<void> {
    const chosen = await promptForCardLink(
      this.app,
      this.cardLinkSuggestions(),
    );
    if (chosen === null) {
      return;
    }
    const file = this.index.fileAtPath(chosen.path);
    if (file === undefined) {
      new Notice("Could not insert the card link: the card no longer exists.");
      return;
    }
    const link = generateFiledCardLink(
      this.app,
      file,
      ctx.file?.path ?? "",
      chosen.address,
    );
    // Focus first: replaceSelection acts on the editor's current selection, and
    // the editor has just lost focus to the suggester.
    editor.focus();
    editor.replaceSelection(link);
  }

  async copyCardLink(card: FiledCard): Promise<void> {
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    const link = generateFiledCardLink(
      this.app,
      card.file,
      sourcePath,
      card.address,
    );
    try {
      await navigator.clipboard.writeText(link);
      new Notice(`Copied ${link}.`);
    } catch (error) {
      new Notice(`Could not copy the card link: ${errorMessage(error)}`);
    }
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

  private async waitForCachedAddress(
    file: TFile,
    expectedAddress: string,
  ): Promise<boolean> {
    const cachedAddress = (): unknown =>
      this.app.metadataCache.getFileCache(file)?.frontmatter?.[
        this.settings.addressProperty
      ];
    if (cachedAddress() === expectedAddress) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let eventRef: EventRef | null = null;
      let timeout: number | null = null;
      let settled = false;
      const finish = (ready: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (eventRef !== null) {
          this.app.metadataCache.offref(eventRef);
        }
        if (timeout !== null) {
          window.clearTimeout(timeout);
        }
        resolve(ready);
      };

      eventRef = this.app.metadataCache.on("changed", (changedFile) => {
        if (
          changedFile.path === file.path &&
          cachedAddress() === expectedAddress
        ) {
          finish(true);
        }
      });
      timeout = window.setTimeout(
        () => finish(cachedAddress() === expectedAddress),
        1_000,
      );

      // Close the race between the first cache check and listener registration.
      if (cachedAddress() === expectedAddress) {
        finish(true);
      }
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

  private freshCardIndex(): CardIndex {
    const index = new CardIndex(this.app, cardIndexConfig(this.settings));
    index.publish(index.buildSnapshot());
    return index;
  }

}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
