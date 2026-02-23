import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const useSeed = args.includes("--seed");
const maxPerSource = Math.max(1, Number.parseInt(readOption("--max-per-source", "20"), 10) || 20);
const maxAgeHours = Math.max(12, Number.parseInt(readOption("--max-age-hours", "96"), 10) || 96);

const sourcesPath = path.join("config", "community-sources.json");
const outputPath = path.join("data", "inbox.jsonl");
const sources = readJsonFile(sourcesPath, []);

if (!Array.isArray(sources) || !sources.length) {
  console.error(`No community sources found in ${sourcesPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const incoming = [];
for (const source of sources) {
  if (!source?.id || !source?.type) continue;
  try {
    const rows = await fetchCommunity(source, { limit: maxPerSource, maxAgeHours });
    incoming.push(...rows);
    console.log(`[ok] ${source.id}: ${rows.length} items`);
  } catch (err) {
    console.warn(`[warn] ${source.id}: ${String(err?.message ?? err)}`);
  }
}

if (useSeed) {
  const seedRows = buildSeedItems();
  incoming.push(...seedRows);
  console.log(`[seed] appended ${seedRows.length} local community test items`);
}

const existing = readJsonLines(outputPath);
const merged = mergeRecords(existing, incoming);
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
  fs.writeFileSync(filepath, `${rows.map((v) => JSON.stringify(v)).join("\n")}\n`, "utf8");
}

function mergeRecords(existing, incomingRows) {
  const map = new Map();

  for (const row of existing) {
    if (!row?.url) continue;
    map.set(row.url, row);
  }

  for (const row of incomingRows) {
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
    .slice(0, 3500);
}

function toMillis(v) {
  const n = new Date(v).valueOf();
  return Number.isFinite(n) ? n : 0;
}

async function fetchCommunity(source, options) {
  if (source.type === "hackernews") return fetchHackerNews(source, options);
  if (source.type === "reddit") return fetchReddit(source, options);
  throw new Error(`Unsupported community source type: ${source.type}`);
}

async function fetchHackerNews(source, { limit, maxAgeHours }) {
  const sinceEpochSec = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const query = String(source.query || "").trim();
  if (!query) return [];

  const endpoint = new URL("https://hn.algolia.com/api/v1/search");
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("tags", "story");
  endpoint.searchParams.set("hitsPerPage", String(limit));
  endpoint.searchParams.set("numericFilters", `created_at_i>${sinceEpochSec}`);

  const json = await fetchJson(endpoint.toString());
  const hits = Array.isArray(json?.hits) ? json.hits : [];
  const now = new Date().toISOString();

  return hits
    .map((hit) => {
      const url = normalizeUrl(
        hit?.url || `https://news.ycombinator.com/item?id=${hit?.objectID}`,
      );
      const title = String(hit?.title || hit?.story_title || "").trim();
      if (!url || !title) return null;

      const points = numberOrZero(hit?.points);
      const comments = numberOrZero(hit?.num_comments);
      const publishedAt = toIso(hit?.created_at);

      return {
        id: hash(`${source.id}:${url}`),
        sourceId: source.id,
        sourceName: source.name || source.id,
        sourceType: "community",
        sourceWeight: Number(source.weight) || 1,
        sourceFeed: endpoint.toString(),
        communityPlatform: "hackernews",
        communityQuery: query,
        title,
        summary: "",
        url,
        engagement: { score: points, comments },
        publishedAt,
        fetchedAt: now,
      };
    })
    .filter(Boolean);
}

async function fetchReddit(source, { limit, maxAgeHours }) {
  const subreddit = String(source.subreddit || "").trim();
  if (!subreddit) return [];
  const sort = String(source.sort || "top");
  const time = String(source.time || "day");

  const endpoint = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort}.json?t=${encodeURIComponent(time)}&limit=${limit}`;
  const json = await fetchJson(endpoint);
  const children = Array.isArray(json?.data?.children) ? json.data.children : [];
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  const now = new Date().toISOString();

  return children
    .map((node) => node?.data)
    .filter(Boolean)
    .map((post) => {
      const title = String(post.title || "").trim();
      const rawUrl = post.url_overridden_by_dest || post.url || post.permalink;
      const url = normalizeUrl(rawUrl, "https://www.reddit.com");
      if (!title || !url) return null;

      const publishedAt = toIso(post.created_utc ? new Date(post.created_utc * 1000).toISOString() : "");
      if (toMillis(publishedAt) < cutoff) return null;

      const score = numberOrZero(post.score);
      const comments = numberOrZero(post.num_comments);
      const summary = String(post.selftext || "").replace(/\s+/g, " ").trim().slice(0, 220);

      return {
        id: hash(`${source.id}:${url}`),
        sourceId: source.id,
        sourceName: source.name || source.id,
        sourceType: "community",
        sourceWeight: Number(source.weight) || 1,
        sourceFeed: endpoint,
        communityPlatform: "reddit",
        communityQuery: `r/${subreddit}`,
        title,
        summary,
        url,
        engagement: { score, comments },
        publishedAt,
        fetchedAt: now,
      };
    })
    .filter(Boolean);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "blog-community-collector/1.0",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.json();
}

function normalizeUrl(raw, homepage = "") {
  if (!raw) return "";
  try {
    const u = homepage && String(raw).startsWith("/")
      ? new URL(raw, homepage)
      : new URL(raw);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["gclid", "fbclid", "ref"].includes(key)) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return "";
  }
}

function toIso(v) {
  const t = new Date(v).valueOf();
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hash(v) {
  return crypto.createHash("sha1").update(v).digest("hex").slice(0, 12);
}

function buildSeedItems() {
  const now = new Date().toISOString();
  const list = [
    {
      sourceId: "seed-community-ai",
      sourceName: "Seed Community AI",
      sourceType: "community",
      sourceWeight: 1.3,
      sourceFeed: "seed://community",
      communityPlatform: "hackernews",
      communityQuery: "AI",
      title: "Gemini 3.1 Pro launch discussion is trending",
      summary: "Community reactions focus on model quality and inference speed.",
      url: "https://hn.algolia.com/?query=Gemini%203.1%20Pro",
      engagement: { score: 420, comments: 188 },
      publishedAt: now,
      fetchedAt: now,
    },
    {
      sourceId: "seed-community-ios",
      sourceName: "Seed Community iOS",
      sourceType: "community",
      sourceWeight: 1.2,
      sourceFeed: "seed://community",
      communityPlatform: "reddit",
      communityQuery: "r/iOSProgramming",
      title: "Xcode build performance tips thread gains traction",
      summary: "Developers discuss practical build speed improvements on larger iOS apps.",
      url: "https://www.reddit.com/r/iOSProgramming/search/?q=xcode+build+speed&restrict_sr=1&sort=top&t=week",
      engagement: { score: 260, comments: 94 },
      publishedAt: now,
      fetchedAt: now,
    },
    {
      sourceId: "seed-community-it",
      sourceName: "Seed Community IT",
      sourceType: "community",
      sourceWeight: 1.1,
      sourceFeed: "seed://community",
      communityPlatform: "reddit",
      communityQuery: "r/devops",
      title: "Cloud outage retrospective template shared by operators",
      summary: "Ops community highlights checklist patterns for postmortems and incident comms.",
      url: "https://www.reddit.com/r/devops/search/?q=outage+retrospective&restrict_sr=1&sort=top&t=week",
      engagement: { score: 210, comments: 77 },
      publishedAt: now,
      fetchedAt: now,
    },
  ];

  return list.map((row) => ({ ...row, id: hash(`seed-community:${row.url}:${row.title}`) }));
}
