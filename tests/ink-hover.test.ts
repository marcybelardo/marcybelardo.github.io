import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INK_HOVER_POINTER_QUERY,
  initializeInkHover,
} from "../src/scripts/ink-hover.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inkHoverStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/ink-hover.css"),
  "utf8",
);
const photoNavigationStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/photo-navigation.css"),
  "utf8",
);

type Listener = (event: Record<string, unknown>) => void;

class FakeEventTarget {
  readonly listeners = new Map<string, Array<Listener>>();

  addEventListener(
    type: string,
    callback: Listener,
    _options?: { readonly once?: boolean },
  ): void {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type: string, callback: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== callback),
    );
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  dispatchEvent(type: string, event: Record<string, unknown> = {}): void {
    [...(this.listeners.get(type) ?? [])].forEach((callback) => callback(event));
  }
}

class FakeElement extends FakeEventTarget {
  readonly attributes = new Map<string, string>();
  readonly style = {
    properties: new Map<string, string>(),
    setProperty: (name: string, value: string): void => {
      this.style.properties.set(name, value);
    },
    removeProperty: (name: string): void => {
      this.style.properties.delete(name);
    },
  };
  rect = { left: 0, top: 0, width: 100, height: 20 };

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getBoundingClientRect(): typeof this.rect {
    return this.rect;
  }

  dispatchPointerEvent(
    type: "pointerenter" | "pointermove" | "pointerleave",
    event: { readonly clientX?: number; readonly clientY?: number } = {},
  ): void {
    this.dispatchEvent(type, { ...event, currentTarget: this });
  }
}

class FakeDocument extends FakeEventTarget {
  readonly targets: ReadonlyArray<FakeElement>;

  constructor(targets: ReadonlyArray<FakeElement>) {
    super();
    this.targets = targets;
  }

  querySelectorAll<T extends FakeElement>(selector: string): Array<T> {
    return selector === "[data-ink-hover]" ? (this.targets as Array<T>) : [];
  }
}

class FakeMediaQuery extends FakeEventTarget {
  matches: boolean;

  constructor(matches: boolean) {
    super();
    this.matches = matches;
  }
}

class FakeWindow {
  readonly animationFrames: Array<{ readonly id: number; readonly callback: () => void }> = [];
  readonly cancelledFrames = new Set<number>();
  readonly mediaQuery: FakeMediaQuery;
  private nextFrameId = 1;

  constructor(matches: boolean) {
    this.mediaQuery = new FakeMediaQuery(matches);
  }

  matchMedia(query: string): FakeMediaQuery {
    assert.equal(query, INK_HOVER_POINTER_QUERY);
    return this.mediaQuery;
  }

  requestAnimationFrame(callback: () => void): number {
    const id = this.nextFrameId++;
    this.animationFrames.push({ id, callback });
    return id;
  }

  cancelAnimationFrame(id: number): void {
    this.cancelledFrames.add(id);
  }

  flushAnimationFrames(): void {
    const frames = this.animationFrames.splice(0);
    frames.forEach(({ id, callback }) => {
      if (!this.cancelledFrames.has(id)) {
        callback();
      }
    });
  }
}

function withHTMLElement<T>(callback: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeElement,
  });

  try {
    return callback();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "HTMLElement", previous);
    } else {
      delete (globalThis as { HTMLElement?: unknown }).HTMLElement;
    }
  }
}

test("ink hover follows fine-pointer movement and coalesces style writes", () => {
  withHTMLElement(() => {
    const target = new FakeElement();
    target.rect = { left: 100, top: 50, width: 200, height: 100 };
    const document = new FakeDocument([target]);
    const window = new FakeWindow(true);
    const runtime = initializeInkHover({
      document: document as unknown as Document,
      window: window as unknown as Window,
    });

    assert.ok(runtime);
    assert.equal(target.listenerCount("pointerenter"), 1);
    assert.equal(target.listenerCount("pointermove"), 1);
    assert.equal(target.listenerCount("pointerleave"), 1);

    target.dispatchPointerEvent("pointerenter", { clientX: 120, clientY: 80 });
    target.dispatchPointerEvent("pointermove", { clientX: 250, clientY: 125 });
    target.dispatchPointerEvent("pointermove", { clientX: 200, clientY: 100 });

    assert.equal(target.getAttribute("data-ink-hover-active"), "true");
    assert.equal(target.style.properties.has("--ink-hover-x"), false);
    assert.equal(window.animationFrames.length, 1);

    window.flushAnimationFrames();
    assert.equal(target.style.properties.get("--ink-hover-x"), "50%");
    assert.equal(target.style.properties.get("--ink-hover-y"), "50%");

    target.dispatchPointerEvent("pointerleave");
    assert.equal(target.getAttribute("data-ink-hover-active"), null);
    assert.equal(target.style.properties.has("--ink-hover-x"), false);
    assert.equal(target.style.properties.has("--ink-hover-y"), false);
    runtime.destroy();
  });
});

test("ink hover responds to pointer capability changes and cleans up on swaps", () => {
  withHTMLElement(() => {
    const target = new FakeElement();
    const document = new FakeDocument([target]);
    const window = new FakeWindow(true);
    const runtime = initializeInkHover({
      document: document as unknown as Document,
      window: window as unknown as Window,
    });

    assert.ok(runtime);
    assert.equal(window.mediaQuery.listenerCount("change"), 1);

    window.mediaQuery.matches = false;
    window.mediaQuery.dispatchEvent("change");
    assert.equal(target.listenerCount("pointerenter"), 0);
    assert.equal(target.getAttribute("data-ink-hover-active"), null);

    window.mediaQuery.matches = true;
    window.mediaQuery.dispatchEvent("change");
    assert.equal(target.listenerCount("pointerenter"), 1);

    target.dispatchPointerEvent("pointerenter", { clientX: 60, clientY: 10 });
    assert.equal(window.animationFrames.length, 1);
    document.dispatchEvent("astro:before-swap");

    assert.equal(target.listenerCount("pointerenter"), 0);
    assert.equal(target.listenerCount("pointermove"), 0);
    assert.equal(target.listenerCount("pointerleave"), 0);
    assert.equal(window.mediaQuery.listenerCount("change"), 0);
    assert.equal(document.listenerCount("astro:before-swap"), 0);
    assert.equal(target.getAttribute("data-ink-hover-active"), null);
    assert.deepEqual([...target.style.properties], []);
    assert.deepEqual([...window.cancelledFrames], [1]);

    window.flushAnimationFrames();
    runtime.destroy();
  });
});

test("ink hover styles use a local fixed-radius field clipped to ink", () => {
  assert.match(inkHoverStyles, /circle var\(--ink-hover-radius\) at var\(--ink-hover-x\) var\(--ink-hover-y\)/);
  assert.match(inkHoverStyles, /--ink-hover-radius:\s*5rem/);
  assert.match(inkHoverStyles, /var\(--color-ink\)\s*100%/);
  assert.match(inkHoverStyles, /background-clip:\s*text/);
  assert.match(inkHoverStyles, /background-size:\s*7rem 7rem, auto/);
  assert.match(photoNavigationStyles, /background-color:\s*var\(--color-ink\)/);
  assert.doesNotMatch(
    photoNavigationStyles,
    /primary-navigation__menu-button[^}]*\{[^}]*background:\s*var\(--color-ink\)/,
  );
});
