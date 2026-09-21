# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-09-21

### Changed
- **Daily, long-term and monthly cost are now one "Cost by Period" section with tabs**, instead of
  three separate sections scattered down the dashboard. Comparing the same figure across time
  windows used to mean scrolling past unrelated cards to reach the next one. The long-term tab keeps
  its own 30/90/180-day range toggle, and that toggle still filters the chart exactly as before.
  Nothing was dropped — all three charts, their empty states and their end-of-line readouts are
  unchanged; only their arrangement changed. A chart is now drawn when its tab is opened rather than
  on load, so it is never built into a hidden, zero-sized container.

### Fixed
- **A Codex log file that was replaced by a different file of exactly the same size was not detected
  as replaced.** The incremental reader decided it could reuse its cached read-offset whenever the
  offset still fell inside the file, which cannot distinguish "more was appended" from "this is a
  different file now" — and in the latter case every record before the offset would never be read.
  The reader now also fingerprints the first bytes of the file and re-reads from the start when they
  change.

### Internal
- The sidebar module no longer touches `document` at import time, which had made the whole file —
  including its pure HTML builders — impossible to import under the unit-test runner. The per-bucket
  history accumulator is now its own pure module with regression tests covering bucket reordering and
  plan changes; this closes the test that v0.2.1 had to defer.
- New build check exercises the cost tabs across two widths, two locales, all three tabs, a language
  switch (which rebuilds the panel) and the long-term tab's own range toggle — asserting in each case
  that the chart that should be on screen actually rendered, not merely that the right button looks
  selected.
- `scripts/capture-media.mjs` re-shoots the marketplace screenshot and demo GIF from the real build
  in one command, so release images can no longer quietly go stale.

## [0.2.1] - 2026-09-20

### Fixed
- **A Codex session record could be silently and permanently lost if a refresh read the log file
  mid-write.** The new incremental reader could land between a completed line and the newline that
  terminates it — Codex CLI writes are not guaranteed atomic from a concurrent reader's point of
  view — and would then advance its cached read-offset past that incomplete line anyway, so the
  next refresh never went back for it even once the write finished. The reader now only advances
  its offset up to the last complete line in each chunk; anything after the final newline is left
  for the next refresh to pick up whole.
- **Codex usage could be overcounted when a subagent replayed a parent session's response.** Duplicate
  detection ran per file, so the same `response_id` appearing in both a parent rollout and a
  `thread_spawn` subagent's own file was counted twice — the same class of billing bug the extension
  already guards against for Claude Code. `loadAllSessionRecords()` now does a second, file-spanning
  dedup pass keyed on `messageId` after the per-file parse, so a replayed response is counted once
  regardless of which file(s) it appears in.
- **Every refresh (every 15s while a session is active) re-read and re-parsed the full Codex log
  history from disk**, with no cache of what had already been parsed. Codex sources now track an
  mtime+offset per file, the same incremental-read pattern `JsonlParser` already uses for Claude —
  unchanged files are skipped entirely, and a file that only grew re-parses just the new bytes. A
  truncated or replaced file (mtime moved but offset now exceeds the file size) safely falls back to
  a full re-parse instead of reading past the end.
- **A file read failure was silently swallowed** (`catch { continue }`) instead of logged, making a
  missing Codex session invisible rather than diagnosable. Both the per-file parse and the rate-limit
  scan now log the failure via `console.error` and keep the previously-cached records for that file.
- **`codex-mini-latest` displayed as "Latest"** instead of the model name — the short-name logic took
  the last `-`-separated segment verbatim, and for this model that segment is the generic `latest`
  suffix. Generic trailing segments are now skipped before taking the last meaningful one.
- **Model-family matching for Codex used first-match instead of longest-prefix**, unlike the pricing
  table's own matching rule (`codexPricing.ts`), so a shorter, less specific family could shadow a
  longer, more specific one depending on object key order. Both now share the same longest-prefix
  strategy (`matchLongestFamily`).
- The sidebar's plan badge showed different casing depending on where it rendered (uppercase in the
  header, Title Case in the footer, for the same value). Both now follow the same per-provider rule.

### Added
- Per-bucket burn-rate row in the Codex sidebar, reusing the existing provider-agnostic `buildBurnRow`
  — the same "time to next reset at current pace" line Claude's 5h/7d gauges already show, now under
  each of Codex's runtime-generated buckets too. History is keyed by the bucket's `windowMinutes`
  (not array position), so a plan or bucket-shape change mid-session can't make one bucket's row
  render another bucket's past samples.

### Internal
- `.provider-codex` palette override table (dark/light, sonnet/warn/danger/fable/haiku +
  `--identity-accent`) is now documented in `DESIGN-TOKENS.md` per the project's token-change
  procedure — it shipped in v0.2.0 without the matching doc update.
- Regression coverage added for the Codex model-color branch (`modelKind`/`modelShortName`/
  `CODEX_MODEL_FAMILY_SLOTS`), which had shipped in v0.2.0 with no dedicated tests.
- Marketplace screenshot and demo GIF refreshed to the current AgentVitals dashboard (previous
  assets predated the v0.1.57 rebrand and v0.2.0 visual overhaul).

## [0.2.0] - 2026-09-20

### Added
- **Codex usage tracking.** A new Claude/Codex switcher in the sidebar header lets you track
  either agent — the same 5h/7d-style gauges, today's cost, model/cache breakdown, tool usage,
  Git branch ROI and usage calendar now read `~/.codex/sessions/*.jsonl` for Codex the same way
  they already read `~/.claude/projects/*.jsonl` for Claude Code.
  - **Rate-limit buckets are read from the data, not assumed.** Codex's plan-dependent buckets
    (a single 30-day window on Free, 5-hour + 7-day on paid plans) are generated at runtime from
    each session's `window_minutes`, not hardcoded — a bucket shape the extension has never seen
    still renders with the right count and reset time.
  - **What Codex genuinely can't provide is left out, not guessed.** Per-skill cost attribution,
    subagent cost breakdown and MCP server attribution depend on fields (`attributionSkill`,
    `isSidechain`, `agentId`) that only exist in Claude Code's logs — those sections don't render
    for Codex rather than showing an invented value. In their place: today's reasoning-token
    total, the model's real context-window size, and a plan badge, none of which Claude exposes.
  - **Three distinct empty states, not one generic "please log in."** Codex CLI not installed,
    installed but not logged in, and logged in with no sessions yet are three different screens
    with different guidance (an install command, a login command, or just "run a session") —
    the same distinction Claude Code's sidebar already made is now applied to both agents.
  - Pricing, dedup and token accounting for Codex follow its own log format exactly: only
    `usage` (the per-response increment) is summed, never the turn/thread running totals (those
    are snapshots, not increments, and summing them overcounts by several times over); replayed
    log lines are recognized by comparing cumulative counters, not by timestamp.
- **A visual overhaul of the dashboard and sidebar** — clearer type hierarchy, the card count
  trimmed from 17 to 6 by merging related metrics, readouts and end-of-line markers added to
  every chart, and a bigger 5-hour gauge as the sidebar's opening view.

### Changed
- **Renamed to AgentVitals** (previously “Claude Code Gauge”). The marketplace listing, the
  activity-bar title, the command palette entries and the dashboard heading all use the new name.
  - **Nothing about the installation changes.** The extension id stays `cubha.claude-code-gauge`,
    so this arrives as an ordinary update rather than a new extension, and existing installs,
    ratings and reviews carry over. The setting namespace stays `claudeCodeGauge.*` and the
    command ids stay `claudeCodeGauge.*`, so configured settings and any keybindings or tasks
    referring to them keep working untouched.
  - The old name is kept in the marketplace keywords, because marketplace search does not appear
    to rank on the extension id slug — searching for the old name would otherwise stop finding it.
  - The name changed because this release starts reading Codex usage too, and a name built around
    a single tool would have stopped being accurate.

## [0.1.56] - 2026-09-10

### Fixed
- **Fable showed up as a black wedge in the Model Breakdown donut, and its bar didn't render at all.** The colour token `--c-fable` was deleted in v0.1.54 as part of a dead-token sweep that found no reference to it. The sweep looked in the right files — including `src/**/*.ts` — but for the wrong thing: it searched for `var(--c-fable)`, while the only consumer builds the name at runtime, as `getCssVar('--c-' + modelKind(model))`. A name that exists only once the code runs cannot be found by searching for it.
  - With the token gone the lookup returned an empty string, which Chart.js drew with the canvas default (black) and the bar drew as `'' + 'cc'` — not a colour, so nothing appeared. The build, the type checker, the linter and all three existing design-token rules stayed green throughout. **Both v0.1.54 and v0.1.55 shipped this way**, from 2026-08-30 to today.
  - The token is restored to its original `#E0529C`, as the design-token document had specified in advance for exactly this case.
