# v0.1.38 구현 페이즈 가이드 — "스킬별 비용" 귀속 정직성 개선

> 작성일: 2026-06-22
> 근거: 사용자 "스킬별 비용 조회 안됨" 보고 → 실데이터 원인 규명(커버리지 33%) + advisor 설계 검증
> 검증: advisor 1회(이중계산·분모·범위외 락인). 정직성 패턴은 v0.1.37 회고 뷰 "미귀속 버킷 1급화" 재사용
> 상태: 🔜 계획 확정. **구현 미착수**. 배포는 ship 게이트(명시 명령 대기)
> 분류: 0.1.x 패치 — 기존 "Cost by Skill"(v0.1.34) 섹션의 정직성/완전성 개선

---

## 0. 한 줄 요약

"스킬별 비용"은 익스텐션이 스킬을 추론하는 게 아니라 **CC 하네스가 jsonl에 박아둔 `attributionSkill` 필드를 수동 그룹핑**한 것이다. 이 필드는 **Skill 툴이 활성 로드된 메인체인 턴에만** 찍히므로 cost 발생 턴의 **67%(스킬 외 메인작업)가 라벨 없이 누락**되고, 서브에이전트(사이드체인)는 0건이다. → v0.1.37 "미귀속 버킷 1급화" 정직성 패턴을 그대로 빌려 **"스킬 외 작업" 1급 버킷 + disclaimer**로 완전성을 복구한다.

---

## 1. 정확한 원인 (데이터 확정 — 추측 아님)

| 측정 | 값 | 출처 |
|---|---|---|
| 메인 assistant(usage 보유) 중 `attributionSkill` 보유 | **33.1%** (8,402 / 25,405) | 전 프로젝트 jsonl grep |
| usage 보유 중 스킬 라벨 **없는** 비율 | **66.9%** | 동일 |
| 사이드체인(서브에이전트) 레코드 + `attributionSkill` | **0건** | 동일 |
| 이 머신 사이드체인 레코드 총량 | **0건** (v0.1.37과 동일 관찰) | 동일 |

**전이 추적(이번 ship 세션 실측):** 사용자가 "/ship 진행" 요청 후 **검증·CHANGELOG·README 편집 전부 `attributionSkill=None`**, Skill 툴이 실제 로드된 시점("Base directory for this skill: …/ship")부터 비로소 `ship`, 서브에이전트(security-auditor) 구간에서 다시 `None`. → **라벨은 "활성 스킬 로드 중"인 동안의 메인 턴에만** 붙는다.

### 누락되는 3 버킷
1. **활성 스킬 없는 메인작업** (가장 큼, 67%) — 평문 NL 요청을 Claude가 Skill 없이 직접 처리 + 스킬 로드 전/후 작업.
2. **서브에이전트 위임작업** — 사이드체인은 `attributionSkill` 0건. (기존 `subagentStats` mainCost/subagentCost로 별도 노출됨)
3. (가능성) 스킬→스킬 중첩 — **미검증**. 단언 안 함.

### 사용자 2가설에 대한 정확한 답
- **"자연어 자동 트리거는 표시 안되나?"** → 부분 거짓. 판정은 *트리거 방식*이 아니라 *Skill 툴이 실제 활성화됐나*. NL이든 슬래시든 Skill이 로드되면 라벨됨. 단 Claude가 스킬 없이 직접 처리하면 라벨 대상 자체가 없음.
- **"체이닝 스킬은 표시 안되나?"** → 서브에이전트 체이닝은 **참**(사이드체인=라벨 0). 스킬→스킬은 미검증.

---

## 2. 핵심 설계 결정 (advisor 락인)

| 결정 | 내용 | 근거 |
|---|---|---|
| **버킷 정의 = `!isSidechain && !attributionSkill`** | `total − Σskill` 공식 **금지** | 그 공식은 서브에이전트 cost를 버킷에 접어넣어 기존 subagent split과 **이중계산**(v0.1.37 "비용 이중계산 금지"). 사이드체인=0인 이 머신에선 로컬테스트에 안 드러남 → "스텁이 최난 가정을 mock하면 거짓 초록" 교훈 → **테스트는 사이드체인-존재 일반 케이스로** |
| **share 분모 = grand-total (Σskill + 버킷)** | 각 스킬 share = cost / grand-total. 버킷도 share 보유 | 정직(회고 패턴 일치). 단 **기존 share 의미(cost/skill-total)가 바뀜** → ST1에서 기존 테스트 동시 갱신(안 하면 stale 계약에 그린) |
| **서브에이전트→스킬 실귀속 = 명시적 범위외** | v0.1.37의 "서브에이전트 transcript 크롤" 연기 방식 그대로 | 버킷이 서브에이전트 cost를 "정직한 누락"으로 만듦. 사이드체인 귀속 반쪽 구현 금지 |
| **라벨 카피 = "활성 스킬 밖의 작업"** | 모호한 "기타" 금지. 스킬 로드 전 lead-up 포함 명시 | 이번 세션의 verify/changelog/readme(=Skill(ship) 로드 전 작업)가 완벽한 구체 예시 |
| 신규 색상 0 / 외부폰트 0 | 버킷은 muted(기존 `--c-slate`/`--vscode-*` 토큰) | CLAUDE.md #5·#6·#7 |

