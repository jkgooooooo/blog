---
title: "Astro + GitHub Pages 블로그 구축기 1편"
description: "왜 Astro와 GitHub Pages를 골랐는지, 실제 구축 흐름과 파일 구조를 경험 중심으로 정리했습니다."
pubDate: "2026-02-23"
draft: false
category: "Dev"
tags: ["Astro", "GitHub Pages", "Blog", "Base Path"]
---

## 왜 Astro + GitHub Pages로 만들었냐면

블로그를 다시 시작해야겠다고 생각했을 때, 우선 기준은 두 가지였습니다.  
하나는 관리가 단순할 것, 다른 하나는 제가 원하는 구조로 직접 고칠 수 있을 것이었습니다.

그래서 선택한 조합이 `Astro + GitHub Pages`였습니다.

- Astro는 Markdown 글과 Astro 페이지를 정적 사이트로 빌드해주는 도구이고,
- GitHub Pages는 빌드된 결과물을 그대로 호스팅해주는 서비스입니다.

결국 저는 “작성은 로컬에서 하고, 배포는 GitHub가 하게 하자”라는 생각으로 이 구조를 잡았습니다.

## GitHub Pages 배포는 이렇게 붙였습니다

제가 실제로 한 순서를 명령 기준으로 적으면 아래입니다.

1. GitHub에서 `blog` 레포지토리를 만들고 로컬로 가져왔습니다.

```bash
git clone https://github.com/jkgooooooo/blog.git
cd blog
```

2. Astro 프로젝트를 현재 폴더 기준으로 생성했습니다.

```bash
npm create astro@latest .
```

생성할 때는 기본 템플릿을 선택했고, 설치가 끝나면 아래 파일들이 먼저 생깁니다.

- `astro.config.mjs`  
  사이트 기본 설정 파일입니다. `site`, `base`, 통합 플러그인 같은 전역 설정을 여기에 둡니다.
- `src/pages/index.astro`  
  메인 페이지 파일입니다. 홈 화면에 어떤 내용을 보여줄지 여기서 결정합니다.
- `src/layouts/`  
  공통 레이아웃 폴더입니다. 헤더/푸터/메타 태그처럼 여러 페이지에서 같이 쓰는 틀을 관리합니다.
- `src/content/`  
  콘텐츠 관련 폴더입니다. 글 스키마(`config.ts`)와 실제 글(`content/blog/*.md`)을 관리합니다.

3. 로컬에서 먼저 실행해서 화면이 뜨는지 확인했습니다.

```bash
npm install
npm run dev
```

4. GitHub Actions 배포 워크플로우(`.github/workflows/deploy.yml`)를 추가했습니다.

5. `main`에 push 하면 Actions가 `npm run build`를 실행해서 `dist`를 만들고, 그 결과를 GitHub Pages에 배포하도록 맞췄습니다.

여기서 가장 많이 헷갈린 건 경로였습니다.  
프로젝트 페이지 주소가 `https://jkgooooooo.github.io/blog` 형태라서 `astro.config.mjs`에 `base: "/blog"`를 명시하지 않으면 링크가 쉽게 깨졌습니다.

제가 쓴 핵심 설정은 이거였습니다.

```js
export default defineConfig({
  site: "https://jkgooooooo.github.io",
  base: "/blog",
});
```

## Astro에서 레이아웃과 글은 이렇게 반영됩니다

레이아웃은 `src/layouts/Layout.astro`를 기준으로 잡았습니다.  
헤드 메타, 폰트, 공통 네비/푸터, 전역 스타일 같은 공통 요소는 여기에서 관리했습니다.

글 작성은 `src/content/blog/` 폴더에 Markdown 파일을 넣는 방식입니다.  
파일을 추가하면 목록 페이지와 상세 페이지가 자동으로 연결되게 만들었습니다.

예를 들어 `src/content/blog/2026-02-23-테스트.md`를 만들면:

- 목록: `src/pages/index.astro`, `src/pages/posts/index.astro`에서 수집해서 노출
- 상세: `src/pages/[slug].astro`가 slug 기준으로 페이지 생성

frontmatter는 `src/content/config.ts`에서 스키마를 관리하고 있어서,  
`title`, `pubDate`, `draft`, `category`, `tags` 같은 필드가 일관되게 유지되도록 했습니다.

## 디렉토리는 이렇게 나눠서 쓰고 있습니다

실제로 자주 건드리는 경로는 아래였습니다.

- `src/content/blog/`  
글 작성 파일 위치입니다. 새 글을 만들면 여기 들어갑니다.
- `src/layouts/Layout.astro`  
공통 레이아웃 파일입니다. 전체 페이지의 공통 UI를 건드립니다.
- `src/pages/index.astro`  
메인 화면입니다. 최신 글 목록 노출 방식을 조정합니다.
- `src/pages/posts/index.astro`  
전체 글 목록 화면입니다.
- `src/pages/[slug].astro`  
글 상세 화면입니다. 메타, 관련 글, 댓글 영역 등을 만집니다.

## AI 없으면 안 되겠네 싶었습니다

이번 구축을 하면서 가장 크게 느낀 건, AI가 없었으면 시간 꽤 많이 잡아먹었겠다는 점이었습니다.  
자료 조사부터 설정 확인, 경로 이슈 정리, 화면 수정까지 전부 혼자 찾았다면 훨씬 오래 걸렸을 것 같습니다.

특히 막히는 구간에서도 대화를 하면서 이슈를 빠르게 잡아갈 수 있었던 점이 가장 좋았습니다.  
덕분에 구축 자체에 집중하면서 빠르게 형태를 잡을 수 있었습니다.

2편에서는 실제 배포 파이프라인 체크 포인트를 이어서 정리해보겠습니다.

## 출처

- <a href="https://docs.astro.build/en/reference/configuration-reference/#base" target="_blank" rel="noopener noreferrer">Astro Docs - base</a>
- <a href="https://docs.astro.build/en/guides/deploy/github/" target="_blank" rel="noopener noreferrer">Astro Docs - Deploy to GitHub Pages</a>