- **Changing a setting did nothing.** `claudeCodeGauge.pollIntervalMs` and `claudeCodeGauge.credentialsPath` were checked against `affectsConfiguration()` using a section-relative key rather than the full key. No such section exists, so the check returned false every time and the poller was never restarted — you had to reload the window for a setting to take effect. Both keys are now fully qualified, and a test locks the shape rather than the value.
- **Usage figures could sit still for as long as you kept working.** The file watcher debounced changes, and a debounce timer resets on every event — but Claude Code appends to its logs continuously while a session is alive, so the timer never expired and the refresh only fired once you stopped. It is now a throttle: the first change after a quiet period refreshes immediately, and further changes refresh at most once per interval, which is the behaviour the debounce was meant to have. The interval is configurable via **`claudeCodeGauge.usageRefreshIntervalMs`** (default 15s, floor 3s), and the refresh button bypasses it entirely — it now also recalculates usage, where before it only refreshed rate limits.
- **Charts re-animated on every background refresh**, which read as the dashboard flickering rather than as data changing. Charts that keep their instance now update without replaying the animation; the two whose containers are rebuilt from scratch each refresh have animation switched off.

### Internal
- **New design-token rule `D-4` in `verify.sh`: every token consumed from TypeScript must be declared.** The three existing rules only look inside `styles.css`, so any token whose only reference lives in `.ts` looks dead to them — `--c-fable` was not the only one in that position (`--c-slate`, `--c-danger` and others are reachable the same way). D-4 collects `var(--x)` and `getCssVar('--x')` literals from `src/**/*.ts` and expands the model-accent families (`--c-`/`--tint-`/`--fg-` for each kind) by **reading `MODEL_KINDS` from the source**, so adding a model without its colours fails the build instead of rendering it black. It was verified by removing the fix and confirming the rule goes red naming `--c-fable`, then restoring it.
- A reentrancy guard for the usage refresh: with three triggers instead of one, two runs could overlap and the slower one would finish last and overwrite newer results. Requests that arrive mid-flight are queued once rather than dropped, so a manual refresh never silently does nothing. This guard lives inside `activate()` and is not directly unit-tested; the throttle, the configuration-key shape and the interval clamp are.
- The refresh interval read from settings is clamped through a pure function rather than a bare `Math.max`. `package.json`'s `type` and `minimum` are enforced by the settings UI only, so a hand-edited `settings.json` can deliver a string — and `Math.max(3000, NaN)` is `NaN`, which makes `elapsed >= interval` false forever and leaves the throttle wide open. That is the exact symptom the clamp was added to prevent, so it is now tested against strings, `null`, `Infinity` and friends.

## [0.1.55] - 2026-09-02

### Fixed
- **Cost was being reported as roughly 1–2% of what you actually spent, and the model breakdown was pointing at the wrong model.** The price table hadn't been updated for the current model generation: `claude-opus-5` and `claude-sonnet-5` were simply absent, and none of `findPricing`'s three fallbacks could reach them — the family fallback truncated the model name to three segments, which made `claude-opus-5`'s "family" the string `claude-opus-5` itself, so it matched nothing. That path had therefore **never fired for any new model since it was written**. The result was a silent `$0` per record: builds, typechecks, lint and the existing tests all passed while nearly every dollar went missing.
  - Because `share` was computed from cost, those zeroes then distorted the Model Breakdown: whichever older model still had a price — even a handful of background calls — took 100% of the chart, while the model doing 97% of the actual work showed 0%. Reproduced on real data: a day where Sonnet accounted for 97% of tokens rendered as `$0.00` with every model at `0.0%`.
  - **Prices were derived from Anthropic's own numbers, not guessed.** Claude Code writes a `cost-state` record into its logs with per-model `costUSD`; solving against it gives `claude-opus-5` at $5/$25 (matching all 21 samples exactly, including the `[1m]` long-context variant, which carries no premium) and `claude-sonnet-5` at **$2/$10** — cheaper than Sonnet 4.x, so copying the older $3/$15 forward would have overcharged by 50%. Those samples are now a fixture, so a future price change or a new model turns the test red instead of silently zeroing your costs.
  - Web search is also billed, at $0.01 per request, and wasn't being counted. This too came out of the same measurement: the leftover discrepancy on search-using sessions matched request count × $0.01 to the cent.
- **A model with no known price no longer reports `$0.00` as if that were a measurement.** When any model in view is unpriced, shares switch to a token basis (and say so), the unpriced row reads "price unknown" instead of a dollar amount, and the card carries a warning naming the affected models. A model that isn't in the table but has a known family is now priced approximately — marked as approximate — rather than dropped to zero.
- **The commit retrospective attributed your usage to other people's commits.** It ran `git log` with no author filter, so on any shared repository every colleague's commit from the last 180 days became a candidate, and the time-window join happily assigned your spending to them. Candidates are now limited to commits authored by your `git config user.email`; `claudeCodeGauge.retroCommitScope` restores the old behaviour. If a repository has no `user.email` configured no filter is applied — an empty `--author` pattern matches everything — and the retro view says so rather than claiming a scope it didn't apply.
- **Recently Edited Files, Recent Sessions and the branch list had no row limit** and pushed the cards below them off-screen. They now show six rows with a "Show more (+N)" toggle that names how many are hidden, so the truncation is visible rather than silent. Lists at or under the limit get no button.

- **The Usage Calendar stopped short of today on a narrow dashboard, cutting today's cell off the right edge.** After each refresh the calendar scrolls itself to the right so the most recent week is what you see. That scroll was applied in the same instant the calendar's HTML was replaced — before the browser had settled the layout — so it was clamped against a width the panel no longer had, and nothing ever re-scrolled it. Measured on a 700px-wide dashboard: it stopped 52px short, every time, and today's square was off-screen. Worse, the wrong position was then read back as "the user scrolled into the past" and preserved on every subsequent refresh, so it never recovered. Only dashboards narrower than about 750px were affected — above that the clamped value happened to coincide with the true maximum, which is why this went unnoticed since v0.1.52.
  - The calendar now remembers *whether* it should be pinned to today rather than inferring it from coordinates, and keeps it pinned as the panel's width settles and whenever it later changes. Scrolling into the past is still preserved across refreshes exactly as before.
- **The sidebar's mini calendar never scrolled to today at all.** It had no scroll handling whatsoever, so on a narrow sidebar (measured: 220px and below) it showed the oldest weeks and clipped today entirely. It now follows the same rule as the dashboard.

### Internal
- **The test that was catching the calendar bug had never been wired into anything.** `scripts/verify-calendar-clip.js` had been failing on it since v0.1.52 — three releases — but wasn't part of `verify.sh`, so nobody ran it. This release fixes the deeper problem rather than just the bug: of six `scripts/verify-*` harnesses, exactly one was wired into the gate.
  - **Gate-coverage integrity check** (`verify.sh`): every `scripts/verify-*` must declare `verify-gate: <tier> — <reason>` in its header. Missing marker, a `skip` without a reason, or a declared tier with no matching call in `verify.sh` all fail the build. Exceptions aren't forbidden — they're made explicit and countable, and the marker lives in the file so it can't drift away from what it describes. Costs one `grep`, so it runs in the cheapest tier.
  - **Executability smoke check**: a separate class of rot that the coverage check can't see — assets that are registered and *look* wired but die the moment you call them. `npm run test:integration` had been exiting 127 (`vscode-test: not found`) since it was added in May, across roughly fifty releases, because nothing ever invoked it.
  - `verify-calendar-clip.js`, `verify-sidebar-calendar.js` and `verify-sidebar-layout.js` are now wired into `verify.sh --full` (+17s). `verify-retro-e2e.ts` was deleted — nothing referenced it and it had no runner.
  - Wiring a harness in is not enough if it can't see the defect next to it. `verify-sidebar-calendar.js` asserted that today's marker *exists in the DOM* — which stays true even when today is scrolled out of view — and allowed a six-cell range where the exact count was knowable. Both were tightened: it now pins the clock, asserts the exact cell count, and checks that today is actually visible.
  - The calendar harness also now covers the two paths where the scroll fix could silently not apply: the container narrowing after render, and a refresh arriving while the panel is hidden and then being reopened. Both assertions were confirmed to fail when the underlying mechanism is disabled, so they are not vacuously true.
- **The calendar harness only failed on one weekday in seven, and that flicker hid the real bug.** Its expected grid width was hardcoded at 54 weeks, but the grid pads to start on a Monday, so the column count is `ceil((371 + padding) / 7)` — 53 weeks when the padding is zero. It now uses Playwright's clock control to sweep all seven padding cases deterministically, deriving the expected width from the seeded date rather than from anything it measured on the page (measuring it would make the assertion vacuously true and lose the v0.1.52 stretch regression it exists to catch).
- **Harnesses that could report "no differences" while checking nothing** were closed off. The DOM-digest golden compares by iterating the *golden's* watched ids, so an empty or all-null golden yielded zero diffs and a green check; it now verifies watched-id coverage on both sides before comparing, and refuses to overwrite an existing golden without an explicit `--accept-regression "<reason>"`. `verify-calendar-clip.js` gained a minimum-assertion-count floor for the same reason.
- **`publish.yml` was reporting success while publishing nothing.** Its two publish steps tested `env.VSCE_PAT`, which a step's own `if` cannot see (it's evaluated before that step's `env` applies), and the repository has no publish secrets anyway — so tag pushes ran build, lint, typecheck and packaging, went green, and shipped nothing. Publishing is now a separate job that is only created when credentials exist, and when they don't the run says so in its job summary instead of quietly passing.
- `verify-real-extension-visual.mjs` no longer hardcodes a VS Code version in its binary path (two versions coexist locally; the pinned one going away would have killed the script silently).

