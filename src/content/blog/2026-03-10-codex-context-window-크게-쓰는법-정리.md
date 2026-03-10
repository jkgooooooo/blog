---
title: "Codex에서 context window 크게 쓰는 법 정리"
description: "GPT-5.4가 1M context를 지원한다는데 왜 Codex에서는 258K로 보이는지, 크게 쓸 때 장단점과 설정 방법을 정리했습니다."
pubDate: "2026-03-10"
draft: false
category: "AI"
tags: ["AI", "Codex", "GPT-5.4", "Context Window", "OpenAI"]
---

Reddit에서 “GPT-5.4는 1M context를 지원한다는데, Codex에서는 왜 258K 정도로만 보이냐”는 글이 올라온 걸 봤습니다.  
저도 처음에는 그냥 플랜 제한인가 싶었는데, 공식 문서까지 같이 보니 이건 단순히 “지원하냐/안 하냐” 문제가 아니라 실제로 어떻게 설정하고, 어디까지 쓰는 게 현실적인가의 문제에 더 가깝더라고요.

결론부터 말하면 GPT-5.4는 공식 발표 기준으로 최대 1M context를 지원합니다.  
다만 Codex에서는 기본값, 자동 compaction, 품질 저하 구간을 같이 고려해서 써야 하고, 무조건 최대로 키운다고 항상 좋은 건 아니었습니다.

## 핵심 요약

- GPT-5.4는 OpenAI 공식 발표 기준으로 최대 1M tokens context를 지원합니다.
- Codex에서는 `config.toml`에서 `model_context_window`와 `model_auto_compact_token_limit`를 직접 조정할 수 있습니다.
- context를 크게 잡으면 긴 작업, 큰 코드베이스, 긴 문서 작업에서 유리하지만, 후반부로 갈수록 품질 저하와 비용/지연 문제가 생길 수 있습니다.
- 그래서 실제 사용은 “최대한 크게”보다 “필요한 만큼 크게 + 적당한 시점에 compaction”이 더 실용적입니다.

## Reddit 글에서 나온 포인트

1. Reddit 글 작성자는 Pro 요금제에서 GPT-5.4를 쓰는데 Codex UI에 258K context window 정도만 보여서, 1M 지원이 맞는지 물었습니다.
2. 댓글 중 하나는 `config.toml`에 `model_context_window=800000`, `model_auto_compact_token_limit=700000`을 넣어 직접 조정할 수 있다고 설명했습니다.
3. 반대로 다른 의견에서는 258K를 넘기면 모델 품질이 급격히 떨어질 수 있으니, 무조건 크게 잡기보다 compaction을 잘 쓰는 쪽이 낫다는 이야기도 나왔습니다.
4. 즉, 이 스레드의 핵심은 “1M 지원”과 “1M을 실제로 끝까지 안정적으로 쓰는 것”은 다른 문제라는 점이었습니다.

## context를 크게 가져가면 뭐가 좋을까

1. 긴 코드베이스를 한 번에 물고 갈 수 있습니다.  
여러 파일, 긴 히스토리, 이전 시도까지 같이 들고 가야 하는 작업에서는 context가 넓을수록 대화가 덜 끊깁니다.

2. 장기 작업에서 앞 문맥이 덜 날아갑니다.  
초반 요구사항, 중간 결정 사항, 마지막 검증 기준을 하나의 세션 안에서 계속 유지하기가 더 쉬워집니다.

3. 문서/리서치 작업에서 스위칭이 줄어듭니다.  
긴 문서 여러 개를 요약하거나 비교할 때, 중간에 요약본을 따로 만들지 않아도 되는 경우가 많습니다.

4. 에이전트형 작업에서 계획 유지가 좋아집니다.  
OpenAI 발표에서도 GPT-5.4를 긴 호라이즌 작업과 컴퓨터 사용 워크플로우에 맞춘 모델로 설명했고, 긴 작업을 계획-실행-검증까지 이어가는 쪽을 강조했습니다.

## 단점도 분명히 있습니다

1. 뒤로 갈수록 품질이 떨어질 수 있습니다.  
지원 토큰 수와 실제로 안정적으로 답을 유지하는 구간은 다를 수 있습니다. Reddit에서도 이 부분을 많이 지적하고 있었습니다.

2. 지연 시간이 늘어납니다.  
입력 토큰이 많아질수록 응답 시작이 느려지고, 긴 작업에서는 체감이 꽤 커질 수 있습니다.

3. 불필요한 문맥까지 같이 끌고 갈 위험이 있습니다.  
예전 시도, 이미 폐기한 방향, 중복된 요구사항이 계속 남아 있으면 오히려 모델이 덜 또렷해질 수 있습니다.

4. 비용도 커질 수 있습니다.  
API 기준으로는 입력 토큰이 늘면 비용이 바로 올라가고, 앱에서도 실제 작업 체감 속도와 효율이 나빠질 수 있습니다.

## Codex에서 크게 쓰려면 어떻게 설정하나

OpenAI Codex 공식 설정 문서에는 아래 두 키가 나옵니다.

- `model_context_window`: 현재 모델에 사용할 context window token 수
- `model_auto_compact_token_limit`: 자동 history compaction이 시작되는 기준 token 수

예를 들어 `config.toml`에서는 이런 식으로 둘 수 있습니다.

```toml
model = "gpt-5.4"
model_context_window = 800000
model_auto_compact_token_limit = 700000
```

이 설정의 의미는 단순합니다.

1. 최대 context는 80만 토큰까지 쓰되
2. 70만 토큰쯤 가면 자동 compaction을 시작해서
3. 끝까지 꽉 채운 상태로 밀어붙이지 않겠다는 뜻입니다.

Reddit 댓글에서도 비슷하게 “최대치 바로 직전까지 가기보다 여유를 남기는 편이 낫다”는 식으로 설명하고 있었습니다.

## 그럼 얼마나 크게 쓰는 게 현실적일까

제 생각에는 이렇게 나누는 게 가장 실용적입니다.

1. 일반 코딩/문서 작업  
200K~300K 정도만 써도 충분한 경우가 많습니다.

2. 큰 레포를 길게 붙잡는 작업  
500K~800K 정도까지 올릴 가치는 있습니다. 다만 compaction 기준도 같이 올려야 합니다.

3. 정말 긴 에이전트형 작업  
1M은 “가능한 최대치”로 보고, 기본값처럼 쓰기보다는 실험적으로 접근하는 게 맞아 보입니다.

즉, “1M 지원”은 분명 장점이지만, 실사용 기본값은 1M보다 더 보수적으로 잡는 편이 안정적입니다.

## 제 기준으로 정리하면

- 긴 작업이 자주 끊겨서 답답하면 context를 키울 이유는 충분합니다.
- 대신 끝까지 꽉 채워 쓰기보다, compaction 기준을 같이 조절해서 문맥을 정리해가며 쓰는 쪽이 낫습니다.
- 결국 중요한 건 숫자 자체보다 “얼마나 긴 작업을 덜 흔들리게 이어갈 수 있느냐”인 것 같습니다.

## 출처

- <a href="https://www.reddit.com/r/codex/comments/1rlyuy6/only_getting_258k_context_window_on_pro_with/" target="_blank" rel="noopener noreferrer">Reddit - only getting 258K context window on Pro with GPT-5.4 in Codex</a>
- <a href="https://developers.openai.com/codex/config-reference/" target="_blank" rel="noopener noreferrer">OpenAI Developers - Codex Configuration Reference</a>
- <a href="https://openai.com/index/introducing-gpt-5-4/" target="_blank" rel="noopener noreferrer">OpenAI - Introducing GPT-5.4</a>
