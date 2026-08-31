import type { CardColor } from "./card-color.js";

export interface DeckMapCard {
  readonly path: string;
  readonly address: string;
  readonly title: string;
  readonly color: CardColor | null;
  readonly onDesk: boolean;
}

export interface DeckMapSection {
  readonly path: string;
  readonly label: string;
  readonly startOrdinal: number;
  readonly endOrdinal: number;
  readonly startPosition: number;
  readonly endPosition: number;
}

export interface DeckMapWindow {
  readonly start: number;
  readonly end: number;
}

export interface DeckMapViewportRange {
  readonly startOrdinal: number;
  readonly endOrdinal: number;
  readonly startPosition: number;
  readonly endPosition: number;
}

export interface DeckMapLandmark {
  readonly path: string;
  readonly address: string;
  readonly title: string;
  readonly ordinal: number;
  readonly position: number;
  readonly active: boolean;
  readonly bookmarked: boolean;
  readonly onDesk: boolean;
}

export interface DeckMapExactLandmark extends DeckMapLandmark {
  readonly kind: "exact";
  readonly id: string;
  readonly bucket: number;
}

export interface DeckMapClusterLandmark {
  readonly kind: "cluster";
  readonly id: string;
  readonly bucket: number;
  readonly position: number;
  readonly members: readonly DeckMapLandmark[];
  readonly count: number;
  readonly onDeskCount: number;
}

export type DeckMapRenderableLandmark =
  | DeckMapExactLandmark
  | DeckMapClusterLandmark;

export interface DeckMapReadout {
  readonly key: string;
  readonly position: number;
  readonly primary: string;
  readonly title: string;
  readonly clusterSummary: string;
}

interface DeckMapPointerActivation {
  readonly button: number;
  preventDefault(): void;
}

/** Keep primary-pointer navigation from leaving the slider as DOM focus owner. */
export function preventPrimaryDeckMapPointerFocus(
  activation: DeckMapPointerActivation,
): void {
  if (activation.button === 0) {
    activation.preventDefault();
  }
}

export function deckMapCoordinate(
  index: number,
  cardCount: number,
): number | null {
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(cardCount) ||
    cardCount <= 0 ||
    index < 0 ||
    index >= cardCount
  ) {
    return null;
  }
  return cardCount === 1 ? 0.5 : index / (cardCount - 1);
}

export function buildDeckMapSections(
  cards: readonly Pick<DeckMapCard, "path" | "address">[],
): readonly DeckMapSection[] {
  const sections: DeckMapSection[] = [];
  let startIndex = -1;
  let path = "";
  let label = "";

  const append = (endIndex: number): void => {
    if (startIndex < 0 || label === "") {
      return;
    }
    sections.push({
      path,
      label,
      startOrdinal: startIndex + 1,
      endOrdinal: endIndex + 1,
      startPosition: deckMapCoordinate(startIndex, cards.length) ?? 0,
      endPosition: deckMapCoordinate(endIndex, cards.length) ?? 0,
    });
  };

  for (const [index, card] of cards.entries()) {
    const nextLabel = deckMapSectionLabel(card.address);
    if (nextLabel === "") {
      continue;
    }
    if (startIndex < 0) {
      startIndex = index;
      path = card.path;
      label = nextLabel;
      continue;
    }
    if (nextLabel === label) {
      continue;
    }
    append(index - 1);
    startIndex = index;
    path = card.path;
    label = nextLabel;
  }
  append(cards.length - 1);
  return sections;
}

/** Use a leading natural number or the first Unicode character as a section. */
export function deckMapSectionLabel(address: string): string {
  return address.match(/^[0-9]+/u)?.[0] ?? Array.from(address)[0] ?? "";
}

export function visibleDeckMapSectionLabels(
  sections: readonly DeckMapSection[],
  railWidth: number,
  minimumSpacing: number,
): readonly DeckMapSection[] {
  const visible: DeckMapSection[] = [];
  let previousPosition: number | null = null;

  for (const section of sections) {
    const pixelPosition = section.startPosition * Math.max(0, railWidth);
    if (
      previousPosition === null ||
      pixelPosition - previousPosition >= Math.max(0, minimumSpacing)
    ) {
      visible.push(section);
      previousPosition = pixelPosition;
    }
  }
  return visible;
}

export function deckMapViewportRange(
  renderedWindow: DeckMapWindow | null,
  cardCount: number,
): DeckMapViewportRange | null {
  if (
    renderedWindow === null ||
    !Number.isInteger(cardCount) ||
    cardCount <= 0 ||
    !Number.isInteger(renderedWindow.start) ||
    !Number.isInteger(renderedWindow.end) ||
    renderedWindow.start < 0 ||
    renderedWindow.end < renderedWindow.start ||
    renderedWindow.end >= cardCount
  ) {
    return null;
  }
  const startPosition = deckMapCoordinate(renderedWindow.start, cardCount);
  const endPosition = deckMapCoordinate(renderedWindow.end, cardCount);
  if (startPosition === null || endPosition === null) {
    return null;
  }
  return {
    startOrdinal: renderedWindow.start + 1,
    endOrdinal: renderedWindow.end + 1,
    startPosition,
    endPosition,
  };
}

