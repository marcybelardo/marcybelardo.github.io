import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { getFeaturedProjects, getRecentPosts } from "../src/content/content-queries.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const homepagePath = resolve(repositoryRoot, "dist", "index.html");
const bioPath = resolve(repositoryRoot, "dist", "bio", "index.html");
const contactPath = resolve(repositoryRoot, "dist", "contact", "index.html");
const homepageSourcePath = resolve(repositoryRoot, "src", "pages", "index.astro");
const configuredOrigin = "https://www.marcelinebelardo.com";
const profileUrls = [
  "https://github.com/marcybelardo",
  "https://bsky.app/profile/marcelinebelardo.com",
  "https://instagram.com/marcelinebelardo",
];

type JsonLdEntry = Readonly<Record<string, unknown>>;

function readHomepage(): string {
  assert.ok(existsSync(homepagePath), "homepage output must exist before generated assertions");
  return readFileSync(homepagePath, "utf8");
}

function readBio(): string {
  assert.ok(existsSync(bioPath), "Bio output must exist before generated assertions");
  return readFileSync(bioPath, "utf8");
}

function readContact(): string {
  assert.ok(existsSync(contactPath), "Contact output must exist before generated assertions");
  return readFileSync(contactPath, "utf8");
}

function getJsonLd(html: string): Readonly<Record<string, unknown>> {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );

  assert.ok(match?.[1], "homepage must contain JSON-LD");
  return JSON.parse(match[1]) as Readonly<Record<string, unknown>>;
}

test("homepage renders the practice, mixed selected work, writing, and contact prompt", () => {
  const html = readHomepage();

  assert.match(html, /I work across software, visual culture, research, and writing\./);
  assert.match(html, /id="selected-projects-heading"[^>]*>Selected Projects<\/h2>/);
  assert.match(html, /id="recent-writing-heading"[^>]*>Recent Writing<\/h2>/);
  assert.match(html, /marcy@marcelinebelardo\.com/);
  assert.equal((html.match(/class="project-index-entry"/g) ?? []).length, 4);
  assert.deepEqual(
    [...html.matchAll(/href="\/projects\/([^/]+)\/"/g)].map((match) => match[1]),
    ["lilyhttpd", "osborne", "cmprsr-rs", "portfolio-site"],
  );
  assert.match(html, /Portfolio Site[\s\S]*?>software<\/[a-z]+>[\s\S]*?>visual<\//);
  assert.match(html, /The Devil You Know, the Devil You (?:Don't|Don&#39;t)/);
  assert.doesNotMatch(html, />\s*(?:Art|Code)\s*</);
});

test("homepage JSON-LD matches visible identity and verified profiles", () => {
  const html = readHomepage();
  const jsonLd = getJsonLd(html);
  const graph = jsonLd["@graph"];

  assert.equal(jsonLd["@context"], "https://schema.org");
  assert.ok(Array.isArray(graph), "homepage JSON-LD must expose a graph");

  const graphEntries = graph.filter(
    (entry): entry is JsonLdEntry =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
  const website = graphEntries.find((entry) => entry["@type"] === "WebSite");
  const person = graphEntries.find((entry) => entry["@type"] === "Person");
  const canonical = `${configuredOrigin}/`;

  assert.ok(website, "homepage JSON-LD must contain a WebSite");
  assert.ok(person, "homepage JSON-LD must contain a Person");
  assert.equal(website.name, "Marceline Belardo");
  assert.equal(website.url, canonical);
  assert.equal(person.name, "Marceline Belardo");
  assert.equal(person.url, canonical);
  assert.deepEqual(person.sameAs, profileUrls);
});

test("empty featured and recent fixtures have no optional section to render", () => {
  assert.deepEqual(getFeaturedProjects([], true, 4), []);
  assert.deepEqual(getRecentPosts([], true, 3), []);

  const source = readFileSync(homepageSourcePath, "utf8");
  assert.match(
    source,
    /featuredProjects\.length > 0 && \(\s*<section[\s\S]*?selected-projects-heading/,
  );
  assert.match(
    source,
    /recentPosts\.length > 0 && \(\s*<section[\s\S]*?recent-writing-heading/,
  );
});

test("Bio uses verified copy and the square portrait without résumé placeholders", () => {
  const html = readBio();

  assert.match(html, /Software Developer/);
  assert.match(html, /Building maintainable, friendly, and performant programs\./);
  assert.match(html, /C · Rust · Java · TypeScript · React · Python · PostgreSQL/);
  assert.match(html, /alt="Marceline Belardo holding a camera, taking a selfie"/);
  assert.match(html, /<div class="square-image[\s\S]*?<img\b[^>]*width="\d+"[^>]*height="\d+"/);
  assert.match(
    html,
    /<meta name="description" content="About Marceline Belardo, a software developer working across software, visual culture, research, and writing\."/,
  );
  assert.doesNotMatch(html, /<h[1-6][^>]*>\s*(?:Résumé|Resume)\s*<\/h[1-6]>/i);
});

test("Contact exposes verified destinations with descriptive, non-empty links", () => {
  const html = readContact();
  const destinations = [
    ["mailto:marcy@marcelinebelardo.com", "Email Marceline at marcy@marcelinebelardo.com"],
    ["https://github.com/marcybelardo", "GitHub profile"],
    ["https://bsky.app/profile/marcelinebelardo.com", "Bluesky profile"],
    ["https://instagram.com/marcelinebelardo", "Instagram profile"],
  ] as const;

  assert.match(html, /Feel free to reach out by email or through one of these profiles\./);
  destinations.forEach(([href, label]) => {
    assert.match(html, new RegExp(`<a href="${href.replaceAll("/", "\\/")}">${label}<\/a>`));
  });
  assert.doesNotMatch(html, /<a\b[^>]*>\s*<\/a>/);
  assert.match(
    html,
    /<meta name="description" content="Contact Marceline Belardo by email or through verified GitHub, Bluesky, and Instagram profiles\."/,
  );
  assert.doesNotMatch(html, /<form\b|availability|endpoint|API/i);
});
