import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMarginNoteOffsets,
  type MarginNoteMeasurement,
} from "../src/scripts/margin-note-layout.ts";

test("margin-note offsets preserve document order and separate collisions", () => {
  const measurements: ReadonlyArray<MarginNoteMeasurement> = [
    { id: "first", referenceTop: 20, height: 30 },
    { id: "second", referenceTop: 10, height: 20 },
    { id: "third", referenceTop: 50, height: 10 },
  ];

  const result = calculateMarginNoteOffsets({ measurements, gap: 8 });

  assert.deepEqual(result, {
    success: true,
    offsets: [
      { id: "first", top: 20 },
      { id: "second", top: 58 },
      { id: "third", top: 86 },
    ],
  });
});

test("margin-note layout rejects invalid measurements without producing offsets", () => {
  const result = calculateMarginNoteOffsets({
    measurements: [{ id: "broken", referenceTop: 12, height: 0 }],
  });

  assert.deepEqual(result, {
    success: false,
    reason: "margin-note measurements must be finite and positive",
  });
});

test("margin-note layout rejects duplicate identities and invalid gaps", () => {
  assert.equal(
    calculateMarginNoteOffsets({
      measurements: [
        { id: "same", referenceTop: 0, height: 10 },
        { id: "same", referenceTop: 20, height: 10 },
      ],
    }).success,
    false,
  );
  assert.equal(
    calculateMarginNoteOffsets({
      measurements: [],
      gap: Number.NaN,
    }).success,
    false,
  );
});