### Known Issues
- The v0.1.54 release notes described this calendar failure as a test-constant problem rather than a rendering defect. That was wrong — there were two separate defects, and the one that varied by weekday obscured the one that was present every day. Both are fixed here.
- `npm run test:integration` is still non-functional (missing `@vscode/test-cli`, no `.vscode-test` config, and a wrong extension id). It is deliberately out of scope for this release; the new executability check keeps it visible rather than forgotten.
- **Days already stored before this fix keep their `$0` cost.** Daily rollups are persisted to survive the ~30-day log rotation, and rollups don't retain a per-model split, so days older than the surviving logs cannot be recomputed. They are not discarded — their token counts are correct — and the long-term trend chart now labels how many days are in this state instead of treating them as absent.
- **Narrowing the retrospective's commit candidates widens each remaining commit's time window, and the confidence indicator moves the wrong way.** Records between a colleague's commit and your next one are not pushed into the unattributed bucket — that bucket only collects work after the last commit — they flow into your next commit instead, raising its record count. Confidence is currently derived from that record count (5 or more reads as "high"), so an attribution that has become *less* precise displays as *more* confident. Replacing the confidence formula is out of scope here; the retrospective was already labelled approximate.
- **What the vendor fixture proves, and what it doesn't.** It confirms the rate table matches Anthropic's own rates: within a single `cost-state` snapshot, tokens and cost are self-consistent and all 38 samples land inside the cache-TTL band. It does not confirm that our per-session record set matches the CLI's session accounting — comparing session totals showed −49% to +1980% scatter, but `cost-state` is a mid-session snapshot that lags the log (one session reports 4,203 output tokens against 141,885 actually recorded), so that comparison is not a valid oracle. Reconciling record sets is a separate question (dedup semantics, resumed sessions, subagent attribution).

## [0.1.54] - 2026-08-30

No user-visible changes of its own. This release is vNext migration R2, the "safety net" phase that had to land before the Codex/multi-IDE work (v0.2.0) could safely begin: test coverage for previously-untested core services, a previously-nonexistent typecheck for the webview and test directories, an async I/O fix on the extension activation path, and a full mechanical split of the 1882-line webview entry point.

It is published together with **v0.1.53**, which was completed but never released separately — so upgrading from v0.1.52 delivers both, and the only user-facing change in that span is v0.1.53's HTML-escaping fix below.

