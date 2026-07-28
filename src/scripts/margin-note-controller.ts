// pattern: Imperative Shell

import {
  calculateMarginNoteOffsets,
  type MarginNoteMeasurement,
} from "./margin-note-layout.ts";

type MeasuredMarginNote = MarginNoteMeasurement & {
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
    };

export type MarginNoteControllerPorts = {
  readonly measure: () => MarginNoteMeasureResult;
  readonly moveToRail: (node: object, top: number) => void;
  readonly restoreToList: (node: object) => void;
  readonly setEnhancedState: (isEnhanced: boolean) => void;
};

export type MarginNoteController = {
  readonly enhance: () => boolean;
  readonly restore: () => void;
  readonly isEnhanced: () => boolean;
};

/**
 * Coordinates an all-or-nothing margin-note enhancement using injected DOM
 * ports. The controller retains the measured document order so restoration
 * does not depend on a second, potentially failed measurement pass.
 */
export function createMarginNoteController(
  ports: MarginNoteControllerPorts,
): MarginNoteController {
  let measuredNotes: Array<MeasuredMarginNote> = [];
  let enhanced = false;

  function restoreNodes(notes: ReadonlyArray<MeasuredMarginNote>): void {
    notes.forEach(({ node }) => {
      try {
        ports.restoreToList(node);
      } catch {
        // Keep restoring the remaining nodes when one DOM operation fails.
      }
    });
  }

  function clearEnhancedState(): void {
    try {
      ports.setEnhancedState(false);
    } catch {
      // Failure cleanup must not prevent the readable baseline from returning.
    }
    enhanced = false;
  }

  function restore(): void {
    restoreNodes(measuredNotes);
    measuredNotes = [];
    clearEnhancedState();
  }

  function enhance(): boolean {
    if (enhanced) {
      restore();
    }

    let result: MarginNoteMeasureResult;

    try {
      result = ports.measure();
    } catch {
      measuredNotes = [];
      clearEnhancedState();
      return false;
    }

    if (!result.success) {
      measuredNotes = [];
      clearEnhancedState();
      return false;
    }

    measuredNotes = [...result.notes];

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
      ports.setEnhancedState(true);
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
