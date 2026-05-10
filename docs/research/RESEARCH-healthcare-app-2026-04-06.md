# Personal Healthcare (운동) 관리 어플리케이션 — 팀 리서치 보고서

> **생성일**: 2026-04-06  
> **참여 에이전트**: tech-researcher, architecture-researcher, market-researcher, 팀 리더  
> **깊이**: 기본 (4개 에이전트)  
> **입력 문서**: `D:\workspace\프로젝트 관련파일\헬스케어 어플리케이션 리서치 명령 프롬프트_20260330.md`

---

## Executive Summary

### 프로젝트 실현 가능성 평가: **높음**

헬스케어/피트니스 앱 시장은 2027년 약 5,000억 달러 규모로 성장 전망이며, 한국 시장만 2025년 1~8월 매출 1,600만 달러(약 215억 원)를 기록하며 강한 성장세를 보이고 있다. 기술적으로도 공공 API(식약처, 농진청), 웨어러블 연동(HealthKit/Health Connect), 체성분 측정(InBody LookinBody API) 등 핵심 인프라가 모두 갖춰져 있어 MVP 단계 진입에 기술적 장벽이 낮다.

### 핵심 기회 요인

1. **경쟁 제품의 구조적 공백**: 국내에서 식단(밀리그램) + 운동(플랜핏) + 리워드(챌린저스/캐시워크)가 모두 분산되어 있으며, 이를 통합한 서비스가 없음
2. **Before→Now→After 여정 시각화**: 신체 변화를 사진+그래프+아바타로 통합 제공하는 앱이 부재
3. **AI 개인화의 표준화**: AI가 기본 기능으로 격하되는 추세에서, "목표 기반 종합 플랜 자동 생성"이 차별화 가능
4. **금전 리워드 없는 저비용 동기부여**: 스트릭+배지+소셜 공유 조합으로 캐시워크/챌린저스 대비 낮은 운영비로 동기부여 가능

### 핵심 리스크

1. **법적 리스크**: 디지털의료제품법(2025.01 시행) + AI 기본법(2026.01 시행) 준수 필요 — 질병 진단/처방 기능 포함 시 의료기기 인허가 대상
2. **경쟁 심화**: MyFitnessPal, Noom 등 글로벌 대형 앱과 국내 캐시워크(2,900만 DL), 챌린저스(150억 매출) 등 기존 강자 존재
3. **리텐션 확보**: 피트니스 앱 90일 내 이탈율 69% — 스트릭 파괴 시 이탈 방지 설계 필수

### 우선 개발 추천 기능 Top 5

| 순위 | 기능 | 근거 |
|---|---|---|
| 1 | Before 신체 정보 입력 + 목표 설정 + 식단·운동 종합 플랜 자동 생성 | 경쟁사 공백, 핵심 차별화 |
| 2 | Daily 운동/식단 이행 체크 + 연속 스트릭 | 리텐션 핵심 메커니즘 |
| 3 | 체중/측정 기록 + 변화 추이 차트 (Before→Now 시각화) | 자기효능감, 동기부여 |
| 4 | 기본 리워드 시스템 (배지, 스트릭, 레벨업) | 저비용 고효과 |
| 5 | 오프라인 퍼스트 로컬 저장 + 백그라운드 동기화 | 운동 중 끊김 대응 필수 |

---

## 체크포인트 1: 유사 시스템 분석

### 국내 앱 비교

| 항목 | 캐시워크 | 챌린저스 | 밀리그램 | 플랜핏 |
|---|---|---|---|---|
| **타겟** | 전 연령 (50대+ 40%) | 20~30대 자기관리 | 2030 여성 다이어트 | 헬스 입문~중급자 |
| **핵심 기능** | 만보기, 포인트 캐시백, 팀 챌린지 | 챌린지 참여비 → 달성 시 환급+상금 | 식단 사진 기록, AI 코칭, 맞춤 식단 | AI 운동 루틴, 헬스장 기구 DB, 자세 가이드 |
| **수익 모델** | 광고, 커머스, 잠금화면 광고 | 실패자 참가비 수수료 + 제휴 쇼핑 | 프리미엄 구독 + AI 코칭 | 프리미엄 구독 |
| **Before/After** | 걸음 수 그래프 | 챌린지 인증 사진 | 체중 추이 그래프, 식단 갤러리 | 운동 볼륨 히트맵 |
| **강점** | 2,900만 DL, 금전 리워드 | 행동경제학 설계, 2024 매출 150억 | 사진 식단 기록, 75% 평균 2.9kg 감량 | AI 맞춤 루틴, 글로벌 $500만 매출 |
| **약점** | 운동/식단 기능 부재 | 헬스케어 정체성 희석 | 운동 추천 미흡 | 식단 관리 없음, 리워드 없음 |
| **평점** | 4.5+ | 4.0 | 4.8 | 4.5+ |

### 해외 앱 비교

| 항목 | MyFitnessPal | Noom | Nike Training Club | JEFIT | Lose It! | Fitbit |
|---|---|---|---|---|---|---|
| **핵심 기능** | 600만 음식DB, 바코드 스캔 | CBT 기반 코칭, GLP-1 연계 | 무료 워크아웃 영상 | 1,300+ 운동 라이브러리 | AI 음성 로그, 사진 식단 | Gemini AI 코치, 수면 추적 |
| **가격** | 프리미엄 $19.99/월 | $17.42/월(연간) | 완전 무료 | Elite $69.99/년 | 프리미엄 ~$39.99/년 | 프리미엄 $10/월 |
| **강점** | 최대 음식DB | 심리학 기반, 78% 16주 유지 | 무료 고품질 | 웨이트 특화 | 가성비 | Google 통합 |
| **약점** | 유료화 불만 급증 | 가격 불투명, 코칭 편차 | 개인화 부재 | 광고 과다 | 운동 추천 미흡 | 브랜드 정체성 희석 |

