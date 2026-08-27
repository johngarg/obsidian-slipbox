import {
  Component,
  ItemView,
  MarkdownRenderer,
  Notice,
  Platform,
  Scope,
  TFile,
  WorkspaceLeaf,
  getLinkpath,
} from "obsidian";

import type SlipboxPlugin from "./main.js";
import {
  activeIndexForViewport,
  adjacentBookmarkIndex,
  bookmarkEdgeTargets,
  cardMotionStyle,
  cardStackOrder,
  setCardMotionOpacity,
  setCardStackOrder,
  centredViewportPosition,
  clampViewportPosition,
  deckIndexByDelta,
  stationarySelectionOffset,
} from "./deck-motion.js";
import type { FiledCard } from "./card-index.js";
import {
  configureRenderedCardBody,
  shouldRenderAutomaticBacklinks,
} from "./card-display.js";
import {
  CardFooterManager,
  type CardFooterEnvironment,
} from "./card-footer.js";
import { UNFILED_ADDRESS_LABEL } from "./card-address.js";
import {
  CardSignatureManager,
  type CardSignatureBranch,
  type CardSignatureEnvironment,
} from "./card-signature.js";
import { showCardSignatureOverflowMenu } from "./card-signature-overflow.js";
import { InferredNavigationManager } from "./inferred-navigation.js";
import { cardHeaderTitle } from "./card-title.js";
import { setCardTooltip } from "./card-tooltip.js";
import {
  renderedLinkAction,
  resolveFiledCardLink,
} from "./card-links.js";
import {
  canRunDeckAction,
  deskToggleFocusTarget,
} from "./deck-actions.js";
import {
  renderCardHeaderButtons,
  type CardHeaderButtonController,
} from "./card-header-buttons.js";
import {
  DECK_ACTION_DEFINITIONS,
  formatKeyBinding,
  keyBindingFromKeyboardEvent,
  keyBindingSignature,
  type DeckAction,
  type DeckKeyBinding,
  type CardButtonSurface,
  type SlipboxActionDefinition,
} from "./settings.js";
import {
  arbitrateShortcut,
  classifyShortcutClaim,
  installEarlyShortcutObserver,
  ShortcutCommandTracker,
} from "./shortcut-arbitration.js";
import {
  TrayRenderer,
  type TrayFilingState,
} from "./tray-view.js";
import {
  collapseAllPiles,
  cardPosition,
  cyclePileTopCard,
  moveCardWithinPile,
  placeFiledCardInPileOrdinal,
  trayHasFiledCards,
} from "./tray-state.js";
import {
  pathIsAtOrBelow,
  renamePathReference,
} from "./path-reference.js";
import { normalizeAddressInput } from "./address-order.js";
import {
  duplicateFilingMessage,
  filingPreviewGuidance,
  filingPreviewFocusPath,
  initialFilingAddress,
  type FilingPreview,
} from "./filing-preview.js";
import {
  attachUnfiledAddressFiling,
  eventTargetsDeck,
  filingEditorMatchesSource,
  renderInlineFilingEditor,
  shouldSuspendDeckCommand,
  shouldSuspendDeckShortcut,
  updateInlineFilingEditor,
  type FilingSourceSurface,
  type InlineFilingEditorElements,
} from "./filing-editor.js";
import {
  buildDeckMapSectionMarkers,
  deckMapCoordinate,
  deckMapIndexAtOffset,
  sampleDeckMapIndices,
  visibleDeckMapSectionMarkers,
  type DeckMapSectionMarker,
} from "./deck-map.js";
import {
  IDLE_DECK_COMMAND,
  advancePendingDeckCommand,
  findAddressInitialIndex,
  installPendingDeckCommandKeyCapture,
  startAddressCommand,
  startPileCommand,
  type PendingDeckCommand,
} from "./deck-commands.js";
import {
  DEFAULT_DECK_MAP_VISIBILITY,
  applyDeckMapVisibility,
  toggleDeckMapVisibility,
  type DeckMapVisibility,
} from "./deck-chrome.js";
import {
  InlineEditFinalizationCoordinator,
  InlineEditSessionController,
  runAfterInlineEditing,
  type InlineEditFailure,
} from "./inline-edit-session.js";
import {
  consumeDeckEscape,
  dispatchInlineAwareDeckAction,
  inlineEditPresentationFingerprint,
  isInlineEditBodyTarget,
  matchesInlineEditRefreshGuard,
  resolveDeckEscapeAction,
  shouldFinishInlineEditFromPointerDown,
  shouldNavigateDeckFromWheel,
  type InlineEditRefreshGuard,
} from "./inline-edit-interactions.js";
import {
  beginPointerActionAfterGate,
  beginThresholdPointerDrag,
} from "./pointer-drag.js";
import {
  deckCardDropTarget,
  resolveDeckCardDrop,
  type DeckCardDropTarget,
  type ResolvedDeckCardDrop,
} from "./tray-drop.js";
import { attachPaperWorkflowTextarea } from "./paper-workflow-dom.js";
import { attachRenderedLinkInteractions } from "./rendered-link-interactions.js";
import {
  createViewedCardState,
  moveViewedCardState,
  renameViewedCardState,
  resolveViewedCardReturnTarget,
  retargetViewedCardState,
  scrollViewedCardState,
  type ViewedCardReturnTarget,
  type ViewedCardState,
} from "./viewed-card.js";
import {
  cardFocusDeleted,
  deckCardFocus,
  deskCardFocus,
  moveDeckFocusWithAnchor,
  redirectViewedCardGhostFocus,
  renameCardFocus,
  viewedCardFocus,
  type CardFocus,
} from "./card-focus.js";
import {
  cyclePileFocusTarget,
  pileFocusLocationForSwap,
  swapPileFocusTarget,
  wrappedPileCardNeighbour,
  type PileFocusLocation,
  type PileNavigationDirection,
} from "./pile-navigation.js";
import {
  deckPositionModeForPileCount,
  deckTopForPileAnchor,
  type DeckPositionMode,
} from "./workspace-layout.js";

export const DECK_VIEW_TYPE = "slipbox-deck";

const RENDER_EDGE_BUFFER = 2;
const LAYOUT_MEASUREMENT_RETRIES = 2;
const SPACE_RECENTER_DURATION_MS = 180;
const VIEWPORT_CENTER_DURATION_MS = 180;
const DECK_MAP_SECTION_LABEL_SPACING = 14;
const DECK_MAP_MARKER_BUDGET = 512;
const COMMAND_FEEDBACK_DURATION_MS = 1_800;
const DECK_CARD_DRAG_THRESHOLD_PX = 5;
const DECK_CARD_CLICK_SUPPRESSION_MS = 400;
const VIEWED_CARD_DRAG_THRESHOLD_PX = 5;
const PENDING_COMMAND_ACTIONS = new Set<DeckAction>([
  "find-address-first",
  "pull-into-pile",
]);
let inlineEditStatusSequence = 0;

interface MountedInlineEdit {
  readonly controller: InlineEditSessionController;
  file: TFile;
  readonly returnTarget: ViewedCardReturnTarget;
  readonly textarea: HTMLTextAreaElement;
  readonly statusEl: HTMLElement;
  policyStatusTimer: number | null;
  readonly bodyEl: HTMLElement;
  readonly cardEl: HTMLElement;
  readonly renderedScrollTop: number;
  readonly presentationFingerprint: string;
}

interface CardActionTarget {
  readonly file: TFile;
  readonly card: FiledCard | null;
  readonly surface: CardButtonSurface;
  readonly pileId?: string;
}

type DeckRefreshReason = "full" | "index";

