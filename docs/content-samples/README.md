# Content format samples

Prototype files showing how a **program** or **blog post** looks once the admin
dashboard saves it: the worker writes the row to **D1** (source of truth for
editing + checkout pricing), then materializes this `.md` file and commits it via
the GitHub API. Astro builds the static site from these committed files, so the
key info (price, registration status, schedule) the editor set in D1 ends up
**on the static page too** - it lives in the frontmatter here.

These are illustrations to lock the vocabulary, not live content. Real files
land in `apps/static/src/content/{programs,blog}/`.

## Program vocabulary

| Field | Allowed values / shape | Meaning |
|---|---|---|
| `category` | `competition` \| `beginner` \| `advanced` \| `residential` | which group it belongs to |
| `registration_status` | `open` \| `closed` \| `coming_soon` \| `on_enquiry` | drives the CTA |
| `registration_opens` / `registration_closes` | ISO date | the signup window (also the edit window) |
| `schedule_label` | free text | human display string |
| `starts_on` / `ends_on` | ISO date | actual program dates |
| `price_label` | free text | card display, e.g. `৳ 1,000` / `From ৳ 500` / `On enquiry` |
| `pricing.selection` | `single` (pick one) \| `multiple` (pick any, summed) | how choices combine |
| `pricing.choices[]` | `{ id, label, note, price }` | the priced options the registrant picks |

A program with one fixed fee (or an enquiry-only program) simply omits the
`pricing` block; only `price_label` shows.

## Blog post vocabulary

Posts carry their key info in frontmatter the same way: `published`, `featured`,
`category`, `date`, plus `author` / `excerpt` / `image`. Body is markdown.
