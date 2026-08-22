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
  stringifyYaml,
  type EventRef,
  type WorkspaceLeaf,
} from "obsidian";

import {
  createBookmark,
  deleteBookmark,
  isPathBookmark,
  migrateAddressBookmarks,
  removeBookmarkPaths,
  renameBookmarkPaths,
  type DeckBookmark,
} from "./bookmarks.js";
import { DECK_VIEW_TYPE, DeckView } from "./deck-view.js";
import { trayToggleLabel } from "./deck-actions.js";
import {
  removeDeskPath,
  renameDeskCard,
} from "./desk-state.js";
import { validateAddress } from "./address-order.js";
import {
  BookmarksModal,
  confirmAction,
  IssuesModal,
  promptForCanvas,
  promptForNewCardTitle,
  promptForTemplate,
  promptForText,
} from "./modals.js";
import {
  newCardBasename,
  newCardFrontmatterTitle,
  newCardTitlePlaceholder,
  newNoteBasename,
} from "./new-note.js";
import {
  DEFAULT_STATE,
  MAX_SPREAD,
  MIN_SPREAD,
  hasRemovedEntryPointData,
  hasTitleAddressCollisionData,
  needsPluginDataMigration,
  normalizePluginData,
  type SlipboxPluginState,
} from "./plugin-state.js";
import { resolveCardTitle } from "./card-title.js";
import {
  DEFAULT_SETTINGS,
  SLIPBOX_DATA_SCHEMA_VERSION,
  normalizeSettings,
  settingsForPersistence,
  SLIPBOX_ACTION_DEFINITIONS,
  type SlipboxActionDefinition,
  type SlipboxSettings,
} from "./settings.js";
import { SlipboxSettingTab } from "./settings-tab.js";
import { CardIndex, type FiledCard } from "./card-index.js";
import {
  EMPTY_TRAY,
  clearFiledCardsFromPile,
  clearFiledCardsFromTray,
  placeUnfiledCardAtPosition,
  reconcileTray,
  removeTrayPath,
  renameTrayPath,
  setPileExpanded,
  toggleFiledCard,
  trayContains,
  type TrayCardCandidate,
  type TrayPilePosition,
  type TrayState,
} from "./tray-state.js";
import { CanvasBridge, type CanvasWriteResult } from "./canvas-bridge.js";
import { normalizeCanvasPath } from "./canvas-layout.js";
import { generateFiledCardLink } from "./card-links.js";
import { pathIsAtOrBelow, renamePathReference } from "./path-reference.js";
import {
  createFilingPreview,
  filingPlacementMatches,
  type FilingPreview,
} from "./filing-preview.js";
import {
  InlineEditPathLock,
  type InlineEditCommitRequest,
  type InlineEditCommitResult,
  type InlineEditOrigin,
  type InlineEditSessionSnapshot,
} from "./inline-edit-session.js";
import {
  NoteBodyConflictError,
  replaceNoteBodyIfUnchanged,
  splitNoteBody,
} from "./note-body.js";

type CardMetadataState = "ordinary" | "unfiled" | "filed" | "invalid";

export type FileCardResult =
  | { readonly status: "filed"; readonly address: string; readonly index: number }
  | { readonly status: "preview-changed" }
  | { readonly status: "failed" };

interface TemplatesCorePlugin {
  readonly options?: { readonly folder?: unknown };
  insertTemplate(file: TFile): Promise<void> | void;
}

export interface TemplatesInfo {
  readonly enabled: boolean;
  readonly folder: string;
  readonly files: readonly TFile[];
}

export interface InlineEditStartData {
  readonly file: TFile;
  readonly body: string;
}

export interface DetachedInlineEditDraft {
  readonly path: string;
  readonly file: TFile;
  readonly origin: InlineEditOrigin;
  readonly baseBody: string;
  readonly draft: string;
  readonly conflictMessage: string | null;
  readonly conflictRetryable: boolean;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly textareaScrollTop: number;
  readonly renderedScrollTop: number;
}

interface DetachedInlineEditPresentation {
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly textareaScrollTop: number;
  readonly renderedScrollTop: number;
}

export default class SlipboxPlugin extends Plugin {
  state: SlipboxPluginState = DEFAULT_STATE;
  settings: SlipboxSettings = DEFAULT_SETTINGS;
  tray: TrayState = EMPTY_TRAY;
  index!: CardIndex;
  canvas!: CanvasBridge;

