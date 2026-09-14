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
const aboutPath = resolve(repositoryRoot, "dist", "about", "index.html");
const bioRedirectPath = resolve(repositoryRoot, "dist", "bio", "index.html");
const contactRedirectPath = resolve(repositoryRoot, "dist", "contact", "index.html");
const configuredOrigin = "https://www.marcelinebelardo.com";


function readHomepage(): string {
  assert.ok(existsSync(homepagePath), "homepage output must exist before generated assertions");
  return readFileSync(homepagePath, "utf8");
}

function readAbout(): string {
  assert.ok(existsSync(aboutPath), "About output must exist before generated assertions");
  return readFileSync(aboutPath, "utf8");
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
  assert.ok(getVisibleH1Text(html));
  assert.match(landing, /<figure class="home-photograph">/);
  const directions = landing.match(/<nav class="home-directions"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  const directionLinks = [
    ...directions.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
  ];
  assert.deepEqual(
    directionLinks.map((match) => match[1]),
    ["/projects/", "/blog/", "/about/"],
  );
  directionLinks.forEach((match) => {
    assert.ok(getInkHoverVisibleText(match[2] ?? "", `homepage link ${match[1]}`));
  });
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
  assert.ok(Array.isArray(person.sameAs), "profile links must be an array");
  person.sameAs.forEach((url) => assert.equal(new URL(String(url)).protocol, "https:"));
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
    sameAs: person.sameAs,
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

test("About has readable content, an accessible CV link, and classified portrait images", () => {
  const html = readAbout();
  assert.ok(getVisibleH1Text(html));
  for (const className of ["about-introduction", "about-practice"]) {
    const section = html.match(new RegExp(`<(?:div|section) class="${className}"[^>]*>([\\s\\S]*?)</(?:div|section)>`))?.[1] ?? "";
    assert.match(section, /<p>\s*[^<\s][\s\S]*?<\/p>/, `${className} must contain readable copy`);
  }
  const portraits = [...html.matchAll(/<img\b[^>]*class="about-portrait-frame__image"[^>]*>/g)].map((match) => match[0]);
  assert.equal(portraits.length, 3);
  assert.match(portraits[0]!, /alt="[^"\s][^"]*"/);
  portraits.slice(1).forEach((image) => assert.match(image, /\salt(?:="")?(?=\s|>)/));
  const cvLinks = [...html.matchAll(/<a\b(?=[^>]*href="\/marceline-belardo-cv\.pdf")(?=[^>]*target="_blank")(?=[^>]*rel="noopener noreferrer")[^>]*>([\s\S]*?)<\/a>/g)];
  assert.equal(cvLinks.length, 1);
  assert.ok(getInkHoverVisibleText(cvLinks[0]?.[1] ?? "", "CV link"));
  assert.match(html, /<meta name="description" content="[^"\s][^"]*"/);
  assert.doesNotMatch(html, /<section\b[^>]*>\s*<\/section>/i);
});

test("About contact line uses a descriptive email link with GlowText and retains the shared profile footer", () => {
  const html = readAbout();
  const contactLine = html.match(/<p class="about-contact">([\s\S]*?)<\/p>/)?.[1] ?? "";
  const emailLink = contactLine.match(
    /<a\b(?=[^>]*href="mailto:([^"]+)")(?=[^>]*aria-label="([^"\s][^"]*)")(?=[^>]*data-ink-hover="text")[^>]*>([\s\S]*?)<\/a>/,
  );
  assert.ok(emailLink, "contact email needs a destination and descriptive accessible label");
  assert.equal(getInkHoverVisibleText(emailLink[3] ?? "", "About contact email"), emailLink[1]);
  const footer = html.match(/<footer class="social-links"[^>]*>([\s\S]*?)<\/footer>/)?.[1] ?? "";
  assert.ok(footer, "About must retain the shared social footer");
  for (const link of footer.matchAll(/<a\b[^>]*>/g)) {
    assert.match(link[0], /href="https:\/\/[^"\s]+"/);
    assert.match(link[0], /aria-label="[^"\s][^"]*"/);
  }
  const aboutStyles = readFileSync(
    resolve(repositoryRoot, "src", "styles", "about-design.css"),
    "utf8",
  );
  assert.match(aboutStyles, /\.about-contact\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(aboutStyles, /\.about-skills\s*\{[^}]*color:\s*var\(--color-muted-ink\)/);
  assert.doesNotMatch(aboutStyles, /body:has\(\.about-page\)\s+\.social-links\s*\{\s*display:\s*none;/);
});

test("Bio and Contact remain lightweight noindex redirects to canonical About", () => {
  [bioRedirectPath, contactRedirectPath].forEach((redirectPath) => {
    assert.ok(existsSync(redirectPath), `${redirectPath} must exist`);
    const html = readFileSync(redirectPath, "utf8");

    assert.match(html, /<meta name="robots" content="noindex, follow"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/www\.marcelinebelardo\.com\/about\/"/);
    assert.match(html, /<meta http-equiv="refresh" content="0;url=\/about\/"/);
    assert.match(html, /<a href="\/about\/">[^<\s][^<]*<\/a>/);
    assert.doesNotMatch(html, /<nav\b[^>]*aria-label="Primary"/);
  });
});
