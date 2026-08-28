import type { TFile } from "obsidian";

import type { CardIndexRuntime } from "./card-index-runtime.js";
import type { VaultCardIndex } from "./card-index.js";
import {
  EMPTY_DESK,
  clearFiledCardsFromDesk,
  clearFiledCardsFromPile,
  deskContains,
  placeUnfiledCardAtPosition,
  reconcileDesk,
  removeDeskPath,
  renameDeskPath,
  setPileExpanded,
  toggleFiledCard,
  type DeskCardCandidate,
  type DeskPilePosition,
  type DeskState,
} from "./desk-state.js";

export interface DeskServiceEnvironment {
  readonly indexRuntime: CardIndexRuntime;
  refreshViews(): Promise<void>;
  notify(message: string): void;
}

/** Own the session-only Desk state and every mutation of it. */
export class DeskService {
  private current: DeskState = EMPTY_DESK;
  private pileSequence = 0;

  constructor(
    private readonly environment: DeskServiceEnvironment,
  ) {}

  get snapshot(): DeskState {
    return this.current;
  }

  createPileId(): string {
    this.pileSequence += 1;
    return `desk-pile-${this.pileSequence}`;
  }

  async replace(next: DeskState): Promise<void> {
    this.current = next;
    await this.environment.refreshViews();
  }

  async toggleFile(file: TFile): Promise<void> {
    let available = false;
    await this.environment.indexRuntime.refresh({
      afterReconcile: () => {
        available = this.environment.indexRuntime.index.filedByFile(file) !== undefined;
        if (available) {
          this.current = toggleFiledCard(
            this.current,
            { cardRef: file.path, kind: "filed" },
            this.createPileId(),
          );
        }
      },
    });
    if (!available) {
      this.environment.notify("Only an available filed card can be pulled out.");
    }
  }

  async putFile(file: TFile): Promise<boolean> {
    if (this.contains(file.path)) {
      return true;
    }
    let available = false;
    await this.environment.indexRuntime.refresh({
      afterReconcile: () => {
        available = this.environment.indexRuntime.index.filedByFile(file) !== undefined;
        if (available) {
          this.current = toggleFiledCard(
            this.current,
            { cardRef: file.path, kind: "filed" },
            this.createPileId(),
          );
        }
      },
    });
    if (!available) {
      this.environment.notify("Only an available filed card can be put on the Desk.");
      return false;
    }
    return this.contains(file.path);
  }

  contains(path: string): boolean {
    return deskContains(this.current, path);
  }

  async setPileExpanded(pileId: string, expanded: boolean): Promise<void> {
    this.current = setPileExpanded(this.current, pileId, expanded);
    await this.environment.refreshViews();
  }

  async clearPile(pileId: string): Promise<void> {
    this.current = clearFiledCardsFromPile(this.current, pileId);
    await this.environment.refreshViews();
  }

  async clearFiledCards(): Promise<void> {
    this.current = clearFiledCardsFromDesk(this.current);
    await this.environment.refreshViews();
  }

  removePath(path: string): void {
    this.current = removeDeskPath(this.current, path);
  }

  renamePath(oldPath: string, newPath: string): void {
    this.current = renameDeskPath(this.current, oldPath, newPath);
  }

  placeUnfiledAtPosition(path: string, position: DeskPilePosition): void {
    this.current = placeUnfiledCardAtPosition(
      this.current,
      path,
      this.createPileId(),
      position,
    );
  }

  reconcile(snapshot: VaultCardIndex): void {
    const candidates: DeskCardCandidate[] = [
      ...snapshot.unfiled.map((file) => ({
        cardRef: file.path,
        kind: "unfiled" as const,
        modifiedTime: file.stat.mtime,
      })),
      ...snapshot.filed.map((card) => ({
        cardRef: card.path,
        kind: "filed" as const,
        modifiedTime: card.file.stat.mtime,
      })),
    ];
    this.current = reconcileDesk(this.current, candidates, this.createPileId());
  }

  pathsInPile(pileId: string): readonly string[] {
    return this.current.piles
      .find((pile) => pile.id === pileId)
      ?.cards.map((card) => card.cardRef) ?? [];
  }
}
