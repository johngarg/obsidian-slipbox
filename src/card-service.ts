import type {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  TFile,
  TFolder,
} from "obsidian";

import { validateAddress } from "./address-order.js";
import { deleteCardWithConfirmation } from "./card-deletion.js";
import type { CardIndex, FiledCard } from "./card-index.js";
import type { CardIndexRuntime } from "./card-index-runtime.js";
import {
  buildCardLinkSuggestions,
  type CardLinkSuggestion,
} from "./card-link-suggestions.js";
import { generateFiledCardLink } from "./card-links.js";
import {
  resolveCardDisplayTitle,
  resolveCardTitle,
} from "./card-title.js";
import type { DeskPilePosition } from "./desk-state.js";
import type { DeskService } from "./desk-service.js";
import type { MetadataCacheWaiter } from "./metadata-cache-waiter.js";
import {
  newCardBasename,
  newCardFrontmatterTitle,
  newCardTitlePlaceholder,
  newNoteBasename,
  resolveNewCardTitle,
  type NewCardTitleMode,
} from "./new-note.js";
import type { SlipboxSettings } from "./settings.js";

export type CardMetadataState = "ordinary" | "unfiled" | "filed" | "invalid";

export interface CardServiceEnvironment {
  readonly app: App;
  readonly index: CardIndex;
  readonly indexRuntime: CardIndexRuntime;
  readonly desk: DeskService;
  readonly cacheWaiter: MetadataCacheWaiter<TFile>;
  settings(): SlipboxSettings;
  timestamp(): string;
  activeCreationSourcePath(): string | undefined;
  promptForTitle(placeholder: string): Promise<string | null>;
  promptForLink(
    suggestions: readonly CardLinkSuggestion[],
  ): Promise<CardLinkSuggestion | null>;
  normalizePath(path: string): string;
  serializeProperties(properties: Record<string, string>): string;
  openFile(file: TFile): Promise<void>;
  openDesk(): Promise<void>;
  focusDeskCard(path: string): void;
  notify(message: string): void;
  copyText(value: string): Promise<void>;
}

export class CardService {
  constructor(private readonly environment: CardServiceEnvironment) {}

  title(file: TFile): string {
    return resolveCardTitle(
      file.basename,
      this.environment.app.metadataCache.getFileCache(file)?.frontmatter,
      this.environment.settings(),
    );
  }

  displayTitle(file: TFile): string | null {
    return resolveCardDisplayTitle(
      file.basename,
      this.environment.app.metadataCache.getFileCache(file)?.frontmatter,
      this.environment.settings(),
    );
  }

  metadataState(file: TFile): CardMetadataState {
    const settings = this.environment.settings();
    const rawFrontmatter: unknown =
      this.environment.app.metadataCache.getFileCache(file)?.frontmatter;
    const frontmatter = isRecord(rawFrontmatter) ? rawFrontmatter : undefined;
    if (
      frontmatter === undefined ||
      !Object.prototype.hasOwnProperty.call(
        frontmatter,
        settings.addressProperty,
      )
    ) {
      return "ordinary";
    }
    const value = frontmatter[settings.addressProperty];
    if (value === "" || value === null || value === undefined) {
      return "unfiled";
    }
    if (typeof value !== "string") {
      return "invalid";
    }
    return validateAddress(value).valid ? "filed" : "invalid";
  }

  isUnfiled(file: TFile): boolean {
    return this.metadataState(file) === "unfiled";
  }

  filedLabel(path: string): string {
    const card = this.environment.index.filedByPath(path);
    return card === undefined
      ? path
      : `${card.address} · ${this.title(card.file)}`;
  }

  open(file: TFile): Promise<void> {
    return this.environment.openFile(file);
  }

  async delete(file: TFile): Promise<boolean> {
    try {
      return await deleteCardWithConfirmation(
        this.environment.app.fileManager,
        file,
      );
    } catch (error) {
      this.environment.notify(
        `Could not delete ${this.title(file)}: ${errorMessage(error)}`,
      );
      return false;
    }
  }

  async makeOrdinaryNoteCard(file: TFile): Promise<void> {
    try {
      await this.environment.app.fileManager.processFrontMatter(
        file,
        (frontmatter: Record<string, unknown>) => {
          const property = this.environment.settings().addressProperty;
          if (Object.prototype.hasOwnProperty.call(frontmatter, property)) {
            throw new Error(`This note already has a ${property} property`);
          }
          frontmatter[property] = "";
        },
      );
      this.environment.indexRuntime.queue();
      this.environment.notify(`${this.title(file)} is now an unfiled card.`);
    } catch (error) {
      this.environment.notify(
        `Could not make this note a card: ${errorMessage(error)}`,
      );
    }
  }

  async createAndOpen(titleMode: NewCardTitleMode): Promise<void> {
    await this.runCreation(async (file) => {
      await this.open(file);
      this.environment.indexRuntime.queue();
    }, titleMode);
  }

