---
title: "UIDesignRequiresCompatibility iOS 26 리퀴드 글래스 자동 적용 관련 정리"
description: "UIDesignRequiresCompatibility 키의 역할, 적용 방법, 제거 시점까지 한 번에 정리했습니다."
pubDate: "2026-02-26"
draft: false
category: "iOS"
tags: ["iOS", "Xcode", "UIKit", "SwiftUI", "UIDesignRequiresCompatibility"]
---

# UIDesignRequiresCompatibility iOS 26 리퀴드 글래스 자동 적용 관련 정리

## 리퀴드 글래스(Liquid Glass)란?

WWDC 2025에서 Apple이 공개한 새로운 디자인 언어입니다.  
2013년 iOS 7 플랫 디자인 이후 가장 큰 시각적 변화라는 평가를 받고 있습니다.

핵심 특징:

- 반투명 유리 질감의 UI 요소 (내비게이션 바, 탭 바, 위젯 등)
- 배경 콘텐츠를 굴절·반사하는 글래스모피즘 효과
- visionOS에서 영감을 받은 깊이감 있는 레이어 구조
- iOS 26, iPadOS 26, macOS 26(Tahoe) 등 전 플랫폼 적용

Xcode 26 SDK로 빌드하면 기본적으로 리퀴드 글래스 디자인이 자동 적용됩니다.

## UIDesignRequiresCompatibility가 무엇인가요?

`Info.plist`에 추가하는 Boolean 키입니다.

> A Boolean value that indicates whether the system runs the app using a compatibility mode for UI.  
> — Apple Developer Documentation

쉽게 말해, 아직 새 디자인에 완전히 대응하지 못한 앱을 호환 모드로 실행해 달라고 시스템에 알려주는 플래그입니다.

## 어떤 기능을 하나요?

| 값 | 동작 |
|---|---|
| `YES` (`true`) | 호환 모드로 실행. 이전 SDK 빌드와 유사한 UI 표시 |
| `NO` (`false`) 또는 미설정 | 리퀴드 글래스 디자인 적용 (기본값) |

`YES`로 설정하면 아래 요소가 기존 스타일에 가깝게 유지됩니다.

- 내비게이션 바: 불투명한 기존 스타일
- 탭 바: 기존 탭 바 스타일
- 시스템 컨트롤: 버튼, 세그먼트 컨트롤 등
- 앱 아이콘: 레이어드 아이콘 효과 비적용

## 왜 필요할까요?

1. 기존 UI가 깨질 수 있습니다.  
   반투명 효과가 기존 커스텀 UI와 충돌하면 가독성 저하나 레이아웃 깨짐이 생길 수 있습니다.

2. 대응 시간을 확보할 수 있습니다.  
   커스텀 UI가 많은 앱은 새 디자인 대응에 시간이 필요합니다.

3. 사용자 경험을 안정적으로 지킬 수 있습니다.  
   어설프게 새 스타일을 적용하는 것보다, 검증된 기존 UI가 나은 경우가 많습니다.

## 어떤 경우에 사용하면 좋을까요?

### 사용을 권장하는 경우

- 커스텀 내비게이션 바/탭 바를 많이 쓰는 앱
- 배경색/대비를 세밀하게 제어하는 화면이 많은 앱
- 반투명 효과로 텍스트 가독성이 떨어지는 경우
- 디자인 리팩토링 시간이 필요한 경우
- QA 없이 바로 리퀴드 글래스를 적용하기 어려운 경우

### 사용하지 않아도 되는 경우

- 시스템 기본 UI 컴포넌트 중심으로 구성된 앱
- SwiftUI 기반으로 시스템 스타일을 잘 따르는 앱
- 리퀴드 글래스 대응이 이미 끝난 앱

## 적용 방법

### 방법 1: Xcode GUI에서 설정

1. `Info.plist` 열기
2. `+` 버튼으로 Row 추가
3. Key: `UIDesignRequiresCompatibility`
4. Type: `Boolean`
5. Value: `YES`

### 방법 2: Source Code(XML)로 직접 추가

```xml
<key>UIDesignRequiresCompatibility</key>
<true/>
```

## 앞으로는 어떻게 대응하면 좋을까요?

중요: 이 키는 임시 조치입니다. Apple 공식 문서에서도 임시 사용을 안내하고 있습니다.

권장 대응 순서:

1. 즉시: `UIDesignRequiresCompatibility`를 `YES`로 설정해 앱 안정성 확보
2. 단기(iOS 26 기간): 리퀴드 글래스 대응 작업 시작
   - 내비게이션 바, 탭 바 등 주요 컴포넌트부터 대응
   - 커스텀 UI의 반투명 배경 가독성 테스트
   - `UINavigationBarAppearance`, `UITabBarAppearance` 등 최신 API 적용
3. 중기: 점진적으로 리퀴드 글래스 적용 범위 확대
4. iOS 27 출시 전: `UIDesignRequiresCompatibility` 키 제거 및 완전 대응

## 언제 제거되나?

| 시점 | 상태 |
|---|---|
| iOS 26 / Xcode 26 (2025~) | 사용 가능 |
| iOS 27 / Xcode 27 (2026 예상) | 제거 예정 |

Apple은 Xcode 27부터 이 키를 제거할 계획이라고 안내하고 있습니다.

## 제거되면 개발자는 뭘 해야 하나?

1. 리퀴드 글래스 완전 대응이 필요합니다.  
   opt-out이 불가능해지므로 모든 UI가 새 디자인에서 정상 동작해야 합니다.

2. 점검 항목
   - `UINavigationBar` 커스텀 스타일 테스트
   - `UITabBar` 커스텀 배경과의 조화 확인
   - 커스텀 뷰 배경색의 가독성 확인
   - 앱 아이콘 레이어드 구조 대응
   - 위젯 UI의 가독성/레이아웃 점검

3. 최신 API 채택
   - `UINavigationBarAppearance`, `UITabBarAppearance` 사용
   - SwiftUI의 `.glassEffect()` 등 새 모디파이어 활용
   - 시스템 머티리얼(`UIBlurEffect`) 기반 반투명 배경 적용

4. `Info.plist`에서 키를 삭제합니다.

## 정리

| 항목 | 내용 |
|---|---|
| 키 이름 | `UIDesignRequiresCompatibility` |
| 타입 | Boolean |
| 역할 | 리퀴드 글래스 디자인 비활성화(호환 모드) |
| 기본값 | `NO` (리퀴드 글래스 적용) |
| 지원 플랫폼 | iOS 26+, iPadOS 26+, macOS 26+, tvOS 26+ |
| 성격 | 임시 opt-out (temporary) |
| 제거 예정 | Xcode 27 / iOS 27 (2026년 가을 예상) |
| 대응 전략 | 지금 설정 → 점진 대응 → iOS 27 전 제거 |

팁: 급하게 리퀴드 글래스를 적용하기보다, 이 키로 시간을 확보하고 단계적으로 대응하는 편이 안전합니다. 다만 iOS 27 출시 전까지는 완전 대응을 목표로 잡는 것이 좋습니다.

## 출처

- <a href="https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility" target="_blank" rel="noopener noreferrer">Apple Developer Documentation - UIDesignRequiresCompatibility</a>