  private indexRefreshTimer: number | null = null;
  private spreadSaveTimer: number | null = null;
  private filingWriteInProgress = false;
  private persistQueue: Promise<void> = Promise.resolve();
  private trayPileSequence = 0;
  private rawSettings: unknown = {};
  private readonly inlineEditOwners = new InlineEditPathLock<DeckView>();
  private readonly detachedInlineEditDrafts = new Map<
    string,
    DetachedInlineEditDraft
  >();

  async onload(): Promise<void> {
    const loadedData: unknown = await this.loadData();
    const purgeRemovedEntryPoints = hasRemovedEntryPointData(loadedData);
    const migrateTitleCollision = hasTitleAddressCollisionData(loadedData);
    const migratePluginData = needsPluginDataMigration(loadedData);
    const data = normalizePluginData(loadedData);
    this.rawSettings = rawSettingsFromPluginData(loadedData);
    this.settings = data.settings;
    this.state = data.state;
    this.index = new CardIndex(
      this.app,
      this.settings.addressProperty,
      this.settings.deckOrdering,
    );
    this.canvas = new CanvasBridge(this.app);
    this.addSettingTab(new SlipboxSettingTab(this.app, this));

    this.registerView(
      DECK_VIEW_TYPE,
      (leaf) => new DeckView(leaf, this),
    );
    this.registerHoverLinkSource(DECK_VIEW_TYPE, {
      display: "Slipbox",
      defaultMod: false,
    });
    this.registerEvent(
      this.app.workspace.on("quit", (tasks) => {
        tasks.addPromise(this.finishInlineEdits("quit"));
      }),
    );

    this.addRibbonIcon("archive", "Open Slipbox", () => {
      void this.openDeck();
    });

    this.registerCommands();
    if (migrateTitleCollision) {
      new Notice(
        "Slipbox changed title source to filename because the title and address properties used the same key.",
      );
    }
    if (purgeRemovedEntryPoints || migrateTitleCollision || migratePluginData) {
      void this.persistState();
    }
    this.app.workspace.onLayoutReady(() => {
      this.registerIndexEvents();
      void this.initializeAfterLayoutReady();
    });
  }