### 기능 매트릭스

| 기능 | 캐시워크 | 챌린저스 | 밀리그램 | 플랜핏 | MFP | Noom | NTC | JEFIT |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 운동 추천/루틴 | X | X | △ | O | △ | △ | O | O |
| 식단 추적 | X | X | O | X | O | O | X | X |
| 목표 설정 (Before) | X | △ | O | O | O | O | O | O |
| Before/After 시각화 | X | △ | △ | △ | △ | △ | X | △ |
| 금전적 리워드 | O | O | X | X | X | X | X | X |
| 배지/게이미피케이션 | △ | △ | X | X | O | O | O | O |
| 스트릭(Streak) | △ | O | X | O | O | O | O | O |
| 커뮤니티 | O | O | O | X | △ | O | X | O |
| AI 코칭 | X | X | O | O | △ | O | X | X |
| 웨어러블 연동 | △ | X | X | X | O | X | △ | O |

*(O 지원, △ 부분 지원/유료, X 미지원)*

### 경쟁 공백에서 도출한 인사이트

1. **식단 + 운동 + 리워드 통합 앱이 존재하지 않음** → 가장 큰 차별화 기회
2. **Before→After 신체 변화 시각화를 전문적으로 제공하는 국내 앱 없음**
3. **목표 기반 AI 종합 플랜(식단+운동 패키지)** 자동 생성은 미개척 영역
4. **Daily 이행 체크의 마찰 최소화** (30초 이내 기록) → UX 차별화 가능

---

## 체크포인트 2: 공공 API 및 데이터 소스

### 식단/영양 관련 API

| API | 제공 기관 | 비용 | 데이터 범위 | 호출 제한 | 한국 음식 | 활용도 |
|---|---|---|---|---|---|---|
| **식약처 식품영양성분 DB** | 식품의약품안전처 | 무료 (API Key) | 식품명, 에너지, 탄단지, 미량영양소 | 일 1,000회 (증량 가능) | 매우 높음 | **핵심 DB** |
| **농진청 메뉴젠 API** | 농촌진흥청 | 무료 (API Key) | 음식코드, 분류, 중량, 재료, 조리법, 이미지 | 포털 기준 | 매우 높음 | **식단 추천용** |
| **전국통합식품영양성분** | 행정안전부 | 무료 | 음식별 식품재료량, 영양성분 통합 | N/A (파일 중심) | 높음 | 보완 |
| **USDA FoodData Central** | USDA | 무료 (API Key) | 브랜드 식품, 원재료, 조사 데이터 | 3,600 req/시간 | 낮음 | 수입식품 보완 |
| **Edamam API** | Edamam | 무료~$999/월 | 900K+ 식품, 2.3M 레시피, 150+ 영양소 | 10,000 req/월 (무료) | 중간 | 글로벌 확장용 |
| **Nutritionix API** | Nutritionix | 유료 전용 | 1.9M+ 식품, 바코드, 자연어 | 유료 플랜별 | 낮음 | 비추천 |

**권장**: 식약처 DB + 농진청 메뉴젠 조합이 한국 서비스 최적. USDA/Edamam은 글로벌 확장 시 보완용.

### 운동/칼로리 소모량

| 항목 | 내용 |
|---|---|
| **MET 데이터베이스** | 2024 Adult Compendium of Physical Activities — 1,114종 운동, 82% 실측 MET, **상업적 이용 무료** |
| **칼로리 계산 공식** | `칼로리/분 = MET × 3.5 × 체중(kg) / 200` (±10~15% 오차) |

### BMR 계산식 비교

| 공식 | 입력값 | 정확도 | 권장 적용 |
|---|---|---|---|
| Harris-Benedict | 성별, 나이, 키, 체중 | 69% | 레거시 호환 |
| **Mifflin-St Jeor** | 성별, 나이, 키, 체중 | **82%** | **일반 사용자 기본값** |
| Katch-McArdle | 제지방량 (LBM) | 체성분 보유 시 최고 | **InBody 연동 후 고도화** |

**TDEE**: BMR × 활동 계수 (Sedentary 1.2 ~ Very Active 1.9)

### 건강 데이터 연동

| 플랫폼 | 비용 | RN 라이브러리 | 수집 가능 데이터 | 주의사항 |
|---|---|---|---|---|
| **Apple HealthKit** | 무료 | `react-native-health` | 걸음, 심박, 수면, 운동, 체중, 혈압 | Expo Go 미지원, dev-client 필수 |
| **Google Health Connect** | 무료 | `react-native-health-connect` | 걸음, 심박, 수면, 운동, 체중, 칼로리 | Health Connect 앱 설치 필요, Android 8.0+ |
| **Terra API** (통합) | $399~499/월 | 공식 SDK | 99%+ 웨어러블 지원 | 초기 비용 과다 — Phase 3 도입 권장 |

---

## 체크포인트 3: InBody 연동

### 연동 방식 비교

