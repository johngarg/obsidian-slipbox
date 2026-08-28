import type { TFile } from "obsidian";

import { normalizeAddressInput } from "./address-order.js";
import {
  duplicateFilingMessage,
  filingPreviewGuidance,
  type FilingPreview,
} from "./filing-preview.js";
import {
  pathIsAtOrBelow,
  renamePathReference,
} from "./path-reference.js";

export type FilingSourceSurface = "desk" | "viewed";
export type FilingSessionPhase = "editing" | "confirming";

export type FilingResolution =
  | { readonly kind: "missing" }
  | { readonly kind: "not-unfiled" }
  | {
      readonly kind: "ready";
      readonly preview: FilingPreview;
      readonly duplicatePaths: readonly string[];
      readonly duplicatesBlocked: boolean;
    };

export interface FilingSessionEnvironment {
  readonly resolve: (
    file: TFile,
    sourcePath: string,
    address: string,
  ) => FilingResolution;
}

export interface FilingSessionSnapshot {
  readonly phase: FilingSessionPhase;
  readonly sourcePath: string;
  readonly sourceSurface: FilingSourceSurface;
  readonly value: string;
  readonly address: string | null;
  readonly preview: FilingPreview | null;
  readonly message: string;
  readonly invalid: boolean;
  readonly duplicatePaths: readonly string[];
  readonly guidance: string;
}

export interface FilingConfirmationRequest {
  readonly file: TFile;
  readonly sourcePath: string;
  readonly sourceSurface: FilingSourceSurface;
  readonly preview: FilingPreview;
}

export interface FilingCancellation {
  readonly sourcePath: string;
  readonly sourceSurface: FilingSourceSurface;
}

interface ActiveFilingSession {
  readonly file: TFile;
  sourcePath: string;
  readonly sourceSurface: FilingSourceSurface;
  value: string;
  phase: FilingSessionPhase;
  preview: FilingPreview | null;
  message: string;
  duplicatePaths: readonly string[];
  duplicatesBlocked: boolean;
  sourceValidity: "ready" | "missing" | "not-unfiled" | "deleted";
}

const INITIAL_MESSAGE = "Enter an address.";

/**
 * Owns one transient filing lifecycle without performing DOM work or writes.
 * The source object is retained so a same-path replacement cannot take over an
 * existing session.
 */
export class FilingSession {
  private active: ActiveFilingSession | null = null;

  constructor(private readonly environment: FilingSessionEnvironment) {}

  get snapshot(): FilingSessionSnapshot | null {
    const active = this.active;
    if (active === null) {
      return null;
    }
    return {
      phase: active.phase,
      sourcePath: active.sourcePath,
      sourceSurface: active.sourceSurface,
      value: active.value,
      address: active.preview?.address ?? null,
      preview: active.preview,
      message: active.duplicatesBlocked && active.preview !== null
        ? duplicateFilingMessage(
            active.preview.address,
            active.duplicatePaths.length,
          )
        : active.message,
      invalid: active.duplicatesBlocked ||
        (active.preview === null && active.message !== INITIAL_MESSAGE),
      duplicatePaths: active.duplicatePaths,
      guidance: filingPreviewGuidance(active.preview),
    };
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  get canConfirm(): boolean {
    return this.active?.phase === "editing" &&
      this.active.preview !== null &&
      !this.active.duplicatesBlocked;
  }

  get canCancel(): boolean {
    return this.active?.phase === "editing";
  }

  start(
    file: TFile,
    sourceSurface: FilingSourceSurface,
    value: string,
  ): void {
    this.active = {
      file,
      sourcePath: file.path,
      sourceSurface,
      value,
      phase: "editing",
      preview: null,
      message: INITIAL_MESSAGE,
      duplicatePaths: [],
      duplicatesBlocked: false,
      sourceValidity: "ready",
    };
    this.refresh();
  }

  refresh(): void {
    const active = this.active;
    if (active === null || active.phase === "confirming") {
      return;
    }
    if (active.sourceValidity === "deleted") {
      this.markUnavailable("The source card no longer exists.");
      return;
    }

    const validation = normalizeAddressInput(active.value);
    const resolution = this.environment.resolve(
      active.file,
      active.sourcePath,
      validation.valid ? validation.address : "",
    );
    if (resolution.kind === "missing") {
      active.sourceValidity = "missing";
      this.markUnavailable("The source card no longer exists.");
      return;
    }
    if (resolution.kind === "not-unfiled") {
      active.sourceValidity = "not-unfiled";
      this.markUnavailable("The source card is no longer unfiled.");
      return;
    }
    active.sourceValidity = "ready";
    if (!validation.valid) {
      this.markUnavailable(validation.message);
      return;
    }
    active.preview = resolution.preview;
    active.message = "";
    active.duplicatePaths = resolution.duplicatePaths;
    active.duplicatesBlocked = resolution.duplicatesBlocked;
  }

  updateInput(value: string): boolean {
    const active = this.active;
    if (active === null || active.phase === "confirming") {
      return false;
    }
    active.value = value;
    this.refresh();
    return true;
  }

  renamePath(oldPath: string, newPath: string): void {
    const active = this.active;
    if (active === null) {
      return;
    }
    active.sourcePath = renamePathReference(
      active.sourcePath,
      oldPath,
      newPath,
    );
    this.refresh();
  }

  deletePath(deletedPath: string): void {
    const active = this.active;
    if (
      active === null ||
      !pathIsAtOrBelow(active.sourcePath, deletedPath)
    ) {
      return;
    }
    active.sourceValidity = "deleted";
    this.markUnavailable("The source card no longer exists.");
  }

  beginConfirmation(): FilingConfirmationRequest | null {
    const active = this.active;
    if (active === null || active.phase !== "editing") {
      return null;
    }
    this.refresh();
    if (!this.canConfirm || active.preview === null) {
      return null;
    }
    active.phase = "confirming";
    return {
      file: active.file,
      sourcePath: active.sourcePath,
      sourceSurface: active.sourceSurface,
      preview: active.preview,
    };
  }

  finishConfirmation(): void {
    if (this.active?.phase !== "confirming") {
      return;
    }
    this.active.phase = "editing";
    this.refresh();
  }

  complete(): void {
    this.active = null;
  }

  cancel(): FilingCancellation | null {
    const active = this.active;
    if (active === null || active.phase === "confirming") {
      return null;
    }
    const cancellation = {
      sourcePath: active.sourcePath,
      sourceSurface: active.sourceSurface,
    };
    this.active = null;
    return cancellation;
  }

  reset(): void {
    this.active = null;
  }

  private markUnavailable(message: string): void {
    if (this.active === null) {
      return;
    }
    this.active.preview = null;
    this.active.message = message;
    this.active.duplicatePaths = [];
    this.active.duplicatesBlocked = false;
  }
}
