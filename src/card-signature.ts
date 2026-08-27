import { fitMeasuredBacklinkPrefix } from "./backlinks.js";
import { renderCardAddress } from "./card-address.js";
import { setCardTooltip } from "./card-tooltip.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const BRANCH_MEASUREMENT_LIMIT = 64;

export interface CardSignatureBranch {
  readonly label: string;
  readonly sourcePath: string;
  readonly sourceAddress: string;
  readonly sourceTitle: string;
  readonly linktext: string;
}

export interface CardSignatureOverflowItem {
  readonly title: DocumentFragment;
  readonly activate: (event: MouseEvent | KeyboardEvent) => void;
}

export interface CardSignatureEnvironment {
  readonly showBranchLabels: () => boolean;
  readonly showTooltips: () => boolean;
  readonly previewLinksOnHover: () => boolean;
  readonly branchesForPath: (path: string) => readonly CardSignatureBranch[];
  readonly preview: (
    event: MouseEvent,
    target: HTMLElement,
    branch: CardSignatureBranch,
    targetPath: string,
  ) => void;
  readonly activate: (branch: CardSignatureBranch) => void | Promise<void>;
  readonly showOverflowMenu: (
    target: HTMLButtonElement,
    items: readonly CardSignatureOverflowItem[],
  ) => () => void;
  readonly runAfterEditing: (
    reason: string,
    action: () => void | Promise<void>,
  ) => void;
}

export interface CardSignatureRenderOptions {
  readonly path: string;
  readonly address: string | null;
  readonly addressClass: string;
  readonly interactive: boolean;
}

interface RenderedCardSignature {
  readonly path: string;
  readonly signature: HTMLSpanElement;
  readonly address: HTMLSpanElement;
  readonly metadata: HTMLSpanElement;
  readonly leadingSeparator: HTMLSpanElement;
  readonly content: HTMLSpanElement;
  readonly intrinsicSizer: HTMLSpanElement;
  measureItems: readonly HTMLElement[];
  measureSeparator: HTMLElement;
  measureOverflow: HTMLElement;
  branches: readonly CardSignatureBranch[];
  interactive: boolean;
  intrinsicWidth: number | null;
  fitKey: string | null;
}

/** Keep canonical address DOM stable while independently refreshing branch metadata. */
export class CardSignatureManager {
  private readonly entries = new Set<RenderedCardSignature>();
  private readonly entriesBySignature = new Map<HTMLElement, RenderedCardSignature>();
  private resizeObserver: ResizeObserver | null = null;
  private ownerWindow: Window | null = null;
  private layoutFrame: number | null = null;
  private layoutTimer: number | null = null;
  private closeOverflow: (() => void) | null = null;
  private overflowEntry: RenderedCardSignature | null = null;

  constructor(private readonly environment: CardSignatureEnvironment) {}

  render(
    parent: HTMLElement,
    options: CardSignatureRenderOptions,
  ): HTMLSpanElement {
    const signature = createHtmlElement(parent.ownerDocument, "span");
    signature.className = "slipbox-card-signature";
    parent.append(signature);
    const address = renderCardAddress(signature, {
      cls: options.addressClass,
      address: options.address,
    });
    const metadata = createHtmlElement(parent.ownerDocument, "span");
    metadata.className = "slipbox-card-signature-branches";
    signature.append(metadata);
    const leadingSeparator = createHtmlElement(parent.ownerDocument, "span");
    leadingSeparator.className =
      "slipbox-card-signature-separator is-address-separator";
    leadingSeparator.textContent = "·";
    leadingSeparator.setAttribute("aria-hidden", "true");
    const content = createHtmlElement(parent.ownerDocument, "span");
    content.className = "slipbox-card-signature-content";
    metadata.append(content);
    const measure = createHtmlElement(parent.ownerDocument, "span");
    measure.className = "slipbox-card-signature-measure";
    measure.setAttribute("aria-hidden", "true");
    metadata.append(measure);
    const measureSeparator = this.createSeparator(measure);
    const measureOverflow = this.createOverflowButton(measure, 1);
    const intrinsicSizer = createHtmlElement(parent.ownerDocument, "span");
    intrinsicSizer.className = "slipbox-card-signature-intrinsic-sizer";
    intrinsicSizer.setAttribute("aria-hidden", "true");
    signature.append(intrinsicSizer);
    const entry: RenderedCardSignature = {
      path: options.path,
      signature,
      address,
      metadata,
      leadingSeparator,
      content,
      intrinsicSizer,
      measureItems: [],
      measureSeparator,
      measureOverflow,
      branches: [],
      interactive: options.interactive,
      intrinsicWidth: null,
      fitKey: null,
    };
    this.entries.add(entry);
    this.entriesBySignature.set(signature, entry);
    this.configureLayout(signature, intrinsicSizer);
    this.populate(entry, this.environment.branchesForPath(options.path));
    return address;
  }

