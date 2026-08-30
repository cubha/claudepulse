# VERIFY-SPEC — ST2: 프로토타입 HTML 드리프트 정리

## 요청
design-lint error 9 → 0 (D-COLOR-02 4색, D-TOKEN-01 4px 그리드 밖 9종). D-TYPE-07의 `--fs-label` 11px만 제외.

## 실제 결과 (스코프 정정됨 — advisor 검토 후)
**error 9 → 6.** 0이 아니다. 이유:

- **D-COLOR-02 (4→0) 완료.** 각 파일 자체 `:root`에 로컬 커스텀 프로퍼티(`--canvas-surface`·`--qp-surface`·`--exp-b`)를 추가하고 `var()`로 치환. 렌더 값 바이트 동일 — 시각적 변경 없음. `usage-heatmap.html:68`의 `background: #143;`(직후 `#0f3d36`으로 즉시 덮어써지는 죽은 선언, `#143`은 3자리 hex로 `#114433`과 동일값)도 함께 제거.
- **D-TOKEN-01(다수)·D-TYPE-07(다수)은 의도적으로 미조치.** `--token-source src/webview/styles.css`가 만드는 허용 px 집합은 spacing과 font-size/border-width를 구분하지 않는 flat set이다. 예: `gap: 10px`가 위반인 이유는 10이 spacing 스케일 밖이라서가 아니라 11(`--fs-label`의 font-size)만 집합에 있어서다. 이 상태로 off-scale 값을 인접 허용값에 스냅하면 spacing을 font-size 우연치에 맞추는 것이라 왜곡이다. property-type을 구분 못하는 도구 한계이지 프로토타입 결함이 아니라고 판단해 손대지 않았다.
- D-TYPE-07의 `--fs-label` 11px 부분은 원 계획대로 의도로 유지.

## 부수 개선 (원 계획에 없었음)
`verify.sh` 12번 섹션의 design-lint 호출을 `--tokens docs/design/DESIGN-TOKENS.md`(unstructured, 문서에 위반값 적으면 허용집합이 오염되는 기결함 있음 — 이전 세션에서 `~/.claude/skills/design-lint`에 핸드오프 프롬프트로 개선 요청함)에서 `--token-source src/webview/styles.css`(structured, 실 선언 harvest)로 전환. design-lint 스킬 쪽이 이미 `--token-source` 플래그를 지원하도록 업그레이드된 것을 실측으로 발견해 채택. `tokenSets.structured: true` 확인됨.

## 변경 파일
- `docs/design/prototype/00-clausight-canvas.html` — `:root` 추가 + var() 치환 1건
- `docs/design/prototype/context-session-picker.html` — `:root`에 `--qp-surface` 추가 + var() 치환 1건
- `docs/design/prototype/usage-heatmap.html` — `:root`에 `--exp-b` 추가 + var() 치환 2건 + 죽은 선언 제거
- `docs/design/prototype/provider-compare.html` — 변경 없음(D-COLOR-02 위반 없었음)
- `verify.sh` — design-lint 호출 플래그 전환
- `docs/design/DESIGN-TOKENS.md` §13.1 — 기준선 갱신(error 9→6) + 미조치 사유 명문화 + `design-lint-ignore`가 피검사 HTML에 적용 안 됨을 명시
- `CLAUDE.md` §9 — 동일 갱신

## 검증
- `bash verify.sh --full` → PASS=18 · FAIL=0, design-lint 블록: `error 6건 · warn 29건`
- design-lint JSON 직접 실행으로 `tokenSets.structured: true` 확인

## 미확인 사항
- D-TYPE-07·D-TOKEN-01을 0으로 만드는 근본 해법(harvest에 property-type 인식 추가)은 design-lint 스킬 저장소 쪽 작업이라 이번 릴리즈 범위 밖 — 별도 개선 과제로 재이관.
- warn 29건은 이번 SubTask 대상이 아니었음(원 계획도 error만 대상).
