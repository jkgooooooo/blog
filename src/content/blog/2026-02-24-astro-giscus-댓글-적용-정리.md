---
title: "Astro 블로그에 Giscus 댓글 붙인 방법 정리"
description: "GitHub Discussions 카테고리 설정부터 Astro 연결까지, Giscus 댓글 적용 과정을 실제 사례 기준으로 정리했습니다."
pubDate: "2026-02-24"
draft: true
category: "Dev"
tags: ["Astro", "GitHub Pages", "Giscus", "댓글", "GitHub Discussions"]
---

블로그를 운영하다 보니, 글 아래에서 바로 의견을 주고받을 수 있는 댓글이 필요했습니다.  
외부 DB를 따로 붙이기는 부담이 있어서, GitHub Discussions 기반으로 동작하는 `Giscus`를 붙였습니다.

이번 글에서는 특히 `Discussions 카테고리`를 어떻게 잡아야 하는지까지 같이 정리해보겠습니다.

## 먼저 준비한 것

댓글이 보이려면 아래 3가지는 먼저 되어 있어야 합니다.

1. 블로그 레포지토리가 공개(Public) 상태여야 합니다.
2. 레포지토리에서 Discussions를 활성화해야 합니다.
3. `giscus` GitHub App을 해당 레포에 설치해야 합니다.

여기까지 끝나면 Giscus 설정 페이지에서 필요한 값을 받을 수 있습니다.

## Discussions 카테고리부터 먼저 정리했습니다

저는 레포의 Discussions에서 `Comments` 카테고리를 새로 만들어서 연결했습니다.
기존 `General`을 써도 되지만, 댓글 전용으로 분리해두면 관리가 훨씬 편했습니다.

![Discussions 탭에서 카테고리 관리로 들어가는 화면](/blog/images/blog/giscus-comments/01-discussions-categories.png)

![Manage discussion categories에서 Comments 카테고리를 확인한 화면](/blog/images/blog/giscus-comments/02-manage-categories-comments.png)

제가 실제로 잡은 기준은 아래였습니다.

- 블로그 댓글만 분리해서 보고 싶다: `Comments` 카테고리 신규 생성 추천
- 이미 Discussions를 거의 안 쓰고 있고 단순 운영이다: 기존 `General` 재사용 가능
- 중요한 공지 전용: `Announcements`는 댓글 카테고리로 비추천  
  `Announcements`는 작성 권한이 제한되는 구조라 댓글 자동 생성 흐름과 맞지 않을 수 있습니다.

## 카테고리 포맷은 어떻게 고를지

새 카테고리를 만들 때 Discussion Format을 고르게 됩니다.

![Create category에서 Discussion Format을 선택하는 화면](/blog/images/blog/giscus-comments/03-create-category-format.png)

포맷은 보통 아래처럼 생각하면 편했습니다.

- `Open-ended discussion`
  일반 댓글형에 가장 무난합니다. 블로그 댓글 목적이면 이걸 가장 많이 씁니다.
- `Question / Answer`
  질문 중심 커뮤니티라면 괜찮습니다.  
  저는 스크린샷처럼 이 포맷으로 먼저 시작했고, 운영하면서 필요하면 Open-ended로 바꿀 수 있게 열어뒀습니다.
- `Announcement`
  공지 전용이라 댓글 카테고리로는 보통 맞지 않습니다.
- `Poll`
  댓글보다는 투표 목적일 때만 적합합니다.

## Giscus 설정 페이지에서 값 가져오기

`https://giscus.app/ko` 에서 레포를 연결하면 아래 값이 생성됩니다.

- `data-repo`
- `data-repo-id`
- `data-category`
- `data-category-id`
- `data-mapping` (저는 `pathname` 사용)
- `data-reactions-enabled`
- `data-theme`
- `data-lang`

여기서 핵심은 `data-category-id`입니다.  
카테고리를 새로 만들거나 바꾸면 이 값이 달라질 수 있으니, 설정 변경 후에는 다시 확인하는 게 안전했습니다.

이 값들을 Astro에서는 환경 변수(`PUBLIC_GISCUS_*`)로 넣어 사용했습니다.

## Astro 컴포넌트로 분리해서 붙이기

저는 댓글 스크립트를 `src/components/GiscusComments.astro`로 분리했습니다.

```astro
---
const repo = import.meta.env.PUBLIC_GISCUS_REPO;
const repoId = import.meta.env.PUBLIC_GISCUS_REPO_ID;
const categoryId = import.meta.env.PUBLIC_GISCUS_CATEGORY_ID;
const enabled = Boolean(repo && repoId && categoryId);
---

{
  enabled ? (
    <script
      src="https://giscus.app/client.js"
      data-repo={repo}
      data-repo-id={repoId}
      data-category-id={categoryId}
      data-mapping="pathname"
      data-lang="ko"
      crossorigin="anonymous"
      async
    ></script>
  ) : null
}
```

핵심은 값이 빠졌을 때는 렌더링하지 않도록 `enabled` 체크를 넣는 부분이었습니다.  
이렇게 해두면 빌드나 페이지 렌더링이 불안정해지는 문제를 줄일 수 있었습니다.

## 글 상세 페이지에 댓글 컴포넌트 연결

글 페이지 파일(`src/pages/[slug].astro`)에서 본문 아래에 컴포넌트를 한 줄 추가하면 됩니다.

```astro
<GiscusComments />
```

이 방식으로 붙이면 모든 게시글 상세 페이지에서 동일하게 댓글이 노출됩니다.

## GitHub Pages 배포 시 환경 변수 넣기

로컬 개발에서는 `.env`에 값을 넣고,  
배포는 GitHub Actions(`.github/workflows/deploy.yml`)의 `Build` 단계 `env`에 넣었습니다.

현재 제 설정은 아래처럼 들어가 있습니다.

- `PUBLIC_GISCUS_REPO=jkgooooooo/blog`
- `PUBLIC_GISCUS_REPO_ID=...`
- `PUBLIC_GISCUS_CATEGORY=Comments`
- `PUBLIC_GISCUS_CATEGORY_ID=...`
- `PUBLIC_GISCUS_MAPPING=pathname`
- `PUBLIC_GISCUS_REACTIONS_ENABLED=1`
- `PUBLIC_GISCUS_THEME=preferred_color_scheme`
- `PUBLIC_GISCUS_LANG=ko`

여기 값이 빠져 있으면 배포 후 댓글이 안 보일 수 있어서, 워크플로우에 명시하는 방식이 제일 안정적이었습니다.

## 적용하면서 체크한 포인트

- 댓글이 안 뜨면 먼저 `repo-id`, `category-id` 누락 여부를 확인했습니다.
- URL 매핑은 `pathname` 기준으로 맞췄습니다. (블로그 주소 구조와 맞추기 편했습니다.)
- Discussions 카테고리 이름/ID가 바뀌면 댓글 연결이 끊길 수 있어서, 이 부분도 같이 점검했습니다.
- 카테고리를 새로 만들었다면 Giscus 설정의 `category` / `category-id`를 반드시 다시 복사해서 반영해야 했습니다.

지금은 글 하단에서 바로 댓글 작성이 가능해서, 피드백을 받는 흐름이 훨씬 편해졌습니다.

## 출처

- <a href="https://giscus.app/ko" target="_blank" rel="noopener noreferrer">Giscus 공식 사이트</a>
- <a href="https://github.com/giscus/giscus" target="_blank" rel="noopener noreferrer">giscus GitHub 저장소</a>
