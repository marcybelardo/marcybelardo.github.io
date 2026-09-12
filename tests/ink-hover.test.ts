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
const globalStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/global.css"),
  "utf8",
);
const inkHoverStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/ink-hover.css"),
  "utf8",
);
const compactNavigationStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/compact-navigation.css"),
  "utf8",
);
const interiorPageStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/interior-page.css"),
  "utf8",
);
const homeDesignStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/home-design.css"),
  "utf8",
);
const aboutDesignStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/about-design.css"),
  "utf8",
);
const projectDesignStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/projects-design.css"),
  "utf8",
);
const blogDesignStyles = readFileSync(
  resolve(repositoryRoot, "src/styles/blog-design.css"),
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

test("ink hover styles keep the text glow and black menu face distinct", () => {
  assert.match(inkHoverStyles, /circle var\(--ink-hover-radius\) at var\(--ink-hover-x\) var\(--ink-hover-y\)/);
  assert.match(inkHoverStyles, /--ink-hover-radius:\s*5rem/);
  assert.match(inkHoverStyles, /filter:\s*blur\(8px\)/);
  assert.match(inkHoverStyles, /mask-image:\s*var\(--ink-hover-mask\)/);
  assert.match(inkHoverStyles, /-webkit-mask-image:\s*var\(--ink-hover-mask\)/);
  assert.match(inkHoverStyles, /background-clip:\s*text/);
  assert.match(
    inkHoverStyles,
    /\.about-title,[\s\S]*?\.about-contact\s*\{\s*overflow:\s*visible;/,
    "About GlowText targets and their containers preserve visible glow overflow",
  );
  assert.match(inkHoverStyles, /background-size:\s*7rem 7rem, auto/);
  const menuAura = inkHoverStyles.match(
    /\.primary-navigation \.primary-navigation__menu-button\[data-ink-hover="surface"\]\[data-ink-hover-active="true"\]::before\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  assert.match(menuAura, /inset:\s*-1rem/);
  assert.match(menuAura, /filter:\s*blur\(10px\)/);
  assert.match(menuAura, /background-image:\s*var\(--ink-hover-texture\),\s*var\(--ink-hover-gradient\)/);
  assert.doesNotMatch(menuAura, /mask(?:-image)?\s*:/);
  assert.match(
    inkHoverStyles,
    /\.primary-navigation \.primary-navigation__menu-button\[data-ink-hover="surface"\]\[data-ink-hover-active="true"\]::after\s*\{[^}]*background:\s*var\(--color-ink\)/,
    "the black menu face remains above the colored field",
  );
  assert.match(
    inkHoverStyles,
    /\[data-ink-hover="text"\]\s*\{[^}]*color:\s*var\(--color-ink\);[^}]*opacity:\s*1/,
    "the target text remains fully opaque black",
  );
  assert.match(
    inkHoverStyles,
    /\.ink-hover__glow-copy\s*\{[^}]*z-index:\s*0;[^}]*color:\s*transparent/,
    "the decorative copy paints in a visible layer beneath the foreground",
  );
  assert.match(inkHoverStyles, /\.ink-hover__foreground\s*\{[^}]*z-index:\s*1;[^}]*color:\s*var\(--color-ink\);/);
  assert.doesNotMatch(inkHoverStyles, /content:\s*attr\(data-ink-text\)/);
  assert.match(inkHoverStyles, /background:\s*var\(--color-ink\)/);
  assert.match(compactNavigationStyles, /background-color:\s*var\(--color-ink\)/);
  assert.match(
    compactNavigationStyles,
    /\.site-header__inner:has\(\.primary-navigation\[data-home="true"\]\)\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*padding-right:\s*clamp\(1rem,\s*2vw,\s*2\.5rem\);[^}]*padding-left:\s*clamp\(1rem,\s*2vw,\s*2\.5rem\)/,
    "the homepage navigation uses the landing page's viewport gutter",
  );
  assert.match(
    compactNavigationStyles,
    /\.primary-navigation\[data-home="true"\]\[data-js-ready\]\s*\{[^}]*justify-content:\s*flex-end/,
    "the enhanced homepage menu sits at the far right",
  );
  assert.match(
    compactNavigationStyles,
    /\.primary-navigation\[data-home="true"\]\[data-js-ready\] \.primary-navigation__panel\s*\{[^}]*top:\s*calc\(100% \+ 3rem\)/,
    "the homepage panel clears the two-line mobile title",
  );
  assert.doesNotMatch(
    compactNavigationStyles,
    /primary-navigation__menu-button[^}]*\{[^}]*background:\s*var\(--color-ink\)/,
  );
  assert.match(compactNavigationStyles, /primary-navigation\[data-js-ready\] \.primary-navigation__panel\[data-open="false"\]/);
  assert.match(compactNavigationStyles, /primary-navigation:not\(\[data-js-ready\]\) \.primary-navigation__panel\s*\{[^}]*position:\s*static/);
  assert.match(interiorPageStyles, /--interior-page-gutter:/);
  assert.match(interiorPageStyles, /\.interior-page__header\s*\{/);
  assert.match(interiorPageStyles, /\.interior-page__section\s*\{/);
});