| 방식 | 조건 | 획득 데이터 | 기술 난이도 | 비용 | 실용성 |
|---|---|---|---|---|---|
| **LookinBody Web API** | InBody 기기 + 구독 ($25~30/월/기기) | 체중, SMM, BFM, BMI, VFA, TBW, 위상각, SMI, 분절별 체성분 | 중간 (REST) | 기기당 $25~30/월 | 헬스장 파트너십용 |
| **Mobile SDK (BLE)** | B2B 문의 필요 | 기기 모델별 상이 | 높음 | 별도 협의 | 가정용 InBody 보유자 |
| **HealthKit/HC 간접** | InBody 앱 사용 | 체중, BMI (제한적) | 낮음 | 무료 | 데이터 항목 매우 제한 |
| **Terra API 경유** | Terra 구독 | LookinBody 범위 동일 | 낮음~중간 | $399~499/월 | 초기 비용 과다 |

### InBody 대안: 스마트 체중계

| 제품 | API | 데이터 | Health 앱 연동 | 기기 가격 | API 비용 |
|---|---|---|---|---|---|
| **Withings Body+/Comp** | **OAuth 2.0 REST API** | 체중, 체지방률, 근육량, 수분, 골밀도, 내장지방 | HealthKit/HC 자동 | $99~199 | **무료** |
| Xiaomi 체성분계 | 없음 | 체중, 체지방률, BMI | Samsung Health/Mi Fit | $30~80 | N/A |
| Eufy Smart Scale | 없음 | 체중, 체지방률, BMI | Apple Health | $30~100 | N/A |

**권장 전략**: MVP는 **Withings API + HealthKit/Health Connect** 조합 → InBody는 프리미엄 기능(헬스장 파트너십)으로 Phase 2 도입

---

## 체크포인트 4: 리워드 시스템

### 리워드 유형 매트릭스

| 리워드 유형 | 구현 난이도 | 운영 비용 | 동기부여 효과 | 장기 지속성 | 권장 Phase |
|---|:---:|:---:|:---:|:---:|:---:|
| **배지/트로피/칭호** | 낮음 | 없음 | 중간 | 낮음 | Phase 1 (MVP) |
| **레벨업/경험치 (XP)** | 낮음~중간 | 없음 | 중간~높음 | 중간 | Phase 1 (MVP) |
| **연속 스트릭(Streak)** | 낮음 | 없음 | **높음** (손실 회피) | 중간 | **Phase 1 (MVP)** |
| **Before/After 시각화** | 중간 | 없음 | **높음** | 높음 | Phase 1~2 |
| **커뮤니티 랭킹/리더보드** | 중간 | 없음 | 중간 | 중간 | Phase 2 |
| **소셜 공유 (SNS 카드)** | 낮음 | 없음 | 중간 | 중간 | Phase 2 |
| **포인트 → 실물 보상** | 높음 | 높음 | 매우 높음 | 높음 | Phase 3 |
| **제휴 할인 쿠폰** | 중간 | 중간 | 높음 | 중간 | Phase 2~3 |
| **챌린지 참여비 환급** | 높음 | 중간 | **매우 높음** | 높음 | Phase 3 |
| **보험사 연계** | 매우 높음 | 낮음 | 높음 | 높음 | Phase 3+ |

### 리워드 심리학 핵심

- **손실 회피**: 스트릭은 "얻는 기쁨"보다 "잃는 고통"(2배)을 활용 → 가장 비용 대비 효과적
- **가변 비율 보상**: 언제 보상이 올지 모를 때 가장 강한 지속 행동 유발 (챌린저스 뷰티래플 원리)
- **외재적 동기의 한계**: 금전 리워드 과도 시 내재적 동기 잠식 (과잉정당화 효과)
- **게이미피케이션 포화**: 기능 과다 시 정보 과부하로 이탈율 증가 (S자 곡선)
- **실증 데이터**: 게이미피케이션+AI 통합 앱 30일 리텐션 25~30% (일반 8~12% 대비 2.5배)
- **스트릭 피로 대응**: "회복 챌린지"(7일 내 재참여 시 스트릭 복구) 설계 필수

### 리워드 설계 권장안

**Phase 1 (MVP) — 저비용 고효과:**
- 연속 스트릭 + 스트릭 회복 메커니즘 (Streak Freeze)
- 기본 배지/칭호 (첫 운동, 7일 연속, 목표 체중 달성 등)
- XP/레벨업 시스템 (운동 완료, 식단 기록, 목표 달성 시 XP 적립)

**Phase 2 — 소셜 + 경쟁:**
- 커뮤니티 랭킹/리더보드
- SNS 공유 자동 카드 생성 (Before→Now 변화율 포함)
- 기간별 챌린지 (주간/월간 목표 달성 시 특별 배지)

**Phase 3 — 수익화 연계:**
- 제휴 쿠폰 (헬스장, 건강식품)
- 챌린지 참여비 환급 모델
- 보험사 B2B 연계 검토

---

## 체크포인트 5: Before/After 시각화 기술

### 시각화 방식 비교

| 방식 | 기술 스택 | 개발 비용 | 사용자 심리 | 법적 리스크 | 정확도 | 권장 Phase |
|---|---|---|---|---|---|---|
| **그래프/차트 수치 시각화** | Chart.js, Victory Native, Recharts | 낮음 | 긍정 (객관적) | 없음 | 높음 (실측 기반) | **Phase 1** |
| **사진 비교 (사용자 업로드)** | React Native Camera, S3 | 낮음~중간 | 높음 (실제 변화) | 초상권 동의 필요 | 높음 (실사) | **Phase 1** |
| **일러스트/캐릭터 아바타** | Ready Player Me API, 자체 2D | 중간~높음 | 긍정 (부담 적음) | 낮음 | 낮음 (추상화) | Phase 2 |
| **3D 바디 스캔 모델** | 3DLOOK API, BodyMorpher | 높음 | 높음 (몰입감) | 중간 (개인정보) | 96~97% (3DLOOK) | Phase 3 |
| **AI 실사 체형 예측** | GAN, Diffusion Model, 자체 서버 | 매우 높음 | 양면적 (기대/불안) | **높음** (딥페이크 규제, 초상권) | 중간 | Phase 3 (유료 전용) |

