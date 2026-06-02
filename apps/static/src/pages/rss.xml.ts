// RSS 2.0 feed for the blog, built from the blog content collection via the
// official @astrojs/rss (handles XML escaping + boilerplate).
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

const SITE = "https://bdmso.org";

export async function GET() {
  const posts = (await getCollection("blog")).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  return rss({
    title: "BdMSO Blog",
    description:
      "News, announcements, and workshop write-ups from the Bangladesh Mathematics and Science Olympiad.",
    site: SITE,
    trailingSlash: false,
    // Namespace + self-link for feed hygiene; <language> mirrors the old feed.
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<language>en</language><atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />`,
    items: posts.map((p) => ({
      title: p.data.title,
      link: `/posts/${p.data.slug}`,
      pubDate: p.data.date,
      description: p.data.description || p.data.excerpt,
      categories: p.data.category ? [p.data.category] : undefined,
    })),
  });
}
