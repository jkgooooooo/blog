import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const useSeed = args.includes("--seed");
const maxPerSourceArg = readOption("--max-per-source", "25");
const maxPerSource = Math.max(1, Number.parseInt(maxPerSourceArg, 10) || 25);

const sourcesPath = path.join("config", "sources.json");
const outputPath = path.join("data", "inbox.jsonl");

const sources = readJsonFile(sourcesPath, []);
if (!Array.isArray(sources) || !sources.length) {
  console.error(`No sources found in ${sourcesPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const allRecords = [];

for (const source of sources) {
  if (!source?.id || !source?.feed) continue;
  try {
    const xml = await fetchText(source.feed);
    const items = parseFeed(xml, source);
    const picked = items.slice(0, maxPerSource);
    allRecords.push(...picked);
    console.log(`[ok] ${source.id}: ${picked.length} items`);
  } catch (err) {
    console.warn(`[warn] ${source.id}: ${String(err?.message ?? err)}`);
  }
}

if (useSeed) {
  const seed = buildSeedItems();
  allRecords.push(...seed);
  console.log(`[seed] appended ${seed.length} local test items`);
}

const existing = readJsonLines(outputPath);
const merged = mergeRecords(existing, allRecords);
writeJsonLines(outputPath, merged);

console.log(`Saved ${merged.length} records -> ${outputPath}`);

function readOption(name, fallback = "") {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] ?? fallback;
}

function readJsonFile(filepath, fallback) {
  if (!fs.existsSync(filepath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    return fallback;
  }
}

function readJsonLines(filepath) {
  if (!fs.existsSync(filepath)) return [];
  const rows = fs.readFileSync(filepath, "utf8").split("\n").map((v) => v.trim()).filter(Boolean);
  return rows
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeJsonLines(filepath, rows) {
  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(filepath, `${body}\n`, "utf8");
}

function mergeRecords(existing, incoming) {
  const map = new Map();

  for (const row of existing) {
    if (!row?.url) continue;
    map.set(row.url, row);
  }

  for (const row of incoming) {
    if (!row?.url) continue;
    const prev = map.get(row.url);
    if (!prev) {
      map.set(row.url, {
        ...row,
        firstSeenAt: row.fetchedAt,
        lastSeenAt: row.fetchedAt,
      });
      continue;
    }
    map.set(row.url, {
      ...prev,
      ...row,
      firstSeenAt: prev.firstSeenAt ?? prev.fetchedAt ?? row.fetchedAt,
      lastSeenAt: row.fetchedAt,
    });
  }

  return [...map.values()]
    .sort((a, b) => toMillis(b.publishedAt ?? b.fetchedAt) - toMillis(a.publishedAt ?? a.fetchedAt))
    .slice(0, 2500);
}

function toMillis(v) {
  const n = new Date(v).valueOf();
  return Number.isFinite(n) ? n : 0;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "blog-feed-collector/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.text();
}

function parseFeed(xml, source) {
  const trimmed = xml.trim();
  if (/<feed[\s>]/i.test(trimmed)) return parseAtom(trimmed, source);
  return parseRss(trimmed, source);
}

function parseRss(xml, source) {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return blocks.map((block) => itemFromBlock(block, source, false)).filter(Boolean);
}

function parseAtom(xml, source) {
  const blocks = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return blocks.map((block) => itemFromBlock(block, source, true)).filter(Boolean);
}

function itemFromBlock(block, source, atom) {
  const title = cleanInline(tagValue(block, atom ? ["title"] : ["title"]));
  const summary = cleanInline(tagValue(block, atom ? ["summary", "content"] : ["description", "content"]));
  const rawLink = atom ? atomLink(block) : tagValue(block, ["link", "guid"]);
  const url = normalizeUrl(rawLink, source.homepage);
  if (!title || !url) return null;

  const publishedAtRaw = tagValue(
    block,
    atom ? ["updated", "published"] : ["pubDate", "dc:date"],
  );
  const publishedAt = toIsoOrNow(publishedAtRaw);
  const fetchedAt = new Date().toISOString();

  return {
    id: hash(`${source.id}:${url}`),
    sourceId: source.id,
    sourceName: source.name || source.id,
    sourceWeight: Number(source.weight) || 1,
    sourceFeed: source.feed,
    title,
    summary,
    url,
    publishedAt,
    fetchedAt,
  };
}

function tagValue(block, tagNames) {
  for (const tag of tagNames) {
    const re = new RegExp(`<${escapeRe(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRe(tag)}>`, "i");
    const m = block.match(re);
    if (m?.[1]) return decodeEntities(stripCdata(m[1]));
  }
  return "";
}

function atomLink(block) {
  const linkTags = [...block.matchAll(/<link\b([^>]*)>/gi)];
  for (const m of linkTags) {
    const attrs = m[1] || "";
    const rel = attrValue(attrs, "rel");
    const href = attrValue(attrs, "href");
    if (!href) continue;
    if (!rel || rel === "alternate") return href;
  }
  return "";
}

function attrValue(attrs, name) {
  const re = new RegExp(`${escapeRe(name)}\\s*=\\s*["']([^"']+)["']`, "i");
  return attrs.match(re)?.[1] ?? "";
}

function cleanInline(v) {
  return decodeEntities(v)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(raw, homepage = "") {
  if (!raw) return "";
  const cleaned = raw.trim();
  try {
    const u = homepage && cleaned.startsWith("/")
      ? new URL(cleaned, homepage)
      : new URL(cleaned);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["gclid", "fbclid", "ref", "s"].includes(key)) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return "";
  }
}

function decodeEntities(v) {
  return v
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripCdata(v) {
  return v.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function toIsoOrNow(v) {
  const t = new Date(v).valueOf();
  if (!Number.isFinite(t)) return new Date().toISOString();
  return new Date(t).toISOString();
}

function hash(v) {
  return crypto.createHash("sha1").update(v).digest("hex").slice(0, 12);
}

function escapeRe(v) {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSeedItems() {
  const now = new Date().toISOString();
  const list = [
    {
      sourceId: "seed",
      sourceName: "Seed: AI Daily",
      sourceWeight: 0.8,
      sourceFeed: "seed://daily",
      title: "Gemini 3.1 Pro practical performance notes",
      summary: "AI model update and benchmark discussion for developer workflows.",
      url: "https://blog.google/technology/ai/",
      publishedAt: now,
      fetchedAt: now,
    },
    {
      sourceId: "seed",
      sourceName: "Seed: iOS Watch",
      sourceWeight: 0.8,
      sourceFeed: "seed://daily",
      title: "Xcode build speed tweaks for larger Swift projects",
      summary: "A short guide on iOS and Swift build setting adjustments with practical results.",
      url: "https://developer.apple.com/news/",
      publishedAt: now,
      fetchedAt: now,
    },
    {
      sourceId: "seed",
      sourceName: "Seed: IT Brief",
      sourceWeight: 0.8,
      sourceFeed: "seed://daily",
      title: "Cloud outage postmortem checklist for engineering teams",
      summary: "Incident response and communication checklist for platform and backend teams.",
      url: "https://github.blog/changelog/",
      publishedAt: now,
      fetchedAt: now,
    },
  ];

  return list.map((row) => ({ ...row, id: hash(`seed:${row.url}`) }));
}
