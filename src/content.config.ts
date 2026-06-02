import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const project = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
  }),
});

const painting = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
  }),
});

const photograph = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
  }),
});

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = { project, painting, photograph, blog };