  onunload(): void {
    void this.finishInlineEdits("plugin-unload");
    if (this.indexRefreshTimer !== null) {
      window.clearTimeout(this.indexRefreshTimer);
    }
    if (this.spreadSaveTimer !== null) {
      window.clearTimeout(this.spreadSaveTimer);
    }
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
      throw new Error("Obsidian did not create the Slipbox view");
    }
    if (filingFile !== undefined) {
      await leaf.view.startFiling(filingFile);
    }
    return leaf.view;
  }

  setSpread(value: number): void {
    const spread = Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, value));
    this.state = { ...this.state, spread };
    if (this.spreadSaveTimer !== null) {
      window.clearTimeout(this.spreadSaveTimer);
    }
    this.spreadSaveTimer = window.setTimeout(() => {
      this.spreadSaveTimer = null;
      void this.persistState();
    }, 160);
  }

  openMarkdownFile(file: TFile): Promise<void> {
    return this.app.workspace.getLeaf("tab").openFile(file);
  }

  acquireInlineEdit(path: string, owner: DeckView): boolean {
    const existing = this.inlineEditOwners.ownerAt(path);
    if (existing === owner) {
      return true;
    }
    if (existing !== undefined) {
      new Notice("This card is already being edited in another Slipbox view.");
      void this.app.workspace.revealLeaf(existing.leaf);
      return false;
    }
    if (this.detachedInlineEditDrafts.has(path)) {
      new Notice(
        "This card has an inline draft waiting to be restored in Slipbox.",
      );
      return false;
    }
    return this.inlineEditOwners.acquire(path, owner);
  }

  releaseInlineEdit(path: string, owner: DeckView): void {
    this.inlineEditOwners.release(path, owner);
  }

  renameInlineEdit(
    oldPath: string,
    newPath: string,
    owner: DeckView,
  ): boolean {
    return this.inlineEditOwners.rename(oldPath, newPath, owner);
  }

  async prepareInlineEdit(file: TFile): Promise<InlineEditStartData> {
    await this.flushOpenTextViews(file.path);
    const latest = this.app.vault.getAbstractFileByPath(file.path);
    if (!(latest instanceof TFile)) {
      throw new Error("The card no longer exists.");
    }
    const source = await this.app.vault.read(latest);
    const body = splitNoteBody(
      source,
      getFrontMatterInfo(source).contentStart,
    ).body;
    return { file: latest, body };
  }

  async commitInlineEdit(
    request: InlineEditCommitRequest,
  ): Promise<InlineEditCommitResult> {
    const file = this.app.vault.getAbstractFileByPath(request.path);
    if (!(file instanceof TFile)) {
      return {
        status: "conflict",
        message: "The card was deleted while it was being edited.",
      };
    }
    try {
      await this.app.vault.process(file, (latest) => {
        const contentStart = getFrontMatterInfo(latest).contentStart;
        return replaceNoteBodyIfUnchanged(
          latest,
          contentStart,
          request.baseBody,
          request.draft,
        );
      });
    } catch (error) {
      if (error instanceof NoteBodyConflictError) {
        return {
          status: "conflict",
          message: "The note body changed elsewhere. Your inline draft was kept.",
        };
      }
      throw error;
    }
    return { status: "saved" };
  }

  async flushOpenTextViews(path: string): Promise<void> {
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
    this.detachedInlineEditDrafts.set(snapshot.path, {
      path: snapshot.path,
      file,
      origin: snapshot.origin,
      baseBody: snapshot.baseBody,
      draft: snapshot.draft,
      conflictMessage: snapshot.failure?.kind === "conflict"
        ? snapshot.failure.message
        : null,
      conflictRetryable: snapshot.conflictRetryable,
      ...presentation,
    });
  }

  takeDetachedInlineEdit(): DetachedInlineEditDraft | null {
    for (const [path, draft] of this.detachedInlineEditDrafts) {
      if (this.inlineEditOwners.ownerAt(path) !== undefined) {
        continue;
      }
      this.detachedInlineEditDrafts.delete(path);
      return draft;
    }
    return null;
  }

  returnDetachedInlineEdit(draft: DetachedInlineEditDraft): void {
    this.detachedInlineEditDrafts.set(draft.path, draft);
  }

  private async finishInlineEdits(reason: string): Promise<void> {
    const owners = this.inlineEditOwners.ownerSet();
    await Promise.all(
      [...owners].map(async (owner) => {
        await owner.finishInlineEditing(reason);
      }),
    );
  }

  cardTitle(file: TFile): string {
    return resolveCardTitle(
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

  templatesInfo(): TemplatesInfo {
    const plugin = this.templatesPlugin();
    const configuredFolder = plugin?.options?.folder;
    if (plugin === null || typeof configuredFolder !== "string") {
      return { enabled: plugin !== null, folder: "", files: [] };
    }
    const folder = normalizePath(configuredFolder);
    if (folder === "") {
      return { enabled: true, folder, files: [] };
    }
    const prefix = `${folder}/`;
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(prefix))
      .sort((left, right) => left.path.localeCompare(right.path));
    return { enabled: true, folder, files };
  }

  async updateSettings(value: SlipboxSettings): Promise<void> {
    const previousAddressProperty = this.settings.addressProperty;
    const previousOrdering = this.settings.deckOrdering;
    this.settings = normalizeSettings(value);
    this.index.setAddressProperty(this.settings.addressProperty);
    this.index.setDeckOrdering(this.settings.deckOrdering);
    await this.persistState();
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.updateKeybindings();
      }
    }
    if (
      this.settings.addressProperty !== previousAddressProperty ||
      this.settings.deckOrdering !== previousOrdering
    ) {
      await this.refreshIndex();
      if (this.settings.deckOrdering !== previousOrdering) {
        for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
          if (leaf.view instanceof DeckView) {
            await leaf.view.handleDeckOrderingChanged();
          }
        }
      }
    } else {
      await this.refreshDeckViews();
    }
  }

  showCardContextMenu(
    event: MouseEvent,
    file: TFile,
    address: string | null,
    source: string,
    leaf: WorkspaceLeaf,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const isBookmarked =
      address !== null && this.bookmarkAtPath(file.path) !== undefined;
    const isInTray = trayContains(this.tray, file.path);
    const title = this.cardTitle(file);
    const menu = Menu.forEvent(event);
    const runViewAction = (action: Parameters<DeckView["runAction"]>[0]): void => {
      if (leaf.view instanceof DeckView) {
        leaf.view.runAction(action);
      }
    };

    menu.addItem((item) => {
      item
        .setTitle(`Open ${title}`)
        .setIcon("file-pen-line")
        .setSection("slipbox-card")
        .onClick(() => runViewAction("open-note"));
    });
    menu.addItem((item) => {
      item
        .setTitle("Copy link")
        .setIcon("copy")
        .setSection("slipbox-card")
        .setDisabled(address === null)
        .onClick(() => runViewAction("copy-link"));
    });
    menu.addItem((item) => {
      item
        .setTitle(isBookmarked ? "Remove bookmark" : "Add bookmark")
        .setIcon(isBookmarked ? "bookmark-minus" : "bookmark-plus")
        .setSection("slipbox-card")
        .setDisabled(address === null)
        .onClick(() => {
          if (address !== null) {
            runViewAction("toggle-bookmark");
          }
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(trayToggleLabel(isInTray))
        .setIcon(isInTray ? "undo-2" : "inbox")
        .setSection("slipbox-card")
        .setDisabled(address === null)
        .onClick(() => {
          if (address !== null) {
            runViewAction("toggle-tray");
          }
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(`Delete ${title}`)
        .setIcon("trash-2")
        .setWarning(true)
        .setSection("slipbox-card-danger")
        .onClick(() => runViewAction("delete-card"));
    });

    // Obsidian supplies its canonical Reveal file in navigation action along
    // with the remaining ordinary file actions and third-party contributions.
    this.app.workspace.trigger("file-menu", menu, file, source, leaf);
    menu.showAtMouseEvent(event);
  }

  async deleteCard(file: TFile): Promise<boolean> {
    if (!(await this.app.fileManager.promptForDeletion(file))) {
      return false;
    }
    try {
      await this.app.fileManager.trashFile(file);
      return true;
    } catch (error) {
      new Notice(`Could not delete ${this.cardTitle(file)}: ${errorMessage(error)}`);
      return false;
    }
  }

  showIssues(): void {
    this.index.refresh();
    new IssuesModal(this.app, this.index.snapshot, {
      open: (path) => {
        const file = this.index.fileAtPath(path);
        if (file === undefined) {
          new Notice(`Could not find ${path}.`);
        } else {
          void this.openMarkdownFile(file);
        }
      },
    }).open();
  }

  showBookmarks(view: DeckView): void {
    const bookmarks = this.state.bookmarks.filter(isPathBookmark);
    new BookmarksModal(this.app, bookmarks, {
      currentPath: view.activeCard?.path ?? null,
      isAvailable: (path) => this.index.filedByPath(path) !== undefined,
      label: (path) => this.filedCardLabel(path),
      visit: (path) => void view.jumpToPath(path),
      addCurrent: () => view.addBookmarkToCurrent(),
      remove: (path) => view.removeBookmark(path),
    }).open();
  }

  bookmarkAtPath(path: string): DeckBookmark | undefined {
    return this.state.bookmarks.find(
      (bookmark): bookmark is DeckBookmark =>
        isPathBookmark(bookmark) && bookmark.path === path,
    );
  }

  async addBookmark(path: string): Promise<void> {
    if (this.index.filedByPath(path) === undefined) {
      new Notice("Only an available filed card can be bookmarked.");
      return;
    }
    const label = this.filedCardLabel(path);
    if (this.bookmarkAtPath(path) !== undefined) {
      new Notice(`${label} already has a bookmark.`);
      return;
    }
    try {
      this.state = {
        ...this.state,
        bookmarks: createBookmark(this.state.bookmarks, path),
      };
      this.refreshBookmarkUi();
      await this.persistState();
      new Notice(`Bookmarked ${label}.`);
    } catch (error) {
      new Notice(`Could not add bookmark: ${errorMessage(error)}`);
    }
  }

  async toggleBookmark(path: string): Promise<void> {
    if (this.bookmarkAtPath(path) === undefined) {
      await this.addBookmark(path);
    } else {
      await this.removeBookmark(path);
    }
  }

  createTrayPileId(): string {
    this.trayPileSequence += 1;
    return `tray-pile-${this.trayPileSequence}`;
  }

  async updateTray(next: TrayState): Promise<void> {
    this.tray = next;
    await this.refreshDeckViews();
  }

  async toggleFileInTray(file: TFile): Promise<void> {
    this.index.refresh();
    const filed = this.index.filedByFile(file);
    if (filed === undefined) {
      new Notice("Only an available filed card can be pulled out.");
      return;
    }
    this.tray = toggleFiledCard(
      this.tray,
      { cardRef: file.path, kind: "filed" },
      this.createTrayPileId(),
    );
    await this.refreshDeckViews();
  }

  isFileInTray(file: TFile): boolean {
    return trayContains(this.tray, file.path);
  }

  async setTrayPileExpanded(pileId: string, expanded: boolean): Promise<void> {
    this.tray = setPileExpanded(this.tray, pileId, expanded);
    await this.refreshDeckViews();
  }

  async clearTrayPile(pileId: string): Promise<void> {
    this.tray = clearFiledCardsFromPile(this.tray, pileId);
    await this.refreshDeckViews();
  }

  async clearTray(): Promise<void> {
    this.tray = clearFiledCardsFromTray(this.tray);
    await this.refreshDeckViews();
  }

  hasActiveCanvas(): boolean {
    return this.canvas.hasActiveCanvas();
  }

  async layOutTrayPileOnActiveCanvas(pileId: string): Promise<void> {
    const paths = this.trayPilePaths(pileId);
    if (paths.length === 0) {
      return;
    }
    try {
      this.reportCanvasWrite(await this.canvas.layoutFilesOnActiveCanvas(paths));
    } catch (error) {
      new Notice(`Could not lay out the pile: ${errorMessage(error)}`);
    }
  }

  async layOutTrayPileOnCanvas(pileId: string): Promise<void> {
    const paths = this.trayPilePaths(pileId);
    if (paths.length === 0) {
      return;
    }
    const canvases = this.canvas.canvasFiles();
    if (canvases.length === 0) {
      new Notice("There are no Canvas files in this vault. Create one from the pile instead.");
      return;
    }
    const file = await promptForCanvas(this.app, canvases);
    if (file === null) {
      return;
    }
    try {
      this.reportCanvasWrite(await this.canvas.layoutFilesOnCanvas(file, paths));
    } catch (error) {
      new Notice(`Could not lay out the pile: ${errorMessage(error)}`);
    }
  }

  async createCanvasFromTrayPile(pileId: string): Promise<void> {
    const paths = this.trayPilePaths(pileId);
    if (paths.length === 0) {
      return;
    }
    const entered = await promptForText(
      this.app,
      "Create Canvas from pile",
      "Canvas filename or vault path",
    );
    if (entered === null) {
      return;
    }
    const path = normalizeCanvasPath(entered);
    if (path === null) {
      new Notice("Enter a valid Canvas filename or vault-relative path.");
      return;
    }
    try {
      this.reportCanvasWrite(await this.canvas.createCanvas(path, paths));
    } catch (error) {
      new Notice(`Could not create the Canvas: ${errorMessage(error)}`);
    }
  }

  async exportLegacyDeskToCanvas(): Promise<void> {
    const legacy = this.state.legacyDeskCards ?? [];
    if (legacy.length === 0) {
      new Notice("There is no legacy Desk layout to export.");
      return;
    }
    const entered = await promptForText(
      this.app,
      "Export legacy Desk to Canvas",
      "Canvas filename or vault path",
      "Legacy Slipbox Desk",
    );
    if (entered === null) {
      return;
    }
    const path = normalizeCanvasPath(entered);
    if (path === null) {
      new Notice("Enter a valid Canvas filename or vault-relative path.");
      return;
    }

    const available = legacy.filter((card) => {
      const file = this.app.vault.getAbstractFileByPath(card.cardRef);
      return file instanceof TFile && file.extension === "md";
    });
    const missingCount = legacy.length - available.length;
    if (available.length === 0) {
      new Notice("None of the cards in the legacy Desk layout still exist. The layout was kept.");
      return;
    }

    let result: CanvasWriteResult;
    try {
      result = await this.canvas.createLegacyDeskCanvas(path, available);
    } catch (error) {
      new Notice(`Could not export the legacy Desk: ${errorMessage(error)}`);
      return;
    }
    const missing = missingCount === 0
      ? ""
      : ` Omitted ${missingCount} missing card${missingCount === 1 ? "" : "s"}.`;
    new Notice(
      `Exported ${result.addedPaths.length} legacy Desk card${result.addedPaths.length === 1 ? "" : "s"} to ${result.file.basename}.${missing}`,
    );

    const clear = await confirmAction(
      this.app,
      "Clear legacy Desk state?",
      "The Canvas was created successfully. Clear the old Desk layout from Slipbox’s saved state?",
      "Clear legacy state",
    );
    if (!clear) {
      return;
    }
    const { legacyDeskCards: _legacyDeskCards, ...state } = this.state;
    this.state = state;
    await this.persistState();
    new Notice("Legacy Desk state cleared. The Canvas was kept.");
  }

  async beginFiling(file: TFile): Promise<void> {
    this.index.refresh();
    if (this.cardMetadataState(file) !== "unfiled") {
      new Notice("Only an unfiled card can enter filing mode.");
      return;
    }
    await this.openDeck(file);
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
    let refreshAfterFiling = false;
    let placementChanged = false;
    this.filingWriteInProgress = true;
    try {
      this.index.refresh();
      this.assertFilingSource(file, preview.sourcePath);
      if (this.cardMetadataState(file) !== "unfiled") {
        throw new Error("The source card is no longer unfiled");
      }
      if (!this.filingPreviewMatches(file, preview)) {
        return { status: "preview-changed" };
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
          this.index.refresh();
          this.assertFilingSource(file, preview.sourcePath);
          if (!this.filingPreviewMatches(file, preview)) {
            placementChanged = true;
            throw new Error("The previewed filing position changed");
          }
          frontmatter[property] = preview.address;
        },
      );

      const cacheReady = await this.waitForCachedAddress(file, preview.address);
      refreshAfterFiling = !cacheReady;
      this.index.refresh();
      this.tray = removeTrayPath(this.tray, file.path);
      const filedIndex = this.index.filedIndexForPath(file.path);
      new Notice(
        cacheReady
          ? `Filed ${this.cardTitle(file)} as ${preview.address}.`
          : `Filed ${this.cardTitle(file)} as ${preview.address}. Slipbox will refresh when Obsidian finishes indexing it.`,
      );
      return {
        status: "filed",
        address: preview.address,
        index: filedIndex < 0 ? preview.insertionIndex : filedIndex,
      };
    } catch (error) {
      if (placementChanged) {
        return { status: "preview-changed" };
      }
      new Notice(`Could not file the card: ${errorMessage(error)}`);
      return { status: "failed" };
    } finally {
      this.filingWriteInProgress = false;
      if (refreshAfterFiling) {
        this.queueIndexRefresh();
      }
    }
  }

  private assertFilingSource(file: TFile, expectedPath: string): void {
    if (
      file.path !== expectedPath ||
      this.app.vault.getAbstractFileByPath(expectedPath) !== file
    ) {
      throw new Error("The source path no longer identifies the intended card");
    }
  }

  private filingPreviewMatches(file: TFile, preview: FilingPreview): boolean {
    if (
      preview.ordering !== this.settings.deckOrdering ||
      !validateAddress(preview.address).valid
    ) {
      return false;
    }
    return filingPlacementMatches(
      this.index.snapshot.filed,
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
      callback: () => void this.createNewCard(),
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
      id: "export-legacy-desk-to-canvas",
      name: "Export legacy Desk to Canvas…",
      checkCallback: (checking) => {
        const available = (this.state.legacyDeskCards?.length ?? 0) > 0;
        if (checking) {
          return available;
        }
        if (available) {
          void this.exportLegacyDeskToCanvas();
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
    if (definition.id === "bookmarks") {
      this.addCommand({
        id: definition.commandId,
        name: definition.commandName,
        callback: () => void this.openDeck().then((view) => {
          view.runAction(definition.id);
        }),
      });
      return;
    }
    if (definition.id === "problems") {
      this.addCommand({
        id: definition.commandId,
        name: definition.commandName,
        checkCallback: (checking) => {
          const available = this.index.snapshot.issues.length > 0;
          if (!checking && available) {
            this.showIssues();
          }
          return available;
        },
      });
      return;
    }
    this.addCommand({
      id: definition.commandId,
      name: definition.commandName,
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(DeckView);
        const available = view?.canRunAction(definition.id) ?? false;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          view.runAction(definition.id);
        }
        return available;
      },
    });
  }

  async createNewCardAtTrayPosition(
    position: TrayPilePosition,
  ): Promise<void> {
    await this.createNewCard(position);
  }

  private async createNewCard(
    trayPosition?: TrayPilePosition,
  ): Promise<void> {
    try {
      const file = await this.createCardFile();
      if (file === null) {
        return;
      }
      if (trayPosition !== undefined) {
        await this.waitForCachedAddress(file, "");
        this.index.refresh();
        this.reconcileSessionTray();
        const pileId = this.createTrayPileId();
        this.tray = placeUnfiledCardAtPosition(
          this.tray,
          file.path,
          pileId,
          trayPosition,
        );
        await this.refreshDeckViews();
      }
      this.queueIndexRefresh();
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
    sourcePath?: string,
  ): Promise<TFile | null> {
    const timestamp = newNoteBasename(
      "",
      moment().format(this.settings.newNoteTimestampFormat),
    );
    const title = await promptForNewCardTitle(
      this.app,
      newCardTitlePlaceholder(timestamp, this.settings.titleSource),
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
    const template = await this.resolveNewNoteTemplate();
    const prefix = parent.isRoot() ? "" : `${parent.path}/`;
    let sequence = 0;
    let path: string;

    do {
      const suffix = sequence === 0 ? "" : ` ${sequence + 1}`;
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
    await this.openMarkdownFile(file);
    if (template !== null) {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view?.file?.path !== file.path) {
        new Notice("Could not apply the new-card template: the note editor is not active.");
      } else {
        const lastLine = view.editor.lastLine();
        view.editor.setCursor({
          line: lastLine,
          ch: view.editor.getLine(lastLine).length,
        });
        try {
          await template.plugin.insertTemplate(template.file);
        } catch (error) {
          new Notice(`Could not apply the new-card template: ${errorMessage(error)}`);
        }
      }
    }
    return file;
  }

  private activeCreationSourcePath(): string | undefined {
    return this.app.workspace.getActiveViewOfType(DeckView)
      ?.activeCard?.file.path ??
      this.app.workspace.getActiveFile()?.path;
  }

  private newCardParent(sourcePath: string | undefined): TFolder {
    const path = this.settings.newCardFolder;
    if (path === "") {
      const source = sourcePath === undefined
        ? null
        : this.app.vault.getAbstractFileByPath(sourcePath);
      return source instanceof TFile && source.parent !== null
        ? source.parent
        : this.app.vault.getRoot();
    }
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof TFolder)) {
      throw new Error(
        `The configured new-card folder “${path}” does not exist`,
      );
    }
    return folder;
  }

  private templatesPlugin(): TemplatesCorePlugin | null {
    const app = this.app as typeof this.app & {
      readonly internalPlugins?: {
        getEnabledPluginById(id: string): unknown;
      };
    };
    const candidate = app.internalPlugins?.getEnabledPluginById("templates");
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !("insertTemplate" in candidate) ||
      typeof candidate.insertTemplate !== "function"
    ) {
      return null;
    }
    return candidate as TemplatesCorePlugin;
  }

  private async resolveNewNoteTemplate(): Promise<{
    readonly plugin: TemplatesCorePlugin;
    readonly file: TFile;
  } | null> {
    if (!this.settings.useTemplatesForNewNotes) {
      return null;
    }
    const plugin = this.templatesPlugin();
    const info = this.templatesInfo();
    if (plugin === null) {
      new Notice("Enable Obsidian’s templates core plugin to apply templates to new cards.");
      return null;
    }
    if (info.folder === "" || info.files.length === 0) {
      new Notice("Configure a templates folder containing at least one template to use it for new cards.");
      return null;
    }

    let file: TFile | null = null;
    if (this.settings.newNoteTemplatePath !== "") {
      file = info.files.find(
        (candidate) => candidate.path === this.settings.newNoteTemplatePath,
      ) ?? null;
      if (file === null) {
        new Notice("The configured new-card template is missing. Choose another template.");
      }
    }
    if (file === null) {
      file = await promptForTemplate(this.app, info.files, info.folder);
    }
    return file === null ? null : { plugin, file };
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
    if (this.bookmarkAtPath(path) === undefined) {
      return;
    }
    const label = this.filedCardLabel(path);
    this.state = {
      ...this.state,
      bookmarks: deleteBookmark(this.state.bookmarks, path),
    };
    this.refreshBookmarkUi();
    await this.persistState();
    new Notice(`Deleted bookmark at ${label}.`);
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

  private async initializeAfterLayoutReady(): Promise<void> {
    await this.refreshIndex();
  }

  private async refreshIndex(): Promise<void> {
    this.index.refresh();
    if (this.state.bookmarks.some((bookmark) => !isPathBookmark(bookmark))) {
      this.state = {
        ...this.state,
        bookmarks: migrateAddressBookmarks(
          this.state.bookmarks,
          (address) => this.index.firstFiledAtAddress(address)?.path,
        ),
      };
      await this.persistState();
    }
    this.reconcileSessionTray();
    await this.refreshDeckViews();
  }

  async refreshDeckViews(): Promise<void> {
    await Promise.all(
      this.app.workspace
        .getLeavesOfType(DECK_VIEW_TYPE)
        .flatMap((leaf) =>
          leaf.view instanceof DeckView ? [leaf.view.refresh()] : [],
        ),
    );
  }

  private refreshBookmarkUi(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handleBookmarksChanged();
      }
    }
  }

  private async persistState(): Promise<void> {
    const persistedSettings = settingsForPersistence(
      this.rawSettings,
      this.settings,
    );
    const write = this.persistQueue.then(() => this.saveData({
      schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
      settings: persistedSettings,
      state: this.state,
    }));
    this.persistQueue = write.catch(() => undefined);
    try {
      await write;
      this.rawSettings = persistedSettings;
    } catch (error) {
      new Notice(`Could not save Slipbox state: ${errorMessage(error)}`);
    }
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
    for (const [path, draft] of this.detachedInlineEditDrafts) {
      if (pathIsAtOrBelow(path, file.path)) {
        this.detachedInlineEditDrafts.set(path, {
          ...draft,
          conflictMessage:
            "The card was deleted while it was being edited. Your draft was kept.",
          conflictRetryable: true,
        });
      }
    }
    this.tray = removeTrayPath(this.tray, file.path);
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handlePathDeletion(file.path);
      }
    }
    const prefix = `${file.path.replace(/\/$/, "")}/`;
    const legacyDeskCards = this.state.legacyDeskCards ?? [];
    const removesLegacyDeskCard = legacyDeskCards.some(
      (card) => card.cardRef === file.path || card.cardRef.startsWith(prefix),
    );
    const nextBookmarks = removeBookmarkPaths(this.state.bookmarks, file.path);
    if (
      removesLegacyDeskCard ||
      nextBookmarks.length !== this.state.bookmarks.length
    ) {
      const next = removeDeskPath(legacyDeskCards, file.path);
      const { legacyDeskCards: _legacyDeskCards, ...state } = this.state;
      this.state = {
        ...state,
        bookmarks: nextBookmarks,
        ...(next.length > 0 ? { legacyDeskCards: next } : {}),
      };
      void this.persistState();
    }
    this.queueIndexRefresh();
  }

  private handleRenamedFile(file: TAbstractFile, oldPath: string): void {
    for (const [path, draft] of [...this.detachedInlineEditDrafts]) {
      const renamedPath = renamePathReference(path, oldPath, file.path);
      if (renamedPath === path) {
        continue;
      }
      this.detachedInlineEditDrafts.delete(path);
      const collision = this.detachedInlineEditDrafts.has(renamedPath) ||
        this.inlineEditOwners.ownerAt(renamedPath) !== undefined;
      this.detachedInlineEditDrafts.set(renamedPath, {
        ...draft,
        path: renamedPath,
        conflictMessage: collision
          ? "The renamed path is already held by another inline-edit session."
          : draft.conflictMessage,
        conflictRetryable: collision ? false : draft.conflictRetryable,
      });
    }
    this.tray = renameTrayPath(this.tray, oldPath, file.path);
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handlePathRename(oldPath, file.path);
      }
    }
    const prefix = `${oldPath.replace(/\/$/, "")}/`;
    const legacyDeskCards = this.state.legacyDeskCards ?? [];
    const renamesLegacyDeskCard = legacyDeskCards.some(
      (card) => card.cardRef === oldPath || card.cardRef.startsWith(prefix),
    );
    const renamesBookmark = this.state.bookmarks.some(
      (bookmark) =>
        isPathBookmark(bookmark) && pathIsAtOrBelow(bookmark.path, oldPath),
    );
    if (renamesLegacyDeskCard || renamesBookmark) {
      this.state = {
        ...this.state,
        bookmarks: renameBookmarkPaths(this.state.bookmarks, oldPath, file.path),
        ...(renamesLegacyDeskCard
          ? { legacyDeskCards: renameDeskCard(legacyDeskCards, oldPath, file.path) }
          : {}),
      };
      void this.persistState();
    }
    this.queueIndexRefresh();
  }

  private reconcileSessionTray(): void {
    const candidates: TrayCardCandidate[] = [
      ...this.index.snapshot.unfiled.map((file) => ({
        cardRef: file.path,
        kind: "unfiled" as const,
        modifiedTime: file.stat.mtime,
      })),
      ...this.index.snapshot.filed.map((card) => ({
        cardRef: card.path,
        kind: "filed" as const,
        modifiedTime: card.file.stat.mtime,
      })),
    ];
    this.tray = reconcileTray(this.tray, candidates, this.createTrayPileId());
  }

  private trayPilePaths(pileId: string): string[] {
    return this.tray.piles
      .find((pile) => pile.id === pileId)
      ?.cards.map((card) => card.cardRef) ?? [];
  }

  private reportCanvasWrite(result: CanvasWriteResult): void {
    const added = result.addedPaths.length;
    const skipped = result.skippedPaths.length;
    const summary = added === 0
      ? `No cards added to ${result.file.basename}.`
      : `Added ${added} card${added === 1 ? "" : "s"} to ${result.file.basename}.`;
    const existing = skipped === 0
      ? ""
      : ` Skipped ${skipped} existing node${skipped === 1 ? "" : "s"}.`;
    new Notice(`${summary}${existing}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rawSettingsFromPluginData(value: unknown): unknown {
  return isRecord(value) && isRecord(value.settings) ? value.settings : {};
}
