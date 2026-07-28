import assert from "node:assert/strict";
import test from "node:test";

import {
  createMarginNoteController,
  type MarginNoteControllerPorts,
  type MarginNoteMeasureResult,
  type MarginNoteState,
} from "../src/scripts/margin-note-controller.ts";

type FakeNote = {
  readonly id: string;
  readonly backlinks: ReadonlyArray<string>;
};

function createPorts(
  notes: ReadonlyArray<FakeNote>,
  onMove?: (note: FakeNote) => void,
): {
  readonly ports: MarginNoteControllerPorts;
  readonly moved: Array<string>;
  readonly restored: Array<string>;
  readonly states: Array<MarginNoteState>;
} {
  const moved: Array<string> = [];
  const restored: Array<string> = [];
  const states: Array<boolean> = [];
  const ports: MarginNoteControllerPorts = {
    measure: (): MarginNoteMeasureResult => ({
      success: true,
      notes: notes.map((note, index) => ({
        id: note.id,
        referenceTop: index * 4,
        height: 12,
        node: note,
      })),
    }),
    moveToRail: (node) => {
      const note = node as FakeNote;
      moved.push(note.id);
      onMove?.(note);
    },
    restoreToList: (node) => {
      const note = node as FakeNote;
      restored.push(note.id);
      return true;
    },
    setEnhancedState: (state) => {
      states.push(state);
    },
  };

  return { ports, moved, restored, states };
}

test("controller enhances measured notes and restores their original order", () => {
  const notes: ReadonlyArray<FakeNote> = [
    { id: "source", backlinks: ["source-ref", "source-ref-2"] },
    { id: "second", backlinks: ["second-ref"] },
  ];
  const fake = createPorts(notes);
  const controller = createMarginNoteController(fake.ports);

  assert.equal(controller.enhance(), true);
  assert.equal(controller.isEnhanced(), true);
  assert.deepEqual(fake.moved, ["source", "second"]);
  assert.deepEqual(fake.states, ["enhanced"]);

  controller.restore();

  assert.equal(controller.isEnhanced(), false);
  assert.deepEqual(fake.restored, ["source", "second"]);
  assert.deepEqual(notes.map((note) => note.backlinks), [
    ["source-ref", "source-ref-2"],
    ["second-ref"],
  ]);
  assert.deepEqual(fake.states, ["enhanced", "baseline"]);
});

test("invalid measurements leave the baseline unenhanced", () => {
  const note = { id: "broken", backlinks: ["broken-ref"] };
  const fake = createPorts([note]);
  const invalidPorts: MarginNoteControllerPorts = {
    ...fake.ports,
    measure: () => ({
    success: true,
    notes: [{ id: note.id, referenceTop: 10, height: 0, node: note }],
    }),
  };
  const controller = createMarginNoteController(invalidPorts);

  assert.equal(controller.enhance(), false);
  assert.equal(controller.isEnhanced(), false);
  assert.deepEqual(fake.moved, []);
  assert.deepEqual(fake.states, ["baseline"]);
});

test("a placement exception restores every note and removes enhancement state", () => {
  const notes: ReadonlyArray<FakeNote> = [
    { id: "first", backlinks: ["first-ref"] },
    { id: "second", backlinks: ["second-ref", "second-ref-2"] },
  ];
  const fake = createPorts(notes, (note) => {
    if (note.id === "second") {
      throw new Error("forced placement failure");
    }
  });
  const controller = createMarginNoteController(fake.ports);

  assert.equal(controller.enhance(), false);
  assert.equal(controller.isEnhanced(), false);
  assert.deepEqual(fake.moved, ["first", "second"]);
  assert.deepEqual(fake.restored, ["first", "second"]);
  assert.deepEqual(fake.states, ["baseline"]);
});

test("restoration failure keeps the controller in a visible cleanup state", () => {
  const note = { id: "unrestored", backlinks: ["unrestored-ref"] };
  const fake = createPorts([note]);
  const states: Array<MarginNoteState> = [];
  let shouldFail = true;
  const controller = createMarginNoteController({
    ...fake.ports,
    restoreToList: () => {
      if (shouldFail) {
        return false;
      }

      return true;
    },
    setEnhancedState: (state) => {
      states.push(state);
    },
  });

  assert.equal(controller.enhance(), true);
  assert.equal(controller.restore(), false);
  assert.deepEqual(states, ["enhanced", "cleanup-failed"]);
  assert.equal(controller.isEnhanced(), false);

  shouldFail = false;
  assert.equal(controller.restore(), true);
  assert.deepEqual(states, ["enhanced", "cleanup-failed", "baseline"]);
});

test("before-print restoration keeps multiple backlinks attached to one note", () => {
  const note = { id: "source", backlinks: ["source-ref", "source-ref-2"] };
  const fake = createPorts([note]);
  const controller = createMarginNoteController(fake.ports);

  assert.equal(controller.enhance(), true);
  controller.restore();

  assert.deepEqual(fake.restored, ["source"]);
  assert.deepEqual(note.backlinks, ["source-ref", "source-ref-2"]);
  assert.equal(controller.isEnhanced(), false);
});
