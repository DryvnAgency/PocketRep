import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const marketing = resolve(root, "Pocketrep");
const routes = [
  ["/", "index.html"],
  ["/car-sales-follow-up-software", "car-sales-follow-up-software.html"],
  ["/car-sales-follow-up-text-templates", "car-sales-follow-up-text-templates.html"],
  ["/crm-for-car-salespeople", "crm-for-car-salespeople.html"],
];

let checks = 0;
const failures = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)];
}

for (const [route, filename] of routes) {
  const path = resolve(marketing, filename);
  const html = readFileSync(path, "utf8");
  const label = `${route} (${filename})`;

  check(matches(html, /<title>[^<]+<\/title>/gi).length === 1, `${label}: expected one title`);
  check(matches(html, /<meta\s+name="description"\s+content="[^"]+">/gi).length === 1, `${label}: expected one meta description`);
  check(matches(html, /<link\s+rel="canonical"\s+href="[^"]+">/gi).length === 1, `${label}: expected one canonical URL`);
  check(matches(html, /<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/gi).length === 1, `${label}: expected one H1`);
  check(!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html), `${label}: indexable route contains noindex`);

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)">/i)?.[1] ?? "";
  check(title.length <= 60, `${label}: title exceeds 60 characters`);
  check(description.length >= 120 && description.length <= 160, `${label}: meta description should be 120–160 characters`);

  for (const href of matches(html, /href="([^"]+)"/gi).map((match) => match[1])) {
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const localPath = href.split("#")[0].split("?")[0];
    if (localPath === "" || routes.some(([knownRoute]) => knownRoute === localPath)) continue;
    check(existsSync(resolve(marketing, localPath.slice(1))), `${label}: missing local link target ${localPath}`);
  }

  const jsonLd = matches(html, /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  check(jsonLd.length > 0, `${label}: expected structured data`);
  for (const block of jsonLd) {
    try {
      JSON.parse(block[1]);
      checks += 1;
    } catch (error) {
      failures.push(`${label}: invalid JSON-LD (${error.message})`);
    }
  }
}

const homepage = readFileSync(resolve(marketing, "index.html"), "utf8");
check(!homepage.includes("data:font/woff2;base64"), "homepage: embedded font payload still present");
check(statSync(resolve(marketing, "index.html")).size < 200_000, "homepage: HTML exceeds 200 KB performance guardrail");

const sitemap = readFileSync(resolve(marketing, "sitemap.xml"), "utf8");
const sitemapUrls = matches(sitemap, /<loc>([^<]+)<\/loc>/g).map((match) => match[1]);
const expectedUrls = routes.map(([route]) => `https://pocketrep.pro${route}`);
check(JSON.stringify(sitemapUrls) === JSON.stringify(expectedUrls), "sitemap: URLs do not match the indexable canonical route set");
check(!/(privacy|terms|cancel|thank)/i.test(sitemapUrls.join(" ")), "sitemap: noindex utility URL included");

const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
for (const [route, filename] of routes.slice(1)) {
  check(vercel.rewrites.some((rewrite) => rewrite.source === route && rewrite.destination === `/${filename}`), `vercel.json: missing rewrite for ${route}`);
}

const appVercel = JSON.parse(readFileSync(resolve(root, "PocketRepApp/vercel.json"), "utf8"));
const robotsHeader = appVercel.headers?.flatMap((entry) => entry.headers ?? []).find((header) => header.key.toLowerCase() === "x-robots-tag");
check(Boolean(robotsHeader?.value.toLowerCase().includes("noindex")), "PocketRepApp: missing X-Robots-Tag noindex header");

if (failures.length) {
  console.error(`Marketing SEO verification failed (${failures.length}/${checks} checks):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Marketing SEO verification passed (${checks} checks).`);
