import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { initializeMarginNotes } from "../src/scripts/margin-notes.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stylesheet = readFileSync(resolve(repositoryRoot, "src/styles/global.css"), "utf8");

type Child = FakeElement | FakeComment;
type Rect = { readonly top: number; readonly width: number; readonly height: number };
type EventCallback = () => void;

class FakeEventTarget {
  readonly listeners = new Map<string, Array<EventCallback>>();

  addEventListener(type: string, callback: EventCallback): void {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type: string, callback: EventCallback): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== callback),
    );
  }

  dispatchEvent(type: string): void {
    [...(this.listeners.get(type) ?? [])].forEach((callback) => callback());
  }
}

class FakeComment {
  parentNode: FakeElement | null = null;

  remove(): void {
    this.parentNode?.removeChild(this);
  }
}

class FakeElement extends FakeEventTarget {
  readonly childNodes: Array<Child> = [];
  readonly dataset: Record<string, string> = {};
  readonly ownerDocument: FakeDocument;
  readonly style = {
    properties: new Map<string, string>(),
    setProperty: (name: string, value: string) => {
      this.style.properties.set(name, value);
    },
    removeProperty: (name: string) => {
      this.style.properties.delete(name);
    },
  };
  tagName: string;
  rect: Rect = { top: 0, width: 100, height: 20 };
  parentNode: FakeElement | null = null;
  attributes = new Map<string, string>();

  constructor(ownerDocument: FakeDocument, tagName: string) {
    super();
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
  }

  get id(): string {
    return this.attributes.get("id") ?? "";
  }

  get isConnected(): boolean {
    let current: FakeElement | null = this;

    while (current?.parentNode) {
      current = current.parentNode;
    }

    return current === this.ownerDocument.article;
  }

  set id(value: string) {
    this.attributes.set("id", value);
  }

