// pattern: Imperative Shell

import {
  createMarginNoteController,
  type MarginNoteController,
  type MarginNoteControllerPorts,
  type MarginNoteMeasureResult,
  type MarginNoteState,
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

type MarginNotePosition = {
  readonly placeholder: Comment;
  readonly parent: Node;
  readonly index: number;
  readonly previousSibling: Node | null;
  readonly nextSibling: Node | null;
};

type MarginNoteMeasurementPreparation = (
  definitions: ReadonlyArray<MarginNoteNode>,
) => (preservePositions: boolean) => boolean;

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
  const railList = rail?.querySelector<HTMLOListElement>("ol");

  if (
    !(rail instanceof HTMLElement) ||
    !(endnotes instanceof HTMLElement) ||
    !(railList instanceof HTMLOListElement)
  ) {
    return null;
  }

  const positions = new Map<MarginNoteNode, MarginNotePosition>();

  function createPlaceholders(
    notes: ReadonlyArray<{ readonly node: object }>,
  ): void {
    const captured = notes.map(({ node }): {
      readonly node: MarginNoteNode;
      readonly parent: Node;
      readonly index: number;
      readonly previousSibling: Node | null;
      readonly nextSibling: Node | null;
    } => {
      if (!(node instanceof HTMLElement) || !node.parentNode) {
        throw new Error("margin-note definition has no list parent");
      }

      const siblings = Array.from(node.parentNode.childNodes);
      const index = siblings.indexOf(node);

      if (index < 0) {
        throw new Error("margin-note definition position is unavailable");
      }

      return {
        node,
        parent: node.parentNode,
        index,
        previousSibling: siblings[index - 1] ?? null,
        nextSibling: siblings[index + 1] ?? null,
      };
    });
    const created: Array<MarginNoteNode> = [];

    try {
      captured.forEach(({ node, parent, index, previousSibling, nextSibling }) => {
        const placeholder = browserDocument.createComment("margin-note-position");
        parent.insertBefore(placeholder, node);
        positions.set(node, {
          placeholder,
          parent,
          index,
          previousSibling,
          nextSibling,
        });
        created.push(node);
      });
    } catch (error) {
      created.forEach((node) => {
        const placeholder = positions.get(node)?.placeholder;
        placeholder?.parentNode?.insertBefore(node, placeholder);
        placeholder?.remove();
        positions.delete(node);
      });
      throw error;
    }
  }

  function restoreNodeToList(
    node: MarginNoteNode,
    removePosition: boolean,
  ): boolean {
    const position = positions.get(node);

    if (!position) {
      return false;
    }

    let restored = false;

    if (position.parent.isConnected) {
      try {
        if (position.placeholder.parentNode === position.parent) {
          position.parent.insertBefore(node, position.placeholder);
        } else if (position.nextSibling?.parentNode === position.parent) {
          position.parent.insertBefore(node, position.nextSibling);
        } else if (position.previousSibling?.parentNode === position.parent) {
          const previousIndex = Array.from(position.parent.childNodes).indexOf(
            position.previousSibling,
          );
          const reference = position.parent.childNodes[previousIndex + 1] ?? null;
          position.parent.insertBefore(node, reference);
        } else {
          const reference = position.parent.childNodes[position.index] ?? null;
          position.parent.insertBefore(node, reference);
        }

        restored = node.parentNode === position.parent;
      } catch {
        restored = false;
      }
    }

    if (!restored) {
      const fallbackList = endnotes.querySelector<HTMLOListElement>("ol");

      if (fallbackList) {
        const fallbackIndex = Math.min(position.index, fallbackList.childNodes.length);
        const reference = fallbackList.childNodes[fallbackIndex] ?? null;
        fallbackList.insertBefore(node, reference);
        restored = node.parentNode === fallbackList;
      }
    }

    if (!restored) {
      return false;
    }

    if (removePosition) {
      position.placeholder.remove();
      positions.delete(node);
      node.style.removeProperty("--margin-note-top");
    }

    return true;
  }

  const ports: MarginNoteControllerPorts = {
    measure: (): MarginNoteMeasureResult =>
      measureMarginNotes(article, rail, (definitions) => {
        createPlaceholders(definitions.map((node) => ({ node })));

        try {
          definitions.forEach((node) => railList.append(node));
        } catch (error) {
          definitions.forEach((node) => {
            restoreNodeToList(node, true);
          });
          throw error;
        }

        return (preservePositions) =>
          definitions.every((node) =>
            restoreNodeToList(node, !preservePositions),
          );
      }),
    moveToRail: (node, top) => {
      if (!(node instanceof HTMLElement)) {
        throw new Error("margin-note node is not an HTMLElement");
      }

      const note = node;
      if (!positions.has(note)) {
        throw new Error("margin-note definition has no restoration placeholder");
      }

      railList.append(note);
      note.style.setProperty("--margin-note-top", `${top}px`);
    },
    restoreToList: (node) => {
      if (!(node instanceof HTMLElement)) {
        throw new Error("margin-note node is not an HTMLElement");
      }

      const note = node;

      if (!positions.has(note)) {
        return false;
      }

      return restoreNodeToList(note, true);
    },
    setEnhancedState: (state: MarginNoteState) => {
      delete article.dataset.marginNotesEnhanced;
      delete article.dataset.marginNoteCleanupFailed;

      if (state === "enhanced") {
        article.dataset.marginNotesEnhanced = "true";
        rail.setAttribute("aria-hidden", "false");
      } else if (state === "cleanup-failed") {
        article.dataset.marginNoteCleanupFailed = "true";
        rail.setAttribute("aria-hidden", "false");
      } else {
        rail.setAttribute("aria-hidden", "true");
      }
    },
  };
  const controller = createMarginNoteController(ports);
  const wideLayout = browserWindow.matchMedia(MARGIN_NOTE_WIDE_LAYOUT_QUERY);
  let isScheduled = false;
  let isDestroyed = false;
  let isPrinting = false;
  let generation = 0;
  let observedWidth: number | null = null;

  function runEnhancement(scheduledGeneration: number): void {
    if (scheduledGeneration !== generation || isPrinting || isDestroyed) {
      return;
    }

    isScheduled = false;

    if (!controller.restore()) {
      return;
    }

    if (wideLayout.matches) {
      controller.enhance();
    }
  }

  function scheduleEnhancement(): void {
    if (isScheduled || isDestroyed || isPrinting) {
      return;
    }

    isScheduled = true;
    const scheduledGeneration = generation;
    void browserDocument.fonts.ready.then(
      () => {
        if (
          isDestroyed ||
          isPrinting ||
          scheduledGeneration !== generation
        ) {
          if (scheduledGeneration === generation) {
            isScheduled = false;
          }
          return;
        }

        browserWindow.requestAnimationFrame(() => {
          runEnhancement(scheduledGeneration);
        });
      },
      () => {
        if (
          isDestroyed ||
          isPrinting ||
          scheduledGeneration !== generation
        ) {
          if (scheduledGeneration === generation) {
            isScheduled = false;
          }
          return;
        }

        browserWindow.requestAnimationFrame(() => {
          runEnhancement(scheduledGeneration);
        });
      },
    );
  }

  const handleMediaChange = (): void => {
    scheduleEnhancement();
  };
  const handleBeforePrint = (): void => {
    isPrinting = true;
    generation += 1;
    isScheduled = false;
    controller.restore();
  };
  const handleAfterPrint = (): void => {
    isPrinting = false;
    generation += 1;

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
      generation += 1;
      isScheduled = false;
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
  prepareDefinitionMeasurement?: MarginNoteMeasurementPreparation,
): ReturnType<MarginNoteControllerPorts["measure"]> {
  const definitions = Array.from(
    article.querySelectorAll<HTMLElement>("[data-margin-note-anchor]"),
  );
  const references = Array.from(
    article.querySelectorAll<HTMLElement>("[data-margin-note-ref]"),
  );
  const referenceById = new Map<string, HTMLElement>();
  const availableDefinitionIds = new Set(
    definitions
      .map((definition) => definition.id)
      .filter((id) => id.length > 0),
  );

  if (definitions.length === 0 || references.length === 0) {
    return { success: false, reason: "no complete margin notes found" };
  }

  for (const reference of references) {
    const referenceId = reference.id;
    const definitionId = reference.dataset.marginNoteRef;

    if (
      !referenceId ||
      !definitionId ||
      !availableDefinitionIds.has(definitionId) ||
      referenceById.has(referenceId)
    ) {
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

    const restoreAfterMeasurement = prepareDefinitionMeasurement?.(definitions);
    let measurementSucceeded = false;

    try {
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
      measurementSucceeded = true;
    } finally {
      if (
        restoreAfterMeasurement &&
        !restoreAfterMeasurement(measurementSucceeded)
      ) {
        throw new Error("margin-note measurement restoration failed");
      }
    }
  } finally {
    delete rail.dataset.marginNoteMeasuring;
  }

  return { success: true, notes };
}
