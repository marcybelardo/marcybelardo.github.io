// pattern: Imperative Shell

import {
  calculateMarginNoteOffsets,
  type MarginNoteMeasurement,
} from "./margin-note-layout.ts";

type MeasuredMarginNote = MarginNoteMeasurement & {
  readonly node: object;
};

type MarginNoteRestorationNode = {
  readonly node: object;
};

export type MarginNoteMeasureResult =
  | {
      readonly success: true;
      readonly notes: Array<MeasuredMarginNote>;
    }
  | {
      readonly success: false;
      readonly reason: string;
      readonly cleanupFailed?: boolean;
      readonly cleanupNodes?: Array<object>;
    };

export type MarginNoteState = "baseline" | "enhanced" | "cleanup-failed";

export type MarginNoteControllerPorts = {
  readonly measure: () => MarginNoteMeasureResult;
  readonly moveToRail: (node: object, top: number) => void;
  readonly restoreToList: (node: object) => boolean;
  readonly setEnhancedState: (state: MarginNoteState) => void;
};

export type MarginNoteController = {
  readonly enhance: () => boolean;
  readonly restore: () => boolean;
  readonly isEnhanced: () => boolean;
};

/**
 * Coordinates an all-or-nothing margin-note enhancement using injected DOM
 * ports. The controller retains the measured document order of every node
 * still needing restoration so cleanup does not depend on a second,
 * potentially failed measurement pass.
 */
export function createMarginNoteController(
  ports: MarginNoteControllerPorts,
): MarginNoteController {
  let restorationNodes: Array<MarginNoteRestorationNode> = [];
  let enhanced = false;

  function restoreNodes(
    notes: ReadonlyArray<MarginNoteRestorationNode>,
  ): Array<MarginNoteRestorationNode> {
    const remaining: Array<MarginNoteRestorationNode> = [];

    notes.forEach((note) => {
      try {
        if (!ports.restoreToList(note.node)) {
          remaining.push(note);
        }
      } catch {
        remaining.push(note);
      }
    });

    return remaining;
  }

  function restore(): boolean {
    const remaining = restoreNodes(restorationNodes);
    restorationNodes = remaining;
    enhanced = false;

    if (remaining.length > 0) {
      ports.setEnhancedState("cleanup-failed");
      return false;
    }

    ports.setEnhancedState("baseline");
    return true;
  }

  function enhance(): boolean {
    if (enhanced || restorationNodes.length > 0) {
      if (!restore()) {
        return false;
      }
    }

    let result: MarginNoteMeasureResult;

    try {
      result = ports.measure();
    } catch {
      restorationNodes = [];
      ports.setEnhancedState("baseline");
      return false;
    }

    if (!result.success) {
      restorationNodes = (result.cleanupNodes ?? []).map((node) => ({ node }));
      ports.setEnhancedState(
        result.cleanupFailed ? "cleanup-failed" : "baseline",
      );
      return false;
    }

    restorationNodes = result.notes.map(({ node }) => ({ node }));

    const measurements = result.notes.map(
      ({ id, referenceTop, height }): MarginNoteMeasurement => ({
        id,
        referenceTop,
        height,
      }),
    );
    const layout = calculateMarginNoteOffsets({ measurements });

    if (!layout.success || result.notes.length !== layout.offsets.length) {
      restore();
      return false;
    }

    try {
      layout.offsets.forEach(({ id, top }) => {
        const note = result.notes.find((candidate) => candidate.id === id);

        if (!note) {
          throw new Error("margin-note layout referenced an unknown note");
        }

        ports.moveToRail(note.node, top);
      });
      ports.setEnhancedState("enhanced");
      enhanced = true;
      return true;
    } catch {
      restore();
      return false;
    }
  }

  return {
    enhance,
    restore,
    isEnhanced: () => enhanced,
  };
}
