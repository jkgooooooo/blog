import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const count = Math.max(1, Number.parseInt(readOption("--count", "3"), 10) || 3);
const publish = args.includes("--publish");
const allowGenericUrl = args.includes("--allow-generic-url");
const selectedPath = readOption("--input", path.join("data", "selected-topics.json"));
const blogDir = path.join("src", "content", "blog");

if (!fs.existsSync(selectedPath)) {
  console.error(`Selected topics file not found: ${selectedPath}`);
  process.exit(1);
}

const selected = readJsonFile(selectedPath, {});
const items = Array.isArray(selected.items) ? selected.items.slice(0, count) : [];

if (!items.length) {
  console.log("No topics to write.");
  process.exit(0);
}

fs.mkdirSync(blogDir, { recursive: true });

const existingFiles = fs.readdirSync(blogDir).filter((name) => name.endsWith(".md"));
const existingCanonical = new Set();
for (const filename of existingFiles) {
  const raw = fs.readFileSync(path.join(blogDir, filename), "utf8");
  const m = raw.match(/^canonicalURL:\s*["']?([^"'\n]+)["']?/m);
  if (m?.[1]) existingCanonical.add(m[1].trim());
}

const created = [];
for (const topic of items) {
  const url = String(topic.url || "").trim();
  if (!url) continue;
  if (!allowGenericUrl && isLikelyListingUrl(url)) {
    console.log(`[skip] generic/listing URL: ${url}`);
    continue;
  }
  if (existingCanonical.has(url)) {
    console.log(`[skip] already exists canonicalURL: ${url}`);
    continue;
  }

  const title = buildKoreanTitle(topic.title || "오늘의 이슈 정리", topic.bucket);
  const dateStr = nowDateString();
  const slug = toSlug(title) || "auto-topic";
  const filename = uniqueFilename(blogDir, `${dateStr}-${slug}`);
  const filepath = path.join(blogDir, filename);

  const category = mapCategory(topic.bucket);
  const tags = buildTags(topic);
  const description = buildDescription(topic.summary, title);
  const body = buildBody(topic, title);

  const content = `---
title: "${escapeQuotes(title)}"
description: "${escapeQuotes(description)}"
pubDate: "${dateStr}"
draft: ${publish ? "false" : "true"}
category: "${escapeQuotes(category)}"
tags: [${tags.map((t) => `"${escapeQuotes(t)}"`).join(", ")}]
canonicalURL: "${url}"
---

${body}
`;

  fs.writeFileSync(filepath, content, "utf8");
  created.push(filepath);
  existingCanonical.add(url);
}

if (!created.length) {
  console.log("No files created (all selected topics already existed).");
  process.exit(0);
}

console.log(`Created ${created.length} posts:`);
for (const file of created) console.log(`- ${file}`);

function readOption(name, fallback = "") {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] ?? fallback;
}

function readJsonFile(filepath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    return fallback;
  }
}

function nowDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeTitle(title) {
  return String(title)
    .replace(/\s*\|\s*[^|]+$/g, "")
    .replace(/\s*-\s*[^-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasHangul(text) {
  return /[가-힣]/.test(String(text));
}

function buildKoreanTitle(rawTitle, bucket) {
  const normalized = normalizeTitle(rawTitle);
  const lower = normalized.toLowerCase();

  if (/gemini\s*3\.?1\s*pro.*performance/.test(lower)) {
    return "Gemini 3.1 Pro 실사용 성능 메모";
  }
  if (/xcode.*build speed.*swift/.test(lower)) {
    return "대형 Swift 프로젝트 Xcode 빌드 속도 개선 메모";
  }
  if (/cloud outage postmortem checklist/.test(lower)) {
    return "클라우드 장애 포스트모템 체크리스트 메모";
  }

  if (hasHangul(normalized)) return normalized;

  let converted = translatePhrase(normalized);
  converted = converted
    .replace(/\s+/g, " ")
    .replace(/^[-:]+|[-:]+$/g, "")
    .trim();

  if (!converted) return `${mapCategory(bucket)} 이슈 메모`;
  if (!hasHangul(converted)) return `${converted} 메모`;
  if (/메모$/.test(converted)) return converted;
  return `${converted} 메모`;
}

function uniqueFilename(dir, baseName) {
  let name = `${baseName}.md`;
  let i = 2;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${baseName}-${i}.md`;
    i += 1;
  }
  return name;
}

function escapeQuotes(v) {
  return String(v).replace(/"/g, '\\"');
}

function mapCategory(bucket) {
  switch ((bucket || "").toUpperCase()) {
    case "IOS":
      return "iOS";
    case "DEV":
      return "Dev";
    case "IT":
      return "IT";
    default:
      return "AI";
  }
}

function buildTags(topic) {
  const text = `${topic.title || ""} ${topic.summary || ""}`.toLowerCase();
  const tags = [];
  if (text.includes("gemini")) tags.push("Gemini");
  if (text.includes("gpt")) tags.push("GPT");
  if (text.includes("claude")) tags.push("Claude");
  if (text.includes("swift")) tags.push("Swift");
  if (text.includes("ios")) tags.push("iOS");
  if (text.includes("xcode")) tags.push("Xcode");
  if (text.includes("security")) tags.push("Security");
  if (!tags.length) tags.push(mapCategory(topic.bucket));

  const head = mapCategory(topic.bucket);
  if (!tags.includes(head)) tags.unshift(head);

  return Array.from(new Set(tags)).slice(0, 4);
}

function buildDescription(summary, title) {
  const base = String(summary || "").replace(/\s+/g, " ").trim();
  if (hasHangul(base)) return base.length > 120 ? `${base.slice(0, 117)}...` : base;
  return `${title} 관련 소식을 보고 핵심만 짧게 기록했습니다.`;
}

function buildBody(topic, title) {
  const sourceName = topic.sourceName || "원문";
  const summaryPoints = buildSummaryPoints(topic.summary, title);
  const articleLines = buildArticleLines(topic, title);
  const commentPoints = buildCommentPoints(topic.bucket);

  return `${title} 관련 내용을 짧게 정리해봤습니다.

## 핵심 요약

${summaryPoints.map((line) => `- ${line}`).join("\n")}

## 기사 내용

${articleLines.map((line, idx) => `${idx + 1}. ${line}`).join("\n")}

## 코멘트

${commentPoints.map((line) => `- ${line}`).join("\n")}

## 출처

- <a href="${topic.url}" target="_blank" rel="noopener noreferrer">${sourceName}</a>`;
}

function buildSummaryPoints(summary, title) {
  const raw = String(summary || "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return [
      `${title} 관련 업데이트가 공개됐습니다.`,
      "핵심 변화 방향을 먼저 확인해둘 만한 내용입니다.",
    ];
  }

  const text = hasHangul(raw) ? raw : translatePhrase(raw);
  const parts = splitSentences(text, 3, 95);
  if (parts.length >= 2) return parts.slice(0, 3);

  return [
    `${ensureSentence(text, 95)}`,
    "핵심 변화 포인트를 간단히 파악하는 데 도움이 됩니다.",
  ];
}

function buildArticleLines(topic, title) {
  const summaryBase = String(topic.summary || "").replace(/\s+/g, " ").trim();
  const summaryLine = summaryBase
    ? ensureSentence(hasHangul(summaryBase) ? summaryBase : translatePhrase(summaryBase), 100)
    : `${title} 관련 이슈가 공식 채널을 통해 공유됐습니다.`;

  switch ((topic.bucket || "").toUpperCase()) {
    case "IOS":
      return [
        "이번 내용은 iOS 개발 흐름 중에서도 빌드/개발 속도와 연결되는 주제입니다.",
        "기사에서는 설정과 작업 흐름 관점에서 개선 포인트가 언급됐습니다.",
        summaryLine,
        "대형 프로젝트일수록 작은 최적화가 누적 효과를 만든다는 맥락이 강조됐습니다.",
        "아직 세부 수치보다 방향 설명 중심이라 후속 공지가 나오면 해석이 더 선명해질 것 같습니다.",
        "그래도 iOS 개발자 입장에서는 계속 체크해둘 가치가 있는 업데이트로 보입니다.",
      ];
    case "IT":
      return [
        "이번 주제는 운영 안정성과 장애 대응 프로세스 정비에 가까운 내용입니다.",
        "기사는 문제 발생 후 대응 순서와 커뮤니케이션 정렬을 핵심으로 다룹니다.",
        summaryLine,
        "기술 대응만큼 기록 체계와 공유 방식이 중요하다는 점을 다시 확인하게 됩니다.",
        "실무에서는 이런 체크리스트가 있어야 대응 품질 편차를 줄이기 쉽습니다.",
        "전체적으로 사건 대응을 구조화하자는 흐름으로 읽히는 내용이었습니다.",
      ];
    default:
      return [
        "이번 이슈는 AI 모델 업데이트 흐름에서 눈여겨볼 만한 소식입니다.",
        "기사는 성능 변화와 활용 가능성 쪽에 초점을 맞춰 설명하고 있습니다.",
        summaryLine,
        "모델 경쟁이 빨라지면서 발표 간격도 짧아지고 있다는 점이 인상적입니다.",
        "현시점에는 세부 비교보다 방향성 파악에 먼저 의미를 둘 만해 보입니다.",
        "후속 벤치마크나 사용자 사례가 붙으면 해석이 더 구체화될 것으로 보입니다.",
      ];
  }
}

function buildCommentPoints(bucket) {
  switch ((bucket || "").toUpperCase()) {
    case "IOS":
      return [
        "Xcode 관련 업데이트는 누적되면 팀 생산성에 큰 차이를 만드는 경우가 많습니다.",
        "앞으로도 이런 방향의 개선이 계속 이어지면 개발 체감이 꽤 좋아질 것 같습니다.",
      ];
    case "DEV":
      return [
        "개발 생산성은 작은 개선이 반복될수록 체감이 커지는 영역이라고 생각합니다.",
        "이번 변화도 그런 흐름으로 이어질지 계속 지켜볼 만합니다.",
      ];
    case "IT":
      return [
        "운영 이슈에서는 재발 방지 체계를 얼마나 잘 남기느냐가 결국 핵심입니다.",
        "체크리스트 기반 문화가 더 확산되면 대응 품질도 안정적으로 올라갈 것 같습니다.",
      ];
    default:
      return [
        "AI 모델 업데이트는 속도와 품질이 같이 좋아지는 흐름이 이어질 때 체감이 커집니다.",
        "이번 변화도 실제 사용 경험에서 긍정적으로 이어질 가능성이 있어 보입니다.",
      ];
  }
}

function splitSentences(text, maxCount, maxLen) {
  return String(text)
    .split(/[.?!]\s+|[。]\s*/g)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => ensureSentence(v, maxLen))
    .slice(0, maxCount);
}

function ensureSentence(text, maxLen) {
  const clipped = String(text).trim().length > maxLen
    ? `${String(text).trim().slice(0, maxLen - 1)}…`
    : String(text).trim();
  return /[.!?…]$/.test(clipped) ? clipped : `${clipped}.`;
}

function translatePhrase(text) {
  let out = String(text);
  const rules = [
    [/launch discussion is trending/gi, "출시 논의가 커지는 중"],
    [/performance tips thread gains traction/gi, "성능 팁 토론이 주목받는 중"],
    [/retrospective template shared by operators/gi, "운영자들이 공유한 회고 템플릿"],
    [/practical performance/gi, "실사용 성능"],
    [/build speed/gi, "빌드 속도"],
    [/tweaks?/gi, "개선"],
    [/larger/gi, "대형"],
    [/projects?/gi, "프로젝트"],
    [/cloud outage/gi, "클라우드 장애"],
    [/postmortem/gi, "포스트모템"],
    [/checklist/gi, "체크리스트"],
    [/engineering teams?/gi, "엔지니어링 팀"],
    [/incident response/gi, "장애 대응"],
    [/communication/gi, "커뮤니케이션"],
    [/guide/gi, "가이드"],
    [/thread/gi, "토론"],
    [/tips?/gi, "팁"],
    [/trending/gi, "주목"],
    [/retrospective/gi, "회고"],
    [/template/gi, "템플릿"],
    [/operators/gi, "운영자"],
    [/shared/gi, "공유된"],
    [/update/gi, "업데이트"],
    [/benchmark/gi, "벤치마크"],
    [/discussion/gi, "정리"],
    [/\bfor\b/gi, ""],
    [/\band\b/gi, "및"],
  ];

  for (const [re, to] of rules) {
    out = out.replace(re, to);
  }

  out = out
    .replace(/\bgemini\b/gi, "Gemini")
    .replace(/\bgpt\b/gi, "GPT")
    .replace(/\bclaude\b/gi, "Claude")
    .replace(/\bswift\b/gi, "Swift")
    .replace(/\bxcode\b/gi, "Xcode")
    .replace(/\bai\b/gi, "AI")
    .replace(/\bios\b/gi, "iOS");

  return out;
}

function isLikelyListingUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return true;
  }

  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return true;
  if (path === "/news" || path === "/technology/ai" || path === "/changelog") return true;
  if (host.endsWith("reddit.com") && /^\/r\/[^/]+$/.test(path)) return true;
  if (host === "news.ycombinator.com" && path === "/") return true;

  return false;
}