  /** Refresh branch-derived DOM without replacing the signature or address. */
  refreshBranches(): void {
    for (const entry of this.entries) {
      const branches = this.environment.branchesForPath(entry.path);
      const shouldShow = this.environment.showBranchLabels() && branches.length > 0;
      if (
        branchesEqual(entry.branches, branches) &&
        entry.metadata.hidden === !shouldShow
      ) {
        this.applyInteractiveState(entry);
        continue;
      }
      this.populate(entry, branches);
    }
    this.scheduleLayout();
  }

  setInteractive(card: HTMLElement, interactive: boolean): void {
    const signature = card.querySelector<HTMLElement>(".slipbox-card-signature");
    const entry = signature === null
      ? undefined
      : this.entriesBySignature.get(signature);
    if (entry === undefined || entry.interactive === interactive) {
      return;
    }
    entry.interactive = interactive;
    this.applyInteractiveState(entry);
    if (!interactive && this.overflowEntry === entry) {
      this.closeOverflowMenu();
    }
  }

  scheduleLayout(): void {
    const ownerWindow = this.ownerWindow;
    if (
      ownerWindow === null ||
      this.layoutFrame !== null ||
      this.layoutTimer !== null
    ) {
      return;
    }
    this.layoutFrame = ownerWindow.requestAnimationFrame(() => {
      this.flushLayout();
    });
    this.layoutTimer = ownerWindow.setTimeout(() => this.flushLayout(), 120);
  }

  /** Flush a pending measured fit immediately when a synchronous layout is required. */
  layoutNow(): void {
    this.flushLayout();
  }

  clear(): void {
    this.closeOverflowMenu();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.entries.clear();
    this.entriesBySignature.clear();
    const ownerWindow = this.ownerWindow;
    if (ownerWindow !== null && this.layoutFrame !== null) {
      ownerWindow.cancelAnimationFrame(this.layoutFrame);
    }
    if (ownerWindow !== null && this.layoutTimer !== null) {
      ownerWindow.clearTimeout(this.layoutTimer);
    }
    this.layoutFrame = null;
    this.layoutTimer = null;
    this.ownerWindow = null;
  }

  private configureLayout(
    signature: HTMLElement,
    intrinsicSizer: HTMLElement,
  ): void {
    const ownerWindow = signature.ownerDocument.defaultView;
    if (ownerWindow === null) {
      return;
    }
    if (this.ownerWindow === null) {
      this.ownerWindow = ownerWindow;
    }
    if (this.resizeObserver === null) {
      this.resizeObserver = new ownerWindow.ResizeObserver(() => {
        this.scheduleLayout();
      });
    }
    this.resizeObserver.observe(signature);
    this.resizeObserver.observe(intrinsicSizer);
  }

  private populate(
    entry: RenderedCardSignature,
    branches: readonly CardSignatureBranch[],
  ): void {
    if (this.overflowEntry === entry) {
      this.closeOverflowMenu();
    }
    entry.branches = branches;
    entry.fitKey = null;
    if (!this.environment.showBranchLabels() || branches.length === 0) {
      entry.metadata.hidden = true;
      entry.signature.classList.remove("has-branch-annotations");
      entry.signature.style.removeProperty(
        "--slipbox-card-signature-intrinsic-width",
      );
      entry.intrinsicWidth = null;
      entry.intrinsicSizer.replaceChildren();
      entry.leadingSeparator.remove();
      entry.content.replaceChildren();
      return;
    }
    entry.metadata.hidden = false;
    entry.signature.classList.add("has-branch-annotations");
    entry.metadata.prepend(entry.leadingSeparator);
    this.rebuildMeasurements(entry);
    this.rebuildIntrinsicSizer(entry);
    this.updateIntrinsicWidth(entry);
    this.renderContent(entry, branches.length);
    this.applyInteractiveState(entry);
    this.scheduleLayout();
  }