  async createOnDesk(titleMode: NewCardTitleMode): Promise<void> {
    await this.environment.openDesk();
    await this.createOnDeskAt(titleMode);
  }

  async createAtDeskPosition(
    position: DeskPilePosition,
    titleMode: NewCardTitleMode = "default",
  ): Promise<void> {
    await this.createOnDeskAt(titleMode, position);
  }

  async insertLink(
    editor: Editor,
    context: MarkdownView | MarkdownFileInfo,
  ): Promise<void> {
    const chosen = await this.environment.promptForLink(this.linkSuggestions());
    if (chosen === null) {
      return;
    }
    const file = this.environment.index.fileAtPath(chosen.path);
    if (file === undefined) {
      this.environment.notify(
        "Could not insert the card link: the card no longer exists.",
      );
      return;
    }
    const link = generateFiledCardLink(
      this.environment.app,
      file,
      context.file?.path ?? "",
      chosen.address,
    );
    editor.focus();
    editor.replaceSelection(link);
  }

  async copyLink(card: FiledCard): Promise<void> {
    const sourcePath =
      this.environment.app.workspace.getActiveFile()?.path ?? "";
    const link = generateFiledCardLink(
      this.environment.app,
      card.file,
      sourcePath,
      card.address,
    );
    try {
      await this.environment.copyText(link);
      this.environment.notify(`Copied ${link}.`);
    } catch (error) {
      this.environment.notify(
        `Could not copy the card link: ${errorMessage(error)}`,
      );
    }
  }

  private async createOnDeskAt(
    titleMode: NewCardTitleMode,
    position?: DeskPilePosition,
  ): Promise<void> {
    await this.runCreation(async (file) => {
      const property = this.environment.settings().addressProperty;
      await this.environment.cacheWaiter.waitFor(file, property, "");
      await this.environment.indexRuntime.refresh({
        reason: "index",
        ...(position === undefined
          ? {}
          : {
              afterReconcile: () => {
                this.environment.desk.placeUnfiledAtPosition(
                  file.path,
                  position,
                );
              },
            }),
      });
      this.environment.focusDeskCard(file.path);
    }, titleMode);
  }

  private async runCreation(
    complete: (file: TFile) => Promise<void>,
    titleMode: NewCardTitleMode,
  ): Promise<void> {
    try {
      const file = await this.createFile(titleMode);
      if (file !== null) {
        await complete(file);
      }
    } catch (error) {
      this.environment.notify(`Could not create a card: ${errorMessage(error)}`);
    }
  }

  /** Create the note only; callers choose opening or Desk placement explicitly. */
  private async createFile(
    titleMode: NewCardTitleMode,
    sourcePath = this.environment.activeCreationSourcePath(),
  ): Promise<TFile | null> {
    const settings = this.environment.settings();
    const timestamp = newNoteBasename("", this.environment.timestamp());
    const title = await resolveNewCardTitle(
      titleMode,
      () => this.environment.promptForTitle(
        newCardTitlePlaceholder(timestamp, settings.titleSource),
      ),
    );
    if (title === null) {
      return null;
    }
    const basename = newCardBasename(title, timestamp, settings.titleSource);
    const parent = this.newCardParent(sourcePath);
    const prefix = parent.isRoot() ? "" : `${parent.path}/`;
    let sequence = 0;
    let path: string;

    do {
      const suffix = sequence === 0 ? "" : ` ${sequence}`;
      path = this.environment.normalizePath(
        `${prefix}${basename}${suffix}.md`,
      );
      sequence += 1;
    } while (this.environment.app.vault.getAbstractFileByPath(path) !== null);

    const properties: Record<string, string> = {
      [settings.addressProperty]: "",
    };
    const frontmatterTitle = newCardFrontmatterTitle(
      title,
      settings.titleSource,
    );
    if (frontmatterTitle !== null) {
      properties[settings.titleProperty] = frontmatterTitle;
    }
    const frontmatter = this.environment.serializeProperties(properties);
    return this.environment.app.vault.create(
      path,
      `---\n${frontmatter}---\n\n`,
    );
  }

  private newCardParent(sourcePath: string | undefined): TFolder {
    const path = this.environment.settings().newCardFolder;
    if (path === "") {
      return this.environment.app.fileManager.getNewFileParent(sourcePath ?? "");
    }
    const folder = this.environment.app.vault.getFolderByPath(path);
    if (folder === null) {
      throw new Error(
        `The configured new-card folder “${path}” is not a folder in this vault`,
      );
    }
    return folder;
  }

  private linkSuggestions(): readonly CardLinkSuggestion[] {
    return buildCardLinkSuggestions(
      this.environment.index.snapshot.filed.map((card) => ({
        path: card.path,
        address: card.address,
        title: this.title(card.file),
      })),
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
