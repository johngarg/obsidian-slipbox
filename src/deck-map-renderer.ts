import type {
  DeckMapReadout,
  DeckMapRenderableLandmark,
  DeckMapSection,
} from "./deck-map.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

interface SectionElements {
  readonly root: HTMLElement;
  readonly label: HTMLElement;
}

/** Reconcile the decorative rail DOM by stable section, path, and bucket IDs. */
export class DeckMapRenderer {
  readonly railElement: HTMLElement;
  private readonly sectionLayer: HTMLElement;
  private readonly landmarkLayer: HTMLElement;
  private readonly readoutElement: HTMLElement;
  private readonly readoutPrimary: HTMLElement;
  private readonly readoutTitle: HTMLElement;
  private readonly readoutCluster: HTMLElement;
  private readonly sectionElements = new Map<string, SectionElements>();
  private readonly landmarkElements = new Map<string, HTMLElement>();

  constructor(readonly rootElement: HTMLElement) {
    rootElement.className = "slipbox-deck-map";
    rootElement.setAttribute("role", "slider");
    rootElement.setAttribute("tabindex", "0");
    rootElement.setAttribute("aria-label", "Deck map");

    this.railElement = this.create("div", "slipbox-deck-map-rail");
    this.railElement.setAttribute("aria-hidden", "true");
    rootElement.append(this.railElement);

    this.railElement.append(this.create("div", "slipbox-deck-map-track"));
    this.sectionLayer = this.create("div", "slipbox-deck-map-sections");
    this.railElement.append(this.sectionLayer);
    this.landmarkLayer = this.create("div", "slipbox-deck-map-landmarks");
    this.railElement.append(this.landmarkLayer);

    this.readoutElement = this.create(
      "div",
      "slipbox-deck-map-readout is-hidden",
    );
    this.readoutElement.setAttribute("aria-hidden", "true");
    this.readoutPrimary = this.create(
      "span",
      "slipbox-deck-map-readout-primary",
    );
    this.readoutTitle = this.create(
      "span",
      "slipbox-deck-map-readout-title",
    );
    this.readoutCluster = this.create(
      "span",
      "slipbox-deck-map-readout-cluster",
    );
    this.readoutElement.append(
      this.readoutPrimary,
      this.readoutTitle,
      this.readoutCluster,
    );
    rootElement.append(this.readoutElement);
  }

  reconcileSections(
    sections: readonly DeckMapSection[],
    visibleLabels: ReadonlySet<string>,
  ): void {
    const retained = new Set<string>();
    for (const [index, section] of sections.entries()) {
      retained.add(section.path);
      let elements = this.sectionElements.get(section.path);
      if (elements === undefined) {
        const root = this.create("span", "slipbox-deck-map-section");
        root.dataset.slipboxDeckMapSectionPath = section.path;
        const divider = this.create(
          "span",
          "slipbox-deck-map-section-divider",
        );
        const label = this.create("span", "slipbox-deck-map-section-label");
        root.append(divider, label);
        this.sectionLayer.append(root);
        elements = { root, label };
        this.sectionElements.set(section.path, elements);
      }
      elements.root.classList.toggle("is-first", index === 0);
      elements.root.style.setProperty(
        "--slipbox-deck-map-position",
        String(section.startPosition),
      );
      elements.root.style.setProperty(
        "--slipbox-deck-map-section-end",
        String(section.endPosition),
      );
      elements.label.textContent = section.label;
      elements.label.classList.toggle(
        "is-hidden",
        !visibleLabels.has(section.path),
      );
    }
    for (const [path, elements] of this.sectionElements) {
      if (retained.has(path)) {
        continue;
      }
      elements.root.remove();
      this.sectionElements.delete(path);
    }
  }

  reconcileLandmarks(
    landmarks: readonly DeckMapRenderableLandmark[],
  ): void {
    const retained = new Set<string>();
    for (const landmark of landmarks) {
      retained.add(landmark.id);
      let element = this.landmarkElements.get(landmark.id);
      if (element === undefined) {
        element = this.createLandmark(landmark.id);
        this.landmarkLayer.append(element);
        this.landmarkElements.set(landmark.id, element);
      }
      this.updateLandmark(element, landmark);
    }
    for (const [id, element] of this.landmarkElements) {
      if (retained.has(id)) {
        continue;
      }
      element.remove();
      this.landmarkElements.delete(id);
    }
  }

  updateReadout(readout: DeckMapReadout | null): void {
    this.readoutElement.classList.toggle("is-hidden", readout === null);
    if (readout === null) {
      this.readoutElement.removeAttribute("data-slipbox-deck-map-readout-key");
      this.readoutPrimary.textContent = "";
      this.readoutTitle.textContent = "";
      this.readoutCluster.textContent = "";
      return;
    }
    this.readoutElement.dataset.slipboxDeckMapReadoutKey = readout.key;
    this.readoutElement.style.setProperty(
      "--slipbox-deck-map-position",
      String(readout.position),
    );
    this.readoutElement.classList.toggle("is-left", readout.position < 0.2);
    this.readoutElement.classList.toggle("is-right", readout.position > 0.8);
    this.readoutPrimary.textContent = readout.primary;
    this.readoutTitle.textContent = readout.title === ""
      ? ""
      : ` · ${readout.title}`;
    this.readoutCluster.textContent = readout.clusterSummary === ""
      ? ""
      : ` · ${readout.clusterSummary}`;
  }

  clear(): void {
    this.reconcileSections([], new Set());
    this.reconcileLandmarks([]);
    this.updateReadout(null);
  }

  private createLandmark(id: string): HTMLElement {
    const element = this.create("span", "slipbox-deck-map-landmark");
    element.dataset.slipboxDeckMapLandmarkId = id;
    for (const state of ["desk", "cluster", "color", "bookmark", "active"]) {
      element.append(this.create(
        "span",
        `slipbox-deck-map-landmark-layer is-${state}`,
      ));
    }
    return element;
  }

  private updateLandmark(
    element: HTMLElement,
    landmark: DeckMapRenderableLandmark,
  ): void {
    element.style.setProperty(
      "--slipbox-deck-map-position",
      String(landmark.position),
    );
    element.dataset.slipboxDeckMapBucket = String(landmark.bucket);
    const cluster = landmark.kind === "cluster";
    element.classList.toggle("is-cluster", cluster);
    if (cluster) {
      delete element.dataset.slipboxDeckMapPath;
      delete element.dataset.slipboxCardColor;
      element.dataset.slipboxDeckMapClusterCount = String(landmark.count);
      element.dataset.slipboxDeckMapClusterColorCount = String(
        landmark.colorCount,
      );
      element.classList.remove("is-active", "is-bookmarked", "is-colored");
      element.classList.toggle("is-on-desk", landmark.onDeskCount > 0);
      return;
    }
    element.dataset.slipboxDeckMapPath = landmark.path;
    delete element.dataset.slipboxDeckMapClusterCount;
    delete element.dataset.slipboxDeckMapClusterColorCount;
    if (landmark.color === null) {
      delete element.dataset.slipboxCardColor;
    } else {
      element.dataset.slipboxCardColor = landmark.color;
    }
    element.classList.toggle("is-active", landmark.active);
    element.classList.toggle("is-bookmarked", landmark.bookmarked);
    element.classList.toggle("is-colored", landmark.color !== null);
    element.classList.toggle("is-on-desk", landmark.onDesk);
  }

  private create(tag: string, className: string): HTMLElement {
    const element = this.rootElement.ownerDocument.createElementNS(
      HTML_NAMESPACE,
      tag,
    );
    element.className = className;
    return element;
  }
}