  get children(): Array<FakeElement> {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement);
  }

  append(...nodes: Array<Child>): void {
    nodes.forEach((node) => {
      if (node instanceof FakeElement) {
        node.parentNode?.removeChild(node);
        node.parentNode = this;
      } else {
        node.parentNode?.removeChild(node);
      }
      this.childNodes.push(node);
    });
  }

  insertBefore(node: Child, reference: Child | null): void {
    if (node instanceof FakeElement) {
      node.parentNode?.removeChild(node);
      node.parentNode = this;
    } else {
      node.parentNode?.removeChild(node);
    }

    const index = reference ? this.childNodes.indexOf(reference) : -1;
    const insertAt = index >= 0 ? index : this.childNodes.length;
    this.childNodes.splice(insertAt, 0, node);
    if (node instanceof FakeComment) {
      node.parentNode = this;
    }
  }

  removeChild(node: Child): void {
    const childIndex = this.childNodes.indexOf(node);
    if (childIndex >= 0) {
      this.childNodes.splice(childIndex, 1);
    }
    if (node instanceof FakeElement) {
      node.parentNode = null;
    } else {
      node.parentNode = null;
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .split("-")
        .map((part, index) => (index === 0 ? part : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
        .join("");
      this.dataset[key] = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector<T extends FakeElement = FakeElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  querySelectorAll<T extends FakeElement = FakeElement>(selector: string): Array<T> {
    const results: Array<T> = [];
    const visit = (element: FakeElement): void => {
      if (matchesSelector(element, selector)) {
        results.push(element as T);
      }
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return results;
  }

  getBoundingClientRect(): Rect {
    return this.rect;
  }
}

class FakeDocument extends FakeEventTarget {
  readonly fonts: { readonly ready: Promise<void> };
  article: FakeElement | null = null;

  constructor(fontsReady: Promise<void>) {
    super();
    this.fonts = { ready: fontsReady };
  }

  createComment(): FakeComment {
    return new FakeComment();
  }

  querySelector<T extends FakeElement = FakeElement>(selector: string): T | null {
    return selector === "[data-margin-note-article]" ? (this.article as T | null) : null;
  }
}

class FakeMediaQuery extends FakeEventTarget {
  matches: boolean;

  constructor(matches: boolean) {
    super();
    this.matches = matches;
  }
}

class FakeWindow extends FakeEventTarget {
  readonly animationFrames: Array<() => void> = [];
  readonly mediaQuery: FakeMediaQuery;

  constructor(matches: boolean) {
    super();
    this.mediaQuery = new FakeMediaQuery(matches);
  }

  matchMedia(): FakeMediaQuery {
    return this.mediaQuery;
  }

  requestAnimationFrame(callback: () => void): number {
    this.animationFrames.push(callback);
    return this.animationFrames.length;
  }

  flushAnimationFrames(): void {
    const callbacks = this.animationFrames.splice(0);
    callbacks.forEach((callback) => callback());
  }
}

class FakeResizeObserver {
  static current: FakeResizeObserver | null = null;
  readonly callback: (entries: ReadonlyArray<{ readonly contentRect: Rect }>) => void;

  constructor(callback: (entries: ReadonlyArray<{ readonly contentRect: Rect }>) => void) {
    this.callback = callback;
    FakeResizeObserver.current = this;
  }

  observe(): void {}
  disconnect(): void {}

  trigger(width: number): void {
    this.callback([{ contentRect: { top: 0, width, height: 500 } }]);
  }
}

function matchesSelector(element: FakeElement, selector: string): boolean {
  if (selector === "ol") {
    return element.tagName === "OL";
  }

  const dataMatch = selector.match(/^\[data-([a-z-]+)\]$/);
  if (!dataMatch?.[1]) {
    return false;
  }

  const key = dataMatch[1]
    .split("-")
    .map((part, index) => (index === 0 ? part : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join("");
  return Object.hasOwn(element.dataset, key);
}

function createBrowserFixture(fontsReady: Promise<void>): {
  readonly document: FakeDocument;
  readonly window: FakeWindow;
  readonly article: FakeElement;
  readonly endnotes: FakeElement;
  readonly endnoteList: FakeElement;
  readonly rail: FakeElement;
  readonly railList: FakeElement;
  readonly notes: ReadonlyArray<FakeElement>;
} {
  const document = new FakeDocument(fontsReady);
  const window = new FakeWindow(true);
  const article = new FakeElement(document, "ARTICLE");
  const endnotes = new FakeElement(document, "SECTION");
  const endnoteList = new FakeElement(document, "OL");
  const rail = new FakeElement(document, "ASIDE");
  const railList = new FakeElement(document, "OL");
  const referenceOne = new FakeElement(document, "A");
  const referenceTwo = new FakeElement(document, "A");
  const noteOne = new FakeElement(document, "LI");
  const noteTwo = new FakeElement(document, "LI");

  article.dataset.marginNoteArticle = "";
  rail.dataset.marginNoteRail = "";
  endnotes.dataset.footnotes = "";
  noteOne.dataset.marginNoteAnchor = "fnref-one";
  noteOne.attributes.set("id", "fn-one");
  noteTwo.dataset.marginNoteAnchor = "fnref-two";
  noteTwo.attributes.set("id", "fn-two");
  referenceOne.dataset.marginNoteRef = "fn-one";
  referenceOne.attributes.set("id", "fnref-one");
  referenceTwo.dataset.marginNoteRef = "fn-two";
  referenceTwo.attributes.set("id", "fnref-two");
  referenceOne.rect = { top: 100, width: 10, height: 10 };
  referenceTwo.rect = { top: 140, width: 10, height: 10 };
  noteOne.rect = { top: 0, width: 100, height: 20 };
  noteTwo.rect = { top: 0, width: 100, height: 24 };
  rail.rect = { top: 0, width: 256, height: 500 };

  endnoteList.append(noteOne, noteTwo);
  endnotes.append(endnoteList);
  rail.append(railList);
  article.append(referenceOne, referenceTwo, endnotes, rail);
  document.article = article;

  return {
    document,
    window,
    article,
    endnotes,
    endnoteList,
    rail,
    railList,
    notes: [noteOne, noteTwo],
  };
}

type VisibilityContext = "narrow" | "print";

function getComputedStyle(
  article: FakeElement,
  context: VisibilityContext,
): Readonly<{ display: string; visibility: string }> {
  if (article.dataset.marginNoteCleanupFailed !== "true") {
    return { display: "none", visibility: "visible" };
  }

  const relevantStyles =
    context === "print"
      ? stylesheet.slice(stylesheet.indexOf("@media print"))
      : stylesheet.slice(0, stylesheet.indexOf("@media (min-width: 72rem)"));
  const declarations =
    relevantStyles.match(
      /\.blog-article\[data-margin-note-cleanup-failed="true"\]\s+\.margin-note-rail\s*\{([^}]*)\}/,
    )?.[1] ?? "";

  return {
    display: /\bdisplay:\s*block/.test(declarations) ? "block" : "none",
    visibility: /\bvisibility:\s*visible/.test(declarations)
      ? "visible"
      : "hidden",
  };
}

function installBrowserGlobals(): () => void {
  const previousHTMLElement = globalThis.HTMLElement;
  const previousHTMLOListElement = globalThis.HTMLOListElement;
  const previousResizeObserver = globalThis.ResizeObserver;
  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement;
  globalThis.HTMLOListElement = FakeElement as unknown as typeof HTMLOListElement;
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;

  return () => {
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.HTMLOListElement = previousHTMLOListElement;
    globalThis.ResizeObserver = previousResizeObserver;
  };
}

async function flushEnhancement(
  browserWindow: FakeWindow,
  resolveFonts: () => void,
): Promise<void> {
  resolveFonts();
  await Promise.resolve();
  await Promise.resolve();
  browserWindow.flushAnimationFrames();
}

test("browser shell suppresses pending enhancement during print and resumes after print", async () => {
  const restoreGlobals = installBrowserGlobals();
  try {
    let resolveFonts!: () => void;
    const fontsReady = new Promise<void>((resolve) => {
      resolveFonts = resolve;
    });
    const fixture = createBrowserFixture(fontsReady);
    const runtime = initializeMarginNotes({
      root: fixture.article,
      window: fixture.window as unknown as Window,
    });

    fixture.window.dispatchEvent("beforeprint");
    await flushEnhancement(fixture.window, resolveFonts);

    assert.equal(runtime?.controller.isEnhanced(), false);
    assert.equal(fixture.railList.children.length, 0);
    assert.equal(fixture.endnoteList.children.length, 2);

    fixture.window.dispatchEvent("afterprint");
    await flushEnhancement(fixture.window, resolveFonts);

    assert.equal(runtime?.controller.isEnhanced(), true);
    assert.deepEqual(fixture.railList.children, fixture.notes);
  } finally {
    restoreGlobals();
  }
});

test("browser shell responds to media-query changes and resize scheduling", async () => {
  const restoreGlobals = installBrowserGlobals();
  try {
    const fixture = createBrowserFixture(Promise.resolve());
    const runtime = initializeMarginNotes({
      root: fixture.article,
      window: fixture.window as unknown as Window,
    });
    await flushEnhancement(fixture.window, () => {});
    assert.equal(runtime?.controller.isEnhanced(), true);

    fixture.window.mediaQuery.matches = false;
    fixture.window.mediaQuery.dispatchEvent("change");
    await flushEnhancement(fixture.window, () => {});
    assert.equal(runtime?.controller.isEnhanced(), false);
    assert.equal(fixture.endnoteList.children.length, 2);

    fixture.window.mediaQuery.matches = true;
    fixture.window.mediaQuery.dispatchEvent("change");
    await flushEnhancement(fixture.window, () => {});
    assert.equal(runtime?.controller.isEnhanced(), true);

    FakeResizeObserver.current?.trigger(900);
    await flushEnhancement(fixture.window, () => {});
    assert.equal(runtime?.controller.isEnhanced(), true);
    assert.deepEqual(fixture.railList.children, fixture.notes);
  } finally {
    restoreGlobals();
  }
});

test("browser shell rejects incomplete reference coverage before moving notes", async () => {
  const restoreGlobals = installBrowserGlobals();
  try {
    const fixture = createBrowserFixture(Promise.resolve());
    const missingReference = new FakeElement(fixture.document, "A");
    missingReference.id = "fnref-missing";
    missingReference.dataset.marginNoteRef = "fn-missing";
    fixture.article.append(missingReference);

    const runtime = initializeMarginNotes({
      root: fixture.article,
      window: fixture.window as unknown as Window,
    });
    await flushEnhancement(fixture.window, () => {});

    assert.equal(runtime?.controller.isEnhanced(), false);
    assert.equal(fixture.railList.children.length, 0);
    assert.equal(fixture.endnoteList.children.length, 2);
  } finally {
    restoreGlobals();
  }
});

test("browser shell restores the original order when a placeholder is missing", async () => {
  const restoreGlobals = installBrowserGlobals();
  try {
    const fixture = createBrowserFixture(Promise.resolve());
    const runtime = initializeMarginNotes({
      root: fixture.article,
      window: fixture.window as unknown as Window,
    });
    await flushEnhancement(fixture.window, () => {});
    assert.equal(runtime?.controller.isEnhanced(), true);

    const placeholder = fixture.endnoteList.childNodes.find(
      (node): node is FakeComment => node instanceof FakeComment,
    );
    assert.ok(placeholder);
    placeholder.remove();
    fixture.window.dispatchEvent("beforeprint");

    assert.equal(runtime?.controller.isEnhanced(), false);
    assert.equal(fixture.article.dataset.marginNotesEnhanced, undefined);
    assert.equal(fixture.article.dataset.marginNoteCleanupFailed, undefined);
    assert.equal(fixture.railList.children.length, 0);
    assert.deepEqual(fixture.endnoteList.children, fixture.notes);
  } finally {
    restoreGlobals();
  }
});

test("browser shell falls back to the visible endnote list when the original parent is unavailable", async () => {
  const restoreGlobals = installBrowserGlobals();
  try {
    const fixture = createBrowserFixture(Promise.resolve());
    const runtime = initializeMarginNotes({
      root: fixture.article,
      window: fixture.window as unknown as Window,
    });
    await flushEnhancement(fixture.window, () => {});
    assert.equal(runtime?.controller.isEnhanced(), true);

    fixture.endnotes.removeChild(fixture.endnoteList);
    const fallbackList = new FakeElement(fixture.document, "OL");
    fixture.endnotes.append(fallbackList);
    fixture.window.dispatchEvent("beforeprint");

    assert.equal(runtime?.controller.isEnhanced(), false);
    assert.equal(fixture.article.dataset.marginNoteCleanupFailed, undefined);
    assert.equal(fixture.railList.children.length, 0);
    assert.deepEqual(fallbackList.children, fixture.notes);
  } finally {
    restoreGlobals();
  }
});

test("cleanup failure keeps the rail computed-visible in narrow and print contexts", async () => {
  const restoreGlobals = installBrowserGlobals();
  try {
    const fixture = createBrowserFixture(Promise.resolve());
    const runtime = initializeMarginNotes({
      root: fixture.article,
      window: fixture.window as unknown as Window,
    });
    await flushEnhancement(fixture.window, () => {});
    assert.equal(runtime?.controller.isEnhanced(), true);

    fixture.endnotes.removeChild(fixture.endnoteList);
    fixture.window.dispatchEvent("beforeprint");

    assert.equal(runtime?.controller.isEnhanced(), false);
    assert.equal(fixture.article.dataset.marginNoteCleanupFailed, "true");
    assert.equal(getComputedStyle(fixture.article, "narrow").display, "block");
    assert.equal(getComputedStyle(fixture.article, "narrow").visibility, "visible");
    assert.equal(getComputedStyle(fixture.article, "print").display, "block");
    assert.equal(getComputedStyle(fixture.article, "print").visibility, "visible");
    assert.equal(fixture.rail.children.length, 1);
  } finally {
    restoreGlobals();
  }
});
