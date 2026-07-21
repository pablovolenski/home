import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.date(),
    lang: z.enum(['de', 'en', 'es']),
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = { blog };
