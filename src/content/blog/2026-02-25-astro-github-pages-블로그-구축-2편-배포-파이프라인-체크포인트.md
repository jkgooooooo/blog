---
title: "Astro + GitHub Pages 블로그 구축기 2편: 배포 파이프라인 체크 포인트"
description: "로컬 작성부터 GitHub Pages 반영까지, 실제로 막히기 쉬운 포인트를 체크리스트 중심으로 정리했습니다."
pubDate: "2026-02-25"
draft: false
category: "Dev"
tags: ["Astro", "GitHub Pages", "GitHub Actions", "Deploy", "Checklist"]
---

1편에서 블로그 구조를 잡았다면, 2편에서는 배포할 때 어디서 자주 막히는지 정리해보겠습니다.  
저도 여러 번 막혀보니, 순서를 단순하게 가져가는 게 제일 낫더라고요.

## 배포 순서는 이렇게 하였습니다

1. 로컬에서 글 작성
2. `main` 브랜치로 push
3. GitHub Actions에서 `build` / `deploy` 실행
4. GitHub Pages 사이트 반영 확인

`글 작성` → `git push` → `Actions 배포` → `실사이트 확인`

## `astro.config.mjs`에서 먼저 확인한 것

GitHub 프로젝트 페이지(`https://아이디.github.io/blog`)를 쓸 때는 `base: "/blog"`가 핵심입니다.

```js
export default defineConfig({
  site: "https://jkgooooooo.github.io",
  base: "/blog",
});
```

이 값이 틀리면 링크나 정적 파일 경로가 쉽게 깨집니다.  
배포가 이상하면 저는 여기부터 먼저 봅니다.

## 배포했는데 글이 안 올라올 때는 `draft`를 먼저 봤습니다

글 파일 frontmatter에서 `draft: true`면 사이트에 안 보입니다.  
테스트할 때 `true`로 두고 깜빡하는 경우가 있어서, 발행 전에는 `draft: false`를 꼭 확인합니다.

## Giscus는 `category-id`까지 같이 맞춰야 했습니다

Giscus는 GitHub Discussions 카테고리에 댓글 스레드를 연결해서 보여주는 방식입니다.  
여기서 `category-id`는 “어느 카테고리와 연결할지”를 가리키는 값이라, 이 값이 틀리면 댓글이 안 뜨거나 다른 카테고리로 연결될 수 있습니다.

Discussions 카테고리를 바꿨거나 새로 만들었다면 `category-id`도 함께 다시 맞춰야 합니다. 자세한 설정은 아래 글에 정리해뒀습니다.
- [Astro 블로그에 Giscus 댓글 적용 방법 정리](https://jkgooooooo.github.io/blog/2026-02-24-astro-giscus-%EB%8C%93%EA%B8%80-%EC%A0%81%EC%9A%A9-%EC%A0%95%EB%A6%AC/)

## 지금은 이렇게 운영하고 있습니다

지금은 이런 방식으로 블로그를 운영하고 있습니다. 배포 자체는 아주 단순합니다. `draft: false` 확인, `npm run build`, 그리고 `git push`면 끝입니다.

하지만 단순히 AI를 도구로 쓰는 수준을 넘어, 글 작성부터 배포 전 점검까지 AI와 함께 워크플로우를 최적화했습니다. AI로 먼저 뼈대가 되는 초안을 잡고, 배포 직전에는 변경된 파일, 오탈자, 링크 상태, 화면 노출 이상 여부까지 꼼꼼하게 같이 점검하며 발행하고 있습니다.

## 출처

- <a href="https://docs.astro.build/en/reference/configuration-reference/#base" target="_blank" rel="noopener noreferrer">Astro Docs - base</a>
- <a href="https://docs.astro.build/en/guides/deploy/github/" target="_blank" rel="noopener noreferrer">Astro Docs - Deploy to GitHub Pages</a>
- <a href="https://giscus.app/ko" target="_blank" rel="noopener noreferrer">Giscus</a>
