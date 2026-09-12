import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { getFeaturedProjects, getRecentPosts } from "../src/content/content-queries.ts";
import {
  getGraphEntries,
  getInkHoverVisibleText,
  getStructuredData,
} from "./generated-artifact-helpers.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const homepagePath = resolve(repositoryRoot, "dist", "index.html");
const bioPath = resolve(repositoryRoot, "dist", "bio", "index.html");
const contactPath = resolve(repositoryRoot, "dist", "contact", "index.html");
const bioSourcePath = resolve(repositoryRoot, "src", "pages", "bio", "index.astro");
const configuredOrigin = "https://www.marcelinebelardo.com";
const profileUrls = [
  "https://github.com/marcybelardo",
  "https://bsky.app/profile/marcelinebelardo.com",
  "https://instagram.com/marcelinebelardo",
];

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

function getVisibleH1Text(html: string): string {
  const matches = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];

  assert.equal(matches.length, 1, "homepage must contain one visible h1");
  const visibleText = getInkHoverVisibleText(
    matches[0]?.[1] ?? "",
    "homepage h1",
  );

  assert.ok(visibleText, "homepage visible h1 must contain text");
  return visibleText;
}

test("homepage is a photo landing with direct links instead of content previews", () => {
  const html = readHomepage();
  const landing = html.match(/<article class="portfolio-home"[^>]*>([\s\S]*?)<\/article>/)?.[1] ?? "";
  assert.equal(getVisibleH1Text(html), "Marceline Belardo");
  assert.match(landing, /<figure class="home-photograph">/);
  const directions = landing.match(/<nav class="home-directions"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  const directionLinks = [
    ...directions.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
  ];
  assert.deepEqual(
    directionLinks.map((match) => match[1]),
    ["/projects/", "/blog/", "/bio/", "/contact/"],
  );
  assert.deepEqual(
    directionLinks.map((match) =>
      getInkHoverVisibleText(match[2] ?? "", `homepage link ${match[1]}`),
    ),
    ["Projects", "Blog", "Bio", "Contact"],
  );
  assert.doesNotMatch(landing, /selected-projects-heading|recent-writing-heading|home-practice|home-contact|project-index-entry/);
  assert.match(html, /data-compact="always"/);
  const button = html.match(/<button[^>]*data-menu-button[^>]*>([\s\S]*?)<\/button>/)?.[1];
  assert.equal(button?.trim(), "", "the menu control is a shape without visible text");
  assert.match(html, /aria-label="Close primary navigation"/);
});

test("homepage JSON-LD matches visible identity and verified profiles", () => {
  const html = readHomepage();
  const jsonLd = getStructuredData(html, "homepage");
  const visibleName = getVisibleH1Text(html);

  assert.equal(jsonLd["@context"], "https://schema.org");
  const graphEntries = getGraphEntries(jsonLd, "homepage");
  const website = graphEntries.find((entry) => entry["@type"] === "WebSite");
  const person = graphEntries.find((entry) => entry["@type"] === "Person");
  const canonical = `${configuredOrigin}/`;

  assert.ok(website, "homepage JSON-LD must contain a WebSite");
  assert.ok(person, "homepage JSON-LD must contain a Person");
  assert.equal(website.name, visibleName);
  assert.equal(website.url, canonical);
  assert.equal(person.name, visibleName);
  assert.equal(person.url, canonical);
  assert.deepEqual(person.sameAs, profileUrls);
  assert.deepEqual(website, {
    "@id": canonical,
    "@type": "WebSite",
    name: visibleName,
    url: canonical,
  });
  assert.deepEqual(person, {
    "@id": `${canonical}#person`,
    "@type": "Person",
    name: visibleName,
    sameAs: profileUrls,
    url: canonical,
  });
});

test("shared featured and recent queries retain stable ordering for content consumers", () => {
  const fixtureEntries = [
    {
      id: "zeta",
      data: { date: new Date("2026-06-12"), featured: true, featuredOrder: 2 },
    },
    {
      id: "alpha",
      data: { date: new Date("2026-06-12"), featured: true, featuredOrder: 1 },
    },
    {
      id: "draft",
      data: {
        date: new Date("2026-06-14"),
        draft: true,
        featured: true,
        featuredOrder: 0,
      },
    },
    {
      id: "bravo",
      data: { date: new Date("2026-06-11"), featured: true, featuredOrder: 3 },
    },
    {
      id: "charlie",
      data: { date: new Date("2026-06-10"), featured: true, featuredOrder: 4 },
    },
    {
      id: "overflow",
      data: { date: new Date("2026-06-09"), featured: true, featuredOrder: 5 },
    },
  ] as const;
  const featuredRuns = [fixtureEntries, [...fixtureEntries].reverse()].map((entries) =>
    getFeaturedProjects(entries, true, 4).map((entry) => entry.id),
  );
  const recentRuns = [fixtureEntries, [...fixtureEntries].reverse()].map((entries) =>
    getRecentPosts(entries, true, 3).map((entry) => entry.id),
  );

  assert.deepEqual(featuredRuns[0], featuredRuns[1]);
  assert.deepEqual(featuredRuns[0], ["alpha", "zeta", "bravo", "charlie"]);
  assert.deepEqual(recentRuns[0], recentRuns[1]);
  assert.deepEqual(recentRuns[0], ["alpha", "zeta", "bravo"]);
});

test("shared queries accept empty collections", () => {
  assert.deepEqual(getFeaturedProjects([], true, 4), []);
  assert.deepEqual(getRecentPosts([], true, 3), []);
});

test("Bio uses verified copy and a full-image mirror portrait triptych", () => {
  const html = readBio();

  assert.match(html, /Software developer/);
  assert.match(html, /I’m Marceline, an independent software developer in Manila since July 2023\./);
  assert.match(html, /Next\.js and TypeScript photography frontend/);
  assert.match(html, /Python NLP sentiment charts for a journalist/);
  assert.match(html, /five merged pull requests for Starship/);
  assert.match(html, /Diploma in Computer Science at UPOU, expected in 2028/);
  assert.match(html, /Writing, photography, and painting remain part of what I do\./);
  assert.match(html, /C · Rust · Java · TypeScript · React · Python · PostgreSQL/);
  assert.match(html, /alt="Marceline Belardo taking a mirror photograph with a camera"/);
  assert.equal([...html.matchAll(/<figure class="bio-portrait-frame">/g)].length, 3);
  assert.equal([...html.matchAll(/<img\b[^>]*\salt(?=\s[^>]*class="bio-portrait-frame__image")/g)].length, 2);
  const cvLinks = [
    ...html.matchAll(
      /<a\b(?=[^>]*href="\/marceline-belardo-cv\.pdf")(?=[^>]*target="_blank")(?=[^>]*rel="noopener noreferrer")[^>]*>([\s\S]*?)<\/a>/g,
    ),
  ];
  assert.equal(cvLinks.length, 1, "Bio must contain one secure CV link");
  assert.equal(
    getInkHoverVisibleText(cvLinks[0]?.[1] ?? "", "CV link"),
    "View CV (PDF)",
  );
  assert.doesNotMatch(html, /<a href="\/marceline-belardo-cv\.pdf"[^>]*download(?:\s|=|>)/);
  assert.match(html, /<figure class="bio-portrait-frame">[\s\S]*?<img\b[^>]*width="\d+"[^>]*height="\d+"/);
  assert.match(
    html,
    /<meta name="description" content="About Marceline Belardo, a software developer working across software, visual culture, research, and writing\."/,
  );
  assert.doesNotMatch(html, /<h[1-6][^>]*>\s*(?:Résumé|Resume)\s*<\/h[1-6]>/i);
  assert.doesNotMatch(html, /<section\b[^>]*>\s*<h[1-6][^>]*>\s*(?:Résumé|Resume)/i);
  assert.doesNotMatch(html, /<section\b[^>]*>\s*<\/section>/i);
  assert.doesNotMatch(readFileSync(bioSourcePath, "utf8"), /(?:Résumé|Resume)-heading/i);
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
