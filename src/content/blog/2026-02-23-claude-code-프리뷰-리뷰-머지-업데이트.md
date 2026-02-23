---
title: "Claude Code 데스크톱에 프리뷰/리뷰/머지 기능이 추가됐습니다"
description: "Claude Code 데스크톱 업데이트에서 앱 프리뷰, 코드 리뷰, PR 자동화까지 한 번에 정리했습니다."
pubDate: "2026-02-23"
draft: false
category: "AI"
tags: ["AI", "Claude", "Anthropic", "DevTool"]
canonicalURL: "https://claude.com/blog/preview-review-and-merge-with-claude-code"
---

Claude Code 데스크톱 업데이트가 올라와서 핵심만 정리해봤습니다.

## 핵심 요약

- 이번 업데이트의 방향은 코드 작성 이후 단계(PR 확인, 수정, 머지)까지 한 화면에서 이어가게 만드는 것입니다.
- 데스크톱에서 실행 화면 프리뷰, 로컬 코드 리뷰, PR 상태 추적/자동 처리 기능이 추가됐습니다.
- CLI, 데스크톱, 웹/모바일 사이에서 세션을 이어서 쓰는 흐름도 같이 강화됐습니다.

## 기사 내용

1. 데스크톱 앱에서 개발 서버를 띄우고 실행 중인 앱 화면을 바로 프리뷰할 수 있게 됐습니다.
2. Claude가 UI와 콘솔 로그를 함께 보고 에러를 잡아가며 반복 수정하는 흐름을 지원합니다.
3. 새 `Review code` 버튼으로 로컬 diff를 점검하고, 버그 가능성이나 개선 포인트를 인라인 코멘트로 보여줍니다.
4. GitHub 저장소 기준으로는 PR의 CI 통과/실패 상태를 데스크톱 안에서 추적할 수 있습니다.
5. `auto-fix`를 켜면 CI 실패를 감지했을 때 Claude가 자동 수정 시도를 하고, `auto-merge`를 켜면 체크 통과 후 머지까지 이어집니다.
6. CLI에서 `/desktop` 명령으로 데스크톱에 컨텍스트를 가져오거나, 데스크톱 세션을 웹/모바일로 넘겨 이어서 작업할 수 있습니다.
7. Anthropic 설명으로는 이 기능들이 현재 모든 사용자에게 바로 제공되며, 데스크톱 앱 업데이트 후 사용할 수 있다고 합니다.

## 코멘트

- 개인적으로는 “코드 작성”보다 “작성 이후 정리 작업”에 드는 시간이 줄어드는지가 가장 큰 포인트로 보였습니다.
- 특히 로컬 리뷰 + PR 상태 추적 + 자동 수정/머지까지 한 곳에서 이어지는 흐름은 팀 작업에서 체감이 클 것 같습니다.
- 앞으로는 모델 성능 경쟁 못지않게, 이런 개발 워크플로우 통합이 실제 생산성을 더 크게 좌우할 것 같네요.

## 출처

- <a href="https://claude.com/blog/preview-review-and-merge-with-claude-code" target="_blank" rel="noopener noreferrer">Claude Blog - Preview, Review, and Merge with Claude Code</a>