  private rebuildMeasurements(entry: RenderedCardSignature): void {
    const measure = entry.measureSeparator.parentElement;
    if (measure === null) {
      return;
    }
    measure.replaceChildren();
    entry.measureItems = entry.branches
      .slice(0, BRANCH_MEASUREMENT_LIMIT)
      .map((branch) => this.createBranchButton(measure, branch));
    entry.measureSeparator = this.createSeparator(measure);
    entry.measureOverflow = this.createOverflowButton(measure, 1);
  }

  private rebuildIntrinsicSizer(entry: RenderedCardSignature): void {
    const address = createHtmlElement(entry.signature.ownerDocument, "span");
    address.className = entry.address.className;
    address.textContent = entry.address.textContent;
    const metadata = createHtmlElement(entry.signature.ownerDocument, "span");
    metadata.className = "slipbox-card-signature-branches";
    this.createSeparator(metadata);
    const content = createHtmlElement(entry.signature.ownerDocument, "span");
    content.className = "slipbox-card-signature-content";
    entry.branches.forEach((branch, index) => {
      if (index > 0) {
        this.createSeparator(content);
      }
      this.createBranchButton(content, branch);
    });
    metadata.append(content);
    entry.intrinsicSizer.replaceChildren(address, metadata);
  }

  private flushLayout(): void {
    const ownerWindow = this.ownerWindow;
    if (ownerWindow !== null && this.layoutFrame !== null) {
      ownerWindow.cancelAnimationFrame(this.layoutFrame);
    }
    if (ownerWindow !== null && this.layoutTimer !== null) {
      ownerWindow.clearTimeout(this.layoutTimer);
    }
    this.layoutFrame = null;
    this.layoutTimer = null;
    for (const entry of this.entries) {
      this.layout(entry);
    }
  }

  private layout(entry: RenderedCardSignature): void {
    this.updateIntrinsicWidth(entry);
    if (entry.metadata.hidden || entry.content.clientWidth <= 0) {
      return;
    }
    const fit = fitMeasuredBacklinkPrefix(
      entry.content.clientWidth,
      entry.measureItems.map((item) => item.getBoundingClientRect().width),
      entry.branches.length,
      entry.measureSeparator.getBoundingClientRect().width,
      (hiddenCount) => {
        entry.measureOverflow.textContent = `+${hiddenCount}`;
        return entry.measureOverflow.getBoundingClientRect().width;
      },
    );
    const fitKey = `${fit.visibleCount}:${fit.hiddenCount}`;
    if (entry.fitKey === fitKey) {
      return;
    }
    entry.fitKey = fitKey;
    this.renderContent(entry, fit.visibleCount);
    this.applyInteractiveState(entry);
  }

  private updateIntrinsicWidth(entry: RenderedCardSignature): void {
    if (entry.metadata.hidden) {
      return;
    }
    const width = Math.ceil(Math.max(
      entry.intrinsicSizer.getBoundingClientRect().width,
      entry.intrinsicSizer.scrollWidth,
    ));
    if (width <= 0 || width === entry.intrinsicWidth) {
      return;
    }
    entry.intrinsicWidth = width;
    entry.signature.style.setProperty(
      "--slipbox-card-signature-intrinsic-width",
      `${width}px`,
    );
  }

