import type { App, TFile } from "obsidian";

import { validateAddress } from "./address-order.js";
import type { CardIndex } from "./card-index.js";
import type { CardIndexRuntime } from "./card-index-runtime.js";
import type { CardService } from "./card-service.js";
import type { DeskService } from "./desk-service.js";
import {
  createFilingPreview,
  duplicateFilingMessage,
  filingPlacementMatches,
  type FilingPreview,
} from "./filing-preview.js";
import type { MetadataCacheWaiter } from "./metadata-cache-waiter.js";
import type { SlipboxSettings } from "./settings.js";

export type FileCardResult =
  | { readonly status: "filed" }
  | { readonly status: "preview-changed" }
  | { readonly status: "failed" };

export interface FilingServiceEnvironment {
  readonly app: App;
  readonly index: CardIndex;
  readonly indexRuntime: CardIndexRuntime;
  readonly desk: DeskService;
  readonly cards: CardService;
  readonly cacheWaiter: MetadataCacheWaiter<TFile>;
  settings(): SlipboxSettings;
  notify(message: string): void;
}

export class FilingService {
  constructor(private readonly environment: FilingServiceEnvironment) {}

  preview(file: TFile, address: string): FilingPreview {
    const settings = this.environment.settings();
    return createFilingPreview(
      this.environment.index.snapshot.filed,
      { path: file.path, address },
      this.environment.cards.title(file),
      settings.deckOrdering,
    );
  }

  duplicateOccupants(address: string): readonly string[] {
    return this.duplicatePaths(
      address,
      this.environment.index.snapshot.filed,
    );
  }

  async file(file: TFile, preview: FilingPreview): Promise<FileCardResult> {
    return this.environment.indexRuntime.suppressQueuedRefresh(async () => {
      let placementChanged = false;
      let duplicateCount = 0;
      try {
        this.assertSource(file, preview.sourcePath);
        if (!this.environment.cards.isUnfiled(file)) {
          throw new Error("The source card is no longer unfiled");
        }

        let snapshot = this.environment.index.buildSnapshot();
        if (!this.previewMatches(file, preview, snapshot.filed)) {
          return { status: "preview-changed" };
        }
        duplicateCount = this.duplicatePaths(
          preview.address,
          snapshot.filed,
        ).length;
        if (duplicateCount > 0) {
          this.environment.notify(
            duplicateFilingMessage(preview.address, duplicateCount),
          );
          return { status: "failed" };
        }

        await this.environment.app.fileManager.processFrontMatter(
          file,
          (frontmatter: Record<string, unknown>) => {
            const property = this.environment.settings().addressProperty;
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

            snapshot = this.environment.index.buildSnapshot();
            this.assertSource(file, preview.sourcePath);
            duplicateCount = this.duplicatePaths(
              preview.address,
              snapshot.filed,
            ).length;
            if (duplicateCount > 0) {
              throw new Error("A duplicate address appeared during filing");
            }
            if (!this.previewMatches(file, preview, snapshot.filed)) {
              placementChanged = true;
              throw new Error("The previewed filing position changed");
            }
            frontmatter[property] = preview.address;
          },
        );

        const settings = this.environment.settings();
        const cacheReady = await this.environment.cacheWaiter.waitFor(
          file,
          settings.addressProperty,
          preview.address,
        );
        this.environment.desk.removePath(file.path);
        this.environment.notify(
          cacheReady
            ? `Filed ${this.environment.cards.title(file)} as ${preview.address}.`
            : `Filed ${this.environment.cards.title(file)} as ${preview.address}. Slipbox Desk will refresh when Obsidian finishes indexing it.`,
        );
        return { status: "filed" };
      } catch (error) {
        if (placementChanged) {
          return { status: "preview-changed" };
        }
        if (duplicateCount > 0) {
          this.environment.notify(
            duplicateFilingMessage(preview.address, duplicateCount),
          );
          return { status: "failed" };
        }
        this.environment.notify(`Could not file the card: ${errorMessage(error)}`);
        return { status: "failed" };
      }
    });
  }

  private duplicatePaths(
    address: string,
    filed: CardIndex["snapshot"]["filed"],
  ): readonly string[] {
    if (this.environment.settings().duplicateAddresses !== "problem") {
      return [];
    }
    return filed
      .filter((card) => card.address === address)
      .map((card) => card.path);
  }

  private previewMatches(
    file: TFile,
    preview: FilingPreview,
    filed: CardIndex["snapshot"]["filed"],
  ): boolean {
    const settings = this.environment.settings();
    if (
      preview.ordering !== settings.deckOrdering ||
      !validateAddress(preview.address).valid
    ) {
      return false;
    }
    return filingPlacementMatches(
      filed,
      { path: file.path, address: preview.address },
      settings.deckOrdering,
      preview,
    );
  }

  private assertSource(file: TFile, expectedPath: string): void {
    if (
      file.path !== expectedPath ||
      this.environment.app.vault.getAbstractFileByPath(expectedPath) !== file
    ) {
      throw new Error("The source path no longer identifies the intended card");
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