### 주요 기술/플랫폼 현황

| 플랫폼 | 특징 | API 가용성 |
|---|---|---|
| **3DLOOK** | AI 기반 3D 바디 스캔, 체중 예측 오차 3.5%, 측정 96~97% 정확도 | API 제공 (B2B) |
| **BodyMorpher** | 3D 디지털 트윈, 7/30/90일 시뮬레이션 | 앱 전용 (API 미제공) |
| **Ready Player Me** | bodyType 파라미터, Morph Targets, full-body/half-body | REST API + Unity/Unreal SDK |
| **Zepeto** | body modifier API, 캐릭터 체형 변형 | World SDK |
| **바디닷(Bodydot)** | 3D 센서 기반 AI 체형분석, CES 2025 혁신상 | B2B (기기 필요) |

### 권장 전략

**Phase 1**: 그래프/차트 + 사진 비교 (저비용, 고효과)
- 체중/체지방/골격근 변화 추이 차트 (fl_chart)
- 사용자 진행 사진 업로드 + Before vs Now 슬라이더 비교
- "Before 대비 현재" 진행률 게이지 (%)

**Phase 2**: 캐릭터/아바타 시각화
- Ready Player Me API 연동 또는 자체 2D 실루엣 아바타
- 체형 파라미터(키, 몸무게, 허리둘레) 기반 아바타 변형
- 사용자 선택 옵션 (그래프 vs 사진 vs 아바타)

**Phase 3**: AI 실사 예측 (유료 전용)
- 3DLOOK API 또는 자체 Diffusion Model
- 법적 이슈 대응 필수 (동의서, AI 생성물 표시)

---

## 체크포인트 6: 서비스 확장 및 유/무료 모델

### 프리미엄 기능 매트릭스

| 기능 영역 | 무료 (Free) | 유료 (Premium) |
|---|---|---|
| 온보딩 | 기본 신체 정보 입력 | AI 기반 체형 분석 |
| 운동 추천 | 일반 루틴 템플릿 (주 3회) | AI 맞춤 루틴 (일별 자동 생성) |
| 식단 추천 | 기본 칼로리 가이드 | 매크로 기반 맞춤 식단 |
| 기록 열람 | 최근 30일 | 무제한 (전체 이력) |
| 리워드 | 기본 배지, 7일 스트릭 | 고급 리워드, 리더보드 |
| 분석 리포트 | 주간 요약 | 월간 심층 분석 + 체성분 트렌드 |
| Before/After | 사진 업로드 비교 + 차트 | AI 실사 예측 시뮬레이션 |
| 커뮤니티 | 읽기 전용 | 포스팅, 챌린지 참여 |
| 1:1 상담 | 없음 | 트레이너/영양사 채팅 |
| 광고 | 있음 | 없음 |
| 웨어러블 연동 | HealthKit/HC 기본 | Garmin, Whoop, Oura 확장 |

### 수익 모델 비교

| 모델 | 헬스케어 적합성 | 구현 난이도 | 국내 전환율 | 권장 |
|---|---|---|---|---|
| **구독형 (월/연)** | 최우선 | 중간 | B2C SaaS 2~5% | **Phase 1부터 도입** |
| 일회성 구매 | 비추천 | 낮음 | - | 비추천 |
| 종량제 (AI 건당) | 부분 가능 | 중간 | - | Phase 3 보완 |
| 광고 수익 | 무료 티어 한정 | 낮음 | - | 무료 티어만 |
| B2B (기업 복지) | Phase 2+ | 높음 | - | Phase 3 검토 |

### 가격 전략

| 단계 | 월 구독료 | 연간 구독 | 근거 |
|---|---|---|---|
| **MVP (Phase 1)** | 4,900~9,900원 | 39,000~69,000원 | 국내 심리적 저항선(9,900원) 이내 진입 |
| **Phase 2** | 9,900~14,900원 | 69,000~99,000원 | AI 코칭, 커뮤니티 추가 가치 |
| **Phase 3** | 14,900~19,900원 | 99,000~149,000원 | 1:1 상담, AI 시각화, 고급 기능 |

- 7일 무료 체험 필수 (업계 표준, 52% 앱이 5~9일 트라이얼)
- 연간 구독 30~40% 할인 구조
- Health & Fitness 카테고리 LTV 중앙값: $16.44 (타 카테고리 대비 최상위)
- 인앱 구매(IAP) 병행 시 구독 대비 수익 30%+ 증가

---

## 기술 스택 추천

> **업데이트 (2026-04-06)**: 웹 접근이 거의 없을 것이라는 판단 하에 Flutter를 1순위로 변경

### Flutter vs React Native 비교 (모바일 전용 앱 관점)

