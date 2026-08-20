import type { App, TFile } from "obsidian";
import { TFile as ObsidianFile } from "obsidian";

import {
  buildFiledZettelLookups,
  indexZettelMetadata,
  zettelMetadataRecord,
  type FiledZettelRecord,
  type ZettelMetadataIndex,
} from "./zettel-metadata.js";
import { indexFiledBacklinks } from "./backlinks.js";

export interface FiledZettel extends FiledZettelRecord {
  readonly file: TFile;
}

export interface VaultZettelIndex extends ZettelMetadataIndex {
  readonly filed: readonly FiledZettel[];
  readonly unfiled: readonly TFile[];
  readonly backlinksByTargetPath: ReadonlyMap<
    string,
    readonly FiledZettel[]
  >;
}

const EMPTY_INDEX: VaultZettelIndex = {
  filed: [],
  unfiled: [],
  unfiledPaths: [],
  issues: [],
  allValidIds: [],
  backlinksByTargetPath: new Map(),
};

const NO_BACKLINKS: readonly FiledZettel[] = [];
const NO_FILED_CARDS: readonly FiledZettel[] = [];

/** A lightweight, cache-backed index over all Markdown files in the vault. */
export class ZettelIndex {
  private current: VaultZettelIndex = EMPTY_INDEX;
  private filedByPathMap = new Map<string, FiledZettel>();
  private filedIndexByPathMap = new Map<string, number>();
  private filedByAddressMap = new Map<string, readonly FiledZettel[]>();

  constructor(
    private readonly app: App,
    private addressProperty = "zettel-id",
  ) {}

  get snapshot(): VaultZettelIndex {
    return this.current;
  }

  setAddressProperty(addressProperty: string): void {
    this.addressProperty = addressProperty;
  }

  refresh(): VaultZettelIndex {
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const records = markdownFiles.map((file) => zettelMetadataRecord(
      file.path,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.addressProperty,
    ));

    const indexed = indexZettelMetadata(records, this.addressProperty);
    const filesByPath = new Map(markdownFiles.map((file) => [file.path, file]));
    const filed: FiledZettel[] = [];

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

    const lookups = buildFiledZettelLookups(filed);
    this.filedByPathMap = new Map(lookups.byPath);
    this.filedIndexByPathMap = new Map(lookups.indexByPath);
    this.filedByAddressMap = new Map(lookups.byAddress);
    this.current = { ...indexed, filed, unfiled, backlinksByTargetPath };
    return this.current;
  }

  filedByPath(path: string): FiledZettel | undefined {
    return this.filedByPathMap.get(path);
  }

  filedByFile(file: TFile): FiledZettel | undefined {
    return this.filedByPath(file.path);
  }

  filedAtAddress(id: string): readonly FiledZettel[] {
    return this.filedByAddressMap.get(id) ?? NO_FILED_CARDS;
  }

  firstFiledAtAddress(id: string): FiledZettel | undefined {
    return this.filedAtAddress(id)[0];
  }

  filedIndexForPath(path: string | null): number {
    return path === null ? -1 : this.filedIndexByPathMap.get(path) ?? -1;
  }

  fileAtPath(path: string): TFile | undefined {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof ObsidianFile ? file : undefined;
  }

  backlinksForPath(path: string): readonly FiledZettel[] {
    return this.current.backlinksByTargetPath.get(path) ?? NO_BACKLINKS;
  }

  /** Read only the note body, excluding the YAML frontmatter block. */
  async readBody(file: TFile): Promise<string> {
    const source = await this.app.vault.cachedRead(file);
    const position = this.app.metadataCache.getFileCache(file)?.frontmatterPosition;
    return position === undefined ? source : source.slice(position.end.offset);
  }
}
