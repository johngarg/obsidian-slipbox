import type { App, TFile } from "obsidian";
import { TFile as ObsidianFile } from "obsidian";

import {
  buildFiledCardLookups,
  cardMetadataRecord,
  indexCardMetadata,
  type CardMetadataIndex,
  type FiledCardRecord,
} from "./card-metadata.js";
import { indexFiledBacklinks } from "./backlinks.js";
import type { DeckOrdering } from "./address-order.js";

export interface FiledCard extends FiledCardRecord {
  readonly file: TFile;
}

export interface VaultCardIndex extends CardMetadataIndex {
  readonly filed: readonly FiledCard[];
  readonly unfiled: readonly TFile[];
  readonly backlinksByTargetPath: ReadonlyMap<string, readonly FiledCard[]>;
}

const EMPTY_INDEX: VaultCardIndex = {
  filed: [],
  unfiled: [],
  unfiledPaths: [],
  issues: [],
  backlinksByTargetPath: new Map(),
};

const NO_BACKLINKS: readonly FiledCard[] = [];
const NO_FILED_CARDS: readonly FiledCard[] = [];

/** A lightweight, cache-backed index over all Markdown files in the vault. */
export class CardIndex {
  private current: VaultCardIndex = EMPTY_INDEX;
  private filedByPathMap = new Map<string, FiledCard>();
  private filedIndexByPathMap = new Map<string, number>();
  private filedByAddressMap = new Map<string, readonly FiledCard[]>();

  constructor(
    private readonly app: App,
    private addressProperty = "zettel-id",
    private ordering: DeckOrdering = "natural",
  ) {}

  get snapshot(): VaultCardIndex {
    return this.current;
  }

  get deckOrdering(): DeckOrdering {
    return this.ordering;
  }

  setAddressProperty(addressProperty: string): void {
    this.addressProperty = addressProperty;
  }

  setDeckOrdering(ordering: DeckOrdering): void {
    this.ordering = ordering;
  }

  refresh(): VaultCardIndex {
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const records = markdownFiles.map((file) => cardMetadataRecord(
      file.path,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.addressProperty,
    ));

    const indexed = indexCardMetadata(
      records,
      this.addressProperty,
      this.ordering,
    );
    const filesByPath = new Map(markdownFiles.map((file) => [file.path, file]));
    const filed: FiledCard[] = [];

    for (const record of indexed.filed) {
      const file = filesByPath.get(record.path);
      if (file !== undefined) {
        filed.push({ ...record, file });
      }
    }

    const unfiled = indexed.unfiledPaths
      .map((path) => filesByPath.get(path))
      .filter((file): file is TFile => file !== undefined);
    const backlinksByTargetPath = indexFiledBacklinks(
      filed,
      this.app.metadataCache.resolvedLinks,
    );

    const lookups = buildFiledCardLookups(filed);
    this.filedByPathMap = new Map(lookups.byPath);
    this.filedIndexByPathMap = new Map(lookups.indexByPath);
    this.filedByAddressMap = new Map(lookups.byAddress);
    this.current = { ...indexed, filed, unfiled, backlinksByTargetPath };
    return this.current;
  }

  filedByPath(path: string): FiledCard | undefined {
    return this.filedByPathMap.get(path);
  }

  filedByFile(file: TFile): FiledCard | undefined {
    return this.filedByPath(file.path);
  }

  filedAtAddress(address: string): readonly FiledCard[] {
    return this.filedByAddressMap.get(address) ?? NO_FILED_CARDS;
  }

  firstFiledAtAddress(address: string): FiledCard | undefined {
    return this.filedAtAddress(address)[0];
  }

  filedIndexForPath(path: string | null): number {
    return path === null ? -1 : this.filedIndexByPathMap.get(path) ?? -1;
  }

  fileAtPath(path: string): TFile | undefined {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof ObsidianFile ? file : undefined;
  }

  backlinksForPath(path: string): readonly FiledCard[] {
    return this.current.backlinksByTargetPath.get(path) ?? NO_BACKLINKS;
  }

  /** Read only the note body, excluding the YAML frontmatter block. */
  async readBody(file: TFile): Promise<string> {
    const source = await this.app.vault.cachedRead(file);
    const position = this.app.metadataCache.getFileCache(file)?.frontmatterPosition;
    return position === undefined ? source : source.slice(position.end.offset);
  }
}
