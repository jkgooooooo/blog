# AGENTS.md — Blog Authoring & UX Guidelines

## Goal
- Add or update blog posts with consistent voice, SEO, accessibility, and good reading UX.
- Prefer small, reviewable diffs. Always run checks before finishing.

## Project structure
- Posts live in: `src/content/blog/`
- Each post is a single markdown file: `YYYY-MM-DD-slug.md` (or keep existing convention)
- Images live in: `public/images/blog/<slug>/` (create if needed)

## Commands (update these to match the repo)
- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Format: `npm run format`
- Typecheck (if any): `npm run typecheck`

## Post quality requirements
### Content
- Strong title and hook in first 2–3 paragraphs
- Use headings in a logical hierarchy (H2/H3)
- Prefer short paragraphs, bullets, and scannable sections
- Include a concise takeaway section near the end

### SEO
- Must include: title, description, tags, date, canonical (if cross-post)
- One clear primary keyword/theme; do not keyword-stuff
- Use descriptive link text (avoid "click here")

### Accessibility
- Every image needs alt text (or alt="" if decorative)
- Ensure color/contrast is not the only cue (if touching UI)
- Avoid emoji-only section headings

### UI/Reading UX
- Keep line length readable (avoid very wide blocks)
- Use code blocks with language fences
- Use callouts sparingly and consistently

## Output expectations for Codex
When making a change, include in the final message:
- What files changed and why
- What commands were run and results
- Any remaining risks or TODOs
