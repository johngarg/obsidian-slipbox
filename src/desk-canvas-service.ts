import type { TFile } from "obsidian";

import type { CanvasWriteResult } from "./canvas-bridge.js";
import { normalizeCanvasPath } from "./canvas-layout.js";

export interface DeskCanvasServiceEnvironment {
  pathsInPile(pileId: string): readonly string[];
  hasActiveCanvas(): boolean;
  canvasFiles(): readonly TFile[];
  chooseCanvas(files: readonly TFile[]): Promise<TFile | null>;
  promptPath(): Promise<string | null>;
  layoutActive(paths: readonly string[]): Promise<CanvasWriteResult>;
  layout(file: TFile, paths: readonly string[]): Promise<CanvasWriteResult>;
  create(path: string, paths: readonly string[]): Promise<CanvasWriteResult>;
  notify(message: string): void;
}

/** Adapt session Desk piles to Obsidian Canvas operations and feedback. */
export class DeskCanvasService {
  constructor(
    private readonly environment: DeskCanvasServiceEnvironment,
  ) {}

  hasActiveCanvas(): boolean {
    return this.environment.hasActiveCanvas();
  }

  async layoutPileOnActiveCanvas(pileId: string): Promise<void> {
    const paths = this.environment.pathsInPile(pileId);
    if (paths.length === 0) {
      return;
    }
    await this.write(
      () => this.environment.layoutActive(paths),
      "Could not lay out the pile",
    );
  }

  async layoutPileOnCanvas(pileId: string): Promise<void> {
    const paths = this.environment.pathsInPile(pileId);
    if (paths.length === 0) {
      return;
    }
    const canvases = this.environment.canvasFiles();
    if (canvases.length === 0) {
      this.environment.notify(
        "There are no Canvas files in this vault. Create one from the pile instead.",
      );
      return;
    }
    const file = await this.environment.chooseCanvas(canvases);
    if (file !== null) {
      await this.write(
        () => this.environment.layout(file, paths),
        "Could not lay out the pile",
      );
    }
  }

  async createCanvasFromPile(pileId: string): Promise<void> {
    const paths = this.environment.pathsInPile(pileId);
    if (paths.length === 0) {
      return;
    }
    const entered = await this.environment.promptPath();
    if (entered === null) {
      return;
    }
    const path = normalizeCanvasPath(entered);
    if (path === null) {
      this.environment.notify(
        "Enter a valid Canvas filename or vault-relative path.",
      );
      return;
    }
    await this.write(
      () => this.environment.create(path, paths),
      "Could not create the Canvas",
    );
  }

  private async write(
    operation: () => Promise<CanvasWriteResult>,
    failure: string,
  ): Promise<void> {
    try {
      this.reportWrite(await operation());
    } catch (error) {
      this.environment.notify(`${failure}: ${errorMessage(error)}`);
    }
  }

  private reportWrite(result: CanvasWriteResult): void {
    const added = result.addedPaths.length;
    const skipped = result.skippedPaths.length;
    const summary = added === 0
      ? `No cards added to ${result.file.basename}.`
      : `Added ${added} card${added === 1 ? "" : "s"} to ${result.file.basename}.`;
    const existing = skipped === 0
      ? ""
      : ` Skipped ${skipped} existing node${skipped === 1 ? "" : "s"}.`;
    this.environment.notify(`${summary}${existing}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
