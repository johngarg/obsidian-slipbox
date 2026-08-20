import {
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
  moment,
  normalizePath,
  stringifyYaml,
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
  normalizePluginData,
  type EntryPoint,
  type SlipboxPluginState,
} from "./plugin-state.js";
import { resolveCardTitle } from "./card-title.js";
import {
  DEFAULT_SETTINGS,
  SLIPBOX_DATA_SCHEMA_VERSION,
  normalizeSettings,
  type DeckAction,
  type SlipboxSettings,
} from "./settings.js";
import { SlipboxSettingTab } from "./settings-tab.js";
import { ZettelIndex } from "./zettel-index.js";

type CardMetadataState = "ordinary" | "unfiled" | "filed" | "invalid";

interface TemplatesCorePlugin {
  readonly options?: { readonly folder?: unknown };
  insertTemplate(file: TFile): Promise<void> | void;
}

export interface TemplatesInfo {
  readonly enabled: boolean;
  readonly folder: string;
  readonly files: readonly TFile[];
}

export default class SlipboxPlugin extends Plugin {
  state: SlipboxPluginState = DEFAULT_STATE;
  settings: SlipboxSettings = DEFAULT_SETTINGS;
  index!: ZettelIndex;

  private indexRefreshTimer: number | null = null;
  private spreadSaveTimer: number | null = null;
  private filingWriteInProgress = false;
  private cardCreationInProgress = false;
  private persistQueue: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    const data = normalizePluginData(await this.loadData());
    this.settings = data.settings;
    this.state = data.state;
    this.index = new ZettelIndex(this.app, this.settings.addressProperty);
    this.index.refresh();
    await this.persistState();
    this.addSettingTab(new SlipboxSettingTab(this.app, this));

