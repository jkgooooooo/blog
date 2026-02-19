import fs from "node:fs";
import path from "node:path";

const title = process.argv.slice(2).join(" ").trim();
if (!title) {
  console.error('Usage: npm run new:post "Post Title"');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9가-힣\s-]/g, "")
  .trim()
  .replace(/\s+/g, "-");

const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, "0");
const dd = String(now.getDate()).padStart(2, "0");
const dateStr = `${yyyy}-${mm}-${dd}`;

const dir = path.join("src", "content", "blog");
fs.mkdirSync(dir, { recursive: true });

const filename = `${dateStr}-${slug || "post"}.md`;
const filepath = path.join(dir, filename);

if (fs.existsSync(filepath)) {
  console.error("File already exists:", filepath);
  process.exit(1);
}

const content = `---
title: "${title.replace(/"/g, '\\"')}"
description: ""
pubDate: "${dateStr}"
draft: true
---

`;

fs.writeFileSync(filepath, content, "utf8");
console.log("Created:", filepath);
