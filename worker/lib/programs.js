// Program catalog. The single source of truth is
// public/data/programs-detail.json - the same file the marketing site
// and the dashboard/admin SPAs read. This module just derives the
// name/price lookup maps the worker needs, so prices and titles can
// never drift between the worker, the site and the apps. To change a
// program's name or fee, edit programs-detail.json and nothing else.

import CATALOG from "../../public/data/programs-detail.json";

// registration_type slug -> display title
export const PROGRAM_NAMES = Object.fromEntries(
  CATALOG.map((p) => [p.slug, p.title]),
);

// registration_type slug -> BDT amount. null means "on enquiry" - the
// dashboard shows a contact-us CTA and create-payment refuses to
// process the row until an admin assigns a price.
export const PROGRAM_PRICES = Object.fromEntries(
  CATALOG.map((p) => [p.slug, p.feeAmount ?? null]),
);