| 평가 항목 | Flutter | React Native (Expo) |
|---|---|---|
| 애니메이션/차트 성능 | ★★★★★ (Impeller, GPU 직접 드로잉) | ★★★★ (JSI, 복잡 애니메이션 병목 가능) |
| 오프라인 퍼스트 | ★★★★★ (Dart Isolate + Drift 패턴 성숙) | ★★★★ (WatermelonDB) |
| HealthKit/Health Connect | ★★★★★ (`health` v13 단일 패키지) | ★★★★ (iOS/Android 별도 라이브러리) |
| BLE 연동 (InBody) | ★★★★ (`flutter_blue_plus`) | ★★★ |
| 인앱 결제 | ★★★★★ (RevenueCat 251k/주 DL) | ★★★★★ (RevenueCat) |
| 타입 안전성 | ★★★★★ (Dart Null Safety + Sealed Class) | ★★★★ (TypeScript) |
| 앱 크기 | ★★★★★ (~41MB) | ★★★★ (~52MB) |
| SO 크로스플랫폼 선호도 | 46% (1위) | 35% (2위) |
| 채용 용이성 (한국) | ★★★ (Dart 풀 좁음) | ★★★★★ (JS 풀 넓음) |
| 웹 확장 가능성 | ★★ (SEO 미지원) | ★★★ |
| UI 일관성 | ★★★★★ (자체 캔버스, 플랫폼 차이 없음) | ★★★★ (네이티브 컴포넌트 의존) |

**결론**: 웹 접근이 거의 없는 모바일 전용 앱이므로 **Flutter가 1순위**. Impeller 렌더링의 애니메이션 성능, `health` 패키지의 통합 API, Drift 기반 오프라인 퍼스트 패턴이 헬스케어 피트니스 앱에 최적.

### 종합 권장 스택 (1순위: Flutter)

```
모바일:       Flutter 3.41 + Dart 3.10
상태 관리:    Riverpod 3.0 (AsyncNotifier + autoDispose)
로컬 DB:      Drift (SQLite ORM, 타입 안전, 마이그레이션)
차트:         fl_chart + Syncfusion (선택적, 커뮤니티 무료)
HealthKit/HC: health 패키지 v13 (iOS+Android 단일 API)
BLE:          flutter_blue_plus (InBody, Withings)
결제:         purchases_flutter (RevenueCat)
푸시 알림:    firebase_messaging + flutter_local_notifications
카메라:       camera + image_picker (Before/After 사진)
백그라운드:   workmanager (오프라인 Sync)
메인 API:     NestJS + TypeScript
AI 서비스:    FastAPI (Python) + scikit-learn/LightGBM → Phase 3: LLM API (Claude/GPT)
데이터베이스: PostgreSQL + TimescaleDB (시계열) + Redis (캐시) + MongoDB (식품DB)
파일 스토리지: AWS S3 + CloudFront
인프라:       AWS (ECS Fargate) + GitHub Actions CI/CD
인증:         AWS Cognito 또는 Auth0
모니터링:     Sentry (에러) + Datadog or CloudWatch (인프라)
```

### 2순위: React Native (Expo) 대안 스택

```
모바일:       React Native (Expo) + TypeScript + WatermelonDB + MMKV
웹 대시보드:  Next.js 15 + Tailwind CSS v4 + shadcn/ui (코드 공유 가능)
```

> React Native 선택 시: TypeScript 풀스택 단일 언어 + 웹 대시보드 코드 공유가 가능. 팀이 React 경험 보유 시 역전 가능.

### Flutter 선택 근거 상세

| 구분 | 선택 | 근거 |
|---|---|---|
| **Flutter** | 모바일 | 웹 불필요, Impeller GPU 렌더링, `health` 단일 API, Drift 오프라인 패턴, 앱 크기 10MB 이점 |
| **Riverpod 3.0** | 상태 관리 | 낮은 보일러플레이트, AsyncNotifier 오프라인→온라인 전환 처리, 컴파일타임 안전성 |
| **Drift** | 로컬 DB | SQLite ORM, 타입 안전 쿼리, 안정적 마이그레이션, `workmanager` 연동 Sync 패턴 존재 |
| **NestJS** | 메인 API | 모듈/DI 체계, 헬스케어 기업 채택 높음. REST API 통신이므로 Dart↔TS 언어 불일치 마찰 없음 |
| **FastAPI** | AI 서비스 | Python ML 생태계 직접 활용, 자동 문서화, 메인 API와 gRPC/REST 통신 |
| **PostgreSQL + TimescaleDB** | DB | ACID 보장 + 시계열 최적화, 기존 PG 생태계(ORM, 마이그레이션) 활용 |
| **AWS** | 인프라 | HIPAA BAA 지원, HealthLake, 가장 성숙한 헬스케어 서비스 |
| **RevenueCat** | 결제 | iOS/Android 인앱 구독 통합, Webhook 기반 상태 동기화 |

### Flutter 오프라인 퍼스트 아키텍처

```
[사용자 입력]
     |
[Riverpod AsyncNotifier]
     |
[Repository Layer] ─── Local: Drift (SQLite) ←── 항상 우선 쓰기
     |                                              |
[NestJS API]                               [Offline Queue Table]
                                                    |
                                           [workmanager] ── 네트워크 복구 시 백그라운드 Sync
```

- 모든 사용자 입력 → Drift 로컬 DB 먼저 저장, `isSynced: false` 마킹
- 낙관적 업데이트: 서버 응답 전 UI 즉시 반영
- `workmanager`가 네트워크 복구 감지 → Last-Write-Wins 전략으로 서버 병합
- 운동 로그: LWW / 설정 변경: 서버 우선

### Flutter Feature-First 디렉토리 구조

