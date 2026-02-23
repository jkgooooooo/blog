import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

const usage = `
Usage:
  npm run write:url -- "<url>" [--note "추가 코멘트"] [--title "강제 제목"] [--publish] [--text-file "./tmp/article.txt"]

Examples:
  npm run write:url -- "https://techcrunch.com/..."
  npm run write:url -- "https://example.com/post" --note "Antigravity에서 직접 써봤습니다."

Env (optional, for AI writing):
  OPENAI_API_KEY=...
  OPENAI_BASE_URL=https://api.openai.com/v1
  OPENAI_MODEL=gpt-4o-mini
`;

if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.log(usage.trim());
  process.exit(0);
}

function parseArgs(argv) {
  const out = {
    url: "",
    note: "",
    title: "",
    textFile: "",
    publish: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--note") {
      out.note = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (v === "--title") {
      out.title = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (v === "--text-file") {
      out.textFile = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (v === "--publish") {
      out.publish = true;
      continue;
    }
    if (!v.startsWith("--") && !out.url) {
      out.url = v;
    }
  }
  return out;
}

const opts = parseArgs(args);

let sourceUrl;
try {
  sourceUrl = new URL(opts.url);
} catch {
  console.error("Invalid URL. Example: npm run write:url -- \"https://example.com/post\"");
  process.exit(1);
}

function toSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function nowDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function cleanText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "blog-write-from-url-script/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.text();
}

async function fetchSource(url) {
  const readerUrl = `https://r.jina.ai/${url}`;
  try {
    const text = await fetchText(readerUrl);
    return { text: cleanText(text), via: "jina-reader" };
  } catch (err) {
    const html = await fetchText(url);
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
    return { text: cleanText(stripped), via: "html-fallback", err: String(err?.message ?? err) };
  }
}

function extractTitle(rawText, fallbackHost) {
  const lines = rawText.split("\n").map((v) => v.trim()).filter(Boolean);
  const h1Line = lines.find((v) => v.startsWith("# "));
  if (h1Line) return h1Line.replace(/^#\s+/, "").trim();
  const titleLine = lines.find((v) => /^title[:\s]/i.test(v));
  if (titleLine) return titleLine.replace(/^title[:\s]*/i, "").trim();
  return `${fallbackHost} 링크 정리`;
}

function pickKeyLines(rawText, limit = 60) {
  const lines = rawText
    .split("\n")
    .map((v) => v.replace(/\s+/g, " ").trim())
    .filter((v) => v.length >= 28 && v.length <= 220)
    .filter((v) => !/^https?:\/\//i.test(v))
    .filter((v) => !isBoilerplateLine(v))
    .map((v) => localizeLine(v));

  return Array.from(new Set(lines)).slice(0, limit);
}

function isBoilerplateLine(line) {
  const text = String(line).toLowerCase();
  const bad = [
    "cookie",
    "privacy",
    "terms",
    "copyright",
    "sign in",
    "sign up",
    "login",
    "subscribe",
    "skip to",
    "menu",
    "navigation",
    "all rights reserved",
    "©",
  ];
  return bad.some((word) => text.includes(word));
}

function localizeLine(line) {
  let out = String(line);
  const rules = [
    [/preview/gi, "프리뷰"],
    [/review/gi, "리뷰"],
    [/merge/gi, "머지"],
    [/pull request/gi, "PR"],
    [/code review/gi, "코드 리뷰"],
    [/workflow/gi, "워크플로우"],
    [/feature/gi, "기능"],
    [/introduces?/gi, "도입합니다"],
    [/added?/gi, "추가됐습니다"],
    [/updated?/gi, "업데이트됐습니다"],
    [/supports?/gi, "지원합니다"],
  ];
  for (const [re, to] of rules) out = out.replace(re, to);
  return out.replace(/\s+/g, " ").trim();
}

function parseJsonLoose(text) {
  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch {}

  const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }
  return null;
}

async function generateWithLLM({ rawText, source, note, dateStr, defaultTitle }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const system = [
    "You write Korean blog drafts in friendly polite Korean (존댓말).",
    "Keep sentences short and practical.",
    "No hype, no fake certainty.",
    "Write title mostly in Korean. Keep only technical jargon in English.",
    "Output JSON only.",
  ].join(" ");

  const user = `
아래 링크를 읽고, 개인 블로그 초안을 작성해주세요.

요구사항:
- 톤: 친근한 존댓말, 1인칭 경험 섞기
- 길이: 짧은 글
- 구성:
  1) "핵심 요약" 2~3줄
  2) "기사 내용" 6~7줄
  3) "코멘트" 2~3줄
- "기사 내용"에는 반드시 원문에서 확인 가능한 구체 변경점(추가된 기능, 바뀐 흐름, 지원 범위)을 포함
- 과장 금지, 확실치 않으면 "~로 보입니다"처럼 표현
- 날짜 기준 문맥 반영: 오늘은 ${dateStr}
- 카테고리: AI
- 태그: 3~5개, 너무 과하지 않게
- canonicalURL은 원문 링크
- 본문 맨 아래에 "## 출처" 섹션을 만들고 원문 링크 1회 포함
- 제목은 한글 중심으로 작성하고, Gemini/GPT/Swift 같은 전문용어만 영문 허용
- "제가 해보겠습니다/테스트하겠습니다" 같은 할 일 문장 금지

추가 사용자 메모:
${note || "(없음)"}

원문 URL:
${source}

원문 텍스트(잘린 버전):
${rawText.slice(0, 12000)}

반드시 아래 JSON 스키마로만 응답:
{
  "title": "string",
  "description": "string",
  "category": "AI",
  "tags": ["string", "string"],
  "bodyMd": "markdown string"
}
`.trim();

  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    throw new Error(`LLM request failed: ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const parsed = parseJsonLoose(content);
  if (!parsed || typeof parsed !== "object") return null;

  const title = String(parsed.title || defaultTitle).trim();
  const description = String(parsed.description || "").trim();
  const category = String(parsed.category || "AI").trim() || "AI";
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((v) => String(v).trim()).filter(Boolean).slice(0, 5)
    : ["AI"];
  const bodyMd = String(parsed.bodyMd || "").trim();

  if (!bodyMd) return null;

  return { title, description, category, tags, bodyMd };
}

function fallbackDraft({ title, description, source, lines, note, dateStr }) {
  const summaryPoints = buildSummaryPoints(lines, title);
  const articleLines = buildArticleLines(lines, title, dateStr);
  const commentPoints = buildCommentPoints(note);

  const bodyMd = `
${title} 관련 소식이 올라와서 핵심만 짧게 남깁니다.
오늘(${dateStr}) 기준으로 확인한 내용입니다.

## 핵심 요약

${summaryPoints.map((line) => `- ${line}`).join("\n")}

## 기사 내용

${articleLines.map((line, idx) => `${idx + 1}. ${line}`).join("\n")}

## 코멘트

${commentPoints.map((line) => `- ${line}`).join("\n")}

## 출처

- <a href="${source}" target="_blank" rel="noopener noreferrer">${new URL(source).hostname}</a>
`.trim();

  return {
    title,
    description,
    category: "AI",
    tags: ["AI"],
    bodyMd,
  };
}

function buildSummaryPoints(lines, title) {
  const best = pickFeatureLines(lines, 4);
  const picked = (best.length ? best : (Array.isArray(lines) ? lines : []))
    .slice(0, 3)
    .map((line) => normalizeSentence(line, 105))
    .filter(Boolean);
  if (picked.length >= 2) return picked;

  return [
    `${title} 관련 업데이트가 공유됐습니다.`,
    "핵심 흐름을 빠르게 파악하기에 괜찮은 내용입니다.",
  ];
}

function buildArticleLines(lines, title, dateStr) {
  const featureLines = pickFeatureLines(lines, 10);
  const sourceLines = featureLines.length >= 4 ? featureLines : (Array.isArray(lines) ? lines : []);
  const picked = sourceLines
    .slice(0, 7)
    .map((line) => normalizeSentence(line, 125))
    .filter(Boolean);

  if (picked.length >= 6) return picked.slice(0, 7);

  return [
    `${title} 관련 소식이 공개됐습니다.`,
    "기사에서는 핵심 변경 사항과 배경을 중심으로 설명합니다.",
    "내용 전개는 기존 흐름과 달라진 포인트를 짚는 방식입니다.",
    "실무 관점에서 어떤 흐름이 달라지는지를 먼저 파악하기에 적합한 내용입니다.",
    "기사에 나온 변경점 기준으로 보면 사용 경험에 영향을 줄 요소가 분명히 보입니다.",
    "오늘 기준으로는 전체 업데이트 방향을 읽는 데 의미가 있는 기사였습니다.",
    `확정 정보는 후속 공지나 공식 문서 업데이트를 함께 보는 게 좋겠습니다. (${dateStr})`,
  ];
}

function buildCommentPoints(note) {
  if (note && note.trim()) {
    return [
      `${note.trim()}`,
      "전체적으로는 최근 흐름과 맞물려서 앞으로의 변화가 더 기대됩니다.",
      "추가 업데이트가 나오면 글 내용도 함께 보강해두겠습니다.",
    ];
  }

  return [
    "짧게 읽어도 방향이 잡히는 기사라서 먼저 메모해둘 만했습니다.",
    "후속 정보가 붙으면 내용이 더 또렷해질 것 같아 계속 지켜보려 합니다.",
    "제품 업데이트 글은 초기에 흐름만 잡아둬도 나중에 비교할 때 도움이 됩니다.",
  ];
}

function pickFeatureLines(lines, limit = 8) {
  const source = Array.isArray(lines) ? lines : [];
  const cues = [
    "추가",
    "도입",
    "업데이트",
    "지원",
    "개선",
    "변경",
    "new",
    "introduced",
    "added",
    "update",
    "now",
    "can",
    "supports",
    "preview",
    "review",
    "merge",
    "workflow",
    "claude code",
  ];

  return source
    .map((line) => ({ line, score: lineScore(line, cues) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.line)
    .slice(0, limit);
}

function lineScore(line, cues) {
  const text = String(line).toLowerCase();
  let score = 0;
  for (const cue of cues) {
    if (text.includes(cue)) score += 2;
  }
  if (/\b\d+(\.\d+)?\b/.test(text)) score += 1;
  if (text.length >= 45 && text.length <= 150) score += 1;
  if (isBoilerplateLine(text)) score -= 5;
  return score;
}

function normalizeSentence(text, maxLen) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const clipped = cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
  return /[.!?…]$/.test(clipped) ? clipped : `${clipped}.`;
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

const dateStr = nowDateString();
const dir = path.join("src", "content", "blog");
fs.mkdirSync(dir, { recursive: true });

console.log("Fetching source...");
let fetched;
if (opts.textFile) {
  try {
    const text = fs.readFileSync(opts.textFile, "utf8");
    fetched = { text: cleanText(text), via: `text-file:${opts.textFile}` };
  } catch (err) {
    console.error(`Failed to read --text-file: ${String(err?.message ?? err)}`);
    process.exit(1);
  }
} else {
  try {
    fetched = await fetchSource(sourceUrl.toString());
  } catch (err) {
    console.error(`Failed to fetch source URL: ${String(err?.message ?? err)}`);
    console.error("Tip: network 문제가 있으면 --text-file 옵션으로 기사 본문 텍스트를 넣어 실행해 주세요.");
    process.exit(1);
  }
}
const defaultTitle = opts.title?.trim() || localizeTitle(extractTitle(fetched.text, sourceUrl.hostname));
const defaultDescription = `${sourceUrl.hostname} 글을 읽고 핵심 내용을 정리했습니다.`;
const keyLines = pickKeyLines(fetched.text, 60);

let draft = null;
try {
  draft = await generateWithLLM({
    rawText: fetched.text,
    source: sourceUrl.toString(),
    note: opts.note.trim(),
    dateStr,
    defaultTitle,
  });
  if (draft) console.log("Draft generated with LLM.");
} catch (err) {
  console.warn(`LLM generation failed. Falling back. (${String(err?.message ?? err)})`);
}

if (!draft) {
  draft = fallbackDraft({
    title: defaultTitle,
    description: defaultDescription,
    source: sourceUrl.toString(),
    lines: keyLines,
    note: opts.note.trim(),
    dateStr,
  });
  console.log("Draft generated with fallback summarizer.");
}

const title = (opts.title?.trim() || draft.title || defaultTitle).trim();
const description = (draft.description || defaultDescription).trim();
const category = (draft.category || "AI").trim();
const tags = (Array.isArray(draft.tags) ? draft.tags : ["AI"])
  .map((v) => String(v).trim())
  .filter(Boolean)
  .slice(0, 5);
const bodyMd = ensureSourceSection((draft.bodyMd || "").trim(), sourceUrl.toString());

const slug = toSlug(title) || "post";
const fileBase = `${dateStr}-${slug}`;
const filename = uniqueFilename(dir, fileBase);
const filepath = path.join(dir, filename);
const tagsYaml = tags.length ? `[${tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(", ")}]` : "[]";

const content = `---
title: "${title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
pubDate: "${dateStr}"
draft: ${opts.publish ? "false" : "true"}
category: "${category.replace(/"/g, '\\"')}"
tags: ${tagsYaml}
canonicalURL: "${sourceUrl.toString()}"
---

${bodyMd}
`;

fs.writeFileSync(filepath, content, "utf8");

console.log(`Created: ${filepath}`);
console.log(`Source fetched via: ${fetched.via}`);
if (!process.env.OPENAI_API_KEY) {
  console.log("Tip: Set OPENAI_API_KEY for higher-quality personalized drafts.");
}

function ensureSourceSection(bodyMd, source) {
  const body = String(bodyMd || "").trim();
  const sourceHost = (() => {
    try {
      return new URL(source).hostname;
    } catch {
      return "원문";
    }
  })();

  if (/##\s*출처/i.test(body)) return body;

  return `${body}

## 출처

- <a href="${source}" target="_blank" rel="noopener noreferrer">${sourceHost}</a>`;
}

function localizeTitle(rawTitle) {
  const title = String(rawTitle || "").trim();
  if (!title) return "업데이트 내용 정리";
  if (/[가-힣]/.test(title)) return title;

  const lower = title.toLowerCase();
  if (lower.includes("preview") && lower.includes("review") && lower.includes("merge") && lower.includes("claude")) {
    return "Claude Code에 Preview, Review, Merge 기능이 추가됐습니다";
  }

  const converted = localizeLine(title)
    .replace(/\s+/g, " ")
    .replace(/[|·-]\s*[^|·-]+$/g, "")
    .trim();

  return /[가-힣]/.test(converted) ? converted : `${title} 업데이트 정리`;
}
