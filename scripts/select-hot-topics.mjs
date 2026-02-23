import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const count = Math.max(1, Number.parseInt(readOption("--count", "3"), 10) || 3);
const maxAgeHours = Math.max(6, Number.parseInt(readOption("--max-age-hours", "72"), 10) || 72);
const minScore = Number.parseFloat(readOption("--min-score", "18")) || 18;
const includeSeed = args.includes("--include-seed");

const keywordsPath = path.join("config", "keywords.json");
const inboxPath = path.join("data", "inbox.jsonl");
const outputPath = path.join("data", "selected-topics.json");

const keywords = readJsonFile(keywordsPath, {});
const inbox = readJsonLines(inboxPath);

if (!inbox.length) {
  console.error(`No inbox records found. Run collect first: ${inboxPath}`);
  process.exit(1);
}

const scored = inbox
  .filter((item) => includeSeed || !String(item.sourceId || "").startsWith("seed"))
  .map((item) => scoreItem(item, keywords))
  .filter((item) => item.score >= minScore)
  .filter((item) => ageHours(item.publishedAt ?? item.fetchedAt) <= maxAgeHours)
  .sort((a, b) => b.score - a.score);

const selected = pickDiverse(scored, count);

const result = {
  selectedAt: new Date().toISOString(),
  totalCandidates: scored.length,
  countRequested: count,
  items: selected,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(`Selected ${selected.length} topics -> ${outputPath}`);
for (const topic of selected) {
  console.log(`- [${topic.bucket}] (score ${topic.score.toFixed(1)}, 관심도 ${topic.engagementScore.toFixed(1)}) ${topic.title}`);
}

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

function scoreItem(item, rules) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();

  const includeHits = matchCount(text, rules.include ?? []);
  const boostHits = matchCount(text, rules.boost ?? []);
  const excludeHits = matchCount(text, rules.exclude ?? []);

  const recency = recencyScore(item.publishedAt ?? item.fetchedAt);
  const sourceScore = Math.min(20, (Number(item.sourceWeight) || 1) * 10);
  const hotScore = hotSignalScore(text);
  const engagementScoreValue = engagementScore(item);
  const communityBonus = item.sourceType === "community" ? 8 : 0;

  const rawScore =
    includeHits * 6 +
    boostHits * 4 +
    hotScore +
    recency +
    sourceScore +
    engagementScoreValue +
    communityBonus;
  const score = excludeHits > 0 ? 0 : rawScore;
  const bucket = detectBucket(text, rules.bucketRules ?? {});

  return {
    ...item,
    score,
    includeHits,
    boostHits,
    recencyScore: recency,
    sourceScore,
    engagementScore: engagementScoreValue,
    communityBonus,
    bucket,
    titleKey: normalizeTitleKey(item.title || ""),
  };
}

function matchCount(text, words) {
  let count = 0;
  for (const raw of words) {
    const w = String(raw).toLowerCase().trim();
    if (!w) continue;
    if (text.includes(w)) count += 1;
  }
  return count;
}

function recencyScore(dateStr) {
  const h = ageHours(dateStr);
  if (h <= 6) return 25;
  if (h <= 12) return 20;
  if (h <= 24) return 14;
  if (h <= 48) return 8;
  if (h <= 72) return 4;
  return 0;
}

function ageHours(dateStr) {
  const ms = new Date().valueOf() - new Date(dateStr).valueOf();
  if (!Number.isFinite(ms)) return 9999;
  return Math.max(0, ms / 36e5);
}

function hotSignalScore(text) {
  const signals = [
    "launch",
    "announced",
    "release",
    "preview",
    "beta",
    "benchmark",
    "security",
    "incident",
    "outage",
    "breaking",
  ];
  return matchCount(text, signals) * 2;
}

function engagementScore(item) {
  const scoreValue =
    numericValue(item?.engagement?.score) ||
    numericValue(item?.communityScore) ||
    numericValue(item?.points) ||
    0;
  const commentsValue =
    numericValue(item?.engagement?.comments) ||
    numericValue(item?.numComments) ||
    numericValue(item?.commentsCount) ||
    0;

  if (scoreValue <= 0 && commentsValue <= 0) return 0;

  // Log scaling keeps very large threads from dominating everything.
  const scorePart = Math.log10(scoreValue + 1) * 12;
  const commentPart = Math.log10(commentsValue + 1) * 10;
  const bonus = item.sourceType === "community" ? 2 : 0;
  return Math.min(35, scorePart + commentPart + bonus);
}

function numericValue(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function detectBucket(text, bucketRules) {
  let best = { name: "AI", score: 0 };
  for (const [name, words] of Object.entries(bucketRules)) {
    const score = matchCount(text, Array.isArray(words) ? words : []);
    if (score > best.score) best = { name, score };
  }
  return best.name;
}

function normalizeTitleKey(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join("-");
}

function pickDiverse(items, limit) {
  const selected = [];
  const usedUrls = new Set();
  const usedTitleKeys = new Set();
  const bucketCount = new Map();
  const sourceCount = new Map();

  for (const item of items) {
    if (selected.length >= limit) break;
    if (usedUrls.has(item.url)) continue;
    if (usedTitleKeys.has(item.titleKey)) continue;

    const bCount = bucketCount.get(item.bucket) ?? 0;
    const sCount = sourceCount.get(item.sourceId) ?? 0;

    // Keep variety when selecting 2~3 daily posts.
    if (bCount >= 2) continue;
    const sourceCap = item.sourceType === "community" ? 2 : 1;
    if (sCount >= sourceCap && items.length > limit) continue;

    selected.push(item);
    usedUrls.add(item.url);
    usedTitleKeys.add(item.titleKey);
    bucketCount.set(item.bucket, bCount + 1);
    sourceCount.set(item.sourceId, sCount + 1);
  }

  // Backfill if diversity filters were too strict.
  if (selected.length < limit) {
    for (const item of items) {
      if (selected.length >= limit) break;
      if (usedUrls.has(item.url)) continue;
      selected.push(item);
      usedUrls.add(item.url);
    }
  }

  return selected.slice(0, limit);
}