### 타입(안)
```ts
// src/types/index.ts — UsageSummary에 추가
interface UsageSummary {
  // ...
  skillBreakdown: SkillUsage[];          // 기존
  skillUnattributed: {                   // 신규 — 1급 버킷
    costUsd: number;
    totalTokens: number;
    // 의미: !isSidechain && !attributionSkill 인 메인체인 레코드 합
  };
}
// SkillUsage.share = cost / (Σskillcost + skillUnattributed.costUsd) 로 재정의
```

---

## 3. 페이즈 (SubTask 3개)

### Phase 0 — 렌더 확인 게이트 (impl 첫 스텝, non-blocking)
- 대시보드 "Cost by Skill" 섹션이 현재 **≥1행 렌더**되는지 30초 확인. → empty-render **버그가 아니라 불완전성** 수정임을 확정(데이터상 이번 세션 `ship` 라벨 존재 → 렌더 정상 거의 확실).

### Phase 1 — 타입 + 집계 로직
- **ST1 `[TDD]`** — `UsageSummary.skillUnattributed` 추가. `UsageAggregator`에서 `!isSidechain && !attributionSkill` 메인체인 레코드를 버킷에 누적. `SkillUsage.share`를 grand-total 분모로 재계산. **기존 `UsageAggregator.attribution.test.ts` share 단언 갱신**(0.5/1.0 → 버킷 포함 재계산) + 사이드체인-존재 케이스 신규 테스트(이중계산 방지 회귀).
  - 파일: `src/types/index.ts`, `src/services/UsageAggregator.ts`, `test/unit/UsageAggregator.attribution.test.ts`
  - TDD: 결정론 집계 + vitest 존재 + 비자명(분모·버킷·이중계산) = 3-AND 충족.

### Phase 2 — UI + i18n
- **ST2** — 버킷을 스킬 행과 동등한 1급 슬라이스로 렌더(muted 스타일, 신규색 0). "스킬 외 작업" 라벨 + disclaimer 배지/툴팁("스킬별 비용은 Skill이 활성화된 동안의 메인 작업만 귀속. 스킬 밖 직접작업·서브에이전트 위임은 '스킬 외'로 집계"). 4개국어.
  - 파일: `src/webview/main.ts`, `src/webview/i18n.ts`, `src/webview/styles.css`

### Phase 3 — 데모 + 문서
- **ST3** — `docs/demo/mock-data.js`에 버킷 반영(데모 일관성). CHANGELOG `[Unreleased]` + README "Cost by Skill" 설명에 정직성 보강 명시.
  - 파일: `docs/demo/mock-data.js`, `CHANGELOG.md`, `README.md`

---

## 4. 범위외 / 알려진 한계
1. **서브에이전트→활성스킬 실귀속 — 범위외.** 사이드체인이 spawn 시점의 활성 스킬을 모름 + 이 머신 사이드체인 0건. 버킷이 정직한 누락으로 처리. 후속 플래그(v0.1.37 transcript 크롤과 동일 운명).
2. **스킬→스킬 중첩 동작 — 미검증.** 추측 구현 금지.
3. **라벨 자체의 재추론(슬래시 메시지 휴리스틱) 금지.** 67%는 진짜 비-스킬 대화 포함 → 추론 시 거짓 정밀도. 정직한 버킷만.

## 5. TDD 적격 요약
| SubTask | TDD | 사유 |
|---|---|---|
| ST1 타입+집계 | **[TDD]** | 결정론+vitest+비자명(분모·이중계산) 3-AND |
| ST2 UI+i18n | ✗ | Webview/E2E |
| ST3 데모+문서 | ✗ | 문서 |

## 6. 확정된 결정
- 원인 = `attributionSkill` 메인체인-활성스킬 한정(커버리지 33%) ✅ 데이터 확정 2026-06-22
- 해결 = "스킬 외 작업" 1급 버킷(`!isSidechain && !attributionSkill`) + grand-total 분모 + disclaimer ✅
- 서브에이전트 실귀속·스킬중첩 = 범위외 ✅
- 구현 미착수 / ship = 명시 명령 대기 ✅