  private renderContent(
    entry: RenderedCardSignature,
    visibleCount: number,
  ): void {
    entry.content.replaceChildren();
    for (let index = 0; index < visibleCount; index += 1) {
      const branch = entry.branches[index];
      if (branch === undefined) {
        continue;
      }
      if (index > 0) {
        this.createSeparator(entry.content);
      }
      this.createBranchButton(entry.content, branch, entry);
    }
    const hiddenCount = entry.branches.length - visibleCount;
    if (hiddenCount <= 0) {
      return;
    }
    if (visibleCount > 0) {
      this.createSeparator(entry.content);
    }
    const overflow = this.createOverflowButton(entry.content, hiddenCount);
    setCardTooltip(
      overflow,
      `Show ${hiddenCount} more branch annotation${hiddenCount === 1 ? "" : "s"}`,
      this.environment.showTooltips(),
      { placement: "bottom" },
    );
    overflow.addEventListener("pointerdown", (event) => event.stopPropagation());
    overflow.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!entry.interactive) {
        return;
      }
      this.environment.runAfterEditing("branch-overflow", () => {
        this.showOverflowMenu(entry, overflow, visibleCount);
      });
    });
  }

  private createSeparator(parent: HTMLElement): HTMLSpanElement {
    const separator = createHtmlElement(parent.ownerDocument, "span");
    separator.className = "slipbox-card-signature-separator";
    separator.textContent = "·";
    separator.setAttribute("aria-hidden", "true");
    parent.append(separator);
    return separator;
  }

  private createBranchButton(
    parent: HTMLElement,
    branch: CardSignatureBranch,
    entry?: RenderedCardSignature,
  ): HTMLButtonElement {
    const button = createHtmlElement(parent.ownerDocument, "button");
    button.className = "slipbox-card-branch-label";
    button.type = "button";
    button.textContent = branch.label;
    if (entry !== undefined) {
      setCardTooltip(
        button,
        branchAccessibleLabel(branch),
        this.environment.showTooltips(),
        { placement: "bottom" },
      );
      button.addEventListener("mouseover", (event) => {
        if (entry.interactive && this.environment.previewLinksOnHover()) {
          this.environment.preview(event, button, branch, entry.path);
        }
      });
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        this.activate(entry, branch, event);
      });
      button.addEventListener("auxclick", (event) => {
        if (event.button === 1) {
          this.activate(entry, branch, event);
        }
      });
    } else {
      button.disabled = true;
      button.tabIndex = -1;
    }
    parent.append(button);
    return button;
  }

  private createOverflowButton(
    parent: HTMLElement,
    hiddenCount: number,
  ): HTMLButtonElement {
    const button = createHtmlElement(parent.ownerDocument, "button");
    button.className = "slipbox-card-branch-overflow";
    button.type = "button";
    button.tabIndex = -1;
    button.textContent = `+${hiddenCount}`;
    parent.append(button);
    return button;
  }

  private showOverflowMenu(
    entry: RenderedCardSignature,
    target: HTMLButtonElement,
    visibleCount: number,
  ): void {
    this.closeOverflowMenu();
    const items = entry.branches.slice(visibleCount).map((branch) => {
      const title = new entry.metadata.ownerDocument.defaultView!.DocumentFragment();
      const label = createHtmlElement(entry.metadata.ownerDocument, "span");
      label.className = "slipbox-card-branch-overflow-item";
      label.textContent = branch.label;
      setCardTooltip(
        label,
        branchAccessibleLabel(branch),
        this.environment.showTooltips(),
        { placement: "left" },
      );
      label.addEventListener("mouseover", (event) => {
        if (entry.interactive && this.environment.previewLinksOnHover()) {
          this.environment.preview(event, label, branch, entry.path);
        }
      });
      title.append(label);
      return {
        title,
        activate: (event: MouseEvent | KeyboardEvent) => {
          this.closeOverflowMenu();
          this.activate(entry, branch, event);
        },
      };
    });
    this.closeOverflow = this.environment.showOverflowMenu(target, items);
    this.overflowEntry = entry;
  }

  private activate(
    entry: RenderedCardSignature,
    branch: CardSignatureBranch,
    event: MouseEvent | KeyboardEvent,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    if (!entry.interactive) {
      return;
    }
    this.environment.runAfterEditing("branch-link", () =>
      this.environment.activate(branch)
    );
  }

  private applyInteractiveState(entry: RenderedCardSignature): void {
    entry.signature.classList.toggle("is-interactive", entry.interactive);
    entry.content
      .querySelectorAll<HTMLButtonElement>(".slipbox-card-branch-label")
      .forEach((button) => {
        button.disabled = !entry.interactive;
        button.tabIndex = entry.interactive ? 0 : -1;
      });
    entry.content
      .querySelectorAll<HTMLButtonElement>(".slipbox-card-branch-overflow")
      .forEach((button) => {
        button.disabled = !entry.interactive;
        button.tabIndex = entry.interactive ? 0 : -1;
      });
  }

  private closeOverflowMenu(): void {
    const close = this.closeOverflow;
    this.closeOverflow = null;
    this.overflowEntry = null;
    close?.();
  }
}

function createHtmlElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
): HTMLElementTagNameMap[K] {
  return document.createElementNS(
    HTML_NAMESPACE,
    tag,
  ) as HTMLElementTagNameMap[K];
}

function branchAccessibleLabel(branch: CardSignatureBranch): string {
  return `Branch ${branch.label} from ${branch.sourceAddress} · ${branch.sourceTitle}`;
}

function branchesEqual(
  left: readonly CardSignatureBranch[],
  right: readonly CardSignatureBranch[],
): boolean {
  return left.length === right.length && left.every((branch, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      branch.label === candidate.label &&
      branch.sourcePath === candidate.sourcePath &&
      branch.sourceAddress === candidate.sourceAddress &&
      branch.sourceTitle === candidate.sourceTitle &&
      branch.linktext === candidate.linktext;
  });
}
