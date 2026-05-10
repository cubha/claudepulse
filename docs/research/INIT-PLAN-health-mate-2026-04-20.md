# Init-Project 계획서: health-mate

> 생성일: 2026-04-20
> 기반 분석: RESEARCH-healthcare-app-2026-04-06.md
> 상태: IN PROGRESS (Phase 4 진행 중)

---

## 1. 프로젝트 정보 (Phase 1 추출 결과)

- **프로젝트명**: health-mate
- **목적**: Before 신체 정보 입력 → 식단·운동 플랜 추천 → Daily 이행 체크 + 리워드를 통한 개인 헬스케어 관리
- **타겟 사용자**: 운동/다이어트 목표가 있는 iOS + Android 사용자
- **핵심 기능**: 신체 정보 입력, 운동/식단 추천, Daily 체크, 스트릭/배지/XP 리워드, Before-After 시각화
- **규모**: MVP (Phase 1) → 단일 앱, 모노레포 구조
- **배포 환경**: Docker Compose (개발), AWS ECS Fargate (프로덕션 Phase 2+)
- **제약 조건**: 모바일 전용 (웹 불필요), 오프라인 퍼스트, MVP는 rule-based 추천
- **사용자 추가 요구사항**: FastAPI AI 서비스 포함 (MVP는 스텁)
- **선호 기술**: 리서치 문서 기반 확정 스택 그대로 사용
- **제외 기술**: 없음

---

## 2. 리서치 결과 (Phase 2)

`--skip-research` 플래그 적용 — RESEARCH-healthcare-app-2026-04-06.md에서 이미 비교 완료.

---

## 3. 채택 스택 (Phase 3 결정)

| 카테고리 | 채택 | 채택 근거 |
|---|---|---|
| 모바일 | Flutter 3.41 + Dart 3.10 | Impeller GPU 렌더링, 모바일 전용 최적화 |
| 상태 관리 | Riverpod 3.0 | AsyncNotifier + autoDispose |
| 로컬 DB | Drift | SQLite ORM, 타입 안전, 마이그레이션 |
| 차트 | fl_chart | 체중/운동 기록 시각화 |
| 건강 데이터 | health v13 | iOS+Android 단일 API |
| 인앱 결제 | purchases_flutter (RevenueCat) | iOS/Android 통합 |
| 푸시 알림 | firebase_messaging + flutter_local_notifications | |
| 카메라 | camera + image_picker | Before/After 사진 |
| 백그라운드 동기화 | workmanager | 오프라인 Sync |
| BLE | flutter_blue_plus | InBody, Withings (Phase 2용) |
| 메인 API | NestJS + TypeScript | 모듈/DI 체계 |
| AI 서비스 | FastAPI (Python) | Phase 2 실사용, MVP 스텁 |
| DB | PostgreSQL 16 | |
| 캐시 | Redis | |
| 컨테이너 | Docker Compose | 개발 환경 |
| 인증 | JWT (NestJS 내장) | MVP용 |

---

## 4. 예정 디렉토리 구조

```
health-mate/
├── app/                    # Flutter 앱
│   ├── lib/
│   │   ├── core/
│   │   │   ├── di/
│   │   │   ├── router/
│   │   │   └── theme/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── workout/
│   │   │   ├── nutrition/
│   │   │   ├── body_record/
│   │   │   ├── wearable/
│   │   │   └── subscription/
│   │   └── shared/
│   │       ├── widgets/
│   │       ├── utils/
│   │       └── constants/
│   ├── test/
│   ├── pubspec.yaml
│   └── analysis_options.yaml
├── backend/                # NestJS API
│   └── src/
├── ai-service/             # FastAPI (Python) - stub
│   └── app/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── CLAUDE.md
└── verify.sh
```

---

## 5. 예정 설정 파일

- [x] INIT-PLAN (이 파일)
- [ ] app/pubspec.yaml
- [ ] app/analysis_options.yaml
- [ ] app/lib/main.dart
- [ ] app/lib/app.dart
- [ ] backend/package.json (NestJS CLI 생성)
- [ ] backend/tsconfig.json
- [ ] ai-service/requirements.txt
- [ ] ai-service/app/main.py
- [ ] docker-compose.yml
- [ ] .env.example
- [ ] .gitignore
- [ ] CLAUDE.md
- [ ] verify.sh
