import {
  pathIsAtOrBelow,
  renamePathReference,
} from "./path-reference.js";

export type ViewedCardReturnTarget =
  | { readonly surface: "deck" }
  | { readonly surface: "desk"; readonly pileId: string };

export interface ViewedCardSnapshot {
  readonly path: string;
  readonly returnTarget: ViewedCardReturnTarget;
  readonly x: number;
  readonly y: number;
  readonly scrollTop: number;
}

export interface ViewedCardPosition {
  readonly path: string;
  readonly x: number;
  readonly y: number;
}

export interface ViewedCardAvailability {
  readonly deckAvailable: boolean;
  readonly deskPileId?: string;
}

export interface ViewedCardClosure {
  readonly path: string;
  readonly returnTarget: ViewedCardReturnTarget | null;
}

export interface ViewedCardBounds {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly margin?: number;
}

/** Owns one viewed-card presentation without rendering or host effects. */
export class ViewedCardSession {
  private active: ViewedCardSnapshot | null = null;

  get snapshot(): ViewedCardSnapshot | null {
    return this.active;
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  isViewing(path: string): boolean {
    return this.active?.path === path;
  }

  open(path: string, returnTarget: ViewedCardReturnTarget): boolean {
    if (this.isViewing(path)) {
      return false;
    }
    this.active = { path, returnTarget, x: 0, y: 0, scrollTop: 0 };
    return true;
  }

  retarget(returnTarget: ViewedCardReturnTarget): boolean {
    const active = this.active;
    if (active === null || sameReturnTarget(active.returnTarget, returnTarget)) {
      return false;
    }
    this.active = { ...active, returnTarget };
    return true;
  }

  close(availability: ViewedCardAvailability): ViewedCardClosure | null {
    const active = this.active;
    if (active === null) {
      return null;
    }
    this.active = null;
    return {
      path: active.path,
      returnTarget: resolveReturnTarget(active.returnTarget, availability),
    };
  }

  remove(path: string): ViewedCardSnapshot | null {
    const active = this.active;
    if (active === null || active.path !== path) {
      return null;
    }
    this.active = null;
    return active;
  }

  renamePath(oldPath: string, newPath: string): string | null {
    const active = this.active;
    if (active === null) {
      return null;
    }
    const renamedPath = renamePathReference(active.path, oldPath, newPath);
    if (renamedPath === active.path) {
      return null;
    }
    this.active = { ...active, path: renamedPath };
    return renamedPath;
  }

  deletePath(
    deletedPath: string,
    editingPath: string | null,
  ): ViewedCardSnapshot | null {
    const active = this.active;
    if (
      active === null ||
      !pathIsAtOrBelow(active.path, deletedPath) ||
      active.path === editingPath
    ) {
      return null;
    }
    this.active = null;
    return active;
  }

  reconcileAvailability(available: boolean): ViewedCardSnapshot | null {
    const active = this.active;
    if (active === null || available) {
      return null;
    }
    this.active = null;
    return active;
  }

  setScrollTop(path: string, scrollTop: number): boolean {
    const active = this.active;
    if (active === null || active.path !== path) {
      return false;
    }
    const next = Math.max(0, scrollTop);
    if (next === active.scrollTop) {
      return false;
    }
    this.active = { ...active, scrollTop: next };
    return true;
  }

  capturePosition(): ViewedCardPosition | null {
    const active = this.active;
    return active === null
      ? null
      : { path: active.path, x: active.x, y: active.y };
  }

  moveFrom(
    origin: ViewedCardPosition,
    deltaX: number,
    deltaY: number,
    bounds: ViewedCardBounds,
  ): boolean {
    return this.moveTo(
      origin.path,
      origin.x + deltaX,
      origin.y + deltaY,
      bounds,
    );
  }

  restorePosition(origin: ViewedCardPosition): boolean {
    const active = this.active;
    if (active === null || active.path !== origin.path) {
      return false;
    }
    if (active.x === origin.x && active.y === origin.y) {
      return false;
    }
    this.active = { ...active, x: origin.x, y: origin.y };
    return true;
  }

  constrain(bounds: ViewedCardBounds): boolean {
    const active = this.active;
    return active === null
      ? false
      : this.moveTo(active.path, active.x, active.y, bounds);
  }

  reset(): void {
    this.active = null;
  }

  private moveTo(
    path: string,
    x: number,
    y: number,
    bounds: ViewedCardBounds,
  ): boolean {
    const active = this.active;
    if (active === null || active.path !== path) {
      return false;
    }
    const margin = Math.max(0, bounds.margin ?? 16);
    const maxX = Math.max(
      0,
      (Math.max(0, bounds.stageWidth) - Math.max(0, bounds.cardWidth)) / 2 -
        margin,
    );
    const maxY = Math.max(
      0,
      (Math.max(0, bounds.stageHeight) - Math.max(0, bounds.cardHeight)) / 2 -
        margin,
    );
    const nextX = clamp(x, -maxX, maxX);
    const nextY = clamp(y, -maxY, maxY);
    if (nextX === active.x && nextY === active.y) {
      return false;
    }
    this.active = { ...active, x: nextX, y: nextY };
    return true;
  }
}

function resolveReturnTarget(
  original: ViewedCardReturnTarget,
  availability: ViewedCardAvailability,
): ViewedCardReturnTarget | null {
  if (original.surface === "deck") {
    if (availability.deckAvailable) {
      return original;
    }
    return availability.deskPileId === undefined
      ? null
      : { surface: "desk", pileId: availability.deskPileId };
  }
  if (availability.deskPileId !== undefined) {
    return { surface: "desk", pileId: availability.deskPileId };
  }
  return availability.deckAvailable ? { surface: "deck" } : null;
}

function sameReturnTarget(
  left: ViewedCardReturnTarget,
  right: ViewedCardReturnTarget,
): boolean {
  return left.surface === right.surface &&
    (left.surface === "deck" ||
      (right.surface === "desk" && left.pileId === right.pileId));
}

function clamp(value: number, minimum: number, maximum: number): number {
  const clamped = Math.min(maximum, Math.max(minimum, value));
  return clamped === 0 ? 0 : clamped;
}
