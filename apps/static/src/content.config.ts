import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Blog posts now live alongside programs under src/content/. NOTE: during
// coexistence these are COPIES - the legacy build.mjs still reads the originals
// in public/posts/*.md (to emit /posts/<slug>.html + posts/index.json for the
// live site). Edit both until build.mjs is retired, then delete public/posts.
const blog = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    category: z.string().optional(),
    date: z.coerce.date(),
    author: z.string().optional(),
    excerpt: z.string().optional().default(""),
    description: z.string().optional(),
    image: z.string().optional(),
    featured: z.boolean().optional().default(false),
  }),
});

// Single source of truth for every program: one .md file per program. The
// frontmatter holds the STRUCTURED fields that fan out to cards + the detail
// sidebar (edit once, every surface updates on rebuild - see PLAN.md); the
// markdown BODY is the detail page's main content (About / What You'll Get /
// Program Day...), edited as freeform prose+lists instead of rigid JSON arrays.
// The admin dashboard will own editing later, so the schema is deliberately
// lenient: only slug/title are required, everything else optional, extras pass
// through.
const programs = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/programs" }),
  schema: z
    .object({
      // No `slug` field: the entry id comes from the filename (lab-day.md ->
      // "lab-day"), so a slug in frontmatter would just duplicate it.
      title: z.string(),
      tagline: z.string().optional(),
      eyebrow: z.string().optional(),
      metaDescription: z.string().optional(),
      image: z.string().optional(),
      price: z.string().optional(),
      feeAmount: z.any().optional(), // number on most programs; an object (per-option pricing) on some
      schedule: z.string().optional(),
      level: z.string().optional(),
      audience: z.string().optional(),
      duration: z.string().optional(),
      format: z.string().optional(),
      outcome: z.string().optional(),
      home_order: z.string().optional(),
      registration: z.boolean().optional(),
      registrationStarts: z.string().optional(),
      registrationEnds: z.string().optional(),
      startsOn: z.string().optional(),
      endsOn: z.string().optional(),
      register_url: z.string().optional(),
      register_label: z.string().optional(),
      hidden: z.boolean().optional(),
      bespokePage: z.boolean().optional(),
      options: z.any().optional(),
    })
    .passthrough(),
});

export const collections = { blog, programs };