```
lib/
├── core/              # DI, Router, Theme, Constants
├── features/
│   ├── auth/          # 온보딩, 신체 상태 입력
│   ├── dashboard/     # 홈, 스트릭, XP, 배지
│   ├── workout/       # 운동 추천, 이행 체크
│   ├── nutrition/     # 식단 추천, 기록
│   ├── body_record/   # 체중/측정, Before/After 사진
│   ├── wearable/      # HealthKit, Health Connect, BLE
│   └── subscription/  # RevenueCat 인앱 결제
└── shared/            # 공통 위젯, 유틸, DB 헬퍼
```

### Flutter 핵심 패키지 요약

| 카테고리 | 패키지 | 버전/상태 | 용도 |
|---|---|---|---|
| HealthKit/HC | `health` | v13.3.1, 73.7k/주 | iOS+Android 건강 데이터 통합 |
| 로컬 DB | `drift` | 활발 | SQLite ORM, 타입 안전, 마이그레이션 |
| 차트 | `fl_chart` | 6,200+ Stars | 체중 추이, 운동 기록 시각화 |
| 인앱 결제 | `purchases_flutter` | v9.16, 251k/주 | RevenueCat iOS/Android 통합 |
| 푸시 알림 | `firebase_messaging` | 표준 | FCM 연동 |
| BLE | `flutter_blue_plus` | 활발 | InBody, Withings 스케일 |
| 카메라 | `camera` + `image_picker` | Google 유지 | Before/After 사진 |
| 백그라운드 | `workmanager` | 활발 | 오프라인 Sync |
| 상태 관리 | `flutter_riverpod` | v3.0 | AsyncNotifier 기반 |

### Flutter Web 제한사항 (참고)

추후 웹 관리 대시보드가 필요해질 경우 Flutter Web이 아닌 **Next.js(TypeScript)를 별도 구성**하는 것이 현실적:
- Flutter Web: SEO 미지원, 접근성 불완전, 일부 플러그인 Web 미지원
- Next.js: SSR/SSG, SEO 완벽, TypeScript → NestJS 백엔드와 타입 공유 가능

### AI/ML 단계별 도입

| 단계 | 기술 | 용도 |
|---|---|---|
| **MVP** | Rule-based + 공개 영양DB + MET 테이블 | 칼로리/매크로 계산, 기본 루틴 매핑 |
| **Phase 2** | Collaborative Filtering (LightFM) + XGBoost | 유사 사용자 기반 추천, 칼로리 소모 예측 |
| **Phase 3** | LLM RAG (Claude API) + YOLOv8 | 자연어 식단 입력, AI 상담, 음식 사진 인식 |

---

## MVP 로드맵

### Phase 1 — MVP (3~4개월)

**목표**: 핵심 행동 루프 검증 (Before 입력 → 루틴 추천 → 기록 → 스트릭)

| 기능 | 포함 | 비고 |
|---|:---:|---|
| 회원가입/로그인 (소셜 포함) | O | |
| 신체 정보 입력 (Before: 키/몸무게/체지방/목표) | O | |
| Rule-based 운동 루틴 추천 | O | ML 없이 규칙 기반 |
| 식단 칼로리 가이드 (식약처 API + MET 테이블) | O | 음식 검색 + 수동 입력 |
| Daily 운동/식단 체크 + 완료 기록 | O | |
| 기본 리워드 (스트릭, 배지, XP/레벨) | O | |
| 체중/측정 기록 + 변화 차트 + 사진 비교 | O | |
| 푸시 알림 (운동 리마인더) | O | |
| 오프라인 로컬 저장 + 백그라운드 동기화 | O | Drift + workmanager |
| 기본 구독 결제 구조 | O | RevenueCat (purchases_flutter) |
| 커뮤니티 | X | Phase 2 |
| AI 추천 | X | Phase 2 |
| 웨어러블 연동 | X | Phase 2 |

**마일스톤:**
- M1 (4주): 온보딩 + 신체 정보 입력 + 기본 운동 추천
- M2 (8주): Daily 체크 루프 + 스트릭 + 기록 저장
- M3 (12주): 식단 가이드 + 차트 + 푸시 알림
- M4 (16주): 결제 연동 + 앱스토어 출시

### Phase 2 — 리워드 고도화 + AI + 커뮤니티 (3~4개월)

- AI 맞춤 운동/식단 추천 (Collaborative Filtering)
- 음식 사진 → 칼로리 인식 (YOLOv8 MVP)
- 커뮤니티 (포스팅, 챌린지, 좋아요)
- 고급 리워드 (리더보드, 기간별 챌린지)
- 웨어러블 연동 (HealthKit, Google Health Connect)
- 캐릭터/아바타 시각화 (Ready Player Me 또는 자체 2D)
- InBody LookinBody API 연동 (헬스장 파트너십)
- 월간 심층 분석 리포트 (유료 전용)
- Withings API 연동

### Phase 3 — AI 시각화 + 유료 확장 (4~6개월)

- AI Before/After 실사 체형 시뮬레이션 (유료 전용)
- LLM 기반 자연어 식단 입력 + AI 코칭 채팅
- B2B 기업 복지 패키지
- 고급 분석 (운동 효율, 목표 달성 예측 AI)
- Terra API 도입 (다종 웨어러블 통합)
- 마이크로서비스 전환
- 글로벌 다국어 확장
- 보험사 B2B 연계 검토

---

## 아키텍처 설계

### 전체 레이어 구조

