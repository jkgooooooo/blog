import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

const usage = `
Usage:
  npm run write:url -- "<url>" [--note "추가 코멘트"] [--title "강제 제목"] [--publish]

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

function pickKeyLines(rawText, limit = 6) {
  const lines = rawText
    .split("\n")
    .map((v) => v.trim())
    .filter((v) => v.length >= 35 && !v.startsWith("http"));
  return lines.slice(0, limit);
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
    "Output JSON only.",
  ].join(" ");

  const user = `
아래 링크를 읽고, 개인 블로그 초안을 작성해주세요.

요구사항:
- 톤: 친근한 존댓말, 1인칭 경험 섞기
- 길이: 짧은 글 (6~10문단)
- 구성: 도입 -> 핵심 내용 -> 개인 체감 -> "정리하면:" bullet 3개 -> 마무리
- 과장 금지, 확실치 않으면 "~로 보입니다"처럼 표현
- 날짜 기준 문맥 반영: 오늘은 ${dateStr}
- 카테고리: AI
- 태그: 3~5개, 너무 과하지 않게
- canonicalURL은 원문 링크
- 본문에 원문 링크 1회 포함

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
  const bullets = lines.length
    ? lines.map((v) => `- ${v}`).join("\n")
    : "- 기사 핵심 내용을 더 확인해보며 업데이트할 예정입니다.";

  const noteLine = note
    ? `\n추가로 제가 느낀 점은 이렇습니다: ${note}\n`
    : "";

  const bodyMd = `
원문을 읽고 핵심 내용을 빠르게 정리해봤습니다.
오늘 날짜(${dateStr}) 기준으로 확인한 내용입니다.

원문 링크: ${source}

핵심 포인트:
${bullets}
${noteLine}
정리하면:

- 주요 업데이트 흐름을 먼저 파악해두면 좋겠습니다.
- 실제 체감은 조금 더 써보면서 확인이 필요해 보입니다.
- 추후 사용 경험이 쌓이면 후속 글로 업데이트하겠습니다.
`.trim();

  return {
    title,
    description,
    category: "AI",
    tags: ["AI", "Summary"],
    bodyMd,
  };
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
const fetched = await fetchSource(sourceUrl.toString());
const defaultTitle = opts.title?.trim() || extractTitle(fetched.text, sourceUrl.hostname);
const defaultDescription = `${sourceUrl.hostname} 글을 읽고 핵심 내용을 정리했습니다.`;
const keyLines = pickKeyLines(fetched.text, 6);

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
const bodyMd = (draft.bodyMd || "").trim();

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
