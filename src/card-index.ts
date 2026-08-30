import type { App, TFile } from "obsidian";
import { getFrontMatterInfo, getLinkpath } from "obsidian";

import {
  buildFiledCardLookups,
  cardMetadataRecord,
  indexCardMetadata,
  type CardMetadataIndex,
  type FiledCardRecord,
} from "./card-metadata.js";
import { indexFiledBacklinks } from "./backlinks.js";
import {
  EMPTY_EXPLICIT_BRANCH_INDEX,
  indexExplicitBranches,
  type ExplicitBranch,
  type ExplicitBranchIndex,
} from "./branch-links.js";
import {
  EMPTY_INFERRED_STRUCTURE,
  buildInferredStructure,
  type InferredStructureIndex,
} from "./inferred-structure.js";
import { resolveFiledCardLink } from "./card-links.js";
import type { CardIndexConfig } from "./card-index-config.js";

export interface FiledCard extends FiledCardRecord {
  readonly file: TFile;
}

export interface VaultCardIndex extends CardMetadataIndex {
  readonly filed: readonly FiledCard[];
  readonly unfiled: readonly TFile[];
  readonly backlinksByTargetPath: ReadonlyMap<string, readonly FiledCard[]>;
  readonly explicitBranches: ExplicitBranchIndex;
  readonly inferredStructure: InferredStructureIndex;
}

const EMPTY_INDEX: VaultCardIndex = {
  filed: [],
  unfiled: [],
  unfiledPaths: [],
  issues: [],
  backlinksByTargetPath: new Map(),
  explicitBranches: EMPTY_EXPLICIT_BRANCH_INDEX,
  inferredStructure: EMPTY_INFERRED_STRUCTURE,
};

const NO_BACKLINKS: readonly FiledCard[] = [];
const NO_FILED_CARDS: readonly FiledCard[] = [];
const NO_BRANCHES: readonly ExplicitBranch[] = [];

/** A lightweight, cache-backed index over all Markdown files in the vault. */
export class CardIndex {
  private current: VaultCardIndex = EMPTY_INDEX;
  private filedByPathMap = new Map<string, FiledCard>();
  private filedIndexByPathMap = new Map<string, number>();
  private filedByAddressMap = new Map<string, readonly FiledCard[]>();

  constructor(
    private readonly app: App,
    private config: CardIndexConfig,
  ) {}

  get snapshot(): VaultCardIndex {
    return this.current;
  }

  configure(config: CardIndexConfig): void {
    // Replace every option together so a refresh cannot see a partial update.
    this.config = config;
  }

  /** Build a complete snapshot without changing the shared published index. */
  buildSnapshot(): VaultCardIndex {
    const config = this.config;
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const records = markdownFiles.map((file) => cardMetadataRecord(
      file.path,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      config.addressProperty,
    ));

    const indexed = indexCardMetadata(
      records,
      config.addressProperty,
      config.ordering,
      config.duplicatePolicy,
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
    const filedByPath = new Map(lookups.byPath);
    const filedByAddress = new Map(lookups.byAddress);
    const explicitBranches = config.explicitBranchLinks
      ? indexExplicitBranches(
        filed.map((card, deckIndex) => ({
          path: card.path,
          address: card.address,
          deckIndex,
          links: this.app.metadataCache.getFileCache(card.file)?.links ?? [],
        })),
        {
          enabled: true,
          resolveTargetPath: (link, sourcePath) => resolveFiledCardLink(
            getLinkpath(link),
            sourcePath,
            {
              resolveFile: (linkPath, path) =>
                this.app.metadataCache.getFirstLinkpathDest(linkPath, path),
              filedPathForFile: (file) => filedByPath.get(file.path)?.path,
              firstFiledPathAtAddress: (address) =>
                filedByAddress.get(address)?.[0]?.path,
            },
          )?.path,
        },
      )
      : EMPTY_EXPLICIT_BRANCH_INDEX;
    const inferredStructure = config.inferAddressBranches
      ? buildInferredStructure(filed, config.ordering)
      : EMPTY_INFERRED_STRUCTURE;
    return {
      ...indexed,
      filed,
      unfiled,
      backlinksByTargetPath,
      explicitBranches,
      inferredStructure,
    };
  }

  /** Replace the shared query snapshot as one atomic publication step. */
  publish(snapshot: VaultCardIndex): void {
    const lookups = buildFiledCardLookups(snapshot.filed);
    this.filedByPathMap = new Map(lookups.byPath);
    this.filedIndexByPathMap = new Map(lookups.indexByPath);
    this.filedByAddressMap = new Map(lookups.byAddress);
    this.current = snapshot;
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
    return this.app.vault.getFileByPath(path) ?? undefined;
  }

  backlinksForPath(path: string): readonly FiledCard[] {
    return this.current.backlinksByTargetPath.get(path) ?? NO_BACKLINKS;
  }

  outgoingBranchesForPath(path: string): readonly ExplicitBranch[] {
    return this.current.explicitBranches.outgoingBySourcePath.get(path) ?? NO_BRANCHES;
  }

  incomingBranchesForPath(path: string): readonly ExplicitBranch[] {
    return this.current.explicitBranches.incomingByTargetPath.get(path) ?? NO_BRANCHES;
  }

  /** Read only the note body, excluding the YAML frontmatter block. */
  async readBody(file: TFile): Promise<string> {
    const source = await this.app.vault.cachedRead(file);
    return source.slice(getFrontMatterInfo(source).contentStart);
  }
}
