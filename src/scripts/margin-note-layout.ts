// pattern: Functional Core

export const DEFAULT_MARGIN_NOTE_GAP = 16;

export type MarginNoteMeasurement = {
  readonly id: string;
  readonly referenceTop: number;
  readonly height: number;
};

export type MarginNoteOffset = {
  readonly id: string;
  readonly top: number;
};

export type MarginNoteLayoutResult =
  | {
      readonly success: true;
      readonly offsets: Array<MarginNoteOffset>;
    }
  | {
      readonly success: false;
      readonly reason: string;
    };

export type MarginNoteLayoutOptions = {
  readonly measurements: ReadonlyArray<MarginNoteMeasurement>;
  readonly gap?: number;
};

/**
 * Computes stable, non-overlapping rail offsets without reading or mutating
 * browser state. Measurements are already in document order, so ties retain
 * that authored order while later notes move below earlier notes as needed.
 */
export function calculateMarginNoteOffsets(
  options: MarginNoteLayoutOptions,
): MarginNoteLayoutResult {
  const { measurements, gap = DEFAULT_MARGIN_NOTE_GAP } = options;

  if (!Number.isFinite(gap) || gap < 0) {
    return { success: false, reason: "margin-note gap must be a finite non-negative number" };
  }

  const offsets: Array<MarginNoteOffset> = [];
  const ids = new Set<string>();
  let previousBottom = 0;

  for (const measurement of measurements) {
    if (
      measurement.id.trim().length === 0 ||
      ids.has(measurement.id) ||
      !Number.isFinite(measurement.referenceTop) ||
      !Number.isFinite(measurement.height) ||
      measurement.referenceTop < 0 ||
      measurement.height <= 0
    ) {
      return { success: false, reason: "margin-note measurements must be finite and positive" };
    }

    const top = Math.max(measurement.referenceTop, previousBottom + gap);
    offsets.push({ id: measurement.id, top });
    ids.add(measurement.id);
    previousBottom = top + measurement.height;
  }

  return { success: true, offsets };
}
