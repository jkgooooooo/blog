import fs from "node:fs";
import path from "node:path";

const blogDir = path.join("src", "content", "blog");
const outputDir = path.join("tistory", "drafts");

const args = process.argv.slice(2);
const slugArgIndex = args.indexOf("--slug");
const slugFilter = slugArgIndex >= 0 ? args[slugArgIndex + 1] : "";
const force = args.includes("--force");

const siteUrl = (process.env.SITE_URL || "https://jkgooooooo.github.io").replace(/\/+$/, "");
const basePath = `/${(process.env.BLOG_BASE_PATH || "blog").replace(/^\/+|\/+$/g, "")}`;

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = {};
  const body = match[2].trim();

  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    frontmatter[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return { frontmatter, body };
}

function getSlugFromFilename(filename) {
  const basename = filename.replace(/\.md$/i, "");
  const datePrefix = /^\d{4}-\d{2}-\d{2}-(.+)$/;
  const matched = basename.match(datePrefix);
  return matched ? matched[1] : basename;
}

function getDateFromFilename(filename) {
  const matched = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (matched) return matched[1];
  return new Date().toISOString().slice(0, 10);
}

function makeSummaryTemplate({ title, description, sourceUrl, bodyPreview }) {
  const safeTitle = title.replace(/"/g, '\\"');
  const safeDescription = (description || "").replace(/"/g, '\\"');
  const createdAt = new Date().toISOString().slice(0, 10);

  return `---
title: "[요약] ${safeTitle}"
description: "${safeDescription}"
source_url: "${sourceUrl}"
created_at: "${createdAt}"
status: "draft"
---

# ${title} 요약

## 한 줄 요약
- 

## 핵심 포인트
1. 
2. 
3. 

## 빠른 정리
${bodyPreview || "- (원문을 바탕으로 핵심 내용을 채워주세요.)"}

## 원문 링크
- ${sourceUrl}
`;
}

if (!fs.existsSync(blogDir)) {
  console.error(`Blog directory not found: ${blogDir}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

const files = fs
  .readdirSync(blogDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => entry.name);

let createdCount = 0;

for (const filename of files) {
  const slug = getSlugFromFilename(filename);
  if (slugFilter && slugFilter !== slug && slugFilter !== filename.replace(/\.md$/i, "")) {
    continue;
  }

  const fullPath = path.join(blogDir, filename);
  const raw = fs.readFileSync(fullPath, "utf8");
  const parsed = parseFrontmatter(raw);
  if (!parsed) continue;

  const title = parsed.frontmatter.title || slug;
  const description = parsed.frontmatter.description || "";
  const isDraft = String(parsed.frontmatter.draft || "").toLowerCase() === "true";
  if (isDraft) continue;

  const date = getDateFromFilename(filename);
  const sourceUrl = `${siteUrl}${basePath}/${slug}/`;
  const bodyPreview = parsed.body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => `- ${line}`)
    .join("\n");

  const outputName = `${date}-${slug}-tistory.md`;
  const outputPath = path.join(outputDir, outputName);

  if (fs.existsSync(outputPath) && !force) {
    continue;
  }

  const template = makeSummaryTemplate({ title, description, sourceUrl, bodyPreview });
  fs.writeFileSync(outputPath, template, "utf8");
  createdCount += 1;
  console.log(`Created: ${outputPath}`);
}

if (createdCount === 0) {
  console.log("No new summary drafts were created.");
}