    this.registerView(
      DECK_VIEW_TYPE,
      (leaf) => new DeckView(leaf, this),
    );
    this.registerView(
      DESK_VIEW_TYPE,
      (leaf) => new DeskView(leaf, this),
    );
    this.registerHoverLinkSource(DECK_VIEW_TYPE, {
      display: "Slipbox Deck",
      defaultMod: false,
    });
    this.registerHoverLinkSource(DESK_VIEW_TYPE, {
      display: "Slipbox Desk",
      defaultMod: false,
    });

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
    this.registerEvent(
      this.app.metadataCache.on("resolve", () => this.queueIndexRefresh()),
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

  openMarkdownFile(file: TFile): Promise<void> {
    return this.app.workspace.getLeaf("tab").openFile(file);
  }

  cardTitle(file: TFile): string {
    return resolveCardTitle(
      file.basename,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.settings,
    );
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
    this.settings = normalizeSettings(value);
    this.index.setAddressProperty(this.settings.addressProperty);
    await this.persistState();
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.updateKeybindings();
      }
    }
    if (this.settings.addressProperty !== previousAddressProperty) {
      await this.refreshIndex();
    } else {
      await this.refreshViews();
    }
  }

  showCardContextMenu(
    event: MouseEvent,
    file: TFile,
    zettelId: string | null,
    source: string,
    leaf: WorkspaceLeaf,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const isBookmarked =
      zettelId !== null && this.bookmarkAt(zettelId) !== undefined;
    const isOnDesk = this.state.deskCards.some(
      (card) => card.cardRef === file.path,
    );
    const title = this.cardTitle(file);
    const menu = Menu.forEvent(event);

    menu.addItem((item) => {
      item
        .setTitle(`Open ${title}`)
        .setIcon("file-pen-line")
        .setSection("slipbox-card")
        .onClick(() => void this.openMarkdownFile(file));
    });
    menu.addItem((item) => {
      item
        .setTitle(isBookmarked ? "Remove bookmark" : "Add bookmark")
        .setIcon(isBookmarked ? "bookmark-minus" : "bookmark-plus")
        .setSection("slipbox-card")
        .setDisabled(zettelId === null)
        .onClick(() => {
          if (zettelId !== null) {
            void this.toggleBookmark(zettelId);
          }
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(isOnDesk ? "Remove from Desk" : "Add to Desk")
        .setIcon("panels-top-left")
        .setSection("slipbox-card")
        .onClick(() => void this.toggleFileOnDesk(file));
    });
    menu.addItem((item) => {
      item
        .setTitle(`Add card from ${title}`)
        .setIcon("plus")
        .setSection("slipbox-card")
        .setDisabled(zettelId === null)
        .onClick(() => {
          if (zettelId !== null) {
            void this.createCardFrom(zettelId);
          }
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(`Delete ${title}`)
        .setIcon("trash-2")
        .setWarning(true)
        .setSection("slipbox-card-danger")
        .onClick(() => void this.deleteCard(file));
    });

    // Obsidian supplies its canonical Reveal file in navigation action along
    // with the remaining ordinary file actions and third-party contributions.
    this.app.workspace.trigger("file-menu", menu, file, source, leaf);
    menu.showAtMouseEvent(event);
  }

  private async deleteCard(file: TFile): Promise<void> {
    if (!(await this.app.fileManager.promptForDeletion(file))) {
      return;
    }
    try {
      await this.app.fileManager.trashFile(file);
    } catch (error) {
      new Notice(`Could not delete ${this.cardTitle(file)}: ${errorMessage(error)}`);
    }
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
      label: (id) => {
        const card = this.index.filedById(id);
        return card === undefined ? id : `${id} · ${this.cardTitle(card.file)}`;
      },
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
      const card = this.index.filedById(zettelId);
      const label = card === undefined
        ? zettelId
        : `${zettelId} · ${this.cardTitle(card.file)}`;
      new Notice(`${label} already has a bookmark.`);
      return;
    }
    try {
      this.state = {
        ...this.state,
        bookmarks: createBookmark(this.state.bookmarks, zettelId),
      };
      await this.persistStateAndRefreshViews();
      const card = this.index.filedById(zettelId);
      const label = card === undefined
        ? zettelId
        : `${zettelId} · ${this.cardTitle(card.file)}`;
      new Notice(`Bookmarked ${label}.`);
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

  async putFileOnDesk(file: TFile, revealDesk = true): Promise<void> {
    this.index.refresh();
    const metadataState = this.cardMetadataState(file);
    if (metadataState !== "filed" && metadataState !== "unfiled") {
      new Notice("Only a filed or unfiled Slipbox card can be placed on Desk.");
      return;
    }
    if (this.state.deskCards.some((card) => card.cardRef === file.path)) {
      new Notice(`${this.cardTitle(file)} is already on Desk.`);
      if (revealDesk) {
        await this.openDesk();
      }
      return;
    }
    const position = this.nextDeskPosition();
    this.state = {
      ...this.state,
      deskCards: addDeskCard(this.state.deskCards, file.path, position),
    };
    await this.persistStateAndRefreshViews();
    if (revealDesk) {
      await this.openDesk();
    }
  }

  async toggleFileOnDesk(file: TFile): Promise<void> {
    if (this.state.deskCards.some((card) => card.cardRef === file.path)) {
      await this.removeFromDesk(file.path);
      return;
    }
    await this.putFileOnDesk(file, false);
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
      if (file === null) {
        return;
      }
      this.queueIndexRefresh();
    } catch (error) {
      new Notice(`Could not create a section: ${errorMessage(error)}`);
    }
  }

  async createCardFrom(attachmentId: string): Promise<void> {
    if (this.cardCreationInProgress) {
      return;
    }
    this.cardCreationInProgress = true;
    try {
      this.index.refresh();
      const attachment = this.index.filedById(attachmentId);
      if (attachment === undefined) {
        throw new Error(
          `Attachment ${attachmentId} is missing, invalid, or duplicated`,
        );
      }
      const id = generateFiledId(
        attachmentId,
        this.index.snapshot.allValidIds,
      );
      const file = await this.createCardFile(id, attachment.path);
      if (file === null) {
        return;
      }
      this.queueIndexRefresh();
    } catch (error) {
      new Notice(
        `Could not add a card from ${attachmentId}: ${errorMessage(error)}`,
      );
    } finally {
      this.cardCreationInProgress = false;
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
        const property = this.settings.addressProperty;
        const hasId = Object.prototype.hasOwnProperty.call(
          frontmatter,
          property,
        );
        const current = frontmatter[property];
        if (!hasId || !(current === "" || current === null || current === undefined)) {
          throw new Error(
            `The card is no longer unfiled; its ${property} was not changed`,
          );
        }
        frontmatter[property] = newId;
      });

      await this.waitForCachedId(file, newId);
      this.index.refresh();
      await this.refreshViews();
      new Notice(`Filed ${this.cardTitle(file)} as ${newId}.`);
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
      callback: () => {
        const deck = this.app.workspace.getActiveViewOfType(DeckView);
        if (deck === null) {
          void this.openDesk();
        } else {
          deck.runAction("open-desk");
        }
      },
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
      callback: () => {
        const deck = this.app.workspace.getActiveViewOfType(DeckView);
        if (deck === null) {
          void this.createNewSection();
        } else {
          deck.runAction("new-section");
        }
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

    this.addCommand({
      id: "put-current-card-on-desk",
      name: "Toggle current card on Desk",
      checkCallback: (checking) => {
        const file = this.currentCardFile();
        const available = file !== null;
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("toggle-desk");
          } else {
            void this.toggleFileOnDesk(file);
          }
        }
        return available;
      },
    });

    this.addCommand({
      id: "add-bookmark-current-card",
      name: "Toggle bookmark on current card",
      checkCallback: (checking) => {
        const id = this.currentFiledId();
        const available = id !== null;
        if (checking) {
          return available;
        }
        if (available && id !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("toggle-bookmark");
          } else {
            void this.toggleBookmark(id);
          }
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
          view.runAction("back");
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
          view.runAction("forward");
        }
        return available;
      },
    });

    this.addCommand({
      id: "open-current-card-markdown",
      name: "Open current card in Markdown",
      checkCallback: (checking) => {
        const file = this.currentCardFile();
        if (checking) {
          return file !== null;
        }
        if (file !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("open-note");
          } else {
            void this.openMarkdownFile(file);
          }
        }
        return file !== null;
      },
    });

    this.addCommand({
      id: "add-card-from-current",
      name: "Add card from current card",
      checkCallback: (checking) => {
        const id = this.currentFiledId();
        if (checking) {
          return id !== null;
        }
        if (id !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("add-card");
          } else {
            void this.createCardFrom(id);
          }
        }
        return id !== null;
      },
    });

    this.registerDeckCommand("previous-card", "Previous card", "previous-card");
    this.registerDeckCommand("next-card", "Next card", "next-card");
    this.registerDeckCommand("centre-active-card", "Centre active card", "centre-card");
    this.registerDeckCommand("first-card", "First card", "first-card");
    this.registerDeckCommand("last-card", "Last card", "last-card");
    this.addCommand({
      id: "manage-entry-points",
      name: "Manage entry points",
      callback: () => void this.openDeck().then((view) => {
        view.runAction("entry-points");
      }),
    });
    this.addCommand({
      id: "manage-bookmarks",
      name: "Manage bookmarks",
      callback: () => void this.openDeck().then((view) => {
        view.runAction("bookmarks");
      }),
    });
    this.addCommand({
      id: "show-card-problems",
      name: "Show card problems",
      checkCallback: (checking) => {
        this.index.refresh();
        const available = this.index.snapshot.issues.length > 0;
        if (checking) {
          return available;
        }
        if (available) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck === null) {
            this.showIssues();
          } else {
            deck.runAction("problems");
          }
        }
        return available;
      },
    });
    this.registerDeckCommand("file-here", "File here", "file-here");
    this.registerDeckCommand("cancel-filing", "Cancel filing", "cancel-filing");
  }

  private registerDeckCommand(
    id: string,
    name: string,
    action: DeckAction,
  ): void {
    this.addCommand({
      id,
      name,
      checkCallback: (checking) => {
        const view = this.currentDeckView();
        const available = view?.canRunAction(action) ?? false;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          view.runAction(action);
        }
        return available;
      },
    });
  }

  private async createNewCard(): Promise<void> {
    try {
      const placeOnDesk = this.app.workspace.getActiveViewOfType(DeskView) !== null;
      const file = await this.createCardFile(null);
      if (file === null) {
        return;
      }
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
      this.queueIndexRefresh();
    } catch (error) {
      new Notice(`Could not create a card: ${errorMessage(error)}`);
    }
  }

  private async makeNoteCard(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const property = this.settings.addressProperty;
        if (Object.prototype.hasOwnProperty.call(frontmatter, property)) {
          throw new Error(`This note already has a ${property} property`);
        }
        frontmatter[property] = "";
      });
      this.queueIndexRefresh();
      new Notice(`${this.cardTitle(file)} is now an unfiled card.`);
    } catch (error) {
      new Notice(`Could not make this note a card: ${errorMessage(error)}`);
    }
  }

  private async createCardFile(
    id: string | null,
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
      [this.settings.addressProperty]: id ?? "",
    };
    const frontmatterTitle = newCardFrontmatterTitle(
      title,
      this.settings.titleSource,
    );
    if (
      frontmatterTitle !== null &&
      this.settings.titleProperty !== this.settings.addressProperty
    ) {
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
      new Notice("Enable Obsidian’s Templates core plugin to apply templates to new cards.");
      return null;
    }
    if (info.folder === "" || info.files.length === 0) {
      new Notice("Configure a Templates folder containing at least one template to use it for new cards.");
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
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
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
    const card = this.index.filedById(zettelId);
    const label = card === undefined
      ? zettelId
      : `${zettelId} · ${this.cardTitle(card.file)}`;
    this.state = {
      ...this.state,
      bookmarks: deleteBookmark(this.state.bookmarks, zettelId),
    };
    await this.persistStateAndRefreshViews();
    new Notice(`Deleted bookmark at ${label}.`);
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
    const write = this.persistQueue.then(() => this.saveData({
      schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
      settings: this.settings,
      state: this.state,
    }));
    this.persistQueue = write.catch(() => undefined);
    try {
      await write;
    } catch (error) {
      new Notice(`Could not save Slipbox state: ${errorMessage(error)}`);
    }
  }

  private async waitForCachedId(file: TFile, expectedId: string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const value =
        this.app.metadataCache.getFileCache(file)?.frontmatter?.[
          this.settings.addressProperty
        ];
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