```
[모바일 앱 (Flutter / Dart)]
        |
  로컬 SQLite (Drift + MMKV)
        |
  [workmanager Background Sync]
        |
[API Gateway (Kong / AWS API GW)]
        |
[NestJS API Server]   [FastAPI AI 서비스]
        |                    |
[PostgreSQL+TimescaleDB]  [ML 모델 서빙]
        |
     [Redis]       [S3]      [MongoDB]
```

### 오프라인 퍼스트 아키텍처

| 패턴 | 설명 |
|---|---|
| 로컬 우선 읽기/쓰기 | 모든 입력 → Drift 로컬 DB 먼저 저장, `isSynced: false` 마킹 |
| 낙관적 업데이트 | 서버 응답 전 UI 즉시 반영, 실패 시 롤백 |
| 백그라운드 동기화 | `workmanager`로 네트워크 복구 시 자동 전송 |
| 충돌 해결 | 운동 로그: Last-Write-Wins / 설정 변경: 서버 우선 |

### 데이터 프라이버시

| 계층 | 조치 |
|---|---|
| 전송 | TLS 1.3 필수, Certificate Pinning |
| 저장 | AES-256 암호화 (민감 건강 데이터), AWS KMS 키 관리 |
| 접근 제어 | RBAC (사용자 / 트레이너 / 관리자) |
| 감사 로그 | 모든 데이터 접근/수정 이력 (CloudTrail) |
| 익명화 | AI 학습 데이터는 개인 식별 정보 제거 |
| 데이터 최소화 | 필요한 건강 데이터만 수집, 목적 외 사용 금지 |

### DB 확장 전략

| 단계 | 전략 |
|---|---|
| 초기 (~1만) | 단일 PostgreSQL (RDS) + 읽기 복제본 1개 |
| 성장기 (~10만) | 복제본 확대 + TimescaleDB 시계열 분리 |
| 확장기 (10만+) | 사용자 파티셔닝(샤딩) + 식품DB 별도 인스턴스 + CDN 캐시 |

---

## 예상 리스크 및 대응 방안

### 법적 리스크

| 법률 | 적용 기준 | 대응 방안 |
|---|---|---|
| **디지털의료제품법** (2025.01 시행) | 질병 진단·예측·처방 시 의료기기 분류 | 운동/식단 앱은 "건강관리 목적"으로 비의료기기 분류 가능. 식약처 사전 상담 권장 |
| **개인정보보호법** | 건강정보 = 민감정보 → 별도 동의 필수 | 온보딩 시 건강정보 처리 별도 동의 화면, 암호화 저장 |
| **AI 기본법** (2026.01 시행) | 고영향 AI 사업자 의무, 딥페이크 고지 의무 | AI 생성 체형 이미지에 "AI 생성물" 표시 필수 (미이행 시 3천만원 과태료) |
| **퍼블리시티권보호법** (발의 중) | 얼굴·목소리 무단 이용 방지 | AI 실사 이미지 생성 시 사용자 명시적 동의 획득 |
| **데이터 3법** | 가명 처리 후 통계·연구 활용 가능 | AI 학습용 데이터 가명 처리 파이프라인 구축 |

**핵심**: 운동/식단 추천은 "건강관리 목적"으로 비의료기기 분류 가능하나, "특정 질병 예방/치료" 표현은 절대 금지. 법적 안전선을 명확히 설정해야 함.

### 기술적 리스크

| 리스크 | 영향도 | 대응 방안 |
|---|---|---|
| 오프라인 동기화 충돌 | 중간 | 지수 백오프 재시도 + 운동 로그 LWW |
| AI 서비스 장애 | 높음 | Fallback to Rule-based 추천 |
| 식약처 API 호출 제한 | 중간 | 식품DB 로컬 캐싱 + 일일 갱신 |
| 웨어러블 SDK 호환성 | 중간 | Phase 1은 HealthKit/HC만, Phase 3에 Terra |

### 사업적 리스크

| 리스크 | 영향도 | 대응 방안 |
|---|---|---|
| 경쟁 심화 | 높음 | "식단+운동+리워드 통합" 차별화 집중 |
| 90일 이탈율 69% | 높음 | 스트릭+회복 메커니즘, 게이미피케이션 적정 수준 유지 |
| 유료 전환율 낮음 (2~5%) | 중간 | 7일 무료 체험, 연간 구독 할인, 단계적 가격 |
| 금전 리워드 경쟁 | 중간 | 금전 리워드 대신 성취감/시각화 중심 차별화 |

---

## 참고 오픈소스 프로젝트

