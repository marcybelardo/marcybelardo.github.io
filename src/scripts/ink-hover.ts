// pattern: Imperative Shell

export const INK_HOVER_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

type InkHoverRoot = Document | HTMLElement;

type InkHoverBrowserOptions = {
  readonly root?: InkHoverRoot;
  readonly document?: Document;
  readonly window?: Window;
};

export type InkHoverRuntime = {
  readonly destroy: () => void;
};

type InkHoverPosition = {
  readonly x: number;
  readonly y: number;
};

/**
 * Progressively enhances selected ink with a frame-coalesced pointer field.
 * It does not interpolate or run an idle animation, so reduced-motion users
 * receive the same direct frame update without any smoothing loop.
 */
export function initializeInkHover(
  options: InkHoverBrowserOptions = {},
): InkHoverRuntime | null {
  const rootDocument =
    options.root && "ownerDocument" in options.root
      ? (options.root as HTMLElement).ownerDocument
      : null;
  const browserDocument =
    options.document ?? rootDocument ??
    (typeof document === "undefined" ? null : document);
  const browserWindow =
    options.window ?? (typeof window === "undefined" ? null : window);

  if (!browserDocument || !browserWindow) {
    return null;
  }

  const root = options.root ?? browserDocument;
  const targets = Array.from(
    root.querySelectorAll<HTMLElement>("[data-ink-hover]"),
  );

  if (targets.length === 0) {
    return null;
  }

  const finePointer = browserWindow.matchMedia(INK_HOVER_POINTER_QUERY);
  const pending = new Map<HTMLElement, InkHoverPosition>();
  let frame: number | null = null;
  let enabled = false;
  let destroyed = false;

  const writePosition = (target: HTMLElement, position: InkHoverPosition) => {
    target.style.setProperty("--ink-hover-x", `${position.x}%`);
    target.style.setProperty("--ink-hover-y", `${position.y}%`);
  };

  const flushPositions = () => {
    frame = null;

    pending.forEach((position, target) => {
      if (target.getAttribute("data-ink-hover-active") === "true") {
        writePosition(target, position);
      }
    });
    pending.clear();
  };

  const queuePosition = (target: HTMLElement, position: InkHoverPosition) => {
    pending.set(target, position);
    if (frame === null) {
      frame = browserWindow.requestAnimationFrame(flushPositions);
    }
  };

  const resetTarget = (target: HTMLElement) => {
    pending.delete(target);
    target.removeAttribute("data-ink-hover-active");
    target.style.removeProperty("--ink-hover-x");
    target.style.removeProperty("--ink-hover-y");
  };

  const positionFromEvent = (
    target: HTMLElement,
    event: PointerEvent,
  ): InkHoverPosition | null => {
    const bounds = target.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }

    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    return { x, y };
  };

  const handlePointerEnter = (event: PointerEvent) => {
    if (!enabled || !(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    const target = event.currentTarget;
    target.setAttribute("data-ink-hover-active", "true");
    const position = positionFromEvent(target, event);
    if (position) {
      queuePosition(target, position);
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!enabled || !(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    const target = event.currentTarget;
    const position = positionFromEvent(target, event);
    if (position) {
      queuePosition(target, position);
    }
  };

  const handlePointerLeave = (event: PointerEvent) => {
    if (event.currentTarget instanceof HTMLElement) {
      resetTarget(event.currentTarget);
    }
  };

  const addTargetListeners = () => {
    targets.forEach((target) => {
      target.addEventListener("pointerenter", handlePointerEnter);
      target.addEventListener("pointermove", handlePointerMove);
      target.addEventListener("pointerleave", handlePointerLeave);
    });
  };

  const removeTargetListeners = () => {
    targets.forEach((target) => {
      target.removeEventListener("pointerenter", handlePointerEnter);
      target.removeEventListener("pointermove", handlePointerMove);
      target.removeEventListener("pointerleave", handlePointerLeave);
      resetTarget(target);
    });
  };

  const syncPointerSupport = () => {
    if (destroyed || finePointer.matches === enabled) {
      return;
    }

    enabled = finePointer.matches;
    if (enabled) {
      addTargetListeners();
    } else {
      removeTargetListeners();
    }
  };

  finePointer.addEventListener("change", syncPointerSupport);
  syncPointerSupport();

  const destroy = () => {
    if (destroyed) {
      return;
    }

    destroyed = true;
    finePointer.removeEventListener("change", syncPointerSupport);
    removeTargetListeners();
    if (frame !== null) {
      browserWindow.cancelAnimationFrame(frame);
      frame = null;
    }
    pending.clear();
    browserDocument.removeEventListener("astro:before-swap", destroy);
  };

  browserDocument.addEventListener("astro:before-swap", destroy, { once: true });
  return { destroy };
}