export function deckMapLandmarkForCard(
  card: DeckMapCard,
  index: number,
  cardCount: number,
  activePath: string | null,
  bookmarkedPaths: ReadonlySet<string>,
): DeckMapLandmark | null {
  const active = card.path === activePath;
  const bookmarked = bookmarkedPaths.has(card.path);
  if (!active && !bookmarked && !card.onDesk) {
    return null;
  }
  const position = deckMapCoordinate(index, cardCount);
  return position === null
    ? null
    : {
        path: card.path,
        address: card.address,
        title: card.title,
        ordinal: index + 1,
        position,
        active,
        bookmarked,
        onDesk: card.onDesk,
      };
}

export function buildDeckMapLandmarks(
  cards: readonly DeckMapCard[],
  activePath: string | null,
  bookmarkedPaths: ReadonlySet<string>,
): readonly DeckMapLandmark[] {
  return cards.flatMap((card, index) => {
    const landmark = deckMapLandmarkForCard(
      card,
      index,
      cards.length,
      activePath,
      bookmarkedPaths,
    );
    return landmark === null ? [] : [landmark];
  });
}

export function deckMapPhysicalPixelWidth(
  railWidth: number,
  devicePixelRatio: number,
): number {
  if (
    !Number.isFinite(railWidth) ||
    railWidth <= 0 ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0
  ) {
    return 1;
  }
  return Math.max(1, Math.round(railWidth * devicePixelRatio));
}

export function deckMapPhysicalPixelBucket(
  position: number,
  physicalPixelWidth: number,
): number {
  const normalized = Number.isFinite(position)
    ? Math.max(0, Math.min(1, position))
    : 0;
  const width = Number.isInteger(physicalPixelWidth) && physicalPixelWidth > 0
    ? physicalPixelWidth
    : 1;
  return Math.round(normalized * (width - 1));
}

export function bucketDeckMapLandmarks(
  landmarks: Iterable<DeckMapLandmark>,
  railWidth: number,
  devicePixelRatio: number,
): readonly DeckMapRenderableLandmark[] {
  const physicalWidth = deckMapPhysicalPixelWidth(
    railWidth,
    devicePixelRatio,
  );
  const exact: DeckMapExactLandmark[] = [];
  const lowerByBucket = new Map<number, DeckMapLandmark[]>();

  for (const landmark of landmarks) {
    const bucket = deckMapPhysicalPixelBucket(
      landmark.position,
      physicalWidth,
    );
    if (landmark.active || landmark.bookmarked) {
      exact.push({
        ...landmark,
        kind: "exact",
        id: `path:${landmark.path}`,
        bucket,
      });
      continue;
    }
    const grouped = lowerByBucket.get(bucket) ?? [];
    grouped.push(landmark);
    lowerByBucket.set(bucket, grouped);
  }

  const rendered: DeckMapRenderableLandmark[] = [...exact];
  for (const [bucket, members] of lowerByBucket) {
    members.sort((left, right) =>
      left.ordinal - right.ordinal || left.path.localeCompare(right.path)
    );
    const only = members[0];
    if (members.length === 1 && only !== undefined) {
      rendered.push({
        ...only,
        kind: "exact",
        id: `path:${only.path}`,
        bucket,
      });
      continue;
    }
    rendered.push({
      kind: "cluster",
      id: `cluster:${bucket}`,
      bucket,
      position:
        members.reduce((sum, member) => sum + member.position, 0) /
        members.length,
      members,
      count: members.length,
      onDeskCount: members.filter((member) => member.onDesk).length,
    });
  }

  rendered.sort((left, right) =>
    left.position - right.position || left.id.localeCompare(right.id)
  );
  return rendered;
}

export function deckMapIndexAtOffset(
  offset: number,
  railWidth: number,
  cardCount: number,
): number | null {
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(railWidth) ||
    railWidth <= 0 ||
    !Number.isInteger(cardCount) ||
    cardCount <= 0
  ) {
    return null;
  }
  if (cardCount === 1) {
    return 0;
  }
  const normalized = Math.max(0, Math.min(1, offset / railWidth));
  return Math.round(normalized * (cardCount - 1));
}

export function deckMapReadout(
  card: DeckMapCard,
  index: number,
  cardCount: number,
  cluster: DeckMapClusterLandmark | null,
  physicalBucket: number | null = null,
): DeckMapReadout | null {
  const position = deckMapCoordinate(index, cardCount);
  if (position === null) {
    return null;
  }
  const clusterSummary = cluster === null
    ? ""
    : `${cluster.count} Desk landmarks`;
  return {
    key: `${card.path}:${physicalBucket ?? cluster?.bucket ?? "card"}`,
    position,
    primary: `${card.address} · ${formatDeckMapNumber(index + 1)} / ${formatDeckMapNumber(cardCount)}`,
    title: card.title,
    clusterSummary,
  };
}

export function deckMapAriaValueText(
  active: DeckMapLandmark | null,
  cardCount: number,
  viewport: DeckMapViewportRange | null,
  bookmarkCount: number,
): string {
  const bookmarks =
    `${formatDeckMapNumber(bookmarkCount)} bookmark${bookmarkCount === 1 ? "" : "s"}`;
  if (active === null) {
    return `${formatDeckMapNumber(cardCount)} filed cards; ${bookmarks}`;
  }
  const visible = viewport === null
    ? ""
    : `; visible ${formatDeckMapNumber(viewport.startOrdinal)}–${formatDeckMapNumber(viewport.endOrdinal)}`;
  return `${active.address} · ${formatDeckMapNumber(active.ordinal)} of ${formatDeckMapNumber(cardCount)} · ${active.title}${visible}; ${bookmarks}`;
}

function formatDeckMapNumber(value: number): string {
  return value.toLocaleString("en-US");
}
