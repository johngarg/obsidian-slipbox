import {
  TFile,
  TextFileView,
  normalizePath,
  type App,
} from "obsidian";

import {
  layoutFilesOnCanvas,
  parseCanvasDocument,
  serializeCanvasDocument,
  type CanvasLayoutResult,
} from "./canvas-layout.js";

export interface CanvasWriteResult extends CanvasLayoutResult {
  readonly file: TFile;
}

type CanvasTransform = (
  source: ReturnType<typeof parseCanvasDocument>,
) => CanvasLayoutResult;

/**
 * Safe Canvas integration using only public APIs.
 *
 * Open Canvases are changed through TextFileView's in-memory data and save
 * contract. Closed Canvases use Vault.process so an open view is never
 * overwritten behind its back. The public API exposes no Canvas viewport, so
 * callers currently supply or accept a deterministic origin.
 */
export class CanvasBridge {
  constructor(private readonly app: App) {}

  hasActiveCanvas(): boolean {
    return this.activeCanvasView() !== null;
  }

  canvasFiles(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((file) => file.extension === "canvas")
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async layoutFilesOnActiveCanvas(
    filePaths: readonly string[],
  ): Promise<CanvasWriteResult> {
    const view = this.activeCanvasView();
    if (view === null) {
      throw new Error("Open and focus a Canvas first");
    }
    const file = view.file;
    if (file === null || file.extension !== "canvas") {
      throw new Error("The active Canvas does not expose a Canvas file");
    }
    return this.updateOpenCanvas(view, file, (data) =>
      layoutFilesOnCanvas(data, filePaths));
  }

  async layoutFilesOnCanvas(
    file: TFile,
    filePaths: readonly string[],
  ): Promise<CanvasWriteResult> {
    return this.updateCanvas(file, (data) => layoutFilesOnCanvas(data, filePaths));
  }

  async createCanvas(
    path: string,
    filePaths: readonly string[],
  ): Promise<CanvasWriteResult> {
    return this.createCanvasWithLayout(path, (data) =>
      layoutFilesOnCanvas(data, filePaths));
  }

  private async createCanvasWithLayout(
    path: string,
    transform: CanvasTransform,
  ): Promise<CanvasWriteResult> {
    const normalized = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(normalized) !== null) {
      throw new Error(`A file already exists at ${normalized}`);
    }
    await this.ensureParentFolder(normalized);
    const result = transform({ nodes: [], edges: [] });
    const file = await this.app.vault.create(
      normalized,
      serializeCanvasDocument(result.data),
    );
    try {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      if (leaf.getViewState().type !== "canvas") {
        throw new Error("Enable Obsidian’s Canvas core plugin to open the new Canvas");
      }
    } catch (error) {
      throw new Error(
        `Created ${normalized}, but could not open it: ${errorMessage(error)}`,
      );
    }
    return { ...result, file };
  }

  private async updateCanvas(
    file: TFile,
    transform: CanvasTransform,
  ): Promise<CanvasWriteResult> {
    if (file.extension !== "canvas") {
      throw new Error(`${file.path} is not a Canvas file`);
    }
    const openView = await this.publicOpenCanvasView(file);
    if (openView !== null) {
      return this.updateOpenCanvas(openView, file, transform);
    }
    let result: CanvasLayoutResult | null = null;
    await this.app.vault.process(file, (source) => {
      result = transform(parseCanvasDocument(source));
      return serializeCanvasDocument(result.data);
    });
    if (result === null) {
      throw new Error(`Could not update ${file.path}`);
    }
    return { ...(result as CanvasLayoutResult), file };
  }

  private async updateOpenCanvas(
    view: TextFileView,
    file: TFile,
    transform: CanvasTransform,
  ): Promise<CanvasWriteResult> {
    const original = view.getViewData();
    const result = transform(parseCanvasDocument(original));
    if (result.addedPaths.length === 0) {
      return { ...result, file };
    }
    view.setViewData(serializeCanvasDocument(result.data), false);
    try {
      await view.save();
    } catch (error) {
      view.setViewData(original, false);
      throw error;
    }
    return { ...result, file };
  }

  private async publicOpenCanvasView(file: TFile): Promise<TextFileView | null> {
    for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
      await leaf.loadIfDeferred();
      if (leaf.view instanceof TextFileView && leaf.view.file?.path === file.path) {
        return leaf.view;
      }
    }
    return null;
  }

  private activeCanvasView(): TextFileView | null {
    const view = this.app.workspace.getActiveViewOfType(TextFileView);
    return view?.getViewType() === "canvas" ? view : null;
  }

  private async ensureParentFolder(path: string): Promise<void> {
    const segments = path.split("/").slice(0, -1);
    let current = "";
    for (const segment of segments) {
      current = current === "" ? segment : `${current}/${segment}`;
      if (this.app.vault.getAbstractFileByPath(current) === null) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
