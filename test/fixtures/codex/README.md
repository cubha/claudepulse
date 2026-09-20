# Codex rollout fixtures

CodexParser의 I/O 계약 검증용. **각 파일의 성격을 반드시 확인하고 쓸 것** — 실물과 합성은 신뢰 수준이 다르다.

| 파일 | 성격 | 출처·범위 |
|---|---|---|
| `real-free-exec-1turn-cli0.155.1.jsonl` | 🟢 **실물** | 2026-09-19 이 프로젝트 개발 머신에서 `codex exec`로 직접 생성. ChatGPT **free** 플랜 · `source:"exec"` · **1턴** · codex-cli **0.155.1**. 개인 경로만 치환(`/home/user/…`), 그 외 구조·숫자 무가공 |
| `synth-plus-2turn-replay.jsonl` | 🟡 **합성** | `openai/codex` 소스(`protocol.rs` · `state/session.rs` · `rollout/policy.rs`) 확정 규칙으로 생성. 실물이 커버 못 하는 **유료 2버킷 · 2턴 · `turn_token_usage` 리셋 · replay 중복 1건** |
| `synth-legacy-tokencount-only.jsonl` | 🟡 **합성** | `token_usage_record` 도입(0.154, 2026-09-08) **이전** 세션 모사. `token_count` 단독 경로 폴백 검증용 |

## 실물이 커버하는 것 / 못 하는 것

**커버함** — `session_meta`의 전체 키 구성, `git{commit_hash,branch}`(origin 없어 `repository_url` **키 자체 부재**), `token_usage_record`와 `token_count` 공존, `rate_limits` 구조, `model_context_window`, `turn_context.model`.

**커버 못 함**(합성이 메움) — 유료 플랜의 2버킷(`window_minutes` 300+10080), 다턴에서의 `turn_token_usage` 리셋, replay 중복, 구버전 폴백, `session_meta.source`의 객체 형태(`{subagent:{thread_spawn:…}}`), `.zst` 압축본.

## 기대값 (회귀 잠금용)

```
real-free-exec-1turn : usage 합 = thread_token_usage = total 12,792 (input 12,787 / cached 9,984 / output 5)
                       rate_limits.primary.window_minutes = 43200, secondary = null, plan_type = "free"
synth-plus-2turn     : usage 합 = thread_token_usage = total 3,120 (input 3,000 / cached 1,500 / output 120 / reasoning 35)
                       replay 1건은 누적쌍 동일 → skip 되어야 한다(합산하면 total 4,370으로 과대)
                       turn-0001 마지막 turn_token_usage = 1,880 / turn-0002 첫 값 = 1,240 (리셋 확인)
synth-legacy         : token_count.total_token_usage 최종 = total 1,245 (input 1,200 / cached 400 / output 45)
```

## 절대 금지

- **`turn_token_usage` / `thread_token_usage`를 합산하지 말 것** — 턴 내 누적 스냅샷이라 합산 시 과대계산(실측 캐시 3.7×). 증분은 `usage`만.
- **두 경로(`token_usage_record` + `token_count`)를 합산하지 말 것** — 같은 사용량의 두 표현. 정확히 2배가 된다.
- **`token_count.total_token_usage`를 누적 진실원으로 쓰지 말 것** — 새 턴에서 `fill_to_context_window`가 덮어써 리셋된다. 구버전 폴백에서만 사용.
