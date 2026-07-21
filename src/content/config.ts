import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.date(),
    lang: z.enum(['de', 'en', 'es']),
    // Shared key linking the same post across languages (used for hreflang).
    // Keep the filename identical across language folders so URLs line up.
    translationKey: z.string(),
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = { blog };
