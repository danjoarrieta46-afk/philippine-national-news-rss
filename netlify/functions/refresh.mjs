import { getStore } from "@netlify/blobs";
import { XMLParser } from "fast-xml-parser";

const SOURCES = [
  {
    name: "GMA News",
    url: "https://www.gmanetwork.com/news/rss/news/feed.xml"
  },

  {
    name: "ABS-CBN News",
    url: "https://www.abs-cbn.com/rss.aspx/news"
  },

  {
    name: "Inquirer",
    url: "https://www.inquirer.net/fullfeed"
  },

  {
    name: "Philstar",
    url: "https://www.philstar.com/rss"
  }
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});

function array(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clean(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchSource(source) {
  try {
    const response = await fetch(source.url);

    if (!response.ok) {
      throw new Error(`${response.status}`);
    }

    const xml = await response.text();

    const data = parser.parse(xml);

    const items = array(data?.rss?.channel?.item);

    return items.map(item => {

      const title = clean(item.title);
      const link = clean(
        typeof item.link === "string"
          ? item.link
          : item.guid
      );

      const description = clean(
        item.description || ""
      );

      const date = new Date(
        item.pubDate || Date.now()
      );

      if (!title || !link) {
        return null;
      }

      return {
        title,
        link,
        description,
        date,
        source: source.name
      };

    }).filter(Boolean);

  } catch (error) {

    console.error(
      `Failed to fetch ${source.name}:`,
      error.message
    );

    return [];
  }
}

function createRSS(articles) {

  const items = articles
    .map(article => `
      <item>
        <title>${escapeXml(article.title)}</title>

        <link>${escapeXml(article.link)}</link>

        <guid isPermaLink="true">
          ${escapeXml(article.link)}
        </guid>

        <description>
          ${escapeXml(article.description)}
          Source: ${escapeXml(article.source)}
        </description>

        <pubDate>
          ${article.date.toUTCString()}
        </pubDate>

        <category>
          Philippine National News
        </category>

        <source>
          ${escapeXml(article.source)}
        </source>
      </item>
    `)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>

<rss version="2.0">

  <channel>

    <title>Philippine National News</title>

    <link>https://YOUR-SITE.netlify.app/</link>

    <description>
      Philippine national news from multiple publishers.
    </description>

    <language>en-ph</language>

    <lastBuildDate>
      ${new Date().toUTCString()}
    </lastBuildDate>

    ${items}

  </channel>

</rss>`;
}

export default async () => {

  const results = await Promise.all(
    SOURCES.map(fetchSource)
  );

  let articles = results.flat();

  // Newest first
  articles.sort(
    (a, b) => b.date - a.date
  );

  // Remove duplicates
  const seen = new Set();

  articles = articles.filter(article => {

    const key =
      article.link ||
      article.title.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });

  // Keep latest 100
  articles = articles.slice(0, 100);

  const rss = createRSS(articles);

  const store = getStore("philippine-news");

  await store.set(
    "feed.xml",
    rss
  );

  console.log(
    `Saved ${articles.length} articles`
  );

  return new Response(
    `Updated ${articles.length} articles`
  );
};

export const config = {
  schedule: "*/15 * * * *"
};