| 프로젝트 | 참고 포인트 |
|---|---|
| [OpenFoodFacts](https://github.com/openfoodfacts) | 식품 데이터 파이프라인, 다국어 처리 |
| [Workout.cool](https://github.com/Snouzy/workout-cool) | 운동 DB 스키마, 루틴 관리 구조 |
| [WatermelonDB](https://github.com/Nozbe/WatermelonDB) | 오프라인 퍼스트 구현 레퍼런스 |
| [Notesnook](https://github.com/streetwriters/notesnook) | 민감 데이터 E2E 암호화 아키텍처 |
| [Medusa](https://github.com/medusajs/medusa) | NestJS 기반 구독/결제 모듈 아키텍처 |

---

## 출처

### 공공 API / 데이터소스
- [식품의약품안전처 식품영양성분 DB API](https://www.data.go.kr/data/15127578/openapi.do)
- [식품영양성분 데이터베이스 OPEN API](https://various.foodsafetykorea.go.kr/nutrient/industry/openApi/info.do)
- [농촌진흥청 식단관리(메뉴젠) API](https://www.data.go.kr/data/15081047/openapi.do)
- [USDA FoodData Central API Guide](https://fdc.nal.usda.gov/api-guide/)
- [2024 Adult Compendium of Physical Activities](https://pacompendium.com/)
- [BMR 공식 비교 — MacroFactor](https://macrofactorapp.com/best-bmr-equations/)

### InBody / 웨어러블
- [InBody Web API — InBody USA](https://inbodyusa.com/web-api/)
- [InBody WebAPI Guide — LookinBody](https://apiusa.lookinbody.com/Home/Document)
- [Terra API Integrations](https://tryterra.co/integrations/inbody)
- [Withings Developer API](https://developer.withings.com/api-reference/)
- [react-native-health — GitHub](https://github.com/agencyenterprise/react-native-health)

### 시각화 기술
- [3DLOOK AI Body Scanning](https://3dlook.ai/)
- [BodyMorpher 3D Body Tracker](https://mwm.ai/ko/apps/bodymorpher-3d-body-tracker/6755445627)
- [Ready Player Me API](https://docs.readyplayer.me/ready-player-me/api-reference/rest-api)
- [바디닷(Bodydot)](https://www.teamelysium.kr/en/product/bodydotfitness)

### 법적 규제
- [디지털의료제품법 — 국가법령정보센터](https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=259299)
- [AI 기본법 — 국가법령정보센터](https://www.law.go.kr/lsInfoP.do?lsiSeq=268543)
- [AI 기본법 가이드 — 피카부랩스](https://peekaboolabs.ai/blog/ai-basic-law-guide)
- [퍼블리시티권보호법 발의](https://news.unn.net/news/articleView.html?idxno=588462)

### 시장 / 경쟁 분석
- [State of Subscription Apps 2025 — RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- [한국 헬스앱 시장 — Sensor Tower](https://sensortower.com/ko/blog/Health-Wellness-category-continues-to-show-steady-growth-in-the-Korean-market)
- [디지털 헬스케어 500조 시장 — ZDNet Korea](https://zdnet.co.kr/view/?no=20250923141419)
- [챌린저스 분석 — 모비인사이드](https://www.mobiinside.co.kr/2023/05/15/challengers/)
- [캐시워크 중장년 이용자 — 다음](https://v.daum.net/v/20251119172113903)
- [밀리그램 식단 앱 — 한국경제](https://plus.hankyung.com/apps/newsinside.view?aid=202303084308i)
- [Noom 리뷰 — Healthline](https://www.healthline.com/nutrition/noom-diet-review)
- [MyFitnessPal Premium — ChoosingTherapy](https://www.choosingtherapy.com/myfitnesspal-review/)
- [Fitness App Gamification 2025 — Frontiers Psychology](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1671543/full)

### 아키텍처 / 기술
- [HIPAA Compliant App Architecture — Technology Rivers](https://technologyrivers.com/blog/building-hipaa-compliant-applications-architecture-security-best-practices-and-compliance-challenges/)
- [Offline-First Mobile Architecture — DEV Community](https://dev.to/odunayo_dada/offline-first-mobile-app-architecture-syncing-caching-and-conflict-resolution-1j58)
- [TimescaleDB vs InfluxDB — Markaicode](https://markaicode.com/time-series-data-influxdb-timescaledb-comparison/)
- [Health & Fitness App Monetization — Apptunix](https://www.apptunix.com/blog/monetize-your-health-and-fitness-app/)

### Flutter 추가 리서치 (2026-04-06)
- [Flutter vs React Native: Healthcare & Fitness — DEV Community](https://dev.to/ciphernutz/flutter-vs-react-native-which-is-better-for-healthcare-fitness-apps-178)
- [Flutter vs React Native 2026 — TechAhead](https://www.techaheadcorp.com/blog/flutter-vs-react-native-in-2026-the-ultimate-showdown-for-app-development-dominance/)
- [Why Flutter Outperforms in 2026 — Foresight Mobile](https://foresightmobile.com/blog/why-flutter-outperforms-the-competition)
- [health package v13 — pub.dev](https://pub.dev/packages/health)
- [Health Package 11.0 — Copenhagen Research Platform](https://carp.dk/health-package-11-0-has-been-released/)
- [Flutter Databases: Drift vs Isar vs Realm 2025 — NuroByte](https://nurobyte.medium.com/flutter-db-showdown-drift-vs-isar-vs-realm-2025-discover-the-fastest-most-efficient-ee0bdb2d3647)
- [Local-First Flutter: Riverpod + Drift + PowerSync](https://dinkomarinac.dev/blog/building-local-first-flutter-apps-with-riverpod-drift-and-powersync/)
- [Riverpod vs Bloc 2026 — Medium](https://medium.com/@flutter-app/state-management-in-2026-is-riverpod-replacing-bloc-40e58adcb70f)
- [Flutter Impeller Rendering Engine — Flutter Docs](https://docs.flutter.dev/perf/impeller)
- [purchases_flutter (RevenueCat) — pub.dev](https://pub.dev/packages/purchases_flutter)
- [flutter_blue_plus — pub.dev](https://pub.dev/packages/flutter_blue_plus)
- [Offline-First Flutter with Drift — Medium](https://777genius.medium.com/building-offline-first-flutter-apps-a-complete-sync-solution-with-drift-d287da021ab0)
- [Flutter Riverpod Clean Architecture — codewithandrea](https://codewithandrea.com/articles/flutter-app-architecture-riverpod-introduction/)
