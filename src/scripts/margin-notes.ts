// pattern: Imperative Shell

import {
  createMarginNoteController,
  type MarginNoteController,
  type MarginNoteControllerPorts,
  type MarginNoteMeasureResult,
} from "./margin-note-controller.ts";

export const MARGIN_NOTE_WIDE_LAYOUT_QUERY = "(min-width: 72rem)";

type MarginNoteBrowserOptions = {
  readonly root?: HTMLElement | null;
  readonly window?: Window;
};

type MarginNoteRuntime = {
  readonly controller: MarginNoteController;
  readonly destroy: () => void;
};

type MarginNoteNode = HTMLElement;

/**
 * Progressively enhances a semantic footnote section with a desktop rail.
 * Every DOM operation is kept here; the controller receives only injected
 * ports and remains usable with fake nodes in Node tests.
 */
export function initializeMarginNotes(
  options: MarginNoteBrowserOptions = {},
): MarginNoteRuntime | null {
  const browserWindow = options.window ?? window;
  const browserDocument = options.root?.ownerDocument ?? document;
  const article =
    options.root ??
    browserDocument.querySelector<HTMLElement>("[data-margin-note-article]");

  if (!(article instanceof HTMLElement)) {
    return null;
  }

  const rail = article.querySelector<HTMLElement>("[data-margin-note-rail]");
  const endnotes = article.querySelector<HTMLElement>("[data-footnotes]");

  if (!(rail instanceof HTMLElement) || !(endnotes instanceof HTMLElement)) {
    return null;
  }

  const placeholders = new Map<MarginNoteNode, Comment>();

  function createPlaceholders(
    notes: ReadonlyArray<{ readonly node: object }>,
  ): void {
    const created: Array<MarginNoteNode> = [];

    try {
      notes.forEach(({ node }) => {
        if (!(node instanceof HTMLElement) || !node.parentNode) {
          throw new Error("margin-note definition has no list parent");
        }

        const placeholder = browserDocument.createComment("margin-note-position");
        node.parentNode.insertBefore(placeholder, node);
        placeholders.set(node, placeholder);
        created.push(node);
      });
    } catch (error) {
      created.forEach((node) => {
        const placeholder = placeholders.get(node);
        placeholder?.parentNode?.insertBefore(node, placeholder);
        placeholder?.remove();
        placeholders.delete(node);
      });
      throw error;
    }
  }

  const ports: MarginNoteControllerPorts = {
    measure: (): MarginNoteMeasureResult => {
      const result = measureMarginNotes(article, rail);

      if (result.success) {
        createPlaceholders(result.notes);
      }

      return result;
    },
    moveToRail: (node, top) => {
      if (!(node instanceof HTMLElement)) {
        throw new Error("margin-note node is not an HTMLElement");
      }

      const note = node;
      if (!placeholders.has(note)) {
        throw new Error("margin-note definition has no restoration placeholder");
      }

      rail.append(note);
      note.style.setProperty("--margin-note-top", `${top}px`);
    },
    restoreToList: (node) => {
      if (!(node instanceof HTMLElement)) {
        throw new Error("margin-note node is not an HTMLElement");
      }

      const note = node;
      const placeholder = placeholders.get(note);

      if (placeholder?.parentNode) {
        placeholder.parentNode.insertBefore(note, placeholder);
        placeholder.remove();
      } else {
        const orderedList = endnotes.querySelector<HTMLOListElement>("ol");

        if (!orderedList) {
          throw new Error("margin-note endnotes list is missing");
        }

        orderedList.append(note);
      }

      placeholders.delete(note);
      note.style.removeProperty("--margin-note-top");
    },
    setEnhancedState: (isEnhanced) => {
      if (isEnhanced) {
        article.dataset.marginNotesEnhanced = "true";
        rail.setAttribute("aria-hidden", "false");
      } else {
        delete article.dataset.marginNotesEnhanced;
        rail.setAttribute("aria-hidden", "true");
      }
    },
  };
  const controller = createMarginNoteController(ports);
  const wideLayout = browserWindow.matchMedia(MARGIN_NOTE_WIDE_LAYOUT_QUERY);
  let isScheduled = false;
  let isDestroyed = false;
  let observedWidth: number | null = null;

  function runEnhancement(): void {
    isScheduled = false;

    if (isDestroyed) {
      return;
    }

    controller.restore();

    if (wideLayout.matches) {
      controller.enhance();
    }
  }

  function scheduleEnhancement(): void {
    if (isScheduled || isDestroyed) {
      return;
    }

    isScheduled = true;
    void browserDocument.fonts.ready.then(
      () => {
        browserWindow.requestAnimationFrame(runEnhancement);
      },
      () => {
        browserWindow.requestAnimationFrame(runEnhancement);
      },
    );
  }

  const handleMediaChange = (): void => {
    scheduleEnhancement();
  };
  const handleBeforePrint = (): void => {
    controller.restore();
  };
  const handleAfterPrint = (): void => {
    if (wideLayout.matches) {
      scheduleEnhancement();
    }
  };

  wideLayout.addEventListener("change", handleMediaChange);
  browserWindow.addEventListener("beforeprint", handleBeforePrint);
  browserWindow.addEventListener("afterprint", handleAfterPrint);

  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(([entry]) => {
          const width = entry?.contentRect.width ?? null;

          if (width === null || width === observedWidth) {
            return;
          }

          observedWidth = width;
          scheduleEnhancement();
        })
      : null;
  resizeObserver?.observe(article);

  scheduleEnhancement();

  return {
    controller,
    destroy: () => {
      if (isDestroyed) {
        return;
      }

      isDestroyed = true;
      resizeObserver?.disconnect();
      wideLayout.removeEventListener("change", handleMediaChange);
      browserWindow.removeEventListener("beforeprint", handleBeforePrint);
      browserWindow.removeEventListener("afterprint", handleAfterPrint);
      controller.restore();
    },
  };
}

