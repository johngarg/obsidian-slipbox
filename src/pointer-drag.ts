export interface ThresholdPointerDragOptions {
  readonly captureTarget: HTMLElement;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly threshold: number;
  readonly onDragStart: () => void;
  readonly onDragMove: (
    event: PointerEvent,
    deltaX: number,
    deltaY: number,
  ) => void;
  readonly onDrop: (event: PointerEvent) => void;
  readonly onCancel: () => void;
}

export type PointerActionGate = (
  action: () => void,
) => Promise<unknown>;

/**
 * Wait for an asynchronous interaction gate without starting a stale pointer
 * action after the user has already released or cancelled that pointer.
 */
export function beginPointerActionAfterGate(
  event: PointerEvent,
  gate: PointerActionGate,
  action: () => void,
): void {
  const currentTarget = event.currentTarget;
  const document = currentTarget !== null && "ownerDocument" in currentTarget
    ? currentTarget.ownerDocument as Document
    : null;
  if (document === null) {
    return;
  }
  const pointerId = event.pointerId;
  let pointerActive = true;
  const cleanup = (): void => {
    document.removeEventListener("pointerup", released, true);
    document.removeEventListener("pointercancel", released, true);
  };
  const released = (releasedEvent: PointerEvent): void => {
    if (releasedEvent.pointerId === pointerId) {
      pointerActive = false;
      cleanup();
    }
  };
  document.addEventListener("pointerup", released, true);
  document.addEventListener("pointercancel", released, true);
  void gate(() => {
    cleanup();
    if (pointerActive) {
      action();
    }
  }).finally(cleanup);
}

/**
 * Preserve native click and double-click targeting until pointer movement
 * demonstrates drag intent, then capture the active pointer for a reliable
 * drag outside the original element.
 */
export function beginThresholdPointerDrag(
  options: ThresholdPointerDragOptions,
): void {
  const {
    captureTarget,
    pointerId,
    startX,
    startY,
    threshold,
  } = options;
  const document = captureTarget.ownerDocument;
  let dragging = false;

  const cleanup = (): void => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
  };
  const releaseCapture = (): void => {
    if (captureTarget.hasPointerCapture(pointerId)) {
      captureTarget.releasePointerCapture(pointerId);
    }
  };
  const move = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!dragging) {
      if (Math.hypot(deltaX, deltaY) < Math.max(0, threshold)) {
        return;
      }
      try {
        captureTarget.setPointerCapture(pointerId);
      } catch {
        cleanup();
        options.onCancel();
        return;
      }
      dragging = true;
      options.onDragStart();
    }
    event.preventDefault();
    options.onDragMove(event, deltaX, deltaY);
  };
  const finish = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }
    cleanup();
    releaseCapture();
    if (!dragging) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    options.onDrop(event);
  };
  const cancel = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }
    cleanup();
    releaseCapture();
    options.onCancel();
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", cancel);
}
