# Blog Automation Notes

## Commands

- `npm run dev`: run Astro dev server
- `npm run build`: build production output
- `npm run new:post "Post Title"`: create new blog post markdown
- `npm run tistory:summary`: generate Tistory summary templates in `tistory/drafts/`
- `npm run tistory:summary -- --slug hello-world`: generate one summary file

## Giscus setup

1. Install giscus app on your GitHub repository.
2. Copy values from giscus setup page into `.env`:
   - `PUBLIC_GISCUS_REPO`
   - `PUBLIC_GISCUS_REPO_ID`
   - `PUBLIC_GISCUS_CATEGORY_ID`
3. Restart dev server.

If required variables are missing, comment box will not render.

## Tistory summary workflow

- Workflow file: `.github/workflows/tistory-summary.yml`
- Trigger:
  - push to `main` when `src/content/blog/*.md` changes
  - manual run from GitHub Actions (`workflow_dispatch`)
- Output:
  - `tistory/drafts/*-tistory.md`