function measureMarginNotes(
  article: HTMLElement,
  rail: HTMLElement,
): ReturnType<MarginNoteControllerPorts["measure"]> {
  const definitions = Array.from(
    article.querySelectorAll<HTMLElement>("[data-margin-note-anchor]"),
  );
  const references = Array.from(
    article.querySelectorAll<HTMLElement>("[data-margin-note-ref]"),
  );
  const referenceById = new Map<string, HTMLElement>();

  if (definitions.length === 0 || references.length === 0) {
    return { success: false, reason: "no complete margin notes found" };
  }

  for (const reference of references) {
    const referenceId = reference.id;
    const definitionId = reference.dataset.marginNoteRef;

    if (!referenceId || !definitionId || referenceById.has(referenceId)) {
      return { success: false, reason: "margin-note reference identity is invalid" };
    }

    referenceById.set(referenceId, reference);
  }

  const notes = [];
  const definitionIds = new Set<string>();

  rail.dataset.marginNoteMeasuring = "true";

  try {
    const railRect = rail.getBoundingClientRect();

    if (!Number.isFinite(railRect.top) || railRect.width <= 0) {
      return { success: false, reason: "margin-note rail measurement failed" };
    }

    for (const definition of definitions) {
      const definitionId = definition.id;
      const referenceId = definition.dataset.marginNoteAnchor;
      const reference = referenceId ? referenceById.get(referenceId) : null;

      if (
        !definitionId ||
        definitionIds.has(definitionId) ||
        !reference ||
        reference.dataset.marginNoteRef !== definitionId
      ) {
        return { success: false, reason: "margin-note reference and definition are unpaired" };
      }

      const referenceRect = reference.getBoundingClientRect();
      const definitionRect = definition.getBoundingClientRect();
      const referenceTop = referenceRect.top - railRect.top;

      if (
        !Number.isFinite(referenceTop) ||
        !Number.isFinite(definitionRect.height) ||
        referenceTop < 0 ||
        definitionRect.height <= 0
      ) {
        return { success: false, reason: "margin-note node measurement failed" };
      }

      definitionIds.add(definitionId);
      notes.push({
        id: definitionId,
        referenceTop,
        height: definitionRect.height,
        node: definition,
      });
    }
  } finally {
    delete rail.dataset.marginNoteMeasuring;
  }

  return { success: true, notes };
}
