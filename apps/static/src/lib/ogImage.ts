// Resolve an absolute (or /images/...) image URL to the optimized build asset
// under src/assets, returning an absolute URL. Used for crawler-facing image
// URLs that can't be <Image> tags - OG/Twitter meta and JSON-LD image/logo
// fields - so they point at the optimized _astro file and public/images no
// longer needs the content images. Remote/unknown paths pass through unchanged.
import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

const ASSETS = import.meta.glob<{ default: ImageMetadata }>(
  "/src/assets/**/*.{webp,png,jpg,jpeg,avif}",
);
const SITE = "https://bdmso.org";

export async function optimizedAbsolute(p: string): Promise<string> {
  try {
    const path = p.replace(/^https?:\/\/[^/]+/, "");
    if (!path.startsWith("/") || /\.(svg|gif)$/i.test(path)) return p;
    let r = path.replace(/^\//, "");
    if (r.startsWith("r2/")) r = `uploads/${r.slice("r2/".length)}`;
    else if (r.startsWith("assets/")) r = r.slice("assets/".length);
    const loader = ASSETS[`/src/assets/${r}`];
    if (!loader) return p;
    const meta = (await loader()).default;
    const out = await getImage({ src: meta, format: "webp", width: Math.min(1200, meta.width) });
    return SITE + out.src;
  } catch {
    return p;
  }
}
