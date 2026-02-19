import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(false),
    category: z.string().default("General"),
    tags: z.array(z.string()).optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().url().optional(),
  }),
});

export const collections = { blog };