export class DeckView extends ItemView {
  /**
   * Slipbox is a static surface, not a navigable one.
   *
   * Leaving this at the default lets Obsidian navigate the Slipbox leaf away,
   * which is what an Escape arriving from a modal does, and what makes
   * `getLeaf(false)` treat the Slipbox leaf as reusable when opening a note.
   * The Deck's own Escape containment cannot prevent the first case, because
   * neither the view scope nor the content-element listener receives a
   * keystroke while a modal holds focus.
   */
  navigation = false;
  private activePath: string | null = null;
  private cardFocus: CardFocus | null = null;
  private lastFocusedPileId: string | null = null;
  private lastPileFocusWasViewed = false;
  private filingFile: TFile | null = null;
  private filingSourcePath: string | null = null;
  private filingSourceSurface: FilingSourceSurface | null = null;
  private filingInputValue = "";
  private filingPreview: FilingPreview | null = null;
  private filingMessage = "Enter an address.";
  private filingConfirmationInProgress = false;
  private stageEl: HTMLElement | null = null;
  private spaceEl: HTMLElement | null = null;
  private deckCardsEl: HTMLElement | null = null;
  private renderedCards: HTMLElement[] = [];
  private renderComponents = new Map<string, Component>();
  private cardScrollPositions = new Map<string, number>();
  private viewportOffset = 0;
  private deckPositionMode: DeckPositionMode | null = null;
  private pointerLastX: number | null = null;
  private pointerLastY: number | null = null;
  private suppressDeckCardClickUntil = 0;
  private spaceOffsetX = 0;
  private spaceOffsetY = 0;
  private spaceRecenteringTimer: number | null = null;
  private viewportCenteringFrame: number | null = null;
  private renderWindowStart = 0;
  private renderWindowEnd = -1;
  private renderRefreshPending = false;
  private renderRefreshRunning = false;
  private renderRefreshQueued = false;
  private renderVersion = 0;
  private deckRenderVersion = 0;
  private deckMapEl: HTMLElement | null = null;
  private deckMapRailEl: HTMLElement | null = null;
  private deckMapSectionLayerEl: HTMLElement | null = null;
  private deckMapBookmarkLayerEl: HTMLElement | null = null;
  private deckMapActiveMarkerEl: HTMLElement | null = null;
  private deckMapBookmarkMarkerEls = new Map<string, HTMLElement>();
  private deckMapSections: readonly DeckMapSectionMarker[] = [];
  private deckMapBookmarkCount = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly cardHeaderButtonControllers = new Set<CardHeaderButtonController>();
  private viewedCardHeaderButtonController: CardHeaderButtonController | null = null;
  private positioningFrame: number | null = null;
  private positioningRetriesRemaining = 0;
  private readonly cardFooters: CardFooterManager;
  private readonly viewedCardFooter: CardFooterManager;
  private readonly cardSignatures: CardSignatureManager;
  private readonly viewedCardSignature: CardSignatureManager;
  private readonly inferredNavigation: InferredNavigationManager;
  private readonly viewedInferredNavigation: InferredNavigationManager;
  private readonly trayRenderer: TrayRenderer;
  private deckKeybindingsSuspended = false;
  private readonly shortcutCommandTracker =
    new ShortcutCommandTracker<KeyboardEvent, DeckAction>();
  private commandActionAwaitingKeyup: {
    readonly action: DeckAction;
    readonly timestamp: number;
  } | null = null;
  private readonly shortcutConflictNoticeTimes = new Map<string, number>();
  private pendingCommand: PendingDeckCommand = IDLE_DECK_COMMAND;
  private pendingCommandStartEvent: KeyboardEvent | null = null;
  private pendingCommandEl: HTMLElement | null = null;
  private pendingCommandFeedback = "";
  private pendingCommandFeedbackTimer: number | null = null;
  private deckMapVisibility: DeckMapVisibility = DEFAULT_DECK_MAP_VISIBILITY;
  private inlineEdit: MountedInlineEdit | null = null;
  private readonly inlineEditFinalization = new InlineEditFinalizationCoordinator();
  private inlineEditStarting = false;
  private renderRefreshDeferred = false;
  private inlineIndexRefreshDeferred = false;
  private recentInlineEditRefresh: {
    readonly path: string;
  } & InlineEditRefreshGuard | null = null;
  private viewedCard: ViewedCardState | null = null;
  private viewedCardEl: HTMLElement | null = null;
  private viewedCardBodyEl: HTMLElement | null = null;
  private viewedCardComponent: Component | null = null;
  private viewedFilingEditor: InlineFilingEditorElements | null = null;
  private viewedFocusFromDeckNavigation = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SlipboxPlugin,
  ) {
    super(leaf);
    const footerEnvironment: CardFooterEnvironment = {
      app: this.app,
      leaf: this.leaf,
      hoverSource: DECK_VIEW_TYPE,
      previewLinksOnHover: () => this.plugin.settings.previewLinksOnHover,
      followLinksFromCards: () => this.plugin.settings.followLinksFromCards,
      showTooltips: () => this.plugin.settings.showTooltips,
      isInTray: (file) => this.plugin.isFileInTray(file),
      runAction: (action, target) => this.runAction(action, target),
      runAfterEditing: (reason, action) => {
        void this.runAfterInlineEditing(reason, action);
      },
    };
    this.cardFooters = new CardFooterManager(footerEnvironment);
    this.viewedCardFooter = new CardFooterManager(footerEnvironment);
    const signatureEnvironment: CardSignatureEnvironment = {
      showBranchLabels: () => this.plugin.settings.showBranchLabels,
      previewLinksOnHover: () => this.plugin.settings.previewLinksOnHover,
      branchesForPath: (path) => this.cardSignatureBranches(path),
      preview: (event, target, branch, targetPath) => {
        this.app.workspace.trigger("hover-link", {
          event,
          source: DECK_VIEW_TYPE,
          hoverParent: this.leaf,
          targetEl: target,
          linktext: branch.linktext,
          sourcePath: targetPath,
        });
      },
      activate: (branch) => this.jumpToPath(branch.sourcePath),
      showOverflowMenu: showCardSignatureOverflowMenu,
      runAfterEditing: (reason, action) => {
        void this.runAfterInlineEditing(reason, action);
      },
    };
    this.cardSignatures = new CardSignatureManager(signatureEnvironment);
    this.viewedCardSignature = new CardSignatureManager(signatureEnvironment);
    const inferredNavigationEnvironment = {
      showNavigation: () =>
        this.plugin.settings.inferAddressBranches &&
        this.plugin.settings.showInferredBranchNavigation,
      previewLinksOnHover: () => this.plugin.settings.previewLinksOnHover,
      relationsForPath: (path: string) =>
        this.plugin.index.inferredNavigationForPath(path),
      preview: (
        event: MouseEvent,
        target: HTMLElement,
        destination: { readonly path: string },
        sourcePath: string,
      ) => {
        const file = this.plugin.index.fileAtPath(destination.path);
        this.app.workspace.trigger("hover-link", {
          event,
          source: DECK_VIEW_TYPE,
          hoverParent: this.leaf,
          targetEl: target,
          linktext: file === undefined
            ? destination.path
            : this.app.metadataCache.fileToLinktext(file, sourcePath),
          sourcePath,
        });
      },
      activate: (destination: { readonly path: string }) =>
        this.jumpToPath(destination.path),
      runAfterEditing: (reason: string, action: () => void | Promise<void>) => {
        void this.runAfterInlineEditing(reason, action);
      },
    };
    this.inferredNavigation = new InferredNavigationManager(
      inferredNavigationEnvironment,
    );
    this.viewedInferredNavigation = new InferredNavigationManager(
      inferredNavigationEnvironment,
    );
    this.trayRenderer = new TrayRenderer(this.app, this.plugin, {
      jumpToFiledCard: (path) => this.jumpToPath(path),
      updateFilingInput: (value) => this.updateFilingInput(value),
      confirmFiling: () => void this.confirmFiling(),
      cancelFiling: () => void this.cancelFiling(),
      previewFilingPlacement: () => void this.previewFilingPlacement(),
      filingInputFocusChanged: (focused) => {
        this.setDeckKeybindingsSuspended(focused);
        if (focused) {
          this.restoreFilingSourceFocus();
        }
      },
      focusViewedCard: () => this.focusViewedCard(),
      focusDeskCard: (path, pileId) => this.focusDeskCard(path, pileId),
      isDeskCardFocused: (path, pileId) =>
        this.cardFocus?.surface === "desk" &&
        this.cardFocus.path === path &&
        this.cardFocus.pileId === pileId,
      canRunAction: (action) => this.canRunAction(action),
      runAction: (action) => this.runAction(action),
      runCardAction: (action, path, pileId) =>
        this.runCardAction(action, path, "desk", pileId),
      runAfterEditing: (reason, action) =>
        this.runAfterInlineEditing(reason, action),
      previewLink: (event, link, linktext, sourcePath) => {
        this.app.workspace.trigger("hover-link", {
          event,
          source: DECK_VIEW_TYPE,
          hoverParent: this.leaf,
          targetEl: link,
          linktext,
          sourcePath,
        });
      },
    });
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.cardFooters.scheduleLayout();
        this.viewedCardFooter.scheduleLayout();
        this.cardSignatures.scheduleLayout();
        this.viewedCardSignature.scheduleLayout();
        this.trayRenderer.scheduleBranchLayout();
      }),
    );
    this.scope = new Scope(this.app.scope);
    this.scope.register([], "Escape", (event) =>
      this.handleDeckEscape(event) ? false : undefined);
  }

  getViewType(): string {
    return DECK_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Slipbox Desk";
  }

  getIcon(): string {
    return "archive";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("slipbox-deck-view");
    this.contentEl.tabIndex = 0;
    const ownerWindow = this.contentEl.ownerDocument.defaultView;
    if (ownerWindow !== null) {
      this.register(installEarlyShortcutObserver(
        ownerWindow,
        (event) => this.deferConfiguredDeckShortcut(event),
      ));
      this.registerDomEvent(ownerWindow, "keyup", (event) => {
        this.reportCommandShortcutConflictOnKeyup(event);
      }, { capture: true });
    }
    this.register(installPendingDeckCommandKeyCapture(
      this.contentEl.ownerDocument,
      {
        isPending: () => this.pendingCommand.kind !== "idle",
        isActive: () => this.app.workspace.getActiveViewOfType(DeckView) === this,
        shouldIgnore: (event) => {
          if (event !== this.pendingCommandStartEvent) {
            return false;
          }
          this.pendingCommandStartEvent = null;
          return true;
        },
        handle: (event) => {
          this.handleDeckCommandContinuation(event);
        },
      },
    ));
    this.registerDomEvent(this.contentEl, "keydown", (event) => {
      if (this.handleDeckEscape(event)) {
        return;
      }
      if (
        this.filingFile !== null &&
        event.key === "Tab" &&
        event.shiftKey &&
        event.target !== this.filingInput
      ) {
        event.preventDefault();
        this.restoreFilingSourceFocus();
        this.focusFilingInputNow();
      }
    }, { capture: true });
    this.registerDomEvent(
      this.contentEl.ownerDocument,
      "pointerdown",
      (event) => this.handleInlineEditPointerDown(event),
      { capture: true },
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (this.inlineEdit !== null && leaf !== this.leaf) {
          void this.finishInlineEditing("active-leaf-change");
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("file-open");
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on("window-open", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("popout-window-open");
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on("window-close", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("popout-window-close");
        }
      }),
    );
    if (ownerWindow !== null) {
      this.registerDomEvent(ownerWindow, "blur", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("window-blur");
        }
      });
    }
    this.registerDomEvent(this.contentEl.ownerDocument, "visibilitychange", () => {
      if (
        this.inlineEdit !== null &&
        this.contentEl.ownerDocument.visibilityState === "hidden"
      ) {
        void this.finishInlineEditing("view-hidden");
      }
    });
    this.observeDeckSize();
    await this.refresh();
    await this.restoreDetachedInlineEdit();
  }

  async onClose(): Promise<void> {
    const saved = await this.finishInlineEditing("view-close");
    if (!saved && this.inlineEdit !== null) {
      const editing = this.inlineEdit;
      editing.controller.cancelDebounce();
      this.plugin.retainDetachedInlineEdit(
        editing.controller.snapshot,
        editing.file,
        {
          returnTarget: editing.returnTarget,
          selectionStart: editing.textarea.selectionStart,
          selectionEnd: editing.textarea.selectionEnd,
          textareaScrollTop: editing.textarea.scrollTop,
          renderedScrollTop: editing.renderedScrollTop,
        },
      );
      this.plugin.releaseInlineEdit(editing.controller.snapshot.path, this);
      this.clearInlineEditPolicyMessage();
      this.inlineEdit = null;
      this.setDeckKeybindingsSuspended(false);
    }
    this.cancelViewportCentering();
    this.cancelSpaceRecentering();
    this.cardFooters.clear();
    this.viewedCardFooter.clear();
    this.cardSignatures.clear();
    this.inferredNavigation.clear();
    this.viewedCardSignature.clear();
    this.viewedInferredNavigation.clear();
    this.trayRenderer.clear();
    this.clearCardHeaderButtonControllers();
    this.clearViewedCardHeaderButtonController();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.positioningFrame !== null) {
      this.contentEl.win.cancelAnimationFrame(this.positioningFrame);
      this.positioningFrame = null;
    }
    this.positioningRetriesRemaining = 0;
    this.rememberScrollPositions();
    this.unloadRenderComponents();
    this.unloadViewedCardComponent();
    this.clearPendingCommand();
    this.filingFile = null;
    this.filingSourcePath = null;
    this.filingSourceSurface = null;
    this.filingPreview = null;
    this.filingConfirmationInProgress = false;
    this.stageEl = null;
    this.spaceEl = null;
    this.deckCardsEl = null;
    this.viewedCard = null;
    this.viewedCardEl = null;
    this.viewedCardBodyEl = null;
    this.viewedFilingEditor = null;
    this.cardFocus = null;
    this.viewedFocusFromDeckNavigation = false;
    this.lastFocusedPileId = null;
    this.lastPileFocusWasViewed = false;
    this.spaceOffsetX = 0;
    this.spaceOffsetY = 0;
    this.renderedCards = [];
    this.deckMapEl = null;
    this.deckMapRailEl = null;
    this.deckMapSectionLayerEl = null;
    this.deckMapBookmarkLayerEl = null;
    this.deckMapActiveMarkerEl = null;
    this.deckMapBookmarkMarkerEls.clear();
    this.deckMapSections = [];
    this.deckMapBookmarkCount = 0;
    this.pendingCommandEl = null;
    this.pendingCommandStartEvent = null;
  }

  onResize(): void {
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    this.viewedCardFooter.scheduleLayout();
    this.cardSignatures.scheduleLayout();
    this.viewedCardSignature.scheduleLayout();
    this.trayRenderer.scheduleBranchLayout();
    this.updateDeckMapSectionLabels();
    this.constrainViewedCard();
  }

  get activeCard(): FiledCard | null {
    if (this.activePath === null) {
      return null;
    }
    return this.plugin.index.filedByPath(this.activePath) ?? null;
  }

  get focusedCardFile(): TFile | null {
    return this.cardFocus === null
      ? null
      : this.plugin.index.fileAtPath(this.cardFocus.path) ?? null;
  }

  get focusedFiledCard(): FiledCard | null {
    const file = this.focusedCardFile;
    return file === null ? null : this.plugin.index.filedByFile(file) ?? null;
  }

  get cardFocusState(): CardFocus | null {
    return this.cardFocus;
  }

  get focusedDeckCardPath(): string | null {
    return this.cardFocus?.surface === "deck" ? this.cardFocus.path : null;
  }

  private assignCardFocus(focus: CardFocus | null): void {
    const viewedPath = this.viewedCard?.path ?? null;
    const viewedPosition = viewedPath === null
      ? null
      : cardPosition(this.plugin.tray, viewedPath);
    const redirectedFromDeckNavigation =
      focus?.surface === "deck" && focus.path === viewedPath;
    const resolved = redirectViewedCardGhostFocus(
      focus,
      viewedPath,
      viewedPosition?.pileId,
    );
    this.cardFocus = resolved;
    this.viewedFocusFromDeckNavigation =
      redirectedFromDeckNavigation && resolved?.surface === "viewed";
    if (resolved?.surface === "desk" && resolved.pileId !== undefined) {
      this.lastFocusedPileId = resolved.pileId;
      this.lastPileFocusWasViewed = false;
    } else if (resolved?.surface === "viewed") {
      this.lastPileFocusWasViewed = resolved.pileId !== undefined;
      if (resolved.pileId !== undefined) {
        this.lastFocusedPileId = resolved.pileId;
      }
    }
  }

  private setCardFocus(focus: CardFocus | null): void {
    this.assignCardFocus(focus);
    this.applyCardFocusClasses();
  }

  private focusDeskCard(path: string, pileId: string): void {
    if (this.viewedCard?.path === path) {
      this.focusViewedCard();
      return;
    }
    this.setCardFocus(deskCardFocus(path, pileId));
  }

  /**
   * Focus a card that is currently placed on the Desk.
   *
   * Call this only after the Desk has been rendered, so that the focus classes
   * land on a mounted card. Returns false when the path is not on the Desk.
   */
  focusDeskCardAtPath(path: string): boolean {
    const position = cardPosition(this.plugin.tray, path);
    if (position === null) {
      return false;
    }
    this.focusDeskCard(path, position.pileId);
    return true;
  }

  private async toggleFocusedCardOnDesk(
    card: FiledCard,
    focusPulledCard: boolean,
  ): Promise<void> {
    const wasOnDesk = this.plugin.isFileInTray(card.file);
    const focusTarget = deskToggleFocusTarget(
      this.cardFocus?.surface ?? null,
      wasOnDesk,
      focusPulledCard,
    );

    if (focusTarget === "deck") {
      if (this.cardFocus?.surface === "viewed") {
        this.viewedCard = null;
        this.viewedCardEl = null;
        this.viewedCardBodyEl = null;
      }
      this.setDeckAnchor(card.path);
      this.assignCardFocus(deckCardFocus(card.path));
      this.viewportOffset = 0;
    }

    // toggleFileInTray updates the shared tray synchronously before refreshing
    // views. Assigning logical Desk focus immediately makes a quick p, e chord
    // reliable even while the refreshed card presentation is mounting.
    const refresh = this.plugin.toggleFileInTray(card.file);
    if (focusTarget === "desk") {
      const position = cardPosition(this.plugin.tray, card.path);
      if (position !== null) {
        this.assignCardFocus(deskCardFocus(card.path, position.pileId));
      }
    }
    await refresh;

    if (focusTarget !== "desk" || !this.focusDeskCardAtPath(card.path)) {
      return;
    }
    this.stageEl?.querySelector<HTMLElement>(
      `.slipbox-tray-card[data-card-ref="${CSS.escape(card.path)}"]`,
    )?.focus({ preventScroll: true });
  }

  private focusDeckCard(path: string): void {
    if (this.plugin.index.filedByPath(path) === undefined) {
      return;
    }
    if (path !== this.activePath) {
      this.selectCardWithoutMoving(path);
    }
    if (this.viewedCard?.path === path) {
      this.focusViewedCard();
      return;
    }
    this.setCardFocus(deckCardFocus(path));
  }

  private viewedCardReturnTargetForFocus(): ViewedCardReturnTarget | null {
    if (this.cardFocus?.surface === "deck") {
      return { surface: "deck" };
    }
    if (
      this.cardFocus?.surface === "desk" &&
      this.cardFocus.pileId !== undefined
    ) {
      return { surface: "desk", pileId: this.cardFocus.pileId };
    }
    return null;
  }

  private pileFocusLocation(): PileFocusLocation | null {
    if (this.cardFocus?.surface === "deck") {
      return { surface: "deck" };
    }
    if (
      (this.cardFocus?.surface === "desk" ||
        this.cardFocus?.surface === "viewed") &&
      this.cardFocus.pileId !== undefined
    ) {
      return { surface: "desk", pileId: this.cardFocus.pileId };
    }
    return null;
  }

  private focusPileNavigationTarget(
    target: PileFocusLocation,
    preferredPath?: string,
  ): void {
    if (target.surface === "deck") {
      if (this.activePath !== null) {
        if (this.viewedCard?.path === this.activePath) {
          this.focusViewedCard();
        } else {
          this.setCardFocus(deckCardFocus(this.activePath));
        }
      }
      return;
    }
    const pile = this.plugin.tray.piles.find((candidate) =>
      candidate.id === target.pileId
    );
    const preferred = preferredPath === undefined
      ? undefined
      : pile?.cards.find((card) => card.cardRef === preferredPath);
    const card = preferred ?? pile?.cards[0];
    if (pile !== undefined && card !== undefined) {
      this.focusDeskCard(card.cardRef, pile.id);
    }
  }

  private cyclePileFocus(direction: PileNavigationDirection): void {
    const target = cyclePileFocusTarget(
      this.plugin.tray.piles.map((pile) => pile.id),
      this.pileFocusLocation(),
      this.activePath !== null,
      direction,
    );
    if (target !== null) {
      this.focusPileNavigationTarget(target);
    }
  }

  private swapDeckPileFocus(): void {
    const current = pileFocusLocationForSwap(
      this.cardFocus,
      this.cardFocus?.surface === "viewed"
        ? this.viewedCard?.returnTarget.surface ?? null
        : null,
    );
    if (current === null) {
      return;
    }
    const target = swapPileFocusTarget(
      this.plugin.tray.piles.map((pile) => pile.id),
      current,
      this.lastFocusedPileId,
      this.activePath !== null,
    );
    if (target !== null) {
      const viewedPath = target.surface === "desk" &&
          this.lastPileFocusWasViewed &&
          this.lastFocusedPileId === target.pileId &&
          this.viewedCard !== null
        ? this.viewedCard.path
        : undefined;
      this.focusPileNavigationTarget(target, viewedPath);
    }
  }

  private toggleFocusedPile(): void {
    if (
      this.cardFocus?.surface !== "desk" ||
      this.cardFocus.pileId === undefined
    ) {
      return;
    }
    const pileId = this.cardFocus.pileId;
    if (!this.plugin.tray.piles.some((pile) => pile.id === pileId)) {
      return;
    }
    const expanded = this.plugin.tray.expandedPileIds.includes(pileId);
    void this.plugin.setTrayPileExpanded(pileId, !expanded);
  }

  private moveFocusWithinPile(direction: PileNavigationDirection): void {
    if (
      this.cardFocus?.surface !== "desk" ||
      this.cardFocus.pileId === undefined
    ) {
      return;
    }
    const pile = this.plugin.tray.piles.find((candidate) =>
      candidate.id === this.cardFocus?.pileId
    );
    if (pile === undefined) {
      return;
    }
    if (!this.plugin.tray.expandedPileIds.includes(pile.id)) {
      const next = cyclePileTopCard(this.plugin.tray, pile.id, direction);
      if (next !== this.plugin.tray) {
        void this.plugin.updateTray(next);
      }
      return;
    }
    const target = wrappedPileCardNeighbour(pile, this.cardFocus.path, direction);
    if (target !== null) {
      this.setCardFocus(deskCardFocus(target, pile.id));
    }
  }

  private setDeckAnchor(path: string): void {
    this.activePath = path;
    this.assignCardFocus(moveDeckFocusWithAnchor(
      this.cardFocus,
      path,
      this.viewedFocusFromDeckNavigation,
    ));
  }

  private applyCardFocusClasses(): void {
    for (const card of this.renderedCards) {
      const path = card.dataset.path;
      card.toggleClass("is-deck-anchor", path === this.activePath);
      card.toggleClass(
        "is-card-focused",
        path !== undefined &&
        this.cardFocus?.surface === "deck" &&
        this.cardFocus.path === path,
      );
    }
    this.stageEl?.querySelectorAll<HTMLElement>(".slipbox-tray-card")
      .forEach((card) => {
        const path = card.dataset.cardRef;
        const pileId = card.dataset.pileId;
        card.toggleClass(
          "is-card-focused",
          !card.hasClass("is-viewed-ghost") &&
          path !== undefined &&
          pileId !== undefined &&
          this.cardFocus?.surface === "desk" &&
          this.cardFocus.path === path &&
          this.cardFocus.pileId === pileId,
        );
      });
    this.trayRenderer.refreshFocusedInferredNavigation();
    if (this.viewedCardEl !== null) {
      this.viewedCardEl.toggleClass(
        "is-card-focused",
        this.viewedCard !== null &&
        this.cardFocus?.surface === "viewed" &&
        this.cardFocus.path === this.viewedCard.path,
      );
    }
  }

  private reconcileCardFocus(): void {
    const focus = this.cardFocus;
    if (focus?.surface === "deck" && this.activePath !== null) {
      this.assignCardFocus(deckCardFocus(this.activePath));
      return;
    }
    if (
      focus?.surface === "viewed" &&
      this.viewedCard?.path === focus.path &&
      this.plugin.index.fileAtPath(focus.path) !== undefined
    ) {
      const position = cardPosition(this.plugin.tray, focus.path);
      this.assignCardFocus(viewedCardFocus(focus.path, position?.pileId));
      return;
    }
    if (focus?.surface === "desk") {
      const pile = this.plugin.tray.piles.find((candidate) =>
        candidate.id === focus.pileId
      );
      const index = pile?.cards.findIndex((card) => card.cardRef === focus.path) ?? -1;
      if (pile !== undefined && index >= 0) {
        if (this.plugin.tray.expandedPileIds.includes(pile.id) || index === 0) {
          return;
        }
        const top = pile.cards[0];
        if (top !== undefined) {
          this.assignCardFocus(deskCardFocus(top.cardRef, pile.id));
          return;
        }
      }
    }
    if (this.activePath !== null) {
      this.assignCardFocus(deckCardFocus(this.activePath));
      return;
    }
    const firstPile = this.plugin.tray.piles[0];
    const firstCard = firstPile?.cards[0];
    this.assignCardFocus(firstPile !== undefined && firstCard !== undefined
      ? deskCardFocus(firstCard.cardRef, firstPile.id)
      : null);
  }

  get isFiling(): boolean {
    return this.filingFile !== null;
  }

  private get filingInput(): HTMLInputElement | null {
    return this.filingSourceSurface === "viewed"
      ? this.viewedFilingEditor?.input ?? null
      : this.trayRenderer.filingInput;
  }

  private get isFilingInputFocused(): boolean {
    const input = this.filingInput;
    return input !== null && input.ownerDocument.activeElement === input;
  }

  private focusFilingInput(): void {
    const input = this.filingInput;
    input?.win.requestAnimationFrame(() => this.focusFilingInputNow());
  }

  private focusFilingInputNow(): void {
    const input = this.filingInput;
    if (input === null) {
      return;
    }
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private updateRenderedFilingState(state: TrayFilingState): void {
    this.trayRenderer.updateFilingState(state);
    if (this.viewedFilingEditor !== null) {
      updateInlineFilingEditor(this.viewedFilingEditor, state);
      this.applyFilingGuidance(this.viewedFilingEditor.input, state.guidance);
    }
  }

  private applyFilingGuidance(input: HTMLInputElement, guidance: string): void {
    input.setAttribute("aria-description", guidance);
    setCardTooltip(input, guidance, this.plugin.settings.showTooltips, {
      placement: "bottom",
      delay: 350,
      accessibleLabel: "Card address",
    });
  }

  handlePathRename(oldPath: string, newPath: string): void {
    const editing = this.inlineEdit;
    const editingPath = editing?.controller.snapshot.path ?? null;
    const renamedEditingPath = editingPath === null
      ? null
      : renamePathReference(editingPath, oldPath, newPath);
    if (
      editing !== null &&
      editingPath !== null &&
      renamedEditingPath !== null &&
      renamedEditingPath !== editingPath
    ) {
      if (!this.plugin.renameInlineEdit(editingPath, renamedEditingPath, this)) {
        editing.controller.markConflict(
          "The renamed path is already being edited in another Slipbox Desk view.",
        );
        this.applyInlineEditFailure(editing.controller.snapshot.failure);
      } else {
        editing.controller.renamePath(renamedEditingPath);
        const renamed = this.plugin.index.fileAtPath(renamedEditingPath);
        if (renamed !== undefined) {
          editing.file = renamed;
        }
        editing.cardEl.dataset.path = renamedEditingPath;
        const component = this.renderComponents.get(editingPath);
        if (component !== undefined) {
          this.renderComponents.delete(editingPath);
          this.renderComponents.set(renamedEditingPath, component);
        }
      }
    }
    if (this.activePath !== null) {
      this.activePath = renamePathReference(this.activePath, oldPath, newPath);
    }
    this.cardFocus = renameCardFocus(this.cardFocus, oldPath, newPath);
    this.cardScrollPositions = new Map(
      [...this.cardScrollPositions].map(([path, scroll]) => [
        renamePathReference(path, oldPath, newPath),
        scroll,
      ]),
    );
    if (this.filingSourcePath !== null) {
      this.filingSourcePath = renamePathReference(
        this.filingSourcePath,
        oldPath,
        newPath,
      );
      this.recalculateFilingPreview();
    }
    const viewed = this.viewedCard;
    if (viewed !== null) {
      const renamedPath = renamePathReference(viewed.path, oldPath, newPath);
      if (renamedPath !== viewed.path) {
        this.viewedCard = renameViewedCardState(viewed, renamedPath);
        if (this.viewedCardEl !== null) {
          this.viewedCardEl.dataset.path = renamedPath;
        }
      }
    }
  }

  handlePathDeletion(deletedPath: string): void {
    const editingPath = this.inlineEdit?.controller.snapshot.path ?? null;
    if (editingPath !== null && pathIsAtOrBelow(editingPath, deletedPath)) {
      this.inlineEdit?.controller.markConflict(
        "The card was deleted while it was being edited. Your draft was kept.",
        true,
      );
      this.applyInlineEditFailure(this.inlineEdit?.controller.snapshot.failure ?? null);
    }
    if (
      this.activePath !== null &&
      pathIsAtOrBelow(this.activePath, deletedPath) &&
      this.activePath !== editingPath
    ) {
      this.activePath = null;
    }
    if (cardFocusDeleted(this.cardFocus, deletedPath)) {
      this.cardFocus = null;
    }
    for (const path of this.cardScrollPositions.keys()) {
      if (pathIsAtOrBelow(path, deletedPath)) {
        this.cardScrollPositions.delete(path);
      }
    }
    if (
      this.filingSourcePath !== null &&
      pathIsAtOrBelow(this.filingSourcePath, deletedPath)
    ) {
      this.clearFilingPlacement();
      this.filingMessage = "The source card no longer exists.";
    }
    if (
      this.viewedCard !== null &&
      pathIsAtOrBelow(this.viewedCard.path, deletedPath) &&
      this.viewedCard.path !== editingPath
    ) {
      this.viewedCard = null;
      this.viewedCardEl = null;
      this.viewedCardBodyEl = null;
    }
  }

  private setDeckKeybindingsSuspended(suspended: boolean): void {
    if (this.deckKeybindingsSuspended === suspended) {
      return;
    }
    if (suspended) {
      this.clearPendingCommand();
    }
    this.deckKeybindingsSuspended = suspended;
  }

  canRunCommandAction(action: DeckAction): boolean {
    const event = this.app.lastEvent;
    if (
      this.deckKeybindingsSuspended ||
      (
        event !== null &&
        "key" in event &&
        shouldSuspendDeckCommand(
          event.target,
          this.isFilingInputFocused,
          this.contentEl,
        )
      )
    ) {
      return false;
    }
    return this.canRunAction(action);
  }

  runCommandAction(action: DeckAction): boolean {
    const lastEvent = this.app.lastEvent;
    const keyboardEvent = lastEvent !== null && "key" in lastEvent
      ? lastEvent
      : undefined;
    const deckKeyboardEvent = keyboardEvent !== undefined && eventTargetsDeck(
      keyboardEvent.target,
      this.contentEl,
    )
      ? keyboardEvent
      : undefined;
    const commandEvent = this.shortcutCommandTracker.record(
      action,
      deckKeyboardEvent,
    );
    const deckCommandEvent = commandEvent !== undefined && eventTargetsDeck(
      commandEvent.target,
      this.contentEl,
    )
      ? commandEvent
      : undefined;
    this.commandActionAwaitingKeyup = deckCommandEvent === undefined
      ? null
      : {
        action,
        timestamp: Date.now(),
      };
    if (
      deckCommandEvent !== undefined &&
      !shouldSuspendDeckShortcut(
        deckCommandEvent.target,
        this.isFilingInputFocused,
      )
    ) {
      const configuredShortcut = this.configuredDeckShortcut(deckCommandEvent);
      if (
        configuredShortcut !== null &&
        configuredShortcut.definition.id !== action
      ) {
        this.reportShortcutConflict(formatKeyBinding(
          configuredShortcut.binding,
        ));
      }
    }
    const ran = this.runAction(action);
    if (
      ran &&
      PENDING_COMMAND_ACTIONS.has(action) &&
      commandEvent !== undefined
    ) {
      this.pendingCommandStartEvent = commandEvent;
    }
    return ran;
  }

  private reportCommandShortcutConflictOnKeyup(event: KeyboardEvent): void {
    const dispatched = this.commandActionAwaitingKeyup;
    if (dispatched === null) {
      return;
    }
    if (Date.now() - dispatched.timestamp > 2_000) {
      this.commandActionAwaitingKeyup = null;
      return;
    }
    const configuredShortcut = this.configuredDeckShortcut(event);
    if (configuredShortcut === null) {
      return;
    }
    this.commandActionAwaitingKeyup = null;
    if (
      shouldSuspendDeckShortcut(event.target, this.isFilingInputFocused) ||
      configuredShortcut.definition.id === dispatched.action
    ) {
      return;
    }
    this.reportShortcutConflict(formatKeyBinding(configuredShortcut.binding));
  }

  private deferConfiguredDeckShortcut(event: KeyboardEvent): void {
    if (
      this.deckKeybindingsSuspended ||
      this.pendingCommand.kind !== "idle" ||
      this.app.workspace.getActiveViewOfType(DeckView) !== this ||
      shouldSuspendDeckShortcut(event.target, this.isFilingInputFocused)
    ) {
      return;
    }
    const shortcut = this.configuredDeckShortcut(event);
    if (shortcut !== null) {
      this.deferDeckActionKey(event, shortcut.definition, shortcut.binding);
    }
  }

  private configuredDeckShortcut(event: KeyboardEvent): {
    readonly definition: SlipboxActionDefinition;
    readonly binding: DeckKeyBinding;
  } | null {
    const signature = keyBindingSignature(keyBindingFromKeyboardEvent(
      event,
      Platform.isMacOS,
    ));
    for (const definition of DECK_ACTION_DEFINITIONS) {
      const binding = this.plugin.settings.deckKeybindings[definition.id].find(
        (configured) => keyBindingSignature(configured) === signature,
      );
      if (binding !== undefined) {
        return { definition, binding };
      }
    }
    return null;
  }

  private deferDeckActionKey(
    event: KeyboardEvent,
    definition: SlipboxActionDefinition,
    binding: DeckKeyBinding,
  ): void {
    if (
      this.pendingCommand.kind !== "idle" ||
      this.app.workspace.getActiveViewOfType(DeckView) !== this ||
      shouldSuspendDeckShortcut(event.target, this.isFilingInputFocused)
    ) {
      return;
    }
    // Observe every configured collision. Contextual action availability is
    // checked only if Obsidian leaves the shortcut unclaimed.
    this.shortcutCommandTracker.observe(event);
    queueMicrotask(() => {
      const commandAction = this.shortcutCommandTracker.take(event);
      if (this.app.workspace.getActiveViewOfType(DeckView) !== this) {
        return;
      }
      const claim = classifyShortcutClaim(
        event.defaultPrevented,
        definition.id,
        commandAction,
      );
      arbitrateShortcut(
        claim,
        () => this.handleDeckActionKey(
          event,
          definition.id,
          definition.repeatable,
        ),
        () => this.reportShortcutConflict(formatKeyBinding(binding)),
      );
    });
  }

  private reportShortcutConflict(shortcut: string): void {
    const message = `${shortcut} is already handled by an Obsidian hotkey; Slipbox Desk left it unchanged.`;
    this.showCommandFeedback(message);
    const now = Date.now();
    const lastNotice = this.shortcutConflictNoticeTimes.get(shortcut) ?? 0;
    if (now - lastNotice < 5_000) {
      return;
    }
    this.shortcutConflictNoticeTimes.set(shortcut, now);
    new Notice(`Slipbox Desk shortcut conflict: ${message}`, 6_000);
  }

  private handleDeckEscape(event: KeyboardEvent): boolean {
    if (this.app.workspace.getActiveViewOfType(DeckView) !== this) {
      return false;
    }
    const action = resolveDeckEscapeAction(event, {
      editing: this.inlineEdit !== null,
      pendingCommand: this.pendingCommand.kind !== "idle",
      filing: this.filingFile !== null && !this.filingConfirmationInProgress,
    });
    if (action === null) {
      return false;
    }
    consumeDeckEscape(event);

    if (action === "finish-editing") {
      void this.finishInlineEditing("escape");
    } else if (action === "cancel-pending-command") {
      this.handleDeckCommandContinuation(event);
    } else if (action === "cancel-filing") {
      void this.cancelFiling();
    }
    return true;
  }

  canRunAction(action: DeckAction, target?: FiledCard): boolean {
    return this.canRunActionForTarget(
      action,
      target === undefined
        ? null
        : { file: target.file, card: target, surface: "deck" },
    );
  }

  private canRunActionForTarget(
    action: DeckAction,
    target: CardActionTarget | null,
  ): boolean {
    if (action === "confirm-filing") {
      return this.filingFile !== null &&
        this.filingPreview !== null &&
        !this.filingConfirmationInProgress;
    }
    if (action === "cancel-filing") {
      return this.filingFile !== null && !this.filingConfirmationInProgress;
    }
    const filed = this.plugin.index.snapshot.filed;
    const active = this.activeCard;
    const activeIndex = active === null
      ? -1
      : this.plugin.index.filedIndexForPath(active.path);
    const needsBookmarkTarget =
      action === "previous-bookmark" || action === "next-bookmark";
    const bookmarkIndices = needsBookmarkTarget && activeIndex >= 0
      ? this.bookmarkIndices()
      : [];
    const focusedFile = target?.file ?? this.focusedCardFile;
    const focusedFiled = target === null
      ? this.focusedFiledCard
      : target.card;
    const focusedSurface = target?.surface ?? this.cardFocus?.surface ?? null;
    const focusedPosition = focusedFile === null
      ? null
      : cardPosition(this.plugin.tray, focusedFile.path);
    const focusedDeskPosition = focusedSurface === "desk"
      ? focusedPosition
      : null;
    return canRunDeckAction(action, {
      hasActiveCard: activeIndex >= 0,
      hasPreviousCard: activeIndex > 0,
      hasNextCard: activeIndex >= 0 && activeIndex < filed.length - 1,
      hasInferredParent:
        active !== null &&
        this.plugin.index.inferredParentForPath(active.path) !== undefined,
      hasForwardInferredSiblingCycle:
        active !== null &&
        this.plugin.index.cycleForwardInferredSiblingForPath(active.path) !== undefined,
      hasBackwardInferredSiblingCycle:
        active !== null &&
        this.plugin.index.cycleBackwardInferredSiblingForPath(active.path) !== undefined,
      hasPreviousBookmark:
        action === "previous-bookmark" &&
        adjacentBookmarkIndex(bookmarkIndices, activeIndex, -1) !== null,
      hasNextBookmark:
        action === "next-bookmark" &&
        adjacentBookmarkIndex(bookmarkIndices, activeIndex, 1) !== null,
      hasProblems: this.plugin.index.snapshot.issues.length > 0,
      filing: this.filingFile !== null,
      hasFocusedCard: focusedFile !== null,
      focusedCardFiled: focusedFiled !== null,
      focusedCardUnfiled:
        focusedFile !== null &&
        focusedFiled === null &&
        focusedSurface !== "deck",
      focusedSurface,
      viewedReturnSurface: focusedSurface === "viewed"
        ? this.viewedCard?.returnTarget.surface ?? null
        : null,
      focusedCardOnDesk: focusedPosition !== null,
      canMoveDeskCardLeft:
        focusedDeskPosition !== null && focusedDeskPosition.cardIndex > 0,
      canMoveDeskCardRight:
        focusedDeskPosition !== null &&
        focusedDeskPosition.cardIndex < focusedDeskPosition.pileSize - 1,
      hasDeskPiles: this.plugin.tray.piles.length > 0,
      hasExpandedPiles: this.plugin.tray.expandedPileIds.length > 0,
      hasFiledDeskCards: trayHasFiledCards(this.plugin.tray),
    });
  }

  runAction(action: DeckAction, target?: FiledCard): boolean {
    return this.runActionForTarget(
      action,
      target === undefined
        ? null
        : { file: target.file, card: target, surface: "deck" },
    );
  }

  private runCardAction(
    action: DeckAction,
    path: string,
    surface: CardButtonSurface,
    pileId?: string,
  ): boolean {
    const file = this.plugin.index.fileAtPath(path);
    if (file === undefined) {
      return false;
    }
    return this.runActionForTarget(action, {
      file,
      card: this.plugin.index.filedByFile(file) ?? null,
      surface,
      ...(pileId === undefined ? {} : { pileId }),
    });
  }

  private runActionForTarget(
    action: DeckAction,
    target: CardActionTarget | null,
  ): boolean {
    if (!this.canRunActionForTarget(action, target)) {
      return false;
    }
    const file = target?.file ?? this.focusedCardFile;
    const card = target === null ? this.focusedFiledCard : target.card;
    return dispatchInlineAwareDeckAction(
      {
        editing: this.inlineEdit !== null,
        starting: this.inlineEditStarting,
      },
      (semanticAction) => this.runAfterInlineEditing(
        `deck-action:${action}`,
        semanticAction,
      ),
      () => this.performAction(action, file, card, target),
    );
  }

  private performAction(
    action: DeckAction,
    file: TFile | null,
    card: FiledCard | null,
    target: CardActionTarget | null,
  ): void {
    switch (action) {
      case "previous-card":
        this.moveBy(-1);
        break;
      case "next-card":
        this.moveBy(1);
        break;
      case "jump-inferred-parent":
        this.jumpToInferredCard((path) =>
          this.plugin.index.inferredParentForPath(path)
        );
        break;
      case "cycle-forward-inferred-siblings":
        this.jumpToInferredCard((path) =>
          this.plugin.index.cycleForwardInferredSiblingForPath(path)
        );
        break;
      case "cycle-backward-inferred-siblings":
        this.jumpToInferredCard((path) =>
          this.plugin.index.cycleBackwardInferredSiblingForPath(path)
        );
        break;
      case "previous-bookmark":
        this.jumpToAdjacentBookmark(-1);
        break;
      case "next-bookmark":
        this.jumpToAdjacentBookmark(1);
        break;
      case "forward-ten-cards":
        this.moveBy(10);
        break;
      case "backward-ten-cards":
        this.moveBy(-10);
        break;
      case "centre-card":
        this.centerActiveCard();
        break;
      case "first-card":
        this.goToDeckBoundary("start");
        break;
      case "last-card":
        this.goToDeckBoundary("end");
        break;
      case "open-note":
        if (file !== null) {
          void this.plugin.openMarkdownFile(file);
        }
        break;
      case "copy-link":
        if (card !== null) {
          void this.plugin.copyCardLink(card);
        }
        break;
      case "toggle-tray":
        if (card !== null) {
          void this.toggleFocusedCardOnDesk(card, target === null);
        }
        break;
      case "toggle-tray-without-focus":
        if (card !== null) {
          void this.toggleFocusedCardOnDesk(card, false);
        }
        break;
      case "toggle-bookmark":
        if (card !== null) {
          void this.toggleCardBookmark(card.path);
        }
        break;
      case "find-address-first":
        this.beginAddressCommand();
        break;
      case "pull-into-pile":
        this.beginPileCommand();
        break;
      case "next-pile":
        this.cyclePileFocus(1);
        break;
      case "previous-pile":
        this.cyclePileFocus(-1);
        break;
      case "swap-deck-pile":
        this.swapDeckPileFocus();
        break;
      case "toggle-pile":
        this.toggleFocusedPile();
        break;
      case "previous-card-in-pile":
        this.moveFocusWithinPile(-1);
        break;
      case "next-card-in-pile":
        this.moveFocusWithinPile(1);
        break;
      case "toggle-deck-map":
        this.deckMapVisibility = toggleDeckMapVisibility(
          this.deckMapVisibility,
          this.plugin.settings.showDeckMap,
        );
        this.applyDeckMapVisibility();
        break;
      case "bookmarks":
        this.plugin.showBookmarks(this);
        break;
      case "problems":
        this.plugin.showIssues();
        break;
      case "confirm-filing":
        void this.confirmFiling();
        break;
      case "cancel-filing":
        void this.cancelFiling();
        break;
      case "edit-card":
        if (file !== null) {
          void this.editCardOnDesk(file);
        }
        break;
      case "show-card-in-deck":
        if (card !== null) {
          void this.showFocusedCardInDeck(card.path);
        }
        break;
      case "toggle-viewed-card":
        if (
          target?.surface === "viewed" &&
          this.viewedCard?.path === target.file.path
        ) {
          void this.closeViewedCard();
        } else if (target === null && this.cardFocus?.surface === "viewed") {
          void this.closeViewedCard();
        } else if (file !== null) {
          let returnTarget: ViewedCardReturnTarget | null;
          if (target?.surface === "desk") {
            const pileId = target.pileId ??
              cardPosition(this.plugin.tray, file.path)?.pileId;
            returnTarget = pileId === undefined
              ? null
              : { surface: "desk", pileId };
          } else if (target?.surface === "deck") {
            returnTarget = { surface: "deck" };
          } else {
            returnTarget = this.viewedCardReturnTargetForFocus();
          }
          if (returnTarget !== null) {
            void this.viewCard(file, returnTarget, false);
          }
        }
        break;
      case "file-card":
        if (file !== null) {
          if (
            target?.surface === "viewed" ||
            (target === null && this.cardFocus?.surface === "viewed")
          ) {
            void this.beginFilingViewedCard(file);
          } else {
            void this.startFiling(file);
          }
        }
        break;
      case "move-desk-card-left":
        if (target?.surface === "desk") {
          void this.moveTrayCardBy(target.file.path, -1);
        } else if (target === null && this.cardFocus?.surface === "desk") {
          void this.moveTrayCardBy(this.cardFocus.path, -1);
        }
        break;
      case "move-desk-card-right":
        if (target?.surface === "desk") {
          void this.moveTrayCardBy(target.file.path, 1);
        } else if (target === null && this.cardFocus?.surface === "desk") {
          void this.moveTrayCardBy(this.cardFocus.path, 1);
        }
        break;
      case "delete-card":
        if (file !== null) {
          void this.deleteFocusedCard(file);
        }
        break;
      case "collapse-all-piles":
        void this.plugin.updateTray(collapseAllPiles(this.plugin.tray));
        break;
      case "return-all-filed-cards":
        if (
          card !== null &&
          this.cardFocus?.surface === "desk" &&
          this.plugin.isFileInTray(card.file)
        ) {
          this.setDeckAnchor(card.path);
          this.assignCardFocus(deckCardFocus(card.path));
          this.viewportOffset = 0;
        }
        void this.plugin.clearTray();
        break;
    }
  }

  private jumpToInferredCard(
    destination: (path: string) => FiledCard | undefined,
  ): void {
    const active = this.activeCard;
    if (active === null) {
      return;
    }
    const target = destination(active.path);
    if (target !== undefined) {
      void this.jumpToPath(target.path);
    }
  }

  async refresh(reason: DeckRefreshReason = "full"): Promise<void> {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      const editing = this.inlineEdit;
      if (
        reason === "index" &&
        editing !== null &&
        editing.presentationFingerprint ===
          this.currentInlineEditPresentationFingerprint(
            editing.controller.snapshot.path,
          )
      ) {
        this.inlineIndexRefreshDeferred = true;
      } else {
        this.renderRefreshDeferred = true;
      }
      return;
    }
    const recent = this.recentInlineEditRefresh;
    if (
      reason === "index" &&
      recent !== null &&
      matchesInlineEditRefreshGuard(
        recent,
        this.plugin.index.fileAtPath(recent.path)?.stat.mtime ?? null,
        this.currentInlineEditPresentationFingerprint(recent.path),
      )
    ) {
      this.refreshInlineEditLinkMetadata();
      return;
    }
    this.recentInlineEditRefresh = null;
    const restoreFilingInputFocus = this.isFilingInputFocused;
    this.cancelViewportCentering();
    this.recalculateFilingPreview();
    const previousActivePath = this.activePath;
    this.reconcileScrollPositions();
    this.chooseAvailableActiveCard();
    this.reconcileCardFocus();
    if (this.activePath !== previousActivePath) {
      this.viewportOffset = 0;
    }
    this.clampViewportOffset();
    await this.renderDeck(this.filingFile === null || restoreFilingInputFocus);
  }

  async startFiling(
    file: TFile,
    sourceSurface: FilingSourceSurface = "desk",
  ): Promise<void> {
    const trayPosition = cardPosition(this.plugin.tray, file.path);
    if (sourceSurface === "viewed" && this.viewedCard?.path === file.path) {
      this.assignCardFocus(viewedCardFocus(file.path, trayPosition?.pileId));
    } else if (trayPosition !== null) {
      this.assignCardFocus(deskCardFocus(file.path, trayPosition.pileId));
    }
    if (
      sourceSurface === "desk" &&
      trayPosition !== null &&
      trayPosition.cardIndex > 0 &&
      !this.plugin.tray.expandedPileIds.includes(trayPosition.pileId)
    ) {
      await this.plugin.setTrayPileExpanded(trayPosition.pileId, true);
    }
    const initialAddress = initialFilingAddress(this.activeCard);
    this.filingFile = file;
    this.filingSourcePath = file.path;
    this.filingSourceSurface = sourceSurface;
    this.filingInputValue = initialAddress;
    this.filingPreview = null;
    this.filingMessage = "Enter an address.";
    this.filingConfirmationInProgress = false;
    this.recalculateFilingPreview();
    await this.renderDeck();
    this.focusFilingInput();
  }

  async cancelFiling(): Promise<void> {
    if (this.filingConfirmationInProgress) {
      return;
    }
    const sourcePath = this.filingSourcePath;
    const sourceSurface = this.filingSourceSurface;
    this.filingFile = null;
    this.filingSourcePath = null;
    this.filingSourceSurface = null;
    this.filingPreview = null;
    this.filingInputValue = "";
    this.filingConfirmationInProgress = false;
    await this.renderDeck(false);
    if (
      sourceSurface === "viewed" &&
      sourcePath !== null &&
      this.viewedCard?.path === sourcePath
    ) {
      this.focusViewedCard();
    }
    new Notice("Filing cancelled. The card remains in its pile.");
  }

  async handleDeckOrderingChanged(): Promise<void> {
    const restoreFilingInputFocus = this.isFilingInputFocused;
    this.recalculateFilingPreview();
    this.viewportOffset = 0;
    await this.renderDeck(restoreFilingInputFocus);
  }

  handleCardSpreadChanged(): void {
    this.positionCards();
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
    this.scheduleCardPositioning();
  }

  async goToPath(path: string): Promise<void> {
    await this.navigateToPath(path);
  }

  async jumpToPath(path: string): Promise<void> {
    if (this.plugin.index.filedByPath(path) === undefined) {
      new Notice(`Card ${path} is missing or invalid.`);
      return;
    }
    await this.navigateToPath(path);
  }

  private jumpToAdjacentBookmark(direction: -1 | 1): void {
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = adjacentBookmarkIndex(
      this.bookmarkIndices(),
      activeIndex,
      direction,
    );
    const target = targetIndex === null
      ? undefined
      : this.plugin.index.snapshot.filed[targetIndex];
    if (target !== undefined) {
      void this.jumpToPath(target.path);
    }
  }

  async addBookmarkToCurrent(): Promise<void> {
    const path = this.focusedDeckCardPath;
    if (path === null) {
      new Notice("Focus a Deck card before adding a bookmark.");
      return;
    }
    const bookmarkedPaths = this.bookmarkedPaths();
    bookmarkedPaths.add(path);
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.addBookmark(path);
  }

  async removeBookmark(path: string): Promise<void> {
    const bookmarkedPaths = this.bookmarkedPaths();
    bookmarkedPaths.delete(path);
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.removeBookmark(path);
  }

  handleBookmarksChanged(): void {
    this.updateBookmarkUi();
  }

  finishInlineEditing(reason: string): Promise<boolean> {
    return this.inlineEditFinalization.finish(
      reason,
      (reasons) => this.finishInlineEditingOnce(reasons),
    );
  }

  private async finishInlineEditingOnce(
    reasons: ReadonlySet<string>,
  ): Promise<boolean> {
    const editing = this.inlineEdit;
    if (editing === null) {
      return true;
    }
    const saved = await editing.controller.finish();
    if (!saved) {
      this.applyInlineEditFailure(editing.controller.snapshot.failure);
      if (this.app.workspace.getActiveViewOfType(DeckView) === this) {
        editing.textarea.focus({ preventScroll: true });
      }
      return false;
    }

    const path = editing.controller.snapshot.path;
    const shouldSkipRender = ["view-close", "plugin-unload", "quit"]
      .some((reason) => reasons.has(reason));
    const presentationUnchanged = editing.presentationFingerprint ===
      this.currentInlineEditPresentationFingerprint(path);
    const requiresFullRefresh = this.renderRefreshDeferred ||
      (this.inlineIndexRefreshDeferred && !presentationUnchanged);
    const refreshBacklinks = this.inlineIndexRefreshDeferred &&
      presentationUnchanged;
    this.renderRefreshDeferred = false;
    this.inlineIndexRefreshDeferred = false;
    this.clearInlineEditPolicyMessage();
    this.inlineEdit = null;
    this.plugin.releaseInlineEdit(path, this);
    this.setDeckKeybindingsSuspended(false);
    editing.cardEl.removeClass("is-inline-editing");
    editing.bodyEl.removeClasses([
      "is-inline-editing",
      "has-inline-edit-error",
    ]);

    if (!shouldSkipRender) {
      if (requiresFullRefresh) {
        this.recentInlineEditRefresh = null;
        await this.refresh();
      } else {
        const modified = this.plugin.index.fileAtPath(path)?.stat.mtime ??
          editing.file.stat.mtime;
        this.recentInlineEditRefresh = {
          path,
          modified,
          presentationFingerprint:
            this.currentInlineEditPresentationFingerprint(path),
          expiresAt: Date.now() + 2_000,
        };
        await this.rerenderEditedPath(editing.file, editing.bodyEl, editing.renderedScrollTop);
        await this.trayRenderer.rerenderPath(editing.file);
        if (refreshBacklinks) {
          this.refreshInlineEditLinkMetadata();
        }
      }
    }
    if (reasons.has("escape")) {
      if (this.viewedCard?.path === path && this.viewedCardEl !== null) {
        this.viewedCardEl.focus({ preventScroll: true });
      } else {
        this.contentEl.focus({ preventScroll: true });
      }
    }
    return true;
  }

  async runAfterInlineEditing(
    reason: string,
    action: () => void | Promise<void>,
  ): Promise<boolean> {
    return runAfterInlineEditing(
      () => this.finishInlineEditing(reason),
      action,
    );
  }

  private async viewCard(
    file: TFile,
    returnTarget: ViewedCardReturnTarget,
    editImmediately: boolean,
  ): Promise<void> {
    if (!this.plugin.isFileInTray(file)) {
      new Notice("Put the card on the Desk before viewing it.");
      return;
    }
    if (this.filingFile !== null) {
      new Notice("Finish filing before viewing another card.");
      return;
    }
    if (this.viewedCard?.path !== file.path) {
      const viewed = await this.runAfterInlineEditing(
        "view-card",
        async () => {
          this.rememberViewedCardScroll();
          this.viewedCard = createViewedCardState(file.path, returnTarget);
          await this.renderDeck(false);
        },
      );
      if (!viewed) {
        return;
      }
    }
    this.focusViewedCard();
    if (editImmediately && this.viewedCardBodyEl !== null) {
      await this.beginInlineEditing(file, this.viewedCardBodyEl);
    }
  }

  private async editCardOnDesk(file: TFile): Promise<void> {
    if (!this.plugin.isFileInTray(file)) {
      new Notice("Put the card on the Desk before editing it.");
      return;
    }
    if (this.filingFile !== null) {
      new Notice("Finish filing before editing a card body.");
      return;
    }
    let position = cardPosition(this.plugin.tray, file.path);
    if (position === null) {
      new Notice("Could not find the card on the Desk.");
      return;
    }
    if (
      position.cardIndex > 0 &&
      !this.plugin.tray.expandedPileIds.includes(position.pileId)
    ) {
      await this.plugin.setTrayPileExpanded(position.pileId, true);
      position = cardPosition(this.plugin.tray, file.path);
      if (position === null) {
        new Notice("Could not find the card on the Desk.");
        return;
      }
    }
    const returnTarget: ViewedCardReturnTarget = {
      surface: "desk",
      pileId: position.pileId,
    };
    if (this.viewedCard?.path !== file.path) {
      await this.viewCard(file, returnTarget, true);
      return;
    }

    const retargeted = retargetViewedCardState(this.viewedCard, returnTarget);
    if (retargeted !== this.viewedCard) {
      this.viewedCard = retargeted;
      await this.renderDeck(false);
    }
    this.focusViewedCard();
    await this.beginInlineEditing(file, this.viewedCardBodyEl);
  }

  private async closeViewedCard(): Promise<void> {
    const viewed = this.viewedCard;
    if (viewed === null) {
      return;
    }
    if (
      this.filingSourceSurface === "viewed" &&
      this.filingSourcePath === viewed.path
    ) {
      new Notice("Finish or cancel filing before closing the viewed card.");
      return;
    }
    await this.runAfterInlineEditing("close-viewed-card", async () => {
      this.viewedCard = null;
      this.viewedCardEl = null;
      this.viewedCardBodyEl = null;
      const position = cardPosition(this.plugin.tray, viewed.path);
      const returnTarget = resolveViewedCardReturnTarget(
        viewed,
        this.plugin.index.filedByPath(viewed.path) !== undefined,
        position?.pileId,
      );
      if (returnTarget?.surface === "deck") {
        this.setDeckAnchor(viewed.path);
        this.assignCardFocus(deckCardFocus(viewed.path));
        this.viewportOffset = 0;
      } else if (returnTarget?.surface === "desk") {
        this.assignCardFocus(deskCardFocus(viewed.path, returnTarget.pileId));
      } else {
        this.assignCardFocus(null);
        this.reconcileCardFocus();
      }
      await this.renderDeck(false);
      const deskCard = returnTarget?.surface === "desk"
        ? this.stageEl?.querySelector<HTMLElement>(
            `.slipbox-tray-card[data-card-ref="${CSS.escape(viewed.path)}"]`,
          ) ?? null
        : null;
      (deskCard ?? this.contentEl).focus({ preventScroll: true });
    });
  }

  private async beginInlineEditing(
    file: TFile,
    bodySurface: HTMLElement | null,
    restored?: {
      readonly baseBody: string;
      readonly protectedBody: string | null;
      readonly draft: string;
      readonly conflictMessage: string | null;
      readonly conflictRetryable: boolean;
      readonly selectionStart: number;
      readonly selectionEnd: number;
      readonly textareaScrollTop: number;
      readonly renderedScrollTop: number;
    },
  ): Promise<void> {
    if (this.filingFile !== null) {
      new Notice("Finish filing before editing a card body.");
      return;
    }
    if (this.inlineEditStarting) {
      return;
    }
    if (this.inlineEdit !== null) {
      if (this.inlineEdit.controller.snapshot.path === file.path) {
        this.inlineEdit.textarea.focus({ preventScroll: true });
        return;
      }
      if (!(await this.finishInlineEditing("start-another-editor"))) {
        return;
      }
    }
    if (!this.plugin.acquireInlineEdit(file.path, this)) {
      return;
    }

    this.inlineEditStarting = true;
    try {
      const prepared = restored === undefined
        ? await this.plugin.prepareInlineEdit(file)
        : { file, body: restored.baseBody };
      const protectedBody = restored === undefined
        ? this.plugin.settings.protectFiledCardText &&
            this.plugin.index.filedByFile(prepared.file) !== undefined
          ? prepared.body
          : null
        : restored.protectedBody;
      const mounted = this.mountInlineEditing(
        prepared.file,
        prepared.body,
        protectedBody,
        bodySurface,
        restored?.renderedScrollTop,
      );
      this.inlineEdit = mounted;
      if (restored !== undefined && restored.draft !== restored.baseBody) {
        mounted.textarea.value = restored.draft;
        mounted.controller.updateDraft(restored.draft);
      }
      if (restored !== undefined) {
        mounted.textarea.scrollTop = restored.textareaScrollTop;
      }
      if (restored?.conflictMessage !== null && restored?.conflictMessage !== undefined) {
        mounted.controller.markConflict(
          restored.conflictMessage,
          restored.conflictRetryable,
        );
        this.applyInlineEditFailure(mounted.controller.snapshot.failure);
      }
      this.setDeckKeybindingsSuspended(true);
      mounted.textarea.win.requestAnimationFrame(() => {
        if (this.inlineEdit === mounted) {
          mounted.textarea.focus({ preventScroll: true });
          mounted.textarea.setSelectionRange(
            restored?.selectionStart ?? mounted.textarea.value.length,
            restored?.selectionEnd ?? mounted.textarea.value.length,
          );
          if (restored !== undefined) {
            mounted.textarea.scrollTop = restored.textareaScrollTop;
          }
        }
      });
    } catch (error) {
      this.plugin.releaseInlineEdit(file.path, this);
      new Notice(`Could not start inline editing: ${errorMessage(error)}`);
    } finally {
      this.inlineEditStarting = false;
    }
  }

  private mountInlineEditing(
    file: TFile,
    baseBody: string,
    protectedBody: string | null,
    requestedBodySurface: HTMLElement | null,
    restoredRenderedScrollTop?: number,
  ): MountedInlineEdit {
    const returnTarget = this.viewedCard?.path === file.path
      ? this.viewedCard.returnTarget
      : null;
    const bodyEl = requestedBodySurface;
    const cardEl = bodyEl?.closest<HTMLElement>(".slipbox-card") ?? null;
    if (returnTarget === null || bodyEl === null || cardEl === null) {
      throw new Error("The viewed card surface is unavailable");
    }

    const renderedScrollTop = restoredRenderedScrollTop ?? bodyEl.scrollTop;
    this.unloadViewedCardComponent();
    bodyEl.empty();
    bodyEl.removeClass("markdown-rendered");
    bodyEl.addClass("is-inline-editing");
    cardEl.addClass("is-inline-editing");
    const textarea = bodyEl.createEl("textarea", {
      cls: "slipbox-inline-editor",
      attr: {
        spellcheck: "true",
      },
    });
    setCardTooltip(
      textarea,
      `Edit raw Markdown for ${this.plugin.cardTitle(file)}`,
      this.plugin.settings.showTooltips,
      { placement: "bottom", delay: 250 },
    );
    textarea.value = baseBody;
    const statusId = `slipbox-inline-edit-status-${++inlineEditStatusSequence}`;
    textarea.setAttr("aria-errormessage", statusId);
    const statusEl = bodyEl.createDiv({
      cls: "slipbox-inline-edit-status",
      attr: {
        id: statusId,
        role: "status",
        "aria-live": "assertive",
      },
    });
    statusEl.hidden = true;

    const controller = new InlineEditSessionController(
      file.path,
      baseBody,
      {
        commit: async (request) => {
          const result = await this.plugin.commitInlineEdit(request);
          if (result.status === "saved" && !request.final) {
            const latestFile = this.plugin.index.fileAtPath(request.path) ?? file;
            await this.trayRenderer.rerenderPath(latestFile);
          }
          return result;
        },
        flushOpenViews: (path) => this.plugin.flushOpenTextViews(path),
        schedule: (callback, delayMs) => textarea.win.setTimeout(callback, delayMs),
        cancelScheduled: (handle) => textarea.win.clearTimeout(handle as number),
        reportFailure: (failure) => this.reportInlineEditFailure(failure),
      },
      protectedBody,
    );
    attachPaperWorkflowTextarea(textarea, {
      restrictPaste: this.plugin.settings.restrictViewedCardPaste,
      acceptsDraft: (draft) => controller.acceptsDraft(draft),
      updateDraft: (draft) => controller.updateDraft(draft),
      currentDraft: () => controller.snapshot.draft,
      accepted: () => {
        if (controller.snapshot.phase !== "conflict") {
          this.clearInlineEditPolicyMessage();
          bodyEl.removeClass("has-inline-edit-error");
          textarea.removeAttribute("aria-invalid");
          statusEl.hidden = true;
          statusEl.setText("");
        }
      },
      message: (message) => this.showInlineEditPolicyMessage(message),
    });
    textarea.addEventListener("pointerdown", (event) => event.stopPropagation());
    textarea.addEventListener("click", (event) => event.stopPropagation());

    return {
      controller,
      file,
      returnTarget,
      textarea,
      statusEl,
      policyStatusTimer: null,
      bodyEl,
      cardEl,
      renderedScrollTop,
      presentationFingerprint:
        this.currentInlineEditPresentationFingerprint(file.path),
    };
  }

  private handleInlineEditPointerDown(event: PointerEvent): void {
    const editing = this.inlineEdit;
    if (editing === null) {
      return;
    }
    if (!shouldFinishInlineEditFromPointerDown(
      event.target,
      editing.textarea,
      editing.cardEl,
    )) {
      return;
    }
    void this.finishInlineEditing("outside-pointer");
  }

  private currentInlineEditPresentationFingerprint(path: string): string {
    const snapshot = this.plugin.index.snapshot;
    return inlineEditPresentationFingerprint({
      editingPath: path,
      cards: [
        ...snapshot.filed.map((card) => ({
          path: card.path,
          modified: card.file.stat.mtime,
          presentation: [
            "filed",
            card.address,
            this.plugin.cardTitle(card.file),
          ],
        })),
        ...snapshot.unfiled.map((file) => ({
          path: file.path,
          modified: file.stat.mtime,
          presentation: ["unfiled", this.plugin.cardTitle(file)],
        })),
      ],
      context: {
        issues: snapshot.issues,
        tray: this.plugin.tray,
        settings: this.plugin.settings,
        bookmarks: this.plugin.state.bookmarks,
      },
    });
  }

  private refreshInlineEditLinkMetadata(): void {
    const backlinksForPath = (path: string) =>
      this.plugin.index.backlinksForPath(path);
    this.cardFooters.refreshBacklinks(backlinksForPath);
    this.viewedCardFooter.refreshBacklinks(backlinksForPath);
    this.refreshBranchPresentation();
  }

  refreshBranchPresentation(): void {
    this.cardSignatures.refreshBranches();
    this.viewedCardSignature.refreshBranches();
    this.trayRenderer.refreshBranchMetadata();
    this.inferredNavigation.refresh();
    this.viewedInferredNavigation.refresh();
    this.trayRenderer.refreshInferredNavigation();
  }

  private cardSignatureBranches(path: string): readonly CardSignatureBranch[] {
    return this.plugin.index.incomingBranchesForPath(path).flatMap((branch) => {
      const source = this.plugin.index.filedByPath(branch.sourcePath);
      if (source === undefined) {
        return [];
      }
      return [{
        label: branch.label,
        sourcePath: source.path,
        sourceAddress: source.address,
        sourceTitle: this.plugin.cardTitle(source.file),
        linktext: this.app.metadataCache.fileToLinktext(source.file, path),
      }];
    });
  }

  private reportInlineEditFailure(failure: InlineEditFailure): void {
    if (failure.kind === "policy") {
      this.showInlineEditPolicyMessage(failure.message);
      return;
    }
    this.applyInlineEditFailure(failure);
    const detail = failure.error === undefined
      ? failure.message
      : `${failure.message} ${errorMessage(failure.error)}`;
    new Notice(`${detail} Your draft remains in the card and can be copied.`);
  }

  private applyInlineEditFailure(failure: InlineEditFailure | null): void {
    const editing = this.inlineEdit;
    if (editing === null || failure === null) {
      return;
    }
    if (failure.kind === "policy") {
      this.showInlineEditPolicyMessage(failure.message);
      return;
    }
    this.clearInlineEditPolicyMessage();
    editing.bodyEl.addClass("has-inline-edit-error");
    editing.textarea.setAttr("aria-invalid", "true");
    editing.statusEl.setText(failure.message);
    editing.statusEl.hidden = false;
  }

  private showInlineEditPolicyMessage(message: string): void {
    const editing = this.inlineEdit;
    if (editing === null) {
      return;
    }
    const failure = editing.controller.snapshot.failure;
    if (failure !== null && failure.kind !== "policy") {
      return;
    }
    if (editing.policyStatusTimer !== null) {
      editing.textarea.win.clearTimeout(editing.policyStatusTimer);
    }
    editing.statusEl.addClass("is-policy-message");
    editing.statusEl.setAttr("aria-live", "polite");
    editing.statusEl.setText(message);
    editing.statusEl.hidden = false;
    editing.policyStatusTimer = editing.textarea.win.setTimeout(() => {
      if (this.inlineEdit === editing) {
        this.clearInlineEditPolicyMessage();
      }
    }, 2_000);
  }

  private clearInlineEditPolicyMessage(): void {
    const editing = this.inlineEdit;
    if (editing === null) {
      return;
    }
    if (editing.policyStatusTimer !== null) {
      editing.textarea.win.clearTimeout(editing.policyStatusTimer);
      editing.policyStatusTimer = null;
    }
    if (!editing.statusEl.hasClass("is-policy-message")) {
      return;
    }
    editing.statusEl.removeClass("is-policy-message");
    editing.statusEl.setAttr("aria-live", "assertive");
    editing.statusEl.setText("");
    editing.statusEl.hidden = true;
  }

  private async rerenderEditedPath(
    file: TFile,
    target: HTMLElement,
    scrollTop: number,
  ): Promise<void> {
    if (!target.isConnected) {
      return;
    }
    target.empty();
    target.removeClasses(["is-inline-editing", "has-inline-edit-error"]);
    target.addClass("markdown-rendered");
    const effectiveScrollTop = configureRenderedCardBody(
      target,
      this.plugin.settings.allowCardScrolling,
      scrollTop,
    );
    if (
      this.viewedCard?.path === file.path &&
      target.closest(".slipbox-viewed-card") !== null
    ) {
      this.viewedCard = scrollViewedCardState(
        this.viewedCard,
        effectiveScrollTop,
      );
      await this.renderViewedMarkdownCard(file, target);
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    if (filed === undefined) {
      return;
    }
    if (this.plugin.settings.allowCardScrolling) {
      this.cardScrollPositions.set(file.path, effectiveScrollTop);
    } else {
      this.cardScrollPositions.delete(file.path);
    }
    await this.renderMarkdownCard(filed, target, this.deckRenderVersion);
  }

  private async restoreDetachedInlineEdit(): Promise<void> {
    const draft = this.plugin.takeDetachedInlineEdit();
    if (draft === null) {
      return;
    }
    const file = this.plugin.index.fileAtPath(draft.path) ?? draft.file;
    this.viewedCard = createViewedCardState(draft.path, draft.returnTarget);
    const position = cardPosition(this.plugin.tray, draft.path);
    this.assignCardFocus(viewedCardFocus(draft.path, position?.pileId));
    await this.renderDeck(false);
    await this.beginInlineEditing(file, this.viewedCardBodyEl, {
      baseBody: draft.baseBody,
      protectedBody: draft.protectedBody,
      draft: draft.draft,
      conflictMessage: draft.conflictMessage,
      conflictRetryable: draft.conflictRetryable,
      selectionStart: draft.selectionStart,
      selectionEnd: draft.selectionEnd,
      textareaScrollTop: draft.textareaScrollTop,
      renderedScrollTop: draft.renderedScrollTop,
    });
    if (this.inlineEdit?.controller.snapshot.path !== draft.path) {
      this.plugin.returnDetachedInlineEdit(draft);
    }
  }

  private async navigateToPath(path: string): Promise<boolean> {
    const targetIndex = this.plugin.index.filedIndexForPath(path);
    if (targetIndex < 0) {
      new Notice(`Card ${path} is missing or invalid.`);
      return false;
    }
    this.cancelViewportCentering();
    this.setDeckAnchor(path);
    this.viewportOffset = 0;
    const restoreFilingInputFocus = this.isFilingInputFocused;
    // Anchor navigation changes the Deck window, not the surrounding Desk or
    // viewed-card surfaces. Keeping those nodes mounted avoids a visible flash.
    await this.refreshDeckCardWindow();
    this.updateActiveUi();
    if (this.filingFile !== null && !restoreFilingInputFocus) {
      this.contentEl.focus({ preventScroll: true });
    }
    return true;
  }

  private chooseAvailableActiveCard(): void {
    const filed = this.plugin.index.snapshot.filed;
    const availablePaths = new Set(filed.map((card) => card.path));

    if (this.activePath !== null && availablePaths.has(this.activePath)) {
      return;
    }

    this.activePath = filed[0]?.path ?? null;
  }

  private async showFocusedCardInDeck(path: string): Promise<void> {
    this.assignCardFocus(deckCardFocus(path));
    await this.jumpToPath(path);
    if (this.viewedCard?.path === path) {
      this.focusViewedCard();
    } else {
      this.contentEl.focus({ preventScroll: true });
      this.applyCardFocusClasses();
    }
  }

  private async deleteFocusedCard(file: TFile): Promise<void> {
    const focus = this.cardFocus;
    const filed = this.plugin.index.snapshot.filed;
    const deckIndex = this.plugin.index.filedIndexForPath(file.path);
    const nextDeckPath = deckIndex < 0
      ? this.activePath
      : filed[deckIndex + 1]?.path ?? filed[deckIndex - 1]?.path ?? null;
    const position = cardPosition(this.plugin.tray, file.path);
    const pile = position === null
      ? undefined
      : this.plugin.tray.piles[position.pileIndex];
    const nextDeskPath = position === null || pile === undefined
      ? null
      : pile.cards[position.cardIndex + 1]?.cardRef ??
        pile.cards[position.cardIndex - 1]?.cardRef ??
        null;

    if (!(await this.plugin.deleteCard(file))) {
      return;
    }
    if (focus?.path !== file.path) {
      return;
    }
    if (
      focus.surface !== "deck" &&
      nextDeskPath !== null &&
      position !== null
    ) {
      this.assignCardFocus(deskCardFocus(nextDeskPath, position.pileId));
    } else if (nextDeckPath !== null) {
      this.setDeckAnchor(nextDeckPath);
      this.assignCardFocus(deckCardFocus(nextDeckPath));
      this.viewportOffset = 0;
    } else {
      this.assignCardFocus(null);
    }
    this.applyCardFocusClasses();
  }

  private async renderDeck(focusFilingInput = true): Promise<void> {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      this.renderRefreshDeferred = true;
      return;
    }
    const version = ++this.renderVersion;
    const deckVersion = ++this.deckRenderVersion;
    if (this.plugin.settings.allowCardScrolling) {
      this.rememberScrollPositions();
      this.rememberViewedCardScroll();
    } else {
      this.cardScrollPositions.clear();
      if (this.viewedCard !== null) {
        this.viewedCard = scrollViewedCardState(this.viewedCard, 0);
      }
    }
    if (
      this.viewedCard !== null &&
      this.plugin.index.fileAtPath(this.viewedCard.path) === undefined
    ) {
      this.viewedCard = null;
    }
    this.unloadRenderComponents();
    this.cardFooters.clear();
    this.cardSignatures.clear();
    this.inferredNavigation.clear();
    this.trayRenderer.clear();
    this.clearCardHeaderButtonControllers();
    this.viewedCardFooter.clear();
    this.viewedCardSignature.clear();
    this.viewedInferredNavigation.clear();
    this.clearViewedCardHeaderButtonController();
    this.unloadViewedCardComponent();
    this.contentEl.empty();
    this.renderedCards = [];
    this.deckCardsEl = null;
    this.deckMapEl = null;
    this.deckMapRailEl = null;
    this.deckMapSectionLayerEl = null;
    this.deckMapBookmarkLayerEl = null;
    this.deckMapActiveMarkerEl = null;
    this.deckMapBookmarkMarkerEls.clear();
    this.deckMapSections = [];
    this.deckMapBookmarkCount = 0;
    this.pendingCommandEl = null;
    this.viewedCardEl = null;
    this.viewedCardBodyEl = null;
    this.viewedFilingEditor = null;
    this.contentEl.dataset.mainCardSize = this.plugin.settings.mainCardSize;
    this.contentEl.dataset.trayCardSize = this.plugin.settings.trayCardSize;
    this.applyDeckPositionMode();

    const shell = this.contentEl.createDiv({ cls: "slipbox-deck-shell" });
    this.renderDeckMap(shell);
    this.renderPendingCommandStatus(shell);
    this.applyDeckMapVisibility();

    const stage = shell.createDiv({ cls: "slipbox-deck-stage" });
    this.stageEl = stage;
    this.attachBrowsingEvents(stage);
    const space = stage.createDiv({ cls: "slipbox-space" });
    this.spaceEl = space;
    this.applySpaceOffset();
    const deckCards = space.createDiv({ cls: "slipbox-deck-cards" });
    this.deckCardsEl = deckCards;
    const trayJob = this.trayRenderer.render(
      stage,
      space,
      this.currentFilingState(),
      this.viewedCard?.path ?? null,
      () => version === this.renderVersion,
    );
    const filed = this.plugin.index.snapshot.filed;
    if (filed.length === 0) {
      this.renderEmptyDeck(deckCards);
    } else {
      const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
      await this.renderCardWindow(deckCards, filed, activeIndex, deckVersion);
    }

    if (version !== this.renderVersion) {
      return;
    }

    await trayJob;
    if (version !== this.renderVersion) {
      return;
    }

    await this.renderViewedCard(stage, version);
    if (version !== this.renderVersion) {
      return;
    }

    this.renderBookmarkEdgeTabs(stage);
    this.positionCards();
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    this.viewedCardFooter.scheduleLayout();
    if (focusFilingInput) {
      this.focusFilingInput();
    }
  }

  private async refreshDeckCardWindow(): Promise<void> {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      this.renderRefreshDeferred = true;
      return;
    }
    const space = this.spaceEl;
    if (space === null || !space.isConnected) {
      await this.renderDeck(false);
      return;
    }

    const deckVersion = ++this.deckRenderVersion;
    this.rememberScrollPositions();
    this.unloadRenderComponents();
    this.cardFooters.clear();
    this.cardSignatures.clear();
    this.inferredNavigation.clear();
    this.clearCardHeaderButtonControllers();
    this.deckCardsEl?.remove();
    this.renderedCards = [];

    const deckCards = space.createDiv({ cls: "slipbox-deck-cards" });
    space.prepend(deckCards);
    this.deckCardsEl = deckCards;
    const filed = this.plugin.index.snapshot.filed;
    if (filed.length === 0) {
      this.renderEmptyDeck(deckCards);
    } else {
      const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
      await this.renderCardWindow(deckCards, filed, activeIndex, deckVersion);
    }

    if (
      deckVersion !== this.deckRenderVersion ||
      this.deckCardsEl !== deckCards
    ) {
      return;
    }
    this.positionCards();
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
  }

  private renderDeckMap(shell: HTMLElement): void {
    const filed = this.plugin.index.snapshot.filed;
    if (filed.length === 0) {
      return;
    }

    const map = shell.createDiv({
      cls: "slipbox-deck-map",
      attr: {
        role: "slider",
        tabindex: "0",
        "aria-valuemin": "1",
        "aria-valuemax": String(filed.length),
      },
    });
    setCardTooltip(map, "Deck map", this.plugin.settings.showTooltips, {
      placement: "bottom",
      delay: 350,
    });
    const rail = map.createDiv({
      cls: "slipbox-deck-map-rail",
      attr: { "aria-hidden": "true" },
    });
    const markerLayer = rail.createDiv({
      cls: "slipbox-deck-map-markers",
    });
    this.deckMapSectionLayerEl = rail.createDiv({
      cls: "slipbox-deck-map-sections",
    });
    this.deckMapEl = map;
    this.deckMapRailEl = rail;

    for (const index of sampleDeckMapIndices(
      filed.length,
      DECK_MAP_MARKER_BUDGET,
    )) {
      const marker = markerLayer.createSpan({
        cls: "slipbox-deck-map-marker",
      });
      const card = filed[index];
      marker.toggleClass(
        "is-in-tray",
        card !== undefined && this.plugin.isFileInTray(card.file),
      );
      marker.style.setProperty(
        "--slipbox-deck-map-position",
        String(deckMapCoordinate(index, filed.length) ?? 0),
      );
    }
    this.deckMapBookmarkLayerEl = rail.createDiv({
      cls: "slipbox-deck-map-markers",
    });
    const activeLayer = rail.createDiv({
      cls: "slipbox-deck-map-markers",
    });
    this.deckMapActiveMarkerEl = activeLayer.createSpan({
      cls: "slipbox-deck-map-marker is-active is-hidden",
    });
    this.deckMapSections = buildDeckMapSectionMarkers(filed);
    this.updateDeckMapBookmarks(this.bookmarkedPaths());
    this.updateDeckMapSectionLabels();

    map.addEventListener("click", (event) => {
      const bounds = rail.getBoundingClientRect();
      const cards = this.plugin.index.snapshot.filed;
      const targetIndex = deckMapIndexAtOffset(
        event.clientX - bounds.left,
        bounds.width,
        cards.length,
      );
      const target = targetIndex === null ? undefined : cards[targetIndex];
      if (target !== undefined && target.path !== this.activePath) {
        void this.runAfterInlineEditing(
          "deck-map-jump",
          () => this.jumpToPath(target.path),
        );
      }
    });
    map.addEventListener("keydown", (event) => {
      const action = event.key === "ArrowLeft"
        ? "previous-card"
        : event.key === "ArrowRight"
          ? "next-card"
          : event.key === "Home"
            ? "first-card"
            : event.key === "End"
              ? "last-card"
              : null;
      if (action === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.runAction(action);
    });
  }

  private applyDeckMapVisibility(): void {
    applyDeckMapVisibility(
      this.deckMapEl,
      this.deckMapVisibility,
      this.plugin.settings.showDeckMap,
      this.plugin.index.snapshot.filed.length,
    );
  }

  private renderPendingCommandStatus(shell: HTMLElement): void {
    this.pendingCommandEl = shell.createDiv({
      cls: "slipbox-pending-command-status",
      attr: {
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
      },
    });
    this.updatePendingCommandStatus();
  }

  private updatePendingCommandStatus(): void {
    const status = this.pendingCommandEl;
    if (status === null) {
      return;
    }
    let instruction = "";
    if (this.pendingCommand.kind === "address") {
      instruction = "Find from start: type an address initial · Esc to cancel";
    } else if (this.pendingCommand.kind === "pile") {
      const digits = this.pendingCommand.digits === ""
        ? "…"
        : this.pendingCommand.digits;
      instruction = `Pile number: ${digits} · Enter to confirm · Esc to cancel`;
    }
    const text = this.pendingCommandFeedback || instruction;
    status.hidden = text === "";
    status.setText(text);
  }

  private clearPendingCommand(): void {
    if (this.pendingCommandFeedbackTimer !== null) {
      this.contentEl.win.clearTimeout(this.pendingCommandFeedbackTimer);
      this.pendingCommandFeedbackTimer = null;
    }
    this.pendingCommand = IDLE_DECK_COMMAND;
    this.pendingCommandFeedback = "";
    this.updatePendingCommandStatus();
  }

  private showCommandFeedback(message: string): void {
    if (this.pendingCommandFeedbackTimer !== null) {
      this.contentEl.win.clearTimeout(this.pendingCommandFeedbackTimer);
    }
    this.pendingCommandFeedback = message;
    this.updatePendingCommandStatus();
    this.pendingCommandFeedbackTimer = this.contentEl.win.setTimeout(() => {
      this.pendingCommandFeedbackTimer = null;
      this.pendingCommandFeedback = "";
      this.updatePendingCommandStatus();
    }, COMMAND_FEEDBACK_DURATION_MS);
  }

  private beginAddressCommand(): void {
    this.pendingCommandStartEvent = null;
    this.clearPendingCommand();
    this.pendingCommand = startAddressCommand();
    this.updatePendingCommandStatus();
  }

  private beginPileCommand(): void {
    this.pendingCommandStartEvent = null;
    this.clearPendingCommand();
    this.pendingCommand = startPileCommand();
    this.updatePendingCommandStatus();
  }

  private completeAddressCommand(initial: string): void {
    const filed = this.plugin.index.snapshot.filed;
    const targetIndex = findAddressInitialIndex(filed, initial);
    const target = targetIndex === null ? undefined : filed[targetIndex];
    if (target === undefined) {
      this.showCommandFeedback(`No filed card begins with “${initial}”.`);
      return;
    }
    void this.jumpToPath(target.path);
  }

  private completePileCommand(digits: string): void {
    const ordinal = Number(digits);
    const pileCount = this.plugin.tray.piles.length;
    if (
      digits === "" ||
      !Number.isSafeInteger(ordinal) ||
      ordinal <= 0 ||
      ordinal > pileCount
    ) {
      this.pendingCommandFeedback = digits === ""
        ? "Enter a pile number before confirming."
        : pileCount === 0
          ? "There are no piles."
          : `Pile ${digits} does not exist.`;
      this.updatePendingCommandStatus();
      return;
    }

    const card = this.focusedFiledCard;
    if (card === null) {
      this.clearPendingCommand();
      this.showCommandFeedback("There is no focused filed card.");
      return;
    }
    const source = cardPosition(this.plugin.tray, card.path);
    const next = placeFiledCardInPileOrdinal(
      this.plugin.tray,
      card.path,
      ordinal,
    );
    this.clearPendingCommand();
    if (next === this.plugin.tray) {
      this.showCommandFeedback(`The focused card is already in pile ${ordinal}.`);
      return;
    }
    this.showCommandFeedback(
      source === null
        ? `Put the focused card into pile ${ordinal}.`
        : `Moved the focused card to pile ${ordinal}.`,
    );
    const targetPile = this.plugin.tray.piles[ordinal - 1];
    if (targetPile !== undefined) {
      this.assignCardFocus(deskCardFocus(card.path, targetPile.id));
    }
    void this.plugin.updateTray(next);
  }

  private updateDeckMapBookmarks(bookmarkedPaths: Set<string>): void {
    const layer = this.deckMapBookmarkLayerEl;
    if (this.deckMapEl === null || layer === null) {
      return;
    }

    for (const marker of this.deckMapBookmarkMarkerEls.values()) {
      marker.remove();
    }
    this.deckMapBookmarkMarkerEls.clear();
    const cardCount = this.plugin.index.snapshot.filed.length;
    for (const path of bookmarkedPaths) {
      const index = this.plugin.index.filedIndexForPath(path);
      const position = deckMapCoordinate(index, cardCount);
      if (position === null) {
        continue;
      }
      const marker = layer.createSpan({
        cls: "slipbox-deck-map-marker is-bookmarked",
      });
      const card = this.plugin.index.filedByPath(path);
      marker.toggleClass(
        "is-in-tray",
        card !== undefined && this.plugin.isFileInTray(card.file),
      );
      marker.style.setProperty(
        "--slipbox-deck-map-position",
        String(position),
      );
      this.deckMapBookmarkMarkerEls.set(path, marker);
    }
    this.deckMapBookmarkCount = this.deckMapBookmarkMarkerEls.size;
    this.updateDeckMapActiveUi();
  }

  private updateDeckMapSectionLabels(): void {
    const rail = this.deckMapRailEl;
    const layer = this.deckMapSectionLayerEl;
    if (rail === null || layer === null) {
      return;
    }
    const sections = visibleDeckMapSectionMarkers(
      this.deckMapSections,
      rail.getBoundingClientRect().width,
      DECK_MAP_SECTION_LABEL_SPACING,
    );
    layer.empty();
    for (const section of sections) {
      const label = layer.createSpan({
        cls: "slipbox-deck-map-section",
        text: section.label,
      });
      label.style.setProperty(
        "--slipbox-deck-map-position",
        String(section.position),
      );
    }
  }

  private updateDeckMapActiveUi(): void {
    const map = this.deckMapEl;
    if (map === null) {
      return;
    }

    const cardCount = this.plugin.index.snapshot.filed.length;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const position = deckMapCoordinate(activeIndex, cardCount);
    const activeMarker = this.deckMapActiveMarkerEl;
    const bookmarkLabel =
      `${this.deckMapBookmarkCount} bookmark${this.deckMapBookmarkCount === 1 ? "" : "s"}`;
    if (position === null) {
      if (activeMarker !== null) {
        activeMarker.addClass("is-hidden");
      }
      map.removeAttribute("aria-valuenow");
      map.setAttr(
        "aria-valuetext",
        `${cardCount} filed cards; ${bookmarkLabel}`,
      );
      return;
    }

    if (activeMarker !== null) {
      activeMarker.removeClass("is-hidden");
      activeMarker.style.setProperty(
        "--slipbox-deck-map-position",
        String(position),
      );
    }
    const summary =
      `Deck anchor ${activeIndex + 1} of ${cardCount}; ${bookmarkLabel}`;
    map.setAttr("aria-valuenow", String(activeIndex + 1));
    map.setAttr("aria-valuetext", summary);
  }

  private renderEmptyDeck(stage: HTMLElement): void {
    const empty = stage.createDiv({ cls: "slipbox-deck-empty" });
    empty.createEl("h2", { text: "The filing box is empty" });
    empty.createEl("p", {
      text: "Create a new card, then file it with a manual address.",
    });
  }

  private async renderCardWindow(
    stage: HTMLElement,
    filed: readonly FiledCard[],
    activeIndex: number,
    deckVersion: number,
  ): Promise<void> {
    const viewportPosition = this.viewportPosition(activeIndex);
    const viewportIndex = Math.round(viewportPosition);
    const radius = Math.min(
      8,
      Math.max(3, Math.ceil(1 / this.plugin.settings.cardSpread) + 2),
    );
    const start = Math.max(0, viewportIndex - radius);
    const end = Math.min(filed.length - 1, viewportIndex + radius);
    this.renderWindowStart = start;
    this.renderWindowEnd = end;
    const jobs: Promise<void>[] = [];

    const focusDisplayIndex = activeIndex;

    for (let filedIndex = start; filedIndex <= end; filedIndex += 1) {
      const card = filed[filedIndex];
      if (card === undefined) {
        continue;
      }

      const cardEl = stage.createDiv({ cls: "slipbox-card" });
      cardEl.dataset.index = String(filedIndex);
      cardEl.dataset.filedIndex = String(filedIndex);
      cardEl.dataset.path = card.path;
      cardEl.toggleClass("is-deck-anchor", filedIndex === activeIndex);
      cardEl.toggleClass(
        "is-card-focused",
        this.cardFocus?.surface === "deck" && this.cardFocus.path === card.path,
      );
      cardEl.addEventListener("focusin", () => this.focusDeckCard(card.path));
      const isViewed = this.viewedCard?.path === card.path;
      cardEl.toggleClass("is-viewed-ghost", isViewed);
      const isBookmarked = this.plugin.bookmarkAtPath(card.path) !== undefined;
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const isInTray = this.plugin.isFileInTray(card.file);
      cardEl.toggleClass("is-in-tray", isInTray);
      cardEl.toggleClass("can-drag-to-desk", !isInTray);
      const title = this.plugin.cardTitle(card.file);
      const cardLabel = `${card.address} · ${title}${
        isInTray ? "; pulled out into a working pile" : ""
      }`;
      setCardTooltip(
        cardEl,
        cardLabel,
        this.plugin.settings.showTooltips,
        { placement: "bottom", delay: 350 },
      );
      setCardStackOrder(
        cardEl,
        cardStackOrder(filedIndex, focusDisplayIndex),
      );
      this.renderedCards.push(cardEl);

      if (isViewed) {
        setCardTooltip(
          cardEl,
          `${card.address} · ${title}; viewed card placeholder. Activate to focus the viewed card.`,
          this.plugin.settings.showTooltips,
          { placement: "bottom", delay: 350 },
        );
        cardEl.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.focusViewedCard();
        });
        cardEl.addEventListener("contextmenu", (event) => {
          this.focusViewedCard();
          this.plugin.showCardContextMenu(
            event,
            card.file,
            card.address,
            "viewed",
            DECK_VIEW_TYPE,
            this.leaf,
            this.viewedCard?.returnTarget.surface ?? null,
          );
        });
        continue;
      }

      const frame = cardEl.createDiv({ cls: "slipbox-card-frame" });
      const addressRow = frame.createDiv({ cls: "slipbox-card-address-row" });
      if (!isInTray) {
        this.attachDeckCardDragging(addressRow, cardEl, card);
      }
      const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
      this.cardSignatures.render(identity, {
        path: card.path,
        address: card.address,
        addressClass: "slipbox-card-address",
        interactive: filedIndex === activeIndex,
      });
      const headerTitle = cardHeaderTitle(
        title,
        this.plugin.settings.showTitleInDeck,
      );
      if (headerTitle !== null) {
        identity.createSpan({
          cls: "slipbox-card-header-title",
          text: headerTitle,
        });
      }
      const cardActions = addressRow.createDiv({ cls: "slipbox-card-actions" });
      this.cardHeaderButtonControllers.add(renderCardHeaderButtons({
        container: cardActions,
        context: {
          surface: "deck",
          viewedReturnSurface: null,
          filed: true,
          onDesk: isInTray,
          bookmarked: isBookmarked,
          canMoveLeft: false,
          canMoveRight: false,
        },
        settings: this.plugin.settings.cardHeaderButtons,
        buttonClass: "slipbox-card-toggle",
        showTooltips: this.plugin.settings.showTooltips,
        tooltipPlacement: "bottom",
        run: (action) => this.runCardAction(action, card.path, "deck"),
      }));

      const scroll = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
      configureRenderedCardBody(
        scroll,
        this.plugin.settings.allowCardScrolling,
        this.cardScrollPositions.get(card.path) ?? 0,
      );
      if (shouldRenderAutomaticBacklinks(
        this.plugin.settings.showAutomaticBacklinks,
        true,
      )) {
        this.cardFooters.render(frame, {
          sourcePath: card.path,
          backlinks: this.plugin.index.backlinksForPath(card.path),
          interactive: filedIndex === activeIndex,
          activate: (backlink) => this.jumpToPath(backlink.path),
        });
      }
      this.inferredNavigation.render(cardEl, {
        path: card.path,
        interactive: filedIndex === activeIndex,
      });
      jobs.push(this.renderMarkdownCard(card, scroll, deckVersion));
      cardEl.addEventListener("contextmenu", (event) => {
        const target = event.targetNode;
        if (
          target?.instanceOf(Element) !== true ||
          target.closest("a, button, input, textarea, select") !== null
        ) {
          return;
        }
        this.focusDeckCard(card.path);
        this.plugin.showCardContextMenu(
          event,
          card.file,
          card.address,
          "deck",
          DECK_VIEW_TYPE,
          this.leaf,
        );
      });

      cardEl.addEventListener("click", (event) => {
        if (event.win.performance.now() < this.suppressDeckCardClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const target = event.targetNode;
        if (target?.instanceOf(HTMLElement) !== true) {
          return;
        }
        if (card.path === this.activePath) {
          this.setCardFocus(deckCardFocus(card.path));
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void this.runAfterInlineEditing(
          "select-card",
          () => this.focusDeckCard(card.path),
        );
      });
    }

    this.positionCards();

    await Promise.all(jobs);
  }

  private attachDeckCardDragging(
    header: HTMLElement,
    cardEl: HTMLElement,
    card: FiledCard,
  ): void {
    header.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (
          event.targetNode?.instanceOf(Element) === true &&
          event.targetNode.closest(
            ".slipbox-card-actions, button, a, input, textarea, select, " +
            "[contenteditable='true']",
          ) !== null
        )
      ) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      beginPointerActionAfterGate(
        event,
        (action) => this.runAfterInlineEditing("deck-card-drag", action),
        () => {
          if (!header.isConnected || !cardEl.isConnected) {
            return;
          }
          beginThresholdPointerDrag({
            captureTarget: header,
            pointerId,
            startX,
            startY,
            threshold: DECK_CARD_DRAG_THRESHOLD_PX,
            onDragStart: () => {
              this.cancelViewportCentering();
              this.cancelSpaceRecentering();
              cardEl.addClass("is-dragging-to-desk");
            },
            onDragMove: (moveEvent, dx, dy) => {
              cardEl.style.translate = `${dx}px ${dy}px`;
              this.updateDeckCardDropCue(moveEvent, cardEl);
            },
            onDrop: (upEvent) => {
              this.suppressDeckCardClickUntil = upEvent.win.performance.now() +
                DECK_CARD_CLICK_SUPPRESSION_MS;
              const result = this.deckCardDropResult(
                card,
                upEvent.clientX,
                upEvent.clientY,
                cardEl,
              );
              this.clearDeckCardDrag(cardEl);
              if (result === null) {
                return;
              }
              this.assignCardFocus(deskCardFocus(
                result.focusPath,
                result.pileId,
              ));
              void this.applyDeckCardDrop(result);
            },
            onCancel: () => {
              this.suppressDeckCardClickUntil = cardEl.win.performance.now() +
                DECK_CARD_CLICK_SUPPRESSION_MS;
              this.clearDeckCardDrag(cardEl);
            },
          });
        },
      );
    });
  }

  private deckCardDropResult(
    card: FiledCard,
    x: number,
    y: number,
    dragged: HTMLElement,
  ): ResolvedDeckCardDrop | null {
    const state = this.plugin.tray;
    if (
      this.plugin.index.filedByPath(card.path) === undefined ||
      cardPosition(state, card.path) !== null
    ) {
      return null;
    }
    const target = this.deckCardDropTargetAtPoint(x, y, dragged);
    if (target?.kind === "pile") {
      const pileId = target.pile.dataset.pileId;
      if (pileId === undefined) {
        return null;
      }
      return resolveDeckCardDrop(state, card.path, {
        kind: "pile",
        pileId,
      });
    }
    if (target?.kind !== "workspace") {
      return null;
    }
    const position = this.deckPilePositionAtPoint(x, y);
    if (position === null) {
      return null;
    }
    const pileId = this.plugin.createTrayPileId();
    return resolveDeckCardDrop(state, card.path, {
      kind: "workspace",
      pileId,
      position,
    });
  }

  private deckCardDropTargetAtPoint(
    x: number,
    y: number,
    dragged: HTMLElement,
  ): DeckCardDropTarget | null {
    return deckCardDropTarget(this.elementsBelowDeckCard(x, y, dragged));
  }

  private elementsBelowDeckCard(
    x: number,
    y: number,
    dragged: HTMLElement,
  ): Element[] {
    dragged.addClass("slipbox-ignore-pointer-events");
    try {
      return dragged.doc.elementsFromPoint(x, y);
    } finally {
      dragged.removeClass("slipbox-ignore-pointer-events");
    }
  }

  private deckPilePositionAtPoint(
    x: number,
    y: number,
  ) {
    return this.trayRenderer.positionDeckCardAtPoint(x, y);
  }

  private updateDeckCardDropCue(
    event: PointerEvent,
    dragged: HTMLElement,
  ): void {
    this.clearDeckCardDropCues();
    const target = this.deckCardDropTargetAtPoint(
      event.clientX,
      event.clientY,
      dragged,
    );
    if (target?.kind === "pile") {
      target.pile.addClass("is-card-drop-target");
    }
  }

  private clearDeckCardDropCues(): void {
    this.stageEl?.querySelectorAll<HTMLElement>(
      ".slipbox-tray-pile.is-card-drop-target",
    ).forEach((pile) => pile.removeClass("is-card-drop-target"));
  }

  private clearDeckCardDrag(card: HTMLElement): void {
    card.removeClass("is-dragging-to-desk");
    card.setCssProps({ translate: "" });
    this.clearDeckCardDropCues();
  }

  private async applyDeckCardDrop(result: ResolvedDeckCardDrop): Promise<void> {
    await this.plugin.updateTray(result.state);
    this.contentEl.win.requestAnimationFrame(() => {
      this.stageEl?.querySelector<HTMLElement>(
        `.slipbox-tray-card[data-card-ref="${CSS.escape(result.focusPath)}"]`,
      )?.focus({ preventScroll: true });
    });
  }

  private async renderViewedCard(
    stage: HTMLElement,
    version: number,
  ): Promise<void> {
    const state = this.viewedCard;
    if (state === null) {
      return;
    }
    const file = this.plugin.index.fileAtPath(state.path);
    if (file === undefined) {
      this.viewedCard = null;
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const address = filed?.address ?? null;
    const filing = this.currentFilingState();
    const isFilingSource = filed === undefined &&
      filing !== null &&
      filingEditorMatchesSource(
        filing.sourcePath,
        filing.sourceSurface,
        file.path,
        "viewed",
      );
    const title = this.plugin.cardTitle(file);
    const layer = stage.createDiv({ cls: "slipbox-viewed-card-layer" });
    const card = layer.createDiv({
      cls: "slipbox-card slipbox-viewed-card",
      attr: {
        role: "group",
        tabindex: "0",
      },
    });
    setCardTooltip(
      card,
      `Viewed card ${address ?? UNFILED_ADDRESS_LABEL} · ${title}`,
      this.plugin.settings.showTooltips,
      { placement: "bottom", delay: 350 },
    );
    card.toggleClass(
      "is-card-focused",
      this.cardFocus?.surface === "viewed" && this.cardFocus.path === file.path,
    );
    card.toggleClass("is-filing-source", isFilingSource);
    card.addEventListener("focusin", () => {
      const position = cardPosition(this.plugin.tray, file.path);
      this.setCardFocus(viewedCardFocus(file.path, position?.pileId));
    });
    card.dataset.path = file.path;
    card.toggleClass("is-bookmarked", filed !== undefined &&
      this.plugin.bookmarkAtPath(filed.path) !== undefined);
    this.viewedCardEl = card;
    this.applyViewedCardPosition();

    const frame = card.createDiv({ cls: "slipbox-card-frame" });
    const addressRow = frame.createDiv({
      cls: "slipbox-card-address-row slipbox-viewed-card-drag-handle",
    });
    setCardTooltip(
      addressRow,
      "Drag to move viewed card",
      this.plugin.settings.showTooltips,
      { placement: "top", delay: 500 },
    );
    const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
    const addressEl = this.viewedCardSignature.render(identity, {
      path: file.path,
      address,
      addressClass: "slipbox-card-address",
      interactive: true,
    });
    if (isFilingSource && filing !== null) {
      this.viewedFilingEditor = renderInlineFilingEditor(
        addressEl,
        card,
        filing,
        {
          showTooltips: this.plugin.settings.showTooltips,
          onInput: (value) => this.updateFilingInput(value),
          onConfirm: () => void this.confirmFiling(),
          onCancel: () => void this.cancelFiling(),
          onPreview: () => void this.previewFilingPlacement(),
          onFocusChange: (focused) => {
            this.setDeckKeybindingsSuspended(focused);
            if (focused) {
              this.restoreFilingSourceFocus();
            }
          },
        },
      );
      this.applyFilingGuidance(
        this.viewedFilingEditor.input,
        filing.guidance,
      );
    } else if (filed === undefined) {
      setCardTooltip(
        addressEl,
        "Unfiled card address; double-click to enter an address",
        this.plugin.settings.showTooltips,
        { placement: "bottom", delay: 350 },
      );
      attachUnfiledAddressFiling(addressEl, () => {
        this.focusViewedCard();
        this.runAction("file-card");
      });
    }
    const headerTitle = cardHeaderTitle(
      title,
      this.plugin.settings.showTitleInDeck,
    );
    if (headerTitle !== null) {
      identity.createSpan({ cls: "slipbox-card-header-title", text: headerTitle });
    }
    const viewedPosition = cardPosition(this.plugin.tray, file.path);
    if (!isFilingSource) {
      const actions = addressRow.createDiv({ cls: "slipbox-card-actions" });
      this.viewedCardHeaderButtonController = renderCardHeaderButtons({
        container: actions,
        context: {
          surface: "viewed",
          viewedReturnSurface: state.returnTarget.surface,
          filed: filed !== undefined,
          onDesk: viewedPosition !== null,
          bookmarked: filed !== undefined &&
            this.plugin.bookmarkAtPath(filed.path) !== undefined,
          canMoveLeft: false,
          canMoveRight: false,
        },
        settings: this.plugin.settings.cardHeaderButtons,
        buttonClass: "slipbox-card-toggle",
        showTooltips: this.plugin.settings.showTooltips,
        tooltipPlacement: "bottom",
        run: (action) => this.runCardAction(action, file.path, "viewed"),
      });
    }

    const body = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
    configureRenderedCardBody(
      body,
      this.plugin.settings.allowCardScrolling,
      state.scrollTop,
    );
    body.addEventListener("scroll", () => {
      if (this.viewedCard?.path === file.path) {
        this.viewedCard = scrollViewedCardState(this.viewedCard, body.scrollTop);
      }
    }, { passive: true });
    body.addEventListener("dblclick", (event) => {
      if (!isInlineEditBodyTarget(event.target, body)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.focusViewedCard();
      void this.editCardOnDesk(file);
    });
    this.viewedCardBodyEl = body;
    if (shouldRenderAutomaticBacklinks(
      this.plugin.settings.showAutomaticBacklinks,
      filed !== undefined,
    ) && filed !== undefined) {
      this.viewedCardFooter.render(frame, {
        sourcePath: filed.path,
        backlinks: this.plugin.index.backlinksForPath(filed.path),
        interactive: true,
        activate: (backlink) => this.jumpToPath(backlink.path),
      });
    }
    if (filed !== undefined) {
      this.viewedInferredNavigation.render(card, {
        path: filed.path,
        interactive: true,
      });
    }
    card.addEventListener("contextmenu", (event) => {
      const target = event.targetNode;
      if (
        target?.instanceOf(Element) !== true ||
        target.closest("a, button, input, textarea, select") !== null
      ) {
        return;
      }
      this.focusViewedCard();
      this.plugin.showCardContextMenu(
        event,
        file,
        filed?.address ?? null,
        "viewed",
        DECK_VIEW_TYPE,
        this.leaf,
        state.returnTarget.surface,
      );
    });
    this.attachViewedCardDragging(addressRow, card);
    await this.renderViewedMarkdownCard(file, body);
    if (version !== this.renderVersion || this.viewedCardEl !== card) {
      return;
    }
    card.win.requestAnimationFrame(() => {
      if (this.viewedCardEl === card) {
        this.constrainViewedCard();
      }
    });
  }

  private async renderViewedMarkdownCard(
    file: TFile,
    target: HTMLElement,
  ): Promise<void> {
    this.viewedCardComponent?.unload();
    const component = new Component();
    component.load();
    this.viewedCardComponent = component;
    try {
      const body = await this.plugin.index.readBody(file);
      if (
        this.viewedCard?.path !== file.path ||
        this.viewedCardComponent !== component
      ) {
        return;
      }
      await MarkdownRenderer.render(
        this.app,
        body,
        target,
        file.path,
        component,
      );
      this.attachInternalLinkInteractions(target, file.path);
      configureRenderedCardBody(
        target,
        this.plugin.settings.allowCardScrolling,
        this.viewedCard.scrollTop,
      );
    } catch (error) {
      target.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage(error)}`,
      });
    }
  }

  private attachViewedCardDragging(
    handle: HTMLElement,
    card: HTMLElement,
  ): void {
    handle.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (
          event.targetNode?.instanceOf(Element) === true &&
          event.targetNode.closest("button, a, input, textarea, select") !== null
        )
      ) {
        return;
      }
      const startState = this.viewedCard;
      if (startState === null) {
        return;
      }
      card.focus({ preventScroll: true });
      beginThresholdPointerDrag({
        captureTarget: handle,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        threshold: VIEWED_CARD_DRAG_THRESHOLD_PX,
        onDragStart: () => card.addClass("is-dragging"),
        onDragMove: (_moveEvent, dx, dy) => {
          if (this.viewedCard?.path !== startState.path) {
            return;
          }
          this.viewedCard = moveViewedCardState(
            this.viewedCard,
            startState.x + dx,
            startState.y + dy,
            this.viewedCardBounds(card),
          );
          this.applyViewedCardPosition();
        },
        onDrop: () => card.removeClass("is-dragging"),
        onCancel: () => {
          card.removeClass("is-dragging");
          if (this.viewedCard?.path === startState.path) {
            this.viewedCard = startState;
            this.applyViewedCardPosition();
          }
        },
      });
    });
  }

  private viewedCardBounds(card: HTMLElement) {
    const stage = this.stageEl;
    return {
      stageWidth: stage?.clientWidth ?? 0,
      stageHeight: stage?.clientHeight ?? 0,
      cardWidth: card.offsetWidth,
      cardHeight: card.offsetHeight,
    };
  }

  private applyViewedCardPosition(): void {
    const state = this.viewedCard;
    const card = this.viewedCardEl;
    if (state === null || card === null) {
      return;
    }
    card.style.setProperty("--slipbox-viewed-card-x", `${state.x}px`);
    card.style.setProperty("--slipbox-viewed-card-y", `${state.y}px`);
  }

  private constrainViewedCard(): void {
    const state = this.viewedCard;
    const card = this.viewedCardEl;
    if (state === null || card === null) {
      return;
    }
    this.viewedCard = moveViewedCardState(
      state,
      state.x,
      state.y,
      this.viewedCardBounds(card),
    );
    this.applyViewedCardPosition();
  }

  private focusViewedCard(): void {
    const viewed = this.viewedCard;
    if (viewed === null) {
      return;
    }
    const position = cardPosition(this.plugin.tray, viewed.path);
    this.setCardFocus(viewedCardFocus(viewed.path, position?.pileId));
    this.viewedCardEl?.focus({ preventScroll: true });
  }

  private async beginFilingViewedCard(file: TFile): Promise<void> {
    await this.runAfterInlineEditing("viewed-file-card", async () => {
      await this.startFiling(file, "viewed");
    });
  }

  private clearCardHeaderButtonControllers(): void {
    for (const controller of this.cardHeaderButtonControllers) {
      controller.disconnect();
    }
    this.cardHeaderButtonControllers.clear();
  }

  private clearViewedCardHeaderButtonController(): void {
    this.viewedCardHeaderButtonController?.disconnect();
    this.viewedCardHeaderButtonController = null;
  }

  private async renderMarkdownCard(
    card: FiledCard,
    target: HTMLElement,
    deckVersion: number,
  ): Promise<void> {
    this.renderComponents.get(card.path)?.unload();
    const component = new Component();
    component.load();
    this.renderComponents.set(card.path, component);
    try {
      const body = await this.plugin.index.readBody(card.file);
      if (
        deckVersion !== this.deckRenderVersion ||
        this.renderComponents.get(card.path) !== component
      ) {
        return;
      }
      await MarkdownRenderer.render(
        this.app,
        body,
        target,
        card.file.path,
        component,
      );
      this.attachInternalLinkInteractions(target, card.file.path);
      configureRenderedCardBody(
        target,
        this.plugin.settings.allowCardScrolling,
        this.cardScrollPositions.get(card.path) ?? 0,
      );
    } catch (error) {
      target.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage(error)}`,
      });
    }
  }

  private async toggleCardBookmark(path: string): Promise<void> {
    const bookmarkedPaths = this.bookmarkedPaths();
    if (bookmarkedPaths.has(path)) {
      bookmarkedPaths.delete(path);
    } else {
      bookmarkedPaths.add(path);
    }
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.toggleBookmark(path);
  }

  private attachInternalLinkInteractions(
    target: HTMLElement,
    sourcePath: string,
  ): void {
    attachRenderedLinkInteractions(target, {
      previewEnabled: this.plugin.settings.previewLinksOnHover,
      followEnabled: this.plugin.settings.followLinksFromCards,
      preview: (event, link, linktext) => {
        this.app.workspace.trigger("hover-link", {
          event,
          source: DECK_VIEW_TYPE,
          hoverParent: this.leaf,
          targetEl: link,
          linktext,
          sourcePath,
        });
      },
      follow: (event, link, linkPath) => {
        const internal = link.matches(".internal-link");
        const newLeaf = event.metaKey || event.ctrlKey || event.button === 1;
        void this.runAfterInlineEditing("rendered-link", async () => {
          const filed = internal
            ? resolveFiledCardLink(getLinkpath(linkPath), sourcePath, {
                resolveFile: (path, source) =>
                  this.app.metadataCache.getFirstLinkpathDest(path, source),
                filedPathForFile: (file) =>
                  this.plugin.index.filedByFile(file)?.path,
                firstFiledPathAtAddress: (address) =>
                  this.plugin.index.firstFiledAtAddress(address)?.path,
              })
            : undefined;
          const action = renderedLinkAction(internal, newLeaf, linkPath, filed);
          if (action.kind === "card") {
            await this.jumpToPath(action.path);
          } else if (action.kind === "note") {
            await this.app.workspace.openLinkText(
              action.linktext,
              sourcePath,
              newLeaf,
            );
          } else {
            link.win.open(link.href, "_blank", "noopener");
          }
        });
      },
    });
  }

  private recalculateFilingPreview(): void {
    const file = this.filingFile;
    const sourcePath = this.filingSourcePath;
    if (file === null || sourcePath === null) {
      this.clearFilingPlacement();
      return;
    }
    if (
      file.path !== sourcePath ||
      this.plugin.index.fileAtPath(sourcePath) !== file
    ) {
      this.clearFilingPlacement();
      this.filingMessage = "The source card no longer exists.";
      return;
    }
    if (!this.plugin.isUnfiledCard(file)) {
      this.clearFilingPlacement();
      this.filingMessage = "The source card is no longer unfiled.";
      return;
    }
    const validation = normalizeAddressInput(this.filingInputValue);
    if (!validation.valid) {
      this.clearFilingPlacement();
      this.filingMessage = validation.message;
      return;
    }
    this.filingPreview = this.plugin.filingPreviewFor(file, validation.address);
    this.filingMessage = "";
  }

  private clearFilingPlacement(): void {
    this.filingPreview = null;
  }

  private updateFilingInput(value: string): void {
    if (this.filingConfirmationInProgress) {
      return;
    }
    this.filingInputValue = value;
    this.recalculateFilingPreview();
    const filing = this.currentFilingState();
    if (filing !== null) {
      this.updateRenderedFilingState(filing);
    }
  }

  private currentFilingState(): TrayFilingState | null {
    const sourcePath = this.filingSourcePath;
    const sourceSurface = this.filingSourceSurface;
    if (sourcePath === null || sourceSurface === null) {
      return null;
    }
    const preview = this.filingPreview;
    const duplicatePaths = preview === null
      ? []
      : this.plugin.index.filedAtAddress(preview.address).map((card) => card.path);
    const blockedByDuplicate = preview !== null &&
      this.plugin.duplicateOccupants(preview.address).length > 0;
    return {
      sourcePath,
      sourceSurface,
      value: this.filingInputValue,
      address: preview?.address ?? null,
      message: blockedByDuplicate && preview !== null
        ? duplicateFilingMessage(preview.address, duplicatePaths.length)
        : this.filingMessage,
      invalid: blockedByDuplicate ||
        (preview === null && this.filingMessage !== "Enter an address."),
      confirmationInProgress: this.filingConfirmationInProgress,
      duplicatePaths,
      guidance: filingPreviewGuidance(preview),
    };
  }

  private async previewFilingPlacement(): Promise<void> {
    this.contentEl.focus({ preventScroll: true });
    const preview = this.filingPreview;
    if (preview === null) {
      return;
    }
    const targetPath = filingPreviewFocusPath(preview);
    if (targetPath === null) {
      return;
    }
    this.assignCardFocus(deckCardFocus(targetPath));
    await this.jumpToPath(targetPath);
    this.contentEl.focus({ preventScroll: true });
  }

  private restoreFilingSourceFocus(): void {
    const path = this.filingSourcePath;
    if (path === null) {
      return;
    }
    const position = cardPosition(this.plugin.tray, path);
    if (
      this.filingSourceSurface === "viewed" &&
      this.viewedCard?.path === path
    ) {
      this.setCardFocus(viewedCardFocus(path, position?.pileId));
    } else if (position !== null) {
      this.setCardFocus(deskCardFocus(path, position.pileId));
    }
  }

  private async confirmFiling(): Promise<void> {
    const file = this.filingFile;
    const preview = this.filingPreview;
    if (
      file === null ||
      preview === null ||
      this.filingConfirmationInProgress
    ) {
      this.recalculateFilingPreview();
      const filing = this.currentFilingState();
      if (filing !== null) {
        this.updateRenderedFilingState(filing);
      }
      return;
    }
    if (this.plugin.duplicateOccupants(preview.address).length > 0) {
      const filing = this.currentFilingState();
      if (filing !== null) {
        this.updateRenderedFilingState(filing);
      }
      return;
    }
    const restoreFilingInputFocus = this.isFilingInputFocused;
    const sourceSurface = this.filingSourceSurface;
    this.filingConfirmationInProgress = true;
    const pending = this.currentFilingState();
    if (pending !== null) {
      this.updateRenderedFilingState(pending);
    }
    try {
      const result = await this.plugin.fileCard(file, preview);
      if (result.status === "preview-changed") {
        this.recalculateFilingPreview();
        await this.renderDeck(restoreFilingInputFocus);
        new Notice("The Deck changed. Review the updated position and confirm again.");
        return;
      }
      if (result.status === "failed") {
        this.recalculateFilingPreview();
        await this.renderDeck(restoreFilingInputFocus);
        return;
      }
      this.filingFile = null;
      this.filingSourcePath = null;
      this.filingSourceSurface = null;
      this.filingPreview = null;
      this.filingInputValue = "";
      if (sourceSurface === "viewed" && this.viewedCard?.path === file.path) {
        this.viewedCard = null;
        this.viewedCardEl = null;
        this.viewedCardBodyEl = null;
        this.viewedFilingEditor = null;
        this.unloadViewedCardComponent();
      }
      this.setDeckAnchor(file.path);
      this.assignCardFocus(deckCardFocus(file.path));
      this.viewportOffset = 0;
      await this.plugin.refreshDeckViews();
    } finally {
      this.filingConfirmationInProgress = false;
      const filing = this.currentFilingState();
      if (filing !== null) {
        this.updateRenderedFilingState(filing);
      }
    }
  }

  private renderBookmarkEdgeTabs(
    stage: HTMLElement,
    bookmarkedPaths = this.bookmarkedPaths(),
  ): void {
    stage.querySelectorAll<HTMLElement>(".slipbox-bookmark-edge-tab")
      .forEach((tab) => tab.remove());
    if (this.activePath === null || bookmarkedPaths.size === 0) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const cardWidth = this.renderedCards[0]?.offsetWidth ?? 0;
    if (activeIndex < 0 || cardWidth <= 0) {
      return;
    }
    const bookmarkIndices = [...bookmarkedPaths].flatMap((path) => {
      const index = this.plugin.index.filedIndexForPath(path);
      return index < 0 ? [] : [index];
    });
    const targets = bookmarkEdgeTargets(
      bookmarkIndices,
      this.viewportPosition(activeIndex) - this.spaceOffsetX / this.cardStep(),
      this.cardStep(),
      stage.clientWidth,
      cardWidth,
    );

    for (const direction of ["left", "right"] as const) {
      const index = targets[direction];
      const card = index === null ? undefined : filed[index];
      if (card === undefined) {
        continue;
      }
      const tab = stage.createEl("button", {
        cls: `slipbox-bookmark-edge-tab is-${direction}`,
        text: `${direction === "left" ? "◀" : "▶"} ${card.address}`,
        attr: {
          type: "button",
        },
      });
      setCardTooltip(
        tab,
        `Jump to bookmark ${card.address}`,
        this.plugin.settings.showTooltips,
        { placement: "top", delay: 250 },
      );
      tab.addEventListener("click", () => {
        void this.runAfterInlineEditing(
          "bookmark-edge-jump",
          () => this.jumpToPath(card.path),
        );
      });
    }
  }

  private attachBrowsingEvents(stage: HTMLElement): void {
    stage.addEventListener(
      "wheel",
      (event) => {
        if (!shouldNavigateDeckFromWheel(event, this.inlineEdit?.textarea ?? null)) {
          return;
        }
        event.preventDefault();
        const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : 1;
        const delta = event.deltaX * scale;
        void this.runAfterInlineEditing(
          "horizontal-wheel",
          () => this.moveViewportByPixels(delta),
        );
      },
      { passive: false },
    );

    stage.addEventListener("pointerdown", (event) => {
      if (event.target !== stage || event.button !== 0) {
        return;
      }
      const begin = (): void => {
        if ((event.buttons & 1) === 0) {
          return;
        }
        this.cancelViewportCentering();
        this.cancelSpaceRecentering();
        this.pointerLastX = event.clientX;
        this.pointerLastY = event.clientY;
        stage.setPointerCapture(event.pointerId);
        stage.addClass("is-dragging");
        this.contentEl.focus({ preventScroll: true });
      };
      if (this.inlineEdit === null) {
        begin();
      } else {
        event.preventDefault();
        void this.runAfterInlineEditing("background-drag", begin);
      }
    });
    stage.addEventListener("pointermove", (event) => {
      if (this.pointerLastX === null || this.pointerLastY === null) {
        return;
      }
      const movementX = event.clientX - this.pointerLastX;
      const movementY = event.clientY - this.pointerLastY;
      this.pointerLastX = event.clientX;
      this.pointerLastY = event.clientY;
      this.spaceOffsetX += movementX;
      this.spaceOffsetY += movementY;
      this.applySpaceOffset();
    });
    const finishPointer = (event: PointerEvent): void => {
      if (this.pointerLastX === null) {
        return;
      }
      this.pointerLastX = null;
      this.pointerLastY = null;
      stage.removeClass("is-dragging");
      if (stage.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }
      this.renderBookmarkEdgeTabs(stage);
      this.queueRenderWindowRefresh();
    };
    stage.addEventListener("pointerup", finishPointer);
    stage.addEventListener("pointercancel", finishPointer);
  }

  private applySpaceOffset(): void {
    if (this.spaceEl === null) {
      return;
    }
    this.spaceEl.style.transform =
      `translate(${this.spaceOffsetX}px, ${this.spaceOffsetY}px)`;
  }

  private recenterSpace(): void {
    const space = this.spaceEl;
    const shouldAnimate =
      space !== null && (this.spaceOffsetX !== 0 || this.spaceOffsetY !== 0);
    this.cancelSpaceRecentering();
    if (shouldAnimate) {
      space.addClass("is-recentering");
    }
    this.spaceOffsetX = 0;
    this.spaceOffsetY = 0;
    this.applySpaceOffset();
    if (!shouldAnimate) {
      return;
    }
    this.spaceRecenteringTimer = space.win.setTimeout(() => {
      space.removeClass("is-recentering");
      this.spaceRecenteringTimer = null;
    }, SPACE_RECENTER_DURATION_MS);
  }

  private cancelSpaceRecentering(): void {
    if (this.spaceRecenteringTimer !== null) {
      (this.spaceEl?.win ?? this.contentEl.win).clearTimeout(
        this.spaceRecenteringTimer,
      );
      this.spaceRecenteringTimer = null;
    }
    this.spaceEl?.removeClass("is-recentering");
  }

  private moveViewportByPixels(deltaPixels: number): void {
    this.cancelViewportCentering();
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }

    const step = this.cardStep();
    if (step <= 0) {
      return;
    }
    const nextPosition = this.viewportPosition(activeIndex) + deltaPixels / step;
    this.applyViewportPosition(nextPosition);
  }

  private moveBy(delta: number): void {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    const targetIndex = deckIndexByDelta(activeIndex, delta, filed.length);
    const target = filed[targetIndex];
    if (target === undefined || target.path === this.activePath) {
      return;
    }

    const viewportPosition = this.viewportPosition(activeIndex);
    this.setDeckAnchor(target.path);
    this.viewportOffset = viewportPosition - targetIndex;
    this.centerViewportOnActive(targetIndex, true);
  }

  private centerActiveCard(): void {
    this.deckPositionMode = deckPositionModeForPileCount(
      this.plugin.tray.piles.length,
    );
    this.applyDeckPositionMode();
    this.recenterSpace();
    if (this.activePath === null) {
      new Notice("There is no Deck anchor to centre.");
      return;
    }
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    this.centerViewportOnActive(activeIndex, false);
  }

  private applyDeckPositionMode(): void {
    const mode = this.deckPositionMode ?? this.plugin.startupDeckPositionMode;
    this.contentEl.toggleClass("is-deck-centered-position", mode === "centered");
  }

  private centerViewportOnActive(
    activeIndex: number,
    smoothly: boolean,
  ): void {
    const cardCount = this.plugin.index.snapshot.filed.length;
    const targetPosition = centredViewportPosition(activeIndex, cardCount);
    const startPosition = this.viewportPosition(activeIndex);
    this.cancelViewportCentering();

    const ownerWindow = this.contentEl.win;
    const reducedMotion = ownerWindow.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (
      !smoothly ||
      reducedMotion ||
      Math.abs(targetPosition - startPosition) < 0.001
    ) {
      this.viewportOffset = targetPosition - activeIndex;
      this.positionCards();
      this.updateActiveUi();
      this.queueRenderWindowRefresh();
      return;
    }

    const activePath = this.activePath;
    const startedAt = ownerWindow.performance.now();
    this.positionCards();
    this.updateActiveUi();
    this.queueRenderWindowRefresh();

    const advance = (timestamp: number): void => {
      if (
        this.activePath !== activePath ||
        this.plugin.index.filedIndexForPath(activePath) !== activeIndex
      ) {
        this.viewportCenteringFrame = null;
        return;
      }

      const progress = Math.min(
        1,
        Math.max(0, (timestamp - startedAt) / VIEWPORT_CENTER_DURATION_MS),
      );
      const easedProgress = 1 - (1 - progress) ** 3;
      const viewportPosition =
        startPosition + (targetPosition - startPosition) * easedProgress;
      this.viewportOffset = viewportPosition - activeIndex;
      this.positionCards();
      this.queueRenderWindowRefresh();

      if (progress < 1) {
        this.viewportCenteringFrame = ownerWindow.requestAnimationFrame(advance);
        return;
      }

      this.viewportCenteringFrame = null;
      this.viewportOffset = targetPosition - activeIndex;
      this.positionCards();
      if (this.stageEl !== null) {
        this.renderBookmarkEdgeTabs(this.stageEl);
      }
    };

    this.viewportCenteringFrame = ownerWindow.requestAnimationFrame(advance);
  }

  private cancelViewportCentering(): void {
    if (this.viewportCenteringFrame !== null) {
      this.contentEl.win.cancelAnimationFrame(this.viewportCenteringFrame);
      this.viewportCenteringFrame = null;
    }
  }

  private async moveTrayCardBy(
    cardRef: string,
    delta: -1 | 1,
  ): Promise<void> {
    const position = cardPosition(this.plugin.tray, cardRef);
    if (position === null) {
      return;
    }
    const target = Math.max(
      0,
      Math.min(position.pileSize - 1, position.cardIndex + delta),
    );
    if (target === position.cardIndex) {
      return;
    }
    await this.plugin.updateTray(moveCardWithinPile(
      this.plugin.tray,
      position.pileId,
      position.cardIndex,
      target,
    ));
  }

  private goToDeckBoundary(boundary: "start" | "end"): void {
    const filed = this.plugin.index.snapshot.filed;
    const target = boundary === "start" ? filed[0] : filed[filed.length - 1];
    if (target === undefined) {
      new Notice("There are no filed cards.");
      return;
    }
    void this.goToPath(target.path);
  }

  private handleDeckActionKey(
    event: KeyboardEvent,
    action: DeckAction,
    repeatable = false,
  ): void {
    if (
      this.pendingCommand.kind !== "idle" ||
      shouldSuspendDeckShortcut(event.target, this.isFilingInputFocused) ||
      !this.canRunAction(action)
    ) {
      return;
    }
    event.preventDefault();
    if (!event.repeat || repeatable) {
      this.runAction(action);
      if (!event.repeat && PENDING_COMMAND_ACTIONS.has(action)) {
        this.pendingCommandStartEvent = event;
      }
    }
  }

  private handleDeckCommandContinuation(event: KeyboardEvent): boolean {
    if (event === this.pendingCommandStartEvent) {
      this.pendingCommandStartEvent = null;
      return false;
    }
    this.pendingCommandStartEvent = null;
    if (this.pendingCommand.kind !== "idle") {
      if (shouldSuspendDeckShortcut(
        event.target,
        this.isFilingInputFocused,
      )) {
        this.clearPendingCommand();
        return false;
      }
      const step = advancePendingDeckCommand(this.pendingCommand, event.key);
      if (!step.consumed) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.pendingCommand = step.state;
      this.pendingCommandFeedback = "";
      this.updatePendingCommandStatus();
      if ("cancelled" in step) {
        this.showCommandFeedback("Command cancelled.");
      } else if ("completion" in step) {
        if (step.completion.kind === "address") {
          this.completeAddressCommand(step.completion.initial);
        } else {
          this.completePileCommand(step.completion.digits);
        }
      }
      return true;
    }

    return false;
  }

  private selectCardWithoutMoving(path: string): void {
    this.cancelViewportCentering();
    const previousActiveIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = this.plugin.index.filedIndexForPath(path);
    if (targetIndex < 0) {
      return;
    }

    this.setDeckAnchor(path);
    this.viewportOffset = stationarySelectionOffset(
      previousActiveIndex,
      targetIndex,
      this.viewportOffset,
    );
    this.positionCards();
    this.updateActiveUi();
  }

  private applyViewportPosition(nextPosition: number): void {
    const filed = this.plugin.index.snapshot.filed;
    const previousActiveIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (previousActiveIndex < 0) {
      return;
    }

    const viewportPosition = clampViewportPosition(nextPosition, filed.length);
    const activeIndex = activeIndexForViewport(
      viewportPosition,
      previousActiveIndex,
      filed.length,
    );
    const activeCard = filed[activeIndex];
    if (activeCard === undefined) {
      return;
    }

    this.setDeckAnchor(activeCard.path);
    this.viewportOffset = viewportPosition - activeIndex;
    this.positionCards();
    this.updateActiveUi();
    if (this.pointerLastX === null) {
      this.queueRenderWindowRefresh();
    }
  }

  private positionCards(): boolean {
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (
      this.renderedCards.length === 0 ||
      activeIndex < 0
    ) {
      return this.updatePileAnchorFromDeck();
    }

    const step = this.cardStep();
    if (step <= 0) {
      return false;
    }
    const focusDisplayIndex = activeIndex;
    const viewportPosition = this.viewportPosition(activeIndex);

    for (const card of this.renderedCards) {
      const index = Number(card.dataset.index ?? "-1");
      const isActive = card.dataset.path === this.activePath;
      card.toggleClass("is-deck-anchor", isActive);
      card.toggleClass(
        "is-card-focused",
        this.cardFocus?.surface === "deck" &&
        card.dataset.path === this.cardFocus.path,
      );
      setCardStackOrder(card, cardStackOrder(index, focusDisplayIndex));
      const motion = cardMotionStyle(
        index,
        viewportPosition,
        step,
        isActive,
        focusDisplayIndex,
      );
      card.style.transform =
        `translate(-50%, -50%) translateX(${motion.translateX}px) scale(${motion.scale})`;
      setCardMotionOpacity(card, motion.opacity);
    }
    return this.updatePileAnchorFromDeck();
  }

  private updatePileAnchorFromDeck(): boolean {
    const space = this.spaceEl;
    const activeCard = this.activePath === null
      ? null
      : this.renderedCards.find(
        (card) => card.dataset.path === this.activePath,
      ) ?? null;
    const deckFootprint = activeCard ?? this.deckCardsEl?.querySelector<HTMLElement>(
      ".slipbox-deck-empty",
    ) ?? null;
    if (space === null || deckFootprint === null) {
      return true;
    }
    const deckTop = deckTopForPileAnchor(
      deckFootprint.offsetTop,
      deckFootprint.offsetHeight,
    );
    if (deckTop === null) {
      return false;
    }
    space.style.setProperty("--slipbox-deck-top", `${deckTop}px`);
    return true;
  }

  private observeDeckSize(): void {
    this.resizeObserver?.disconnect();
    const ownerWindow = this.contentEl.ownerDocument.defaultView;
    if (ownerWindow === null) {
      this.resizeObserver = null;
      return;
    }
    const resizeObserver = new ownerWindow.ResizeObserver(() => {
      this.scheduleCardPositioning();
      this.updateDeckMapSectionLabels();
    });
    this.resizeObserver = resizeObserver;
    resizeObserver.observe(this.contentEl);
  }

  private scheduleCardPositioning(
    retries = LAYOUT_MEASUREMENT_RETRIES,
  ): void {
    this.positioningRetriesRemaining = Math.max(
      this.positioningRetriesRemaining,
      retries,
    );
    if (this.positioningFrame !== null) {
      return;
    }
    this.positioningFrame = this.contentEl.win.requestAnimationFrame(() => {
      this.flushScheduledCardPositioning();
    });
  }

  private flushScheduledCardPositioning(): void {
    this.positioningFrame = null;
    const positioned = this.positionCards();
    if (positioned) {
      this.positioningRetriesRemaining = 0;
      this.cardFooters.scheduleLayout();
      if (this.stageEl !== null) {
        this.renderBookmarkEdgeTabs(this.stageEl);
      }
      return;
    }

    if (
      this.contentEl.offsetWidth > 0 &&
      this.positioningRetriesRemaining > 0
    ) {
      this.positioningRetriesRemaining -= 1;
      this.positioningFrame = this.contentEl.win.requestAnimationFrame(() => {
        this.flushScheduledCardPositioning();
      });
      return;
    }
    this.positioningRetriesRemaining = 0;
  }

  private updateActiveUi(): void {
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }

    for (const card of this.renderedCards) {
      const filedIndex = Number(card.dataset.filedIndex ?? "-1");
      card.toggleClass("is-deck-anchor", filedIndex === activeIndex);
      card.toggleClass(
        "is-card-focused",
        this.cardFocus?.surface === "deck" &&
        card.dataset.path === this.cardFocus.path,
      );
      setCardStackOrder(card, cardStackOrder(filedIndex, activeIndex));
      this.cardFooters.setInteractive(card, filedIndex === activeIndex);
      this.cardSignatures.setInteractive(card, filedIndex === activeIndex);
      this.inferredNavigation.setInteractive(card, filedIndex === activeIndex);
    }
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
    this.updateDeckMapActiveUi();
    this.applyCardFocusClasses();
  }

  private bookmarkedPaths(): Set<string> {
    return new Set(
      this.plugin.state.bookmarks.flatMap((bookmark) =>
        "path" in bookmark ? [bookmark.path] : []
      ),
    );
  }

  private bookmarkIndices(): number[] {
    return [...this.bookmarkedPaths()].flatMap((path) => {
      const index = this.plugin.index.filedIndexForPath(path);
      return index < 0 ? [] : [index];
    });
  }

  private updateBookmarkUi(bookmarkedPaths = this.bookmarkedPaths()): void {
    for (const cardEl of this.renderedCards) {
      const path = cardEl.dataset.path;
      if (path === undefined) {
        continue;
      }
      const isBookmarked = bookmarkedPaths.has(path);
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const toggle = cardEl.querySelector<HTMLButtonElement>(
        '.slipbox-card-header-action[data-slipbox-action="toggle-bookmark"]',
      );
      if (toggle === null) {
        continue;
      }
      const action = isBookmarked ? "Remove bookmark" : "Add bookmark";
      toggle.toggleClass("is-pressed", isBookmarked);
      toggle.setAttr("aria-pressed", String(isBookmarked));
      setCardTooltip(
        toggle,
        action,
        this.plugin.settings.showTooltips,
        { placement: "bottom", delay: 250 },
      );
    }

    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl, bookmarkedPaths);
    }
    this.updateDeckMapBookmarks(bookmarkedPaths);
  }

  private viewportPosition(activeIndex: number): number {
    return activeIndex + this.viewportOffset;
  }

  private clampViewportOffset(): void {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      this.viewportOffset = 0;
      return;
    }
    const position = clampViewportPosition(
      this.viewportPosition(activeIndex),
      filed.length,
    );
    this.viewportOffset = position - activeIndex;
  }

  private queueRenderWindowRefresh(): void {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      this.renderRefreshDeferred = true;
      return;
    }
    if (
      this.renderRefreshPending ||
      this.pointerLastX !== null
    ) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    const displayCount = filed.length;
    const viewportIndex = Math.round(this.viewportPosition(activeIndex));
    const needsEarlierCards =
      this.renderWindowStart > 0 &&
      viewportIndex <= this.renderWindowStart + RENDER_EDGE_BUFFER;
    const needsLaterCards =
      this.renderWindowEnd < displayCount - 1 &&
      viewportIndex >= this.renderWindowEnd - RENDER_EDGE_BUFFER;
    if (!needsEarlierCards && !needsLaterCards) {
      return;
    }

    if (this.renderRefreshRunning) {
      this.renderRefreshQueued = true;
      return;
    }

    this.renderRefreshPending = true;
    this.contentEl.win.requestAnimationFrame(() => {
      this.renderRefreshPending = false;
      if (this.stageEl !== null) {
        this.renderRefreshRunning = true;
        void this.refreshDeckCardWindow().finally(() => {
          this.renderRefreshRunning = false;
          if (this.renderRefreshQueued) {
            this.renderRefreshQueued = false;
            this.queueRenderWindowRefresh();
          }
        });
      }
    });
  }

  private cardStep(): number {
    const firstCard = this.renderedCards[0];
    if (firstCard === undefined) {
      return 1;
    }
    return firstCard.offsetWidth * this.plugin.settings.cardSpread;
  }

  private rememberScrollPositions(): void {
    for (const card of this.renderedCards) {
      const path = card.dataset.path;
      const scroll = card.querySelector<HTMLElement>(".slipbox-card-scroll");
      if (path !== undefined && scroll !== null) {
        this.cardScrollPositions.set(path, scroll.scrollTop);
      }
    }
  }

  private rememberViewedCardScroll(): void {
    if (this.viewedCard !== null && this.viewedCardBodyEl !== null) {
      this.viewedCard = scrollViewedCardState(
        this.viewedCard,
        this.viewedCardBodyEl.scrollTop,
      );
    }
  }

  private unloadRenderComponents(): void {
    for (const component of this.renderComponents.values()) {
      component.unload();
    }
    this.renderComponents.clear();
  }

  private unloadViewedCardComponent(): void {
    this.viewedCardComponent?.unload();
    this.viewedCardComponent = null;
  }

  private reconcileScrollPositions(): void {
    const availablePaths = new Set(
      this.plugin.index.snapshot.filed.map((card) => card.path),
    );
    for (const path of this.cardScrollPositions.keys()) {
      if (!availablePaths.has(path)) {
        this.cardScrollPositions.delete(path);
      }
    }
  }

}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
