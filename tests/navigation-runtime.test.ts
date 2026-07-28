import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const homepagePath = resolve(repositoryRoot, "dist", "index.html");

type Listener = {
  readonly callback: (event: { readonly target?: FakeNode; readonly key?: string }) => void;
  readonly once: boolean;
};

class FakeNode {
  readonly listeners = new Map<string, Array<Listener>>();

  addEventListener(
    type: string,
    callback: Listener["callback"],
    options?: { readonly once?: boolean },
  ): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ callback, once: options?.once ?? false });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, callback: Listener["callback"]): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((listener) => listener.callback !== callback),
    );
  }

  dispatchEvent(
    type: string,
    event: { readonly target?: FakeNode; readonly key?: string } = {},
  ): void {
    const listeners = [...(this.listeners.get(type) ?? [])];

    listeners.forEach(({ callback, once }) => {
      callback(event);
      if (once) {
        this.removeEventListener(type, callback);
      }
    });
  }
}

class FakeElement extends FakeNode {
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly children: Array<FakeElement> = [];
  readonly tagName: string;
  focused = false;
  ownerDocument: FakeDocument | null = null;

  constructor(tagName: string) {
    super();
    this.tagName = tagName;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  toggleAttribute(name: string, force?: boolean): void {
    const shouldHaveAttribute = force ?? !this.attributes.has(name);

    if (shouldHaveAttribute) {
      this.attributes.set(name, "");
    } else {
      this.attributes.delete(name);
    }
  }

  focus(): void {
    this.focused = true;
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "[data-menu-button]") {
      return this.children.find((child) => child instanceof FakeButton) ?? null;
    }

    if (selector === "[data-open]") {
      return this.children.find((child) => child.attributes.has("data-open")) ?? null;
    }

    if (selector === "a") {
      return this.children.find((child) => child.tagName === "A") ?? null;
    }

    return null;
  }

  querySelectorAll(selector: string): Array<FakeElement> {
    if (selector === "a") {
      return this.children.filter((child) => child.tagName === "A");
    }

    return [];
  }

  contains(node: FakeNode): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }
}

class FakeButton extends FakeElement {
  constructor() {
    super("BUTTON");
  }
}

class FakeDocument extends FakeNode {
  activeElement: FakeElement | null = null;
  navigation: FakeElement | null = null;

  querySelector(selector: string): FakeElement | null {
    return selector === "[data-site-navigation]" ? this.navigation : null;
  }
}

function createNavigationDom(): {
  readonly button: FakeButton;
  readonly document: FakeDocument;
  readonly firstLink: FakeElement;
  readonly outside: FakeElement;
  readonly panel: FakeElement;
} {
  const document = new FakeDocument();
  const navigation = new FakeElement("NAV");
  const button = new FakeButton();
  const panel = new FakeElement("DIV");
  const firstLink = new FakeElement("A");
  const secondLink = new FakeElement("A");
  const outside = new FakeElement("MAIN");

  panel.setAttribute("data-open", "true");

  [navigation, button, panel, firstLink, secondLink, outside].forEach((element) => {
    element.ownerDocument = document;
  });
  panel.children.push(firstLink, secondLink);
  navigation.children.push(button, panel);
  document.navigation = navigation;

  return { button, document, firstLink, outside, panel };
}

function getNavigationScript(): string {
  const html = readFileSync(homepagePath, "utf8");
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  const navigationScript = scripts
    .map((match) => match[1] ?? "")
    .find((script) => script.includes("[data-site-navigation]"));

  assert.ok(navigationScript, "built output must include the navigation runtime script");
  return navigationScript;
}

function bootstrapNavigation(): ReturnType<typeof createNavigationDom> {
  const dom = createNavigationDom();
  const mediaQuery = {
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  vm.runInNewContext(getNavigationScript(), {
    document: dom.document,
    HTMLElement: FakeElement,
    HTMLButtonElement: FakeButton,
    Node: FakeNode,
    window: {
      matchMedia: () => mediaQuery,
      requestAnimationFrame: (callback: () => void) => callback(),
    },
  });

  return dom;
}

test("mobile navigation opens with synchronized state and focuses its first link", () => {
  const { button, firstLink, panel } = bootstrapNavigation();

  button.dispatchEvent("click", { target: button });

  assert.equal(panel.dataset.open, "true");
  assert.equal(panel.getAttribute("aria-hidden"), "false");
  assert.equal(panel.attributes.has("inert"), false);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(button.getAttribute("aria-label"), "Close primary navigation");
  assert.equal(firstLink.focused, true);
});

test("mobile navigation dismisses on outside click and Escape with focus restoration", () => {
  const { button, document, outside, panel } = bootstrapNavigation();

  button.dispatchEvent("click", { target: button });
  document.dispatchEvent("click", { target: outside });

  assert.equal(panel.dataset.open, "false");
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, button);

  button.dispatchEvent("click", { target: button });
  document.dispatchEvent("keydown", { key: "Escape", target: button });

  assert.equal(panel.dataset.open, "false");
  assert.equal(document.activeElement, button);
});

test("mobile navigation removes runtime listeners during Astro swaps", () => {
  const { button, document, firstLink, panel } = bootstrapNavigation();

  document.dispatchEvent("astro:before-swap");
  button.dispatchEvent("click", { target: button });
  assert.equal(panel.dataset.open, "false");
  firstLink.dispatchEvent("click", { target: firstLink });

  assert.equal(panel.dataset.open, "false");
  assert.equal(button.getAttribute("aria-expanded"), "false");
});