test("display headings share one compressed stack while reading and utility faces stay separate", () => {
  assert.match(
    globalStyles,
    /--font-display:\s*"Arial Narrow",\s*"Liberation Sans Narrow",\s*"Helvetica Neue",\s*Arial,\s*sans-serif/,
  );

  const displayStyleSources = [
    homeDesignStyles,
    aboutDesignStyles,
    projectDesignStyles,
    blogDesignStyles,
  ].join("\n");
  assert.doesNotMatch(displayStyleSources, /font-family:\s*"Arial Narrow"/);
  const displayTargets: Array<[RegExp, string]> = [
    [/\.portfolio-home\s*\{[^}]*font-family:\s*var\(--font-display\)/, "Home"],
    [/\.about-title h1\s*\{[^}]*font-family:\s*var\(--font-display\)/, "About title"],
    [/\.projects-index__header h1\s*\{[^}]*font-family:\s*var\(--font-display\)/, "Projects title"],
    [/\.project-index-entry__main h2\s*\{[^}]*font-family:\s*var\(--font-display\)/, "project entry titles"],
    [/\.project-layout__header h1\s*\{[^}]*font-family:\s*var\(--font-display\)/, "project detail title"],
    [/\.project-layout__gallery > h2,[\s\S]*?font-family:\s*var\(--font-display\)/, "project gallery and related headings"],
    [/\.blog-index-page \.blog-index__header h1\s*\{[^}]*font-family:\s*var\(--font-display\)/, "Blog and tag titles"],
    [/\.blog-index-entry__summary h2\s*\{[^}]*font-family:\s*var\(--font-display\)/, "blog entry titles"],
    [/\.blog-article \.blog-article__header h1\s*\{[^}]*font-family:\s*var\(--font-display\)/, "blog article title"],
  ];
  displayTargets.forEach(([pattern, label]) => {
    assert.match(displayStyleSources, pattern, `${label} use the display face`);
  });

  assert.match(blogDesignStyles, /\.blog-article__body\s*\{[^}]*font-family:\s*var\(--font-reading\)/);
  assert.match(projectDesignStyles, /\.project-index-entry__metadata dd\s*\{[^}]*font-family:\s*var\(--font-utility\)/);
  assert.match(blogDesignStyles, /\.blog-index-entry__tags\s*\{[^}]*font-family:\s*var\(--font-utility\)/);
  assert.match(globalStyles, /\.primary-navigation__link\s*\{[^}]*font-family:\s*var\(--font-utility\)/);
});

test("GlowText owns paired decorative and semantic copies and BaseLayout initializes it once", () => {
  const glowTextComponent = readFileSync(
    resolve(repositoryRoot, "src/components/GlowText.astro"),
    "utf8",
  );
  const homeMarkup = readFileSync(resolve(repositoryRoot, "src/pages/index.astro"), "utf8");
  const aboutMarkup = readFileSync(resolve(repositoryRoot, "src/pages/about/index.astro"), "utf8");
  const baseLayout = readFileSync(resolve(repositoryRoot, "src/layouts/BaseLayout.astro"), "utf8");
  const allMarkup = homeMarkup + aboutMarkup;

  assert.match(glowTextComponent, /class="ink-hover__glow-copy" aria-hidden="true"><slot\s*\/>/);
  assert.match(glowTextComponent, /class="ink-hover__foreground"><slot\s*\/>/);
  assert.equal([...glowTextComponent.matchAll(/<slot\s*\/>/g)].length, 2);
  assert.equal([...homeMarkup.matchAll(/<GlowText>/g)].length, 4);
  assert.equal([...aboutMarkup.matchAll(/<GlowText>/g)].length, 3);
  assert.doesNotMatch(allMarkup, /ink-hover__glow-copy|ink-hover__foreground/);
  assert.doesNotMatch(allMarkup, /initializeInkHover|styles\/ink-hover\.css/);
  assert.match(baseLayout, /\.\.\/styles\/ink-hover\.css/);
  assert.match(baseLayout, /import \{ initializeInkHover \} from "\.\.\/scripts\/ink-hover\.ts"/);
  assert.equal([...baseLayout.matchAll(/initializeInkHover\(\)/g)].length, 1);
  assert.match(aboutMarkup, /href=\{`mailto:\$\{aboutContent\.email\.address\}`\}\s+aria-label=\{aboutContent\.email\.label\}\s+data-ink-hover="text"/);
});