### Internal
- **Test coverage backfilled** for `UsageAggregator`'s core rollup (`today`/`last7Days`/`cacheHitRate`/`modelBreakdown`/`cacheStats`/`todayToolCounts`/`recentSessions`/`recentEditedFiles`), `CacheStore`, and `WorkspaceMapper` — none of these had dedicated unit tests before. 30 new characterization tests, all green on first run (no bugs found in the process — `aggregate()`'s lack of dedup is correct by design; dedup is `JsonlParser`'s job).
- **`WorkspaceMapper.getAllJsonlFiles()` converted from sync to async** (`fs.readdirSync` → `fs.promises.readdir`) — this ran on every `refreshUsage()` call on the extension activation path and blocked the event loop. TDD (RED confirmed, then implemented). The one production call site (`extension.ts`) and 5 call sites in an existing integration test were updated to `await`.
- **`tsconfig.test.json` added and wired into `verify.sh`.** The `test/` directory had never been typechecked (excluded from the root `tsconfig.json`, and `vitest` doesn't typecheck by default) — turning this on surfaced 5 real, previously-invisible bugs: a test helper passing one fewer constructor argument than the real class requires (silently `undefined`), a Vitest hook returning the wrong type, and two small type errors in `main.ts` (a `Chart` constructor-parameters mistype, an implicit `any`). All fixed.
- **`tsconfig.webview.json` wired in** (`npm run build`, `npm run typecheck`, `verify.sh`) — it existed but was never referenced anywhere, so the webview's ~1900 lines had zero compile-time type checking. Also removed from ESLint's ignore list for the same reason.
- **`src/webview/main.ts` split** from a single 1882-line file into `webviewApi.ts`, `webviewShared.ts`, `sidebarView.ts`, and `panelView.ts` (entry point now 27 lines). Verified behaviorally identical via a new structural DOM-digest snapshot harness (`scripts/verify-webview-surface.mjs`, 8 viewport/locale combinations, 0 diffs) plus a real Extension Development Host screenshot pass (sidebar and dashboard both render correctly with live data, including both Chart.js charts).
- **`vscode-messenger`/`-common`/`-webview` bumped 0.5.1 → 0.6.1**, verified via the existing `test:e2e` broadcast round-trip test (both before and after the bump).
- `verify.sh --full` gained two new gates from the above: the webview DOM-digest check and `test:e2e`.

### Known Issues (pre-existing, not introduced by this release)
- `scripts/verify-calendar-clip.js` (Usage Calendar width/scroll regression test) currently fails 6 of its assertions on certain days of the week. Root cause: `calendarView.ts`'s cell-grid padding makes the total rendered cell count depend on which weekday the window boundary falls on (±6 cells across a 7-day cycle), which the test's fixed 54-week/14-week width constants don't account for. This is a test-assertion gap, not a rendering defect — filed for a future fix.

## [0.1.53] - 2026-08-28

### Fixed
- **Webview error messages were injected into `innerHTML` unescaped.** Five sites in the sidebar/panel initialization paths (`Messenger init/start failed`, top-level webview boot failure) interpolated `err.message` directly into HTML strings without escaping. `escapeHtml()` already existed and was used at 20+ other call sites (extracted in v0.1.39), but these five error-path renders predated that convention and were missed.
  - **Fix**: extracted the shared `err instanceof Error ? err.message : String(err)` pattern into `formatErrorHtml()` (`src/webview/format.ts`), which escapes before returning, and applied it at all five sites.

### Internal
- **Design token Ground Truth re-established.** `src/webview/styles.css` is now the single source of truth for the extension's 75 CSS custom properties (`:root` 24 · `.theme-dark` 51 · `.theme-light` 51). `docs/design/DESIGN-TOKENS.md` was stale (22 tokens documented vs. 69 actually declared) and has been rewritten from the code. Declaration-outside-`:root` color literals dropped from 122 to 0, dead tokens from 21 to 0, and a real silent-failure bug was found and fixed: `.panel-title`'s `font-family: var(--ff-display)` referenced a token that was never declared, so the browser silently dropped the whole declaration — surviving undetected through v0.1.52.
- **`verify.sh` gained a design-token gate (D-0~D-3)**: declaration-count integrity, undeclared-token references (fail — these are silent style-loss bugs, not just messy code), and dark/light pair coverage, each validated against 6 negative-test cases.
- **Prototype HTML hardcoded-color drift resolved** (`docs/design/prototype/*.html`, design-lint `D-COLOR-02`: 4 → 0) by promoting each file's one-off literals to file-local CSS custom properties (byte-identical rendering) and removing a dead duplicate `background` declaration in `usage-heatmap.html`. `verify.sh`'s design-lint invocation switched from `--tokens` (whole-document regex harvest, vulnerable to allow-set poisoning if a violating value is ever written into the docs) to `--token-source src/webview/styles.css` (structured harvest from real declarations). Off-scale spacing/font-size findings (`D-TOKEN-01`, `D-TYPE-07`) were investigated and deliberately left unresolved — the harvest doesn't distinguish spacing tokens from font-size/border-width values, so snapping to the nearest allowed number would fit the mockups to a linter artifact rather than an actual design-scale violation.

## [0.1.52] - 2026-08-10

### Fixed
- **The Usage Calendar's month labels drifted away from the cells they label, and recent usage looked like it belonged to a future month.** The heatmap grid used `grid-auto-flow: column` without a fixed track size, so the columns were `auto`-sized and the grid's default `justify-content` (`normal`, which resolves to `stretch`) distributed leftover width across them. Once the card was wider than the grid's intended width (54 weeks × 14px = 756px), the cells spread out while the month labels stayed pinned at 14px each — measured drift reached **704px** at a 1600px-wide dashboard, putting the colored recent-activity cells far to the right of the last month label. The sidebar's mini calendar had the same defect at a smaller scale (49px drift at 300px, 152px at 420px).
  - **Fix**: the calendar is now fixed-width on both surfaces — cells stay 12px with a 14px column pitch regardless of container width, and leftover width is left as margin (the convention contribution graphs follow). When the display area is *narrower* than the fixed grid, it scrolls horizontally as before rather than clipping.
- **CJK month labels wrapped vertically and overlapped the first row of cells.** Flex items default to `min-width: auto` (a min-content floor), so a 14px-wide label span behaved differently per locale: `"10월"` can break anywhere, so it wrapped onto a second line and spilled past the 14px label row into the grid, while `"Aug"` can't break at all, so it forced the span wider and inflated the label pitch — misaligning English labels by a cumulative 26px even at narrow widths. Labels now set `min-width: 0` with `white-space: nowrap`, so the pitch is exactly one column in every locale.

### Internal
- `scripts/verify-calendar-clip.js` grew from 5 narrow-width checks to 25 across three phases (dashboard at 700px and 1600px in `ko`/`en`, sidebar at 300/420/180px). Verifying a single viewport width is what let this defect pass through nine releases: the old harness ran only at 700px, where the grid always overflowed and therefore never entered the stretching regime. Assertions are on invariants — column pitch, label pitch, label-to-column drift, wrap height — not on pixel screenshots.

## [0.1.51] - 2026-08-06

### Fixed
- **In a multi-root workspace, the context gauge could report a repo you weren't working in.** v0.1.48 scoped the gauge to `workspaceFolders[0]` and documented the multi-root case as a known limitation; dogfooding turned it into a real defect — three repos open in one window, active work in one of them, and the gauge pinned to another repo's session from 1d 19h earlier. The active session wasn't losing the "most recent" comparison, it was never a candidate: the prefix filter excluded it before selection.
  - **Fix**: `UsageAggregator.aggregate()` takes `workspaceRoots` (`string | string[]`, backward compatible) and treats a record as a candidate if its `cwd` falls under *any* open folder. Zero match across all folders still yields no gauge rather than a silent cross-project fallback, preserving the v0.1.49 honesty rule.

### Added
- **Session picker for the context gauge.** The `📁` workspace chip is now clickable and opens a native QuickPick listing every session observed in the workspace — repo, branch, idle time, `tokens/window (%)`, and model — sorted by most recent activity. Selecting one pins the gauge to that session; the currently auto-selected entry is badged so the default is visible. Useful when several sessions are live at once and the auto-selected reading would otherwise alternate between them.
- **Pin safety rails.** Auto (most recently active) remains the default; pinning is an override, not a replacement. A pinned session idle beyond the existing 4h staleness threshold turns the gauge amber and surfaces a "Switch back to auto" link, so pinning cannot reproduce the stale-reading problem this release fixes. A pinned session that leaves the candidate pool entirely (ended, or its folder closed) falls back to auto and clears the stored pin via a `pinMissing` signal.

### Internal
- `SessionSummary` gained `lastActivity` / `model` / `contextTokens` / `branch`; new `UsageSummary.contextSessions` provides the workspace-scoped session list. `recentSessions` deliberately stays cross-project — the v0.1.49 "no session for this workspace" vs. "no session history at all" distinction depends on it.
- Session-picker item construction (`src/utils/sessionPicker.ts`) and gauge badge/color/revert-link resolution (`src/webview/contextGaugeState.ts`) are pure functions with unit tests, separate from the VS Code API glue. Picker rows reuse the same 1M-context-window ladder as the gauge, so a session's percentage doesn't change between the list and the gauge after selection.
- New `test/unit/MultiRepoContextGauge.integration.test.ts` drives the real `WorkspaceMapper` → `JsonlParser` → `UsageAggregator` pipeline against on-disk `.jsonl` fixtures in a temp directory, reproducing the original 3-repo defect and locking the fix.

## [0.1.50] - 2026-08-03

### Fixed
- **The session context gauge could over-report usage by up to 5×.** `CONTEXT_WINDOWS` statically classified every current model as a 200K-token window, even for accounts with the 1M beta window active, and `Math.min(1, …)` clamped the ratio to 100% — hiding just how far off the true value was (one workspace's real occupancy was 292%, displayed as a flat 100%).
  - **Fix**: `findContextWindow`/`calcContextUsageRatio` take a `forceOneMillion` flag. `UsageAggregator` decides it via a two-signal ladder: (1) if any record for that model anywhere in history exceeds 200K tokens, a 200K window couldn't have produced it, so 1M is physically proven; (2) failing that, if `~/.claude.json`'s `projects.*.lastModelUsage` has a `[1m]`-suffixed key for that model (new `src/utils/claudeJsonModels.ts`). Falls back to the static 200K table only when neither signal is present.
- **The gauge's token count could nearly double on multi-call turns.** The top-level `usage` field in a `.jsonl` record sums every API call (`iterations`) within one assistant turn, not just the one reflecting current context occupancy. `JsonlParser` now derives `contextTokens` from the last non-`advisor_message` iteration, falling back to the summed field when `iterations` is absent (legacy logs).
- **Background/subagent sessions could hijack the gauge.** `UsageAggregator` now excludes `isSidechain` records when selecting the "most recent session" candidate.

### Added
- **Absolute token counts next to the gauge percentage** (`≈72K/1M`) and an age chip — the gauge dims after 4 hours of inactivity so a stale reading isn't mistaken for a live one.

## [0.1.49] - 2026-07-30

### Fixed
- **The session context gauge never appeared at all on native Windows.** v0.1.48's workspace scoping compared `cwd` (from `.jsonl`, written as-is from `process.cwd()` — e.g. `C:\_project\...`) against VS Code's `workspaceFolders[0].uri.fsPath`, which lowercases the drive letter (`c:\_project\...`) per `vscode-uri`'s `uriToFsPath`. The match was case-sensitive, so on Windows it always found zero candidates and the gauge silently hid itself — a 100% reproduction on native Windows, unrelated to CLI version or the JS vs. native binary.
  - **Fix**: path comparison now folds case only when *both* sides look like a Windows drive path (`X:\...`); POSIX paths keep case-sensitive matching untouched. `WorkspaceMapper`'s workspace↔project matching shares the same fix since it uses the same utility.
- **No way to tell a real "no session" state apart from this bug.** The gauge hid itself unconditionally on zero match, so a genuine "no session for this workspace yet" looked identical to the Windows bug above — which is why the regression went unnoticed through release. It now shows "No session record for this workspace" whenever the machine has session history but none of it matches the current workspace, and only hides itself when there's no session history at all.

## [0.1.48] - 2026-07-27

### Fixed
- **Session context gauge showed the wrong repo's usage in multi-repo setups.** `UsageAggregator.aggregate()` always picked the most recently active session across the entire `~/.claude/projects` directory, regardless of which workspace VS Code had open — so a different repo's context usage could appear in a workspace where you hadn't even started a session yet.
  - **Fix**: `aggregate()` now accepts an optional `workspaceRoot` and scopes the session-context candidate to records whose `cwd` falls under it. No match under the workspace means the gauge hides itself — no silent fallback to a different repo's numbers. Passing no `workspaceRoot` preserves the previous cross-project behavior.
  - **Known limitation**: `workspaceRoot` always resolves to the first folder of the workspace, not whichever one is currently focused, because the gauge only recomputes on `.jsonl` file changes (not on editor-focus changes) — tying the scope to "currently focused" without also recomputing on focus change would show a stale value under a now-incorrect label, which is worse than the fixed-first-folder behavior. This only matters for multi-root workspaces; most multi-repo setups use one VS Code window per repo (single-root), which this fully solves.
  - The matching logic (path normalization + prefix match) is shared with `WorkspaceMapper.cwdMatchesWorkspace()`, previously unused dead code, via a new `src/utils/workspaceMatch.ts`.

### Added
- **Repo chip on the session context gauge.** A small `📁 <folder name>` chip below the gauge bar states which workspace the percentage is scoped to, with the full path as a tooltip — useful when the session was started from a subdirectory, where the folder name shown isn't necessarily the repo root.

## [0.1.47] - 2026-07-25

### Added
- **Session context gauge (sidebar).** Shows how full the latest session's context window is, as a compact bar below the monthly-cost row. Computed from the *most recent* assistant turn's `input_tokens + cache_read + cache_creation` against that model's window — not a cumulative sum, which would double-count the context on every turn and converge above 100%. Model windows resolve through the same exact → longest-prefix → family fallback used for pricing. Labeled `≈` and hidden entirely when there's no session to measure, because auto-compact isn't recorded in the logs and so can't be accounted for.
- **MCP server attribution (dashboard).** Cost attribution now breaks MCP usage down per server, parsed from `mcp__<server>__<tool>` tool names and ranked by call count. Share is **call-count based, not cost based** — a single assistant message can mix MCP and non-MCP tool calls, so decomposing *cost* per server is structurally impossible and would be false precision.
- **24h / 7d / All scope toggle (dashboard).** The attribution section — skills, the "Outside skills" bucket, subagents, and MCP servers — can now be scoped to the last 24 hours or 7 days instead of only all-time. Share denominators stay grand-total within each scope, so the existing no-double-counting guarantee holds per scope. Reuses the existing scope-toggle styling; no new visual language.

### Fixed
- **Burn Rate and Safe Until could stay stuck on "Collecting data…" indefinitely while you were idle.** If utilization didn't change between two polls, the measured rate was exactly `0`, and the display branches only accepted `> 0` — so being briefly idle at the default 5-minute poll interval was enough to reproduce it. A 5h window reset (negative delta) fell into the same trap.
  - **Fix**: burn-rate state is now derived by an explicit state machine (`no_usage` / `collecting` / `idle` / `active` / `window_reset`) in a dedicated pure module, so idle reads as `0.00%/min · idle` and a window reset falls back to the elapsed-time estimate, both clearly distinct from genuinely still collecting.
  - The slope is also averaged over the last 30 minutes of poll history instead of just the two most recent points, so a single noisy sample no longer swings the reading.
  - **Regression lock**: the label decision for all five states lives in one pure function with unit tests, rather than being branched by hand at each card — the original defect was that the two dashboard cards each wrote their own branch and only one of them handled idle.

### Security
- **Hardened two lookup maps keyed by strings that originate outside the extension** (MCP server names from `.jsonl` tool calls, and model names). Both were plain objects, so a key colliding with an inherited `Object.prototype` member — `constructor`, `toString`, `valueOf` — would read back an inherited function instead of `undefined`, silently corrupting an MCP call count into a string or producing `NaN%` in the context gauge. The MCP counter now uses a prototype-less map and the model lookup an own-property guard. No `Object.prototype` mutation was possible in either case; this closes a silent data-corruption path, not a privilege escalation.

## [0.1.46] - 2026-07-23

### Fixed
- **Sidebar tool/model/branch/monthly-cost chip rows no longer clip when the sidebar is narrowed.** These rows never wrapped, so chips that didn't fit on one line were simply cut off by the sidebar's scroll container instead of flowing to a new line — unlike every other section, which reflowed normally as the panel resized.
  - **Fix**: `.sb-chip-row` now sets `flex-wrap: wrap`, so chips wrap to additional lines instead of overflowing off-screen.
- **Faint stray border above the sidebar Usage Calendar header.** Its section header reused the shared `.sb-section-hdr` divider style (meant to separate collapsible sections), producing a redundant hairline directly under the Overage section. The calendar's header no longer draws that top border.

## [0.1.45] - 2026-07-23

### Added
- **Sidebar mini Usage Calendar** — a compact, last-3-months (90-day) version of the dashboard's GitHub-style heatmap, shown right after the Overage section. Reuses the dashboard's exact 12×12px cell size (same day-of-usage quartile coloring and hover tooltips as the fixed 1-year view, which is unchanged) rather than enlarging cells — a 90-day window was the sweet spot found by comparing several window lengths at the default ~300px sidebar width: 30/60 days left visible dead space on the right, 120 days overflowed into horizontal scroll, 90 fills it almost edge-to-edge with no scrolling. The legend is omitted to save vertical space, and the section itself is hidden entirely when there's no usage history yet (no "Collecting data…" placeholder).

### Fixed
- **"Open Dashboard" button rendered stuck to the section above it instead of pinned to the bottom of the sidebar**, and long sidebar content had no way to scroll. Root cause: the webview's mount `<div id="root">` had no explicit height, so `.sb-layout`'s `height: 100%` resolved against an auto-sized parent and collapsed to content size — leaving the `flex: 1` spacer with no room to push the button down.
  - **Fix**: `#root` now gets an explicit `height: 100%`, scoped to the sidebar (`body[data-mode="sidebar"] #root`) so the dashboard panel — which mounts the same `#root` id — is unaffected. The sidebar layout switched from `overflow: hidden` to `overflow-y: auto`, so content taller than the viewport now scrolls instead of clipping.
  - **Regression lock**: new Playwright checks (`scripts/verify-sidebar-layout.js`, `scripts/verify-sidebar-calendar.js`) render the real webview bundle and assert the button stays pinned with short content, the sidebar actually scrolls when content overflows, and the new calendar section renders in the right place without horizontal overflow.

## [0.1.44] - 2026-07-03

### Fixed
- **Usage Calendar silently hid the newest weeks when the dashboard was narrower than the fixed 1-year grid (54 weeks × 14px).** The grid area clipped its own overflow (`overflow: hidden`), so the intended horizontal scrollbar on the parent never engaged — and since the newest weeks live at the right edge, exactly the days you actually used got cut off, making the calendar look empty despite active usage.
  - **Fix**: the grid area is now the horizontal scroller, and the default scroll position is anchored to the right edge (today), GitHub-style. Scrolling left to browse the past is preserved across data refreshes instead of snapping back to today.
  - **Regression lock**: new Playwright check (`scripts/verify-calendar-clip.js`) renders the real webview bundle at 700px and asserts overflow engagement, right-anchored default, today-cell visibility, and scroll-position preservation.
- **Rate-limit poller requests now time out after 15s.** Previously a server that accepted the TCP connection but never responded would leave the request (and its socket) hanging forever — each poll cycle leaked another socket and the gauge went stale without any error surfaced. Timed-out requests are destroyed and reported through the existing `network_error` path.
- **Poller/credentials-watcher disposables no longer accumulate** in `context.subscriptions` on every settings change (hygiene — old instances were already stopped correctly).

### Changed
- **Zero hardcoded colors**: webview error/waiting fallbacks now use `var(--vscode-errorForeground)` / `var(--vscode-descriptionForeground)` (5 spots), and the StatusBar gauge text uses the theme's `charts.blue` instead of a fixed hex — dark/light themes now render consistently.
- **CSP nonces are now generated with `crypto.randomBytes`** via a single shared utility (`src/utils/nonce.ts`), replacing two duplicated `Math.random()` implementations.
- `JsonlParser` file stat is now async (`fs.promises.stat`) — no sync I/O on the extension host during refresh.
- Removed obsolete `@types/chokidar` stub (chokidar 3+ ships its own types); bumped `chart.js` to ^4.5.1.

## [0.1.43] - 2026-07-01

### Security
- **`credentialsPath` setting could be hijacked by a workspace's `.vscode/settings.json`.** The setting declared no `scope`, so it defaulted to `window` scope — a malicious repo could point it at an arbitrary file, and the extension would read that file and send its contents to Anthropic as a Bearer token.
  - **Fix**: the setting now declares `"scope": "machine"`, so VS Code ignores workspace-defined values for it at the platform level (the same mechanism used by `git.path`) and shows its own native warning if a workspace tries anyway.
  - **Defense-in-depth**: `resolveCredentialsPath()` (new pure function) resolves the path from `config.inspect()`'s `globalValue` only, ignoring `workspaceValue`/`workspaceFolderValue` outright — so the fix holds even if the `scope` declaration is ever accidentally removed.

### Added
- **Usage Calendar** — a GitHub-style contribution heatmap of your daily Claude Code cost, shown right after the Daily Cost card. Fixed 1-year (53-week) grid colored by day-of-usage quartile on the existing blue heat scale, with a hover tooltip (date · cost · tokens) and a highlighted "today" cell.
  - **History now backfills in full**: previously only the last 7 days were kept in permanent storage; every refresh now persists the entire jsonl-visible history (~30 days), so the calendar (and other history-based charts) fill in from day one instead of growing one day at a time.

## [0.1.42] - 2026-06-30

### Fixed
- **The retrospective ("Cost by Commit") card could still get stuck on "Collecting data…" in locked-down environments** — the surviving tail of the v0.1.37–v0.1.40 fixes. Unlike its sibling cards, the retrospective was **pull-only** (`GetRetroSummary` request): it relied on the usage push transitively re-triggering that pull. When security software interferes with the webview→extension request round-trip, that pull never completes, so the retro card alone stays wedged while every push-backed card recovers.
  - **Fix**: the retrospective is now delivered by **push** (`PushRetroSummary`, broadcast) like its sibling sections, with `GetRetroSummary` kept as a first-paint fallback (dual delivery). The extension pushes the retro on every usage refresh and on the panel's load-complete pull.
  - **No background-git regression**: the build+push is gated behind `DashboardPanel.isOpen`, so a closed panel never triggers a git shell-out on file changes. The existing `retroDirty` guard still skips redundant rebuilds.
  - **Verified**: the broadcast-methods unit test is flipped from "retro is pull-only (locked)" to "retro is push (primary) + pull (fallback)", locking `PushRetroSummary` into `WEBVIEW_BROADCAST_METHODS` as a regression guard. Full suite 76/76 green.

## [0.1.41] - 2026-06-26

### Fixed
- **"Login with Claude" button opened the Claude Code REPL instead of logging in, and the sidebar intermittently showed "Session Expired" while still logged in.** Two compounding bugs:
  - The button ran `claude login`, which is **not a valid subcommand** — the CLI treats `login` as a prompt and just starts an interactive session, so nothing logs in. Now runs **`claude auth login`** (the real auth command, confirmed against `claude --help`). Aliased shells can't be controlled from the extension; the hint text guides manual `claude auth login`.
  - Login state was inferred purely from a live **401** on the rate-limit poll. But the OAuth `accessToken` in `~/.claude/.credentials.json` is short-lived (~6–8h) and is only auto-refreshed **while the Claude Code CLI is running**. With the CLI idle, the cached token goes stale → 401 → "Session Expired" — a **false positive**, since the user is still logged in (valid refresh token). This is the intermittent "logged out" symptom.
- **New `token_stale` state (vs `token_expired`)**: when the access token is rejected but a refresh token is present, the sidebar now shows **"Token Refresh Needed — run Claude Code once to auto-refresh"** with a re-login escape hatch, instead of "Session Expired" (4 languages). An `expiresAt` pre-check short-circuits a doomed 401 round-trip.
- **`.credentials.json` is now watched** (chokidar, single-file): when the CLI refreshes the token, the extension **re-polls immediately**, eliminating the stale-token false-positive window while the CLI is active.
  - The extension never refreshes tokens itself (would violate Anthropic ToS and the project's "no private API" rule) — it only classifies and defers recovery to the CLI/user.

## [0.1.40] - 2026-06-26

### Fixed
- **Cost by Commit (and every usage card) permanently stuck on "Collecting data…"** — the real root cause behind the v0.1.37/v0.1.39 attempts, which mis-diagnosed it as git/RPC blocking. The dashboard panel and sidebar registered with `vscode-messenger` **omitting `PushUsageSummary` from `broadcastMethods`**, so per the library contract (`broadcastMethods.indexOf(method) >= 0`) the panel **never received the usage broadcast** — its `onNotification(PushUsageSummary)` handler was dead. Usage cards (model / cache / skill / daily / **Cost by Commit**) were only ever populated by the one-shot `GetUsageSummary` pull on view open; when that pull raced ahead of the async `.jsonl` parse it returned null and the placeholder stuck forever, recovering only on reopen. Rate-limit cards kept working because their methods *were* registered — exactly matching the observed "burn rate / safe-time show after a while, retro never does" symptom.
  - **Fix**: both registration sites now share a single `WEBVIEW_BROADCAST_METHODS` constant (including `PushUsageSummary`), so the two can't drift apart again. Cost by Commit is pull-only (no `PushRetroSummary`) and recovers transitively because the usage push re-triggers its pull.
  - **Verified**: deterministic unit test locking the constant + the library delivery filter, plus a **test-electron round-trip** (`npm run test:e2e`) proving in a real VS Code host that a panel with the fix receives `pushUsageSummary` while a control panel with the old list does not.

## [0.1.39] - 2026-06-24

### Fixed
- **Cost by Commit stuck on "Collecting data…"**: the retrospective card never replaced its loading placeholder, and refreshing the dashboard didn't help. Root cause was **not** the webview render path (which unconditionally replaces on any response) but that the **response never arrived**: `buildRetroSummary` shelled out to git **synchronously** (`spawnSync`), blocking the extension-host event loop so the RPC reply couldn't be delivered — and an active session writing `.jsonl` re-triggered the build on every push, keeping the loop wedged.
  - **Dropped `git log --name-only`**: the per-commit file list had **zero consumers** (attribution joins on timestamp+repo; the render never showed files) yet dominated cost on large repos — removing it cut a single heavy repo's `git log` ~5×.
  - **GitLogReader is now fully async** (`spawnSync` → `execFile` + `await`) with a **5s timeout**, so git can never block the host or hang indefinitely.
  - **Debounced + deduped rebuilds**: the summary is rebuilt only when records actually change (not on every push), concurrent requests share one build, and the full summary is persisted for **instant first-paint** across sessions.
  - **Extracted `renderRetro` into a pure module** (`retroView.ts` + `format.ts`) with unit tests locking the placeholder→render replace contract (incl. empty/null → "no data" and HTML escaping).

## [0.1.38] - 2026-06-22

### Changed
- **Cost by Skill — honest attribution**: the card previously only summed turns Claude Code stamped with an `attributionSkill`, which is **only main-chain turns while a skill is actively loaded** — measured at ~33% of cost-bearing turns. The other ~67% (plain requests, and lead-up work before/after a skill loads) silently vanished, making the card read as if it covered all cost.
  - **First-class "Outside skills" bucket**: that unattributed main-chain work (`!isSidechain && !attributionSkill`) is now shown as a first-class slice alongside skills — never hidden — reusing the v0.1.37 retrospective's "unattributed bucket" honesty pattern.
  - **Grand-total shares + `≈ Partial` badge**: skill shares are now computed over the grand total (skills + bucket), and the card header carries a `≈ Partial` badge with a disclaimer explaining the attribution scope.
  - **No double-counting**: subagent (sidechain) cost stays out of the bucket and is shown only in the separate "Subagent usage" line.
  - Localized in all 4 languages (ko/en/ja/zh). No new accent colors (bucket reuses the existing slate token).

## [0.1.37] - 2026-06-19

### Added
- **Cost by Commit — usage×git retrospective**: A new dashboard card attributes token cost to individual git commits, extending the existing branch-level Git ROI down to commit/feature granularity. Each row shows the commit, an approximate cost (`≈$`), a confidence dot, and its share of total.
  - **Honest approximation by design**: git commits are *not* recorded in session logs, so attribution is an approximate join on `timestamp + cwd + branch` (not an exact mapping). The card carries a prominent **`≈ Approximate`** badge and a join-method disclaimer.
  - **First-class "Other / Uncommitted" bucket**: work not yet committed (planning, discussion, research, debugging) — measured to be roughly half of output — is shown as a first-class slice rather than hidden, to avoid false precision.
  - **Survives the 30-day log window**: commit attributions are persisted SHA-keyed (`ccg-retro.json`, separate from the date-keyed history) so retro data outlives the rolling `.jsonl` window.
  - Localized in all 4 languages (ko/en/ja/zh). No new accent colors (reuses existing tokens).

## [0.1.36] - 2026-06-17

### Fixed
- **Cost by Skill card layout**: the dashboard card stretched full-width with no padding, unlike every other card — now aligned with the rest of the dashboard.
- **Lower CPU/IO on live updates**: incremental `.jsonl` parsing was silently re-reading each file in full on every change; it now reads only newly appended data, and rapid bursts of file changes are debounced into a single refresh. Noticeably lighter during active Claude Code sessions.
- **Memory leak on the cache hit-rate sparkline**: the chart was recreated without disposing the previous instance, leaking on every dashboard refresh — fixed for long-running windows.

### Changed
- Internal cleanup only (model-label/branch aggregation dedup); no behavior change, no new colors or tokens.

## [0.1.35] - 2026-06-16

### Fixed
- **Overage section no longer shows misleading "0%" when disabled**: When extra-usage (overage) is disabled/rejected (`anthropic-ratelimit-unified-overage-status: rejected`, e.g. `org_level_disabled`), the API omits the `overage-utilization` header, which the parser correctly defaulted to `0` — but rendering it as "0%" implied "0% used" rather than "unavailable". The sidebar now shows a **`DISABLED` chip** instead of a percentage when overage is rejected; the utilization percentage is shown **only when overage is active**.

### Added
- **Overage label tooltip**: The "Overage Usage" section label now carries a help tooltip clarifying that this percentage is the *overage rate-limit utilization* (how much of the overage allowance is used after the base 5h/7d quota is exhausted) — a **different metric** from the claude.ai Usage Credits ($ spend / monthly cap) shown on the web usage page. Localized in all 4 languages (ko/en/ja/zh).

### Notes
- The claude.ai "Usage Credits" percentage (e.g. `$3.80 / $30 ≈ 13%`) is a dollar-spend-vs-cap figure produced by claude.ai's internal usage API and is **not exposed in any official rate-limit header**; verified empirically that `overage-utilization` reports `0.0` even with overage enabled while the web page showed 13%. The two are distinct metrics, and the official header value is reported faithfully.

## [0.1.34] - 2026-06-12

### Fixed
- **Cache-creation cost accuracy (P0)**: Cache-creation tokens are now billed per TTL — 5-minute writes at 1.25× input and 1-hour writes at 2.0× input — instead of charging everything at the 5m rate. Real-history sampling showed 1h cache dominant (53.2M vs 9.8M tokens), so the old flat calculation under-counted cache-creation cost by ~50%. The parser reads `usage.cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}`; legacy logs without the breakdown fall back to the prior (5m) behavior. Cost math is consolidated into a single `calcCost()` source of truth.

### Added
- **`service_tier` awareness**: Parses `usage.service_tier`; `batch` tier applies a −50% cost multiplier (currently all traffic is `standard`, so no present-day impact — future-proofing).
- **Tool-count granularity**: The catch-all `other` bucket is split into `Read` (previously the largest hidden bucket), `Grep`/`Glob`, `WebFetch` (incl. `server_tool_use.web_fetch_requests`), and `MCP` (`mcp__*` tools). New categories surface as neutral sidebar chips (existing 6+1 accent cap preserved).
- **Cost by Skill**: New dashboard card breaks down cost by `attributionSkill` (sh-dev-loop, ship, plan, …) as a ranked single-accent bar list — a differentiator no competing IDE extension offers.
- **Subagent vs. main split**: Aggregates `isSidechain`/`agentId` to show subagent consumption share, cost, and unique-agent count.

### Notes
- Thinking-token separation was evaluated and deferred: `thinking` blocks are present but empty by default (`display: omitted`) and no separate thinking-token count is exposed in `usage` (folded into `output_tokens`) — data not available.

## [0.1.33] - 2026-06-11

### Added
- **Claude Fable 5 model support**: New top-tier model `claude-fable-5` (above Opus) is now recognized across pricing, sidebar chip, and dashboard model breakdown. Pricing: $10 / $50 per MTok (input / output). Added a dedicated brand accent `--c-fable` (#E0529C, rose) with dark/light badge + chip variants (6+1 accent cap, agreed 2026-06).

### Fixed
- **Model pricing accuracy**: Refreshed the embedded price snapshot to current Anthropic rates. Corrected the legacy `claude-opus-4` entry ($15/$75) — current Opus 4.5–4.8 are now priced at $5/$25, fixing a ~3× cost over-estimation for current Opus usage. Added explicit entries for Opus 4.5–4.8, Sonnet 4.5/4.6, and kept legacy Opus 4.0/4.1 at $15/$75.
- **`findPricing` prefix matching**: Reworked model→price resolution to longest-prefix matching so versioned IDs resolve correctly (e.g. `claude-opus-4-1-20250805` → legacy $15/$75 instead of falling through to a current-Opus entry). Covered by new unit tests (`test/unit/pricing.test.ts`).

## [0.1.32] - 2026-05-28

### Fixed
- **Usage Trend chart on first open**: Dashboard now pre-hydrates the trend chart with historical poll data on first open, eliminating the "Collecting data…" placeholder that appeared before the first manual refresh. The extension maintains a rolling buffer of up to 60 poll snapshots (`PollHistoryPoint[]`) and delivers them via the new `GetPollHistory` RPC before the initial `GetRateLimit` request, ensuring the chart renders immediately if the extension has been running.

## [0.1.31] - 2026-05-26

### Fixed
- **Overage billing link URL**: Corrected link target from `claude.ai/settings/billing` to `claude.ai/settings/usage` where the Usage Credits toggle actually lives.
- **Overage link label**: Updated text from "사용 크레딧 설정 →" to "사용량 설정 →" to match the correct page.

## [0.1.3] - 2026-05-26

### Changed
- **Overage Usage section redesign** (Sidebar): Removed show/hide pill toggle. Status is now always visible as a chip (`ACTIVE` / `BLOCKED`). Replaced `disabledReason` text with a `Usage Credits →` link button that opens `claude.ai/settings/billing` directly in the browser.

### Added
- `RequestOpenBillingSettings` message contract — webview notifies extension host, which calls `vscode.env.openExternal` to open the billing settings page.

## [0.1.2] - 2026-05-26

### Added
- **Overage section toggle** (Sidebar): Pill-style on/off toggle switch added to the Overage Usage section header. When toggled off, the progress bar and status chip are hidden while the header row remains visible for re-activation. Preference is persisted in `localStorage` (`ccg-show-overage`) and survives page reloads.

## [0.1.1] - 2026-05-25

### Added
- **Long-term cost persistence** (`CacheStore`): Daily usage snapshots are now saved to `globalStorageUri/ccg-history.json`. Each `refreshUsage()` cycle merges the latest 7 days into the store — data survives jsonl rotation (30-day rolling window) so 6-month and 1-year views are possible.
- **Long-term trend chart** (Dashboard): New section below Git ROI — line chart showing daily cost over 30 / 90 / 180 days (scope toggle). Data comes from `CacheStore` so it accumulates across sessions.
- **Monthly cost bar chart** (Dashboard): Aggregates historical daily data by YYYY-MM and renders a bar chart — see at a glance which month was most expensive.
- **This-month chip** (Sidebar): New `◑ this month $X.XX / ≈$Y.YY` chip below the branch row — current month accumulated cost plus a projected end-of-month estimate (linear extrapolation from elapsed days).
- **i18n**: 8 new translation keys for long-term trend UI (`this_month`, `projected`, `long_term_trend`, `monthly_cost`, `scope_30d`, `scope_90d`, `scope_180d`, `no_history_data`) in all 4 languages.

### Changed
- `UsageSummary` gains a new `historicalDays: DailyUsage[]` field — all persisted daily snapshots from `CacheStore`, sorted by date ascending and injected by the extension before each broadcast.
- Login command reverted to simple `claude login` in an integrated terminal (no platform-specific path detection — straightforward and works for the majority of setups).

## [0.1.0] - 2026-05-24

### Added
- **Git ROI — Branch cost tracking**: Every assistant response in `~/.claude/projects/**/*.jsonl` now includes a `gitBranch` field. Claude Code Gauge parses it directly — no `vscode.git` API needed.
- **Sidebar branch chip**: Active branch name + cumulative cost for that branch displayed as a `⎇ main · $0.42` chip below the tool usage row.
- **Dashboard Git ROI table**: New "Git ROI" section at the bottom of the Dashboard Panel — lists all branches with **Cost · Tokens · Sessions · Last Active** columns, sorted by cost descending.
- **Branch aggregation**: `UsageAggregator` now emits `branchBreakdown` (cost-sorted array) and `activeBranch` (most recent branch from latest record) in every `UsageSummary` push.
- **i18n**: 6 new translation keys (`branch_cost`, `git_roi`, `branch_label`, `sessions_label`, `last_active`, `no_branch_data`) added in all 4 supported languages (ko/en/ja/zh).

## [0.0.80] - 2026-05-21

### Fixed
- **Overage usage %**: Sidebar overage section now displays the actual utilization percentage (e.g., 101%) alongside the status chip. Previously only the "차단됨/활성" badge was shown with no numeric value.

### Changed
- **Section label clarity**: Renamed sidebar/panel labels — `세션 (5h)` → `세션사용량 (5h)`, `주간 (7d)` → `주간사용량 (7d)`, `초과` → `초과사용량`. Same change applied to all supported languages (en/ja/zh).

## [0.0.79] - 2026-05-20

### Fixed
- **Danger status color**: `danger` CSS class rules were missing — status badge, progress bar fill, progress bar outline, and rate-status chip now correctly render red (same as `blocked`) for the 90–<100 % range.

## [0.0.78] - 2026-05-20

### Changed
- **Status label refinement**: 90–100 % now displays **Danger** (위험) instead of Blocked — reserved **Blocked** (차단) exclusively for 100 % reached. Color scheme unchanged (both red). Applies consistently across StatusBar, Sidebar, and Dashboard Panel. A new `'danger'` status value was introduced in the internal type system; `worstStatus` priority order is `blocked > danger > allowed_warning > allowed`.

## [0.0.77] - 2026-05-19

### Changed
- **Status color thresholds**: Color decisions (StatusBar emoji 🟦🟨🟥 / background / font, Sidebar section dots / % text / progress bars, Dashboard progress bars / badge) now use fixed utilization % thresholds instead of raw Anthropic API status headers — 0–80 % blue · 80–90 % amber · 90–100 % red. API status header parsing is preserved in code for future re-enablement.

## [0.0.76] - 2026-05-19

### Changed
- **Status color unification**: StatusBar emoji gauge (🟦🟨🟥), background, font color and Sidebar section dots, utilization % text, progress bars now all derive color exclusively from the Anthropic API status value (`allowed` → blue · `allowed_warning` → amber · `blocked` → red). The previous utilization-% fallback thresholds (60%/80%) for preemptive color changes have been removed — color changes only when the API signals a state change.

## [0.0.75] - 2026-05-18

### Fixed
- **Dashboard loading state**: All data-dependent sections (Model Breakdown, Cache Efficiency, Tool Usage, Recently Edited Files, Recent Sessions) now show a pulsing "Collecting data…" indicator instead of an empty-state message while data is loading — prevents confusing "No data" flash on first open
- **Chart canvas overflow**: Daily Cost and Tool Usage canvases are now hidden until data arrives, preventing layout overflow that caused loading text to bleed into adjacent sections

## [0.0.74] - 2026-05-18

### Changed
- **Activity Bar icon**: Speedometer gauge SVG now correctly applied (16×16, semicircle track + active arc + needle + hub)
- **Marketplace icon**: Resized `icon.png` from 1024×1024 (~991 KB) to 256×256 (~27 KB) — 97% size reduction, faster extension panel load
- **README badges**: Replaced static badges with live shields.io badges — VS Marketplace version, Open VSX version, download count, MIT license

## [0.0.73] - 2026-05-18

### Added
- **StatusBar dual items**: Split into two independent `StatusBarItem` instances — `5H` and `7D` — each with its own emoji gauge and background color (yellow=warning / red=blocked)
- **StatusBar emoji gauge**: Usage level visualized as 5 colored squares (`🟦🟦🟦⬜⬜`) — blue for normal (0–50%), yellow for warning (50–90%), red for danger (90–100%)
- **Open Dashboard button**: Persistent button at the sidebar bottom — tactile depth styling (gradient + inner glow + press effect) — opens Dashboard Panel on click
- **Dashboard i18n**: All dashboard text (section headers, metric labels, chart titles, empty states, cache labels) fully translated via `t()` — respects the same 4-language setting as the sidebar
- **i18n real-time sync**: Language changes in the sidebar broadcast `PushLang` to the dashboard panel instantly — no panel reopen needed
- **New icon**: Speedometer gauge icon (PNG Marketplace + SVG Activity Bar) matching the extension's usage-monitoring identity

### Fixed
- **Overage section border**: Added `border-bottom` to the overage section for clear visual separation
- **Dashboard header spacing**: Removed duplicate `margin-left` on plan badge and status badge — consistent `gap: 4px` via flex container

### Internal
- `RequestSetLang` / `GetLang` / `PushLang` messaging contracts for cross-webview language sync
- `broadcastMethods` in `DashboardPanel` and `SidebarViewProvider` extended with `PushLang.method`
- Extension `globalState` persists language preference as `ccg-lang`

## [0.0.72] - 2026-05-18

### Changed
- **Sidebar title**: VS Code panel section name changed from `RATE LIMITS` → `CLAUDE CODE GAUGE` — eliminates redundant label duplication
- **Header layout**: Removed inner "Claude Code Gauge" title text; plan badge (`MAX 5X`) and status badge (`OK`) now lead the header row, followed by language selector, timestamp, and refresh button

### Added
- **Language selector** (sidebar header): Compact dropdown (`한국어 · English · 日本語 · 中文`) placed immediately after the OK badge — persists selection in `localStorage`, auto-detects from `navigator.language` on first open
- **i18n system** (`src/webview/i18n.ts`): 4-language dictionary (ko / en / ja / zh-CN) with `t()` lookup, `getLang()` / `setLang()` helpers, and `navigator.language` auto-detection fallback
- **Full UI translation**: All sidebar text — section labels, reset/burn/safe-until strings, error messages, login hints, overage labels — rendered in the selected language

## [0.0.71] - 2026-05-18

### Fixed
- **Sidebar section flattening** (P0): Removed nested card wrappers from Session and Weekly sections; replaced with flat `left-accent` bottleneck highlight and `sb-spacer` bottom fill — eliminates double-card layering artifact

## [0.0.70] - 2026-05-18

### Added
- **Tool usage chips** (sidebar): Color-coded `Edit N · Write N · Bash N · 🔍 N` chip row below the model/cache chips — shows today's tool call counts at a glance
- **Web search count** (sidebar): `🔍 N` chip sourced from `server_tool_use.web_search_requests` in `.jsonl` usage field
- **Tool usage histogram** (dashboard): Stacked bar chart showing Edit / Write / Bash / Search counts per day for the last 7 days
- **Recently edited files** (dashboard): List of up to 20 files touched in recent sessions, ordered by most-recent activity — shows filename and parent directory path

### Fixed
- **Sidebar card backgrounds** (P0): Session (5h) and Weekly (7d) rate cards now use `var(--vscode-sideBar-background)` instead of the slightly lighter card background — eliminates the double-card visual artifact
- **Dashboard section alignment** (P0): Cache Efficiency and Recent Sessions cards now have consistent `margin: 0 var(--sp-4)` matching all other dashboard sections — all 7 section cards align at the same left baseline as the 4-card metric grid

### Internal
- `ToolUseCounts` and `DailyToolStats` interfaces added to domain model
- `SessionRecord` extended with `toolCounts` and `editedFiles` fields
- `JsonlParser`: parses `message.content` tool_use blocks (Edit / MultiEdit / Write / Bash / WebSearch) and `usage.server_tool_use.web_search_requests`
- `UsageAggregator`: per-day tool rollup, recent-file tracking (last-seen timestamp dedup), `todayToolCounts` / `last7DaysTools` / `recentEditedFiles` added to `UsageSummary`

## [0.0.60] - 2026-05-17

### Added
- **Model chip**: Sidebar now shows today's top model (Opus / Sonnet / Haiku) as a color-coded chip below the token count row
- **Cache hit rate chip**: Sidebar shows today's cache hit rate (e.g. `⚡ 72%`) with saved cost in tooltip — powered by `cache_read_input_tokens` from `.jsonl`, no private API
- **Model breakdown section**: Dashboard panel includes a doughnut chart + bar list showing per-model cost share (Opus / Sonnet / Haiku) for today
- **Cache efficiency section**: Dashboard panel shows today's cache hit rate KPI, cumulative saved cost, and a 7-day hit rate sparkline

### Internal
- `ModelBreakdown` and `CacheStats` interfaces added to domain model
- `DailyUsage` extended with `cacheHitRate` field for per-day sparkline
- `UsageSummary` extended with `modelBreakdown[]` and `cacheStats`
- `UsageAggregator`: per-model token/cost rollup, cache hit rate formula (`cache_read / (input + cache_creation + cache_read)`), cache saved cost via LiteLLM price delta

## [0.0.5] - 2026-05-16

### Added
- **Today's usage summary**: Sidebar now shows "오늘 N tokens · ~$X.XX" one-line row — powered by local `.jsonl` parsing, no extra API call
- **7-day cost bar chart**: Dashboard panel now includes a daily cost chart for the last 7 days
- **Recent sessions list**: Dashboard shows up to 20 most recent sessions with start time, working directory, token count, and cost

### Infrastructure
- `FileWatcher`: chokidar v3 file watcher with WSL `usePolling` fallback, `depth:2`, 3 s polling interval
- `JsonlParser`: incremental `readline` parser with `mtime`+`offset` cache, `progress`/`file-history-snapshot` type filter, dual dedup via `requestId` (streaming) + `message.id` (cross-file)
- `UsageAggregator`: daily/weekly/monthly rollup with LiteLLM-based cost calculation
- `WorkspaceMapper`: encode-then-match pattern for `~/.claude/projects/<encoded>` resolution
- `src/utils/pricing.ts`: Claude model price snapshot (opus-4 / sonnet-4-5 / haiku-4-5)
- New messaging contracts: `GetUsageSummary` / `PushUsageSummary`

## [0.0.4] - 2026-05-15

### Added
- **Plan badge**: Subscription type and rate-limit tier (e.g. "Max 5x") now displayed as a badge in the sidebar and panel headers, read from `~/.claude/.credentials.json`
- **Overage section**: Dedicated progress bar + Active/Blocked chip for overage (extra usage) quota — shown when the API reports overage state
- **Fallback banner**: Inline warning banner when Claude falls back to reduced speed (e.g. "50% speed") — parsed from `anthropic-ratelimit-unified-fallback` header
- **Bottleneck highlight**: The current limiting window card (5h or 7d) is visually highlighted with an amber border — driven by `anthropic-ratelimit-unified-representative-claim`
- **7d surpassed-threshold badge**: Red `>75%` badge on the Weekly card when a usage threshold has been surpassed

### Internal
- `CredentialsReader` now reads `subscriptionType`, `rateLimitTier`, `organizationUuid` from credentials
- `RateLimitPoller` parses 9 additional API response headers (overage ×3, fallback ×2, representative-claim, 7d-surpassed-threshold, upgrade-paths)
- New types: `PlanInfo`, `OverageWindow`, `FallbackInfo` added to domain model

## [0.0.31] - 2026-05-14

### Changed
- **Status badge placement**: Moved "OK / Warning / Blocked" badge from standalone row to inline right of the title in sidebar and dashboard headers — one badge per view instead of three
- **Removed duplicate status chips**: SESSION and WEEKLY cards no longer show individual OK chips; progress bar color (teal / amber / red) conveys per-window status
- **Sidebar card spacing**: Added 3% horizontal margin to SESSION / WEEKLY cards so they float slightly from the sidebar walls

## [0.0.3] - 2026-05-14

### Fixed
- **Sidebar whitespace**: Removed default `body` margin and card side margins — content now fills full sidebar width
- **Progress bars inverted**: Bars were showing remaining% instead of used% due to block-element default width; now correctly animate from 0 to actual utilization
- **Status badge unstyled "OK"**: CSP blocked inline `style=""` attributes; fixed by adding `'unsafe-inline'` to `style-src` and converting status colors to CSS classes
- **Burn Rate / Safe Until stuck on "Collecting data…"**: Now computes an estimated burn rate from session elapsed time when only one poll point is available (labeled `est.`); shows "No usage yet" when utilization is zero

### Added
- **Trend chart time scope selector**: Toggle between 30m / 2h (default) / 24h views directly on the chart
- **Chart X-axis seconds**: Labels now include `HH:MM:SS` for better granularity in short windows
- **Smart data points**: Shows dot markers when ≤10 data points for readability in sparse views

## [0.0.2] - 2026-05-13

### Changed
- Extension renamed to Claude Code Gauge (claude-code-gauge)
- README and marketplace listing updated

## [0.0.1] - 2026-05-12

### Added
- **StatusBar**: Always-visible session (5h) % · weekly (7d) % indicator
- **Sidebar**: `used% · left%` dual display, 12px status-colored progress bars (green OK / amber Warning / red Blocked), real-time `HH:MM:SS` timestamp
- **Burn Rate**: `%/min` and `%/hr` consumption speed from polling history
- **Safe Until**: Predicted quota exhaustion time + projected remaining at reset
- **Dashboard Panel**: SESSION · WEEKLY · BURN RATE · SAFE UNTIL 4-card layout + utilization trend chart
- **Threshold alerts**: Native VS Code warning notification on utilization threshold breach
- **Auto-polling**: 5-minute interval polling via Anthropic `/v1/messages` API headers
- **Error UI**: `credentials_missing` / `token_expired` / `network_error` state differentiation with login prompt
