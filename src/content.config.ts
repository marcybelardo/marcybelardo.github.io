// pattern: Imperative Shell

import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

import {
  generateBlogId,
  generateProjectId,
} from "./content/content-identifiers.ts";

const nonEmptyString = z.string().trim().min(1);
const slug = nonEmptyString.regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "slug must contain lowercase letters, numbers, and single hyphens",
);
const url = nonEmptyString.url();

const project = defineCollection({
  loader: glob({
    base: "./src/content/projects",
    pattern: "**/*.{md,mdx}",
    generateId: ({ data }) =>
      generateProjectId({ slug: data.slug, title: data.title }),
  }),
  schema: ({ image }) =>
    z
      .object({
        slug,
        title: nonEmptyString,
        date: z.coerce.date(),
        description: nonEmptyString,
        disciplines: z.array(nonEmptyString).min(1),
        tags: z.array(nonEmptyString).default([]),
        status: nonEmptyString.optional(),
        featured: z.boolean().default(false),
        draft: z.boolean().default(false),
        featuredOrder: z.number().int().positive().optional(),
        coverImage: image().optional(),
        coverImageAlt: nonEmptyString.optional(),
        gallery: z
          .array(
            z.object({
              image: image(),
              imageAlt: nonEmptyString,
              caption: z.string().optional(),
            }),
          )
          .optional(),
        repositoryUrl: url.optional(),
        liveUrl: url.optional(),
        externalUrl: url.optional(),
        collaborators: z.array(nonEmptyString).optional(),
        role: nonEmptyString.optional(),
        relatedProjects: z.array(nonEmptyString).default([]),
        relatedWriting: z.array(nonEmptyString).default([]),
      })
      .superRefine((data, context) => {
        if (data.coverImage && !data.coverImageAlt) {
          context.addIssue({
            code: "custom",
            path: ["coverImageAlt"],
            message: "coverImageAlt is required when coverImage is provided",
          });
        }
      }),
});

const blog = defineCollection({
  loader: glob({
    base: "./src/content/blog",
    pattern: "**/*.{md,mdx}",
    generateId: ({ data }) =>
      generateBlogId({ title: data.title, slug: data.slug }),
  }),
  schema: ({ image }) =>
    z
      .object({
        slug: slug.optional(),
        title: nonEmptyString,
        date: z.coerce.date(),
        description: nonEmptyString.optional(),
        image: image().optional(),
        imageAlt: nonEmptyString.optional(),
        tags: z.array(nonEmptyString).default([]),
        draft: z.boolean().default(false),
      })
      .superRefine((data, context) => {
        if (data.image && !data.imageAlt) {
          context.addIssue({
            code: "custom",
            path: ["imageAlt"],
            message: "imageAlt is required when image is provided",
          });
        }

        if (!data.draft && !data.description) {
          context.addIssue({
            code: "custom",
            path: ["description"],
            message: "published blog posts require a non-empty description",
          });
        }
      }),
});

export const collections = { project, blog };
