const STORAGE_KEY = 'ccg-lang';

type Lang = 'ko' | 'en' | 'ja' | 'zh';

const dict: Record<string, Record<Lang, string>> = {
  // 에러 / 연결 상태
  login_required:   { ko: '로그인 필요',       en: 'Login Required',        ja: 'ログイン必要',             zh: '需要登录' },
  token_refresh_needed:{ ko: '토큰 갱신 필요',  en: 'Token Refresh Needed',  ja: 'トークン更新が必要',       zh: '需要刷新令牌' },
  session_expired:  { ko: '세션 만료',          en: 'Session Expired',       ja: 'セッション期限切れ',       zh: '会话过期' },
  network_error:    { ko: '네트워크 오류',      en: 'Network Error',         ja: 'ネットワークエラー',       zh: '网络错误' },
  connecting:       { ko: '연결 중…',           en: 'Connecting…',           ja: '接続中…',                 zh: '连接中…' },
  // v0.2.0 ST8: login_sub_missing을 설치축/인증축 2키로 분할(PLAN §6) — not_installed는
  // 별도 login_sub_not_installed로 분기하므로 이 키는 "설치는 됐지만 인증 안 됨" 전용으로 좁힌다.
  login_sub_missing:{ ko: '로그인되지 않았습니다.',
                      en: 'You are not logged in.',
                      ja: 'ログインされていません。',
                      zh: '您尚未登录。' },
  not_installed_title:{ ko: 'CLI 미설치', en: 'CLI Not Installed', ja: 'CLI 未インストール', zh: '未安装 CLI' },
  login_sub_not_installed:{ ko: 'Claude Code CLI가 설치되어 있지 않습니다.<br>설치 후 로그인하세요.',
                      en: 'Claude Code CLI is not installed.<br>Install it, then log in.',
                      ja: 'Claude Code CLIがインストールされていません。<br>インストール後にログインしてください。',
                      zh: '未安装 Claude Code CLI。<br>请安装后登录。' },
  install_claude_cmd:{ ko: 'npm install -g @anthropic-ai/claude-code',
                      en: 'npm install -g @anthropic-ai/claude-code',
                      ja: 'npm install -g @anthropic-ai/claude-code',
                      zh: 'npm install -g @anthropic-ai/claude-code' },
  login_sub_expired:{ ko: 'OAuth 토큰이 만료됐습니다.<br>다시 로그인해 주세요.',
                      en: 'OAuth token has expired.<br>Please log in again.',
                      ja: 'OAuthトークンが期限切れです。<br>再ログインしてください。',
                      zh: 'OAuth 令牌已过期。<br>请重新登录。' },
  login_sub_stale:  { ko: '세션이 만료된 게 아닙니다. Claude Code를 한 번<br>실행하면 토큰이 자동 갱신됩니다. 계속 뜨면 다시 로그인하세요.',
                      en: 'Not a logout — run Claude Code once to<br>auto-refresh the token. If it persists, log in again.',
                      ja: 'ログアウトではありません。Claude Codeを一度<br>実行するとトークンが自動更新されます。続く場合は再ログインを。',
                      zh: '并非登出 — 运行一次 Claude Code 即可<br>自动刷新令牌。若仍出现，请重新登录。' },
  login_sub_network:{ ko: 'Anthropic API에 연결할 수 없습니다.<br>네트워크를 확인하세요.',
                      en: 'Cannot connect to Anthropic API.<br>Please check your network.',
                      ja: 'Anthropic APIに接続できません。<br>ネットワークを確認してください。',
                      zh: '无法连接到 Anthropic API。<br>请检查您的网络。' },
  connecting_sub:   { ko: 'Anthropic API에서 Rate Limit 정보를<br>가져오는 중…',
                      en: 'Fetching Rate Limit info from<br>Anthropic API…',
                      ja: 'Anthropic APIからRate Limit情報を<br>取得中…',
                      zh: '正在从 Anthropic API 获取<br>Rate Limit 信息…' },
  // 버튼 / 힌트
  login_with_claude:{ ko: 'Claude로 로그인',    en: 'Login with Claude',     ja: 'Claudeでログイン',         zh: '使用 Claude 登录' },
  login_hint:       { ko: '로그인 후 ↻ 버튼을 눌러 새로고침하세요',
                      en: 'After login, press ↻ to refresh',
                      ja: 'ログイン後、↻を押して更新してください',
                      zh: '登录后，按 ↻ 刷新' },
  retry:            { ko: '↻ 다시 시도',        en: '↻ Retry',               ja: '↻ 再試行',                zh: '↻ 重试' },

  // Codex 프로바이더(v0.2.0 ST7/ST8) — 스위처 라벨 + Codex 전용 3단 빈 상태.
  // 로그인 버튼 없음(설치 명령만) vs 있음(CLI 명령만)의 구분은 Claude와 동일 원칙(§6).
  provider_claude:  { ko: 'Claude',              en: 'Claude',                ja: 'Claude',                  zh: 'Claude' },
  provider_codex:   { ko: 'Codex',               en: 'Codex',                 ja: 'Codex',                   zh: 'Codex' },
  // 사이드바 footer(ST9 신설) — plan_type 문자열은 원본 그대로 대문자화만 하고 분기 금지(PLAN §8
  // 불변식3, serde(other) 폴백 존재). null일 때만 이 키로 대체한다.
  plan_unknown:     { ko: '플랜 미상',            en: 'Plan unknown',          ja: 'プラン不明',               zh: '套餐未知' },
  // Codex 대시보드/사이드바 신규 패널(verify-impl B-V1/B-V2/B-V6 보완, v0.2.0) — 추론 토큰·
  // 컨텍스트 창 실측·가변 버킷 안내. 사용률(%)이 아니라 크기 실측치라 "사용률" 표현을 피한다.
  reasoning_tokens: { ko: '추론 토큰',            en: 'Reasoning tokens',      ja: '推論トークン',              zh: '推理令牌' },
  codex_context_window: { ko: '컨텍스트 창',      en: 'Context window',        ja: 'コンテキストウィンドウ',      zh: '上下文窗口' },
  codex_context_window_note: { ko: 'CLI가 보고한 모델 컨텍스트 창 크기(실측). 사용률이 아닙니다.',
    en: 'Model context window size as reported by the CLI (measured). Not a usage percentage.',
    ja: 'CLIが報告したモデルのコンテキストウィンドウサイズ(実測)。使用率ではありません。',
    zh: 'CLI 报告的模型上下文窗口大小(实测)。不是使用率。' },
  codex_variable_bucket_note: { ko: '지표 밴드도 가변입니다 — Free 플랜은 "주간" 대신 "30일" 한 칸만, rate_limits가 없으면 소모율·안전 시간만 남습니다.',
    en: 'The metric band is variable too — Free plans show a single "30 days" slot instead of "Weekly", and without rate_limits only burn rate and safe time remain.',
    ja: '指標バンドも可変です — Freeプランは「週間」の代わりに「30日」の1枠のみ、rate_limitsがない場合は消費率と安全時間のみ残ります。',
    zh: '指标带也是可变的 — Free 套餐只显示"30天"一格而非"每周",没有 rate_limits 时只保留消耗率和安全时间。' },
  codex_extra_panel_title: { ko: '대신 새로 생기는 것', en: 'New in its place', ja: '代わりに新設される項目', zh: '取而代之的新内容' },
  plan_label:       { ko: '플랜',                 en: 'Plan',                  ja: 'プラン',                    zh: '套餐' },
  codex_not_installed_title:{ ko: 'Codex CLI 미설치', en: 'Codex CLI Not Installed', ja: 'Codex CLI 未インストール', zh: '未安装 Codex CLI' },
  codex_not_installed_sub:{ ko: '아래 명령으로 설치 후 로그인하세요.<br>설치돼 있지 않으면 로그인해도 소용없습니다.',
                      en: 'Install with the command below, then log in.<br>Logging in won’t help until it’s installed.',
                      ja: '下のコマンドでインストール後、ログインしてください。<br>未インストールの間はログインしても無意味です。',
                      zh: '请先用以下命令安装，然后登录。<br>未安装前登录无效。' },
  install_codex_cmd:{ ko: 'npm install -g @openai/codex', en: 'npm install -g @openai/codex', ja: 'npm install -g @openai/codex', zh: 'npm install -g @openai/codex' },
  codex_not_authenticated_title:{ ko: '로그인 필요', en: 'Login Required', ja: 'ログイン必要', zh: '需要登录' },
  codex_not_authenticated_sub:{ ko: 'Codex CLI에 로그인되어 있지 않습니다.',
                      en: 'You are not logged in to the Codex CLI.',
                      ja: 'Codex CLIにログインされていません。',
                      zh: '您尚未登录 Codex CLI。' },
  login_cmd_codex:  { ko: 'codex login',         en: 'codex login',          ja: 'codex login',             zh: 'codex login' },
  codex_no_records_sub:{ ko: '아직 Codex 세션 기록이 없습니다.',
                      en: 'No Codex session history yet.',
                      ja: 'まだCodexセッション履歴がありません。',
                      zh: '暂无 Codex 会话记录。' },
  // window_minutes 런타임 생성 라벨(codexRollout.ts extractRateLimitBuckets 계약) — 5h/7d/30d 하드코딩 금지 그 자체는
  // 로직에서 지키고, 여기는 그 3종이 실제로 나왔을 때 쓸 표시 문구만 제공한다.
  codex_bucket_5h:  { ko: '5시간',                en: '5-Hour',                ja: '5時間',                   zh: '5小时' },
  codex_bucket_7d:  { ko: '주간(7일)',            en: 'Weekly (7d)',           ja: '週間(7日)',                zh: '每周(7天)' },
  codex_bucket_30d: { ko: '월간(30일)',           en: 'Monthly (30d)',         ja: '月間(30日)',               zh: '每月(30天)' },
  // 사용량
  no_usage_today:   { ko: '오늘 사용량 없음',   en: 'No usage today',        ja: '本日の使用量なし',         zh: '今日无使用记录' },
  tokens:           { ko: '토큰',               en: 'tokens',                ja: 'トークン',                 zh: '令牌' },
  // 섹션
  session_5h:       { ko: '세션사용량 (5h)',       en: 'Session Usage (5h)',     ja: 'セッション使用量 (5h)',     zh: '会话用量 (5h)' },
  weekly_7d:        { ko: '주간사용량 (7d)',       en: 'Weekly Usage (7d)',      ja: '週間使用量 (7d)',           zh: '每周用量 (7d)' },
  resets_in:        { ko: '재설정까지',          en: 'resets in',             ja: 'リセットまで',             zh: '重置于' },
  left:             { ko: '남음',                en: 'left',                  ja: '残り',                    zh: '剩余' },
  burn:             { ko: '소모율',              en: 'Burn',                  ja: '消費率',                   zh: '消耗率' },
  safe_until:       { ko: '안전 시간',           en: 'Safe until',            ja: '安全期限',                 zh: '安全至' },
  proj:             { ko: '예측',               en: 'proj',                  ja: '予測',                    zh: '预测' },
  idle_label:       { ko: '유휴',               en: 'idle',                  ja: 'アイドル',                 zh: '空闲' },
  // Overage
  overage:          { ko: '초과사용량',           en: 'Overage Usage',         ja: '超過使用量',               zh: '超额用量' },
  overage_active:   { ko: '활성',               en: 'Active',                ja: 'アクティブ',               zh: '活跃' },
  overage_blocked:  { ko: '차단됨',             en: 'Blocked',               ja: 'ブロック',                 zh: '已屏蔽' },
  overage_disabled: { ko: '비활성',             en: 'Disabled',              ja: '無効',                     zh: '已禁用' },
  overage_tooltip:  { ko: '기본 5h/7d 한도를 초과해 사용한 overage 비율입니다. claude.ai 사용 크레딧($ 지출)과는 다른 지표입니다.', en: 'Share of overage rate-limit used after your base 5h/7d quota is exhausted. Different from claude.ai Usage Credits ($ spend).', ja: '基本5h/7d上限を超えて使用したoverage割合です。claude.aiの使用クレジット($支出)とは別の指標です。', zh: '基础5h/7d额度用尽后使用的overage比例。与claude.ai使用额度($支出)是不同指标。' },
  billing_settings: { ko: '사용량 설정 →',     en: 'Usage Settings →',      ja: '使用量設定 →',              zh: '使用量设置 →' },
  // 상태 배지
  status_ok:        { ko: 'OK',                 en: 'OK',                    ja: 'OK',                      zh: '正常' },
  status_warning:   { ko: '경고',               en: 'Warning',               ja: '警告',                    zh: '警告' },
  status_danger:    { ko: '위험',               en: 'Danger',                ja: '危険',                    zh: '危险' },
  status_blocked:   { ko: '차단',               en: 'Blocked',               ja: 'ブロック',                 zh: '已屏蔽' },
  // 대시보드 버튼
  open_dashboard:   { ko: '대시보드 열기',       en: 'Open Dashboard',        ja: 'ダッシュボードを開く',     zh: '打开仪表板' },
  // 대시보드 섹션 헤더
  burn_rate:        { ko: '소모율',              en: 'Burn Rate',             ja: '消費率',                  zh: '消耗率' },
  safe_until_label: { ko: '안전 시간',           en: 'Safe Until',            ja: '安全期限',                zh: '安全至' },
  util_trend:       { ko: '사용량 추세',          en: 'Utilization Trend',     ja: '使用量トレンド',           zh: '使用率趋势' },
  scope_label:      { ko: '범위',               en: 'Scope',                 ja: '範囲',                    zh: '范围' },
  daily_cost:       { ko: '일별 비용 (최근 7일)', en: 'Daily Cost (Last 7 Days)', ja: '日別コスト (直近7日)',  zh: '每日费用（近7天）' },
  model_breakdown:  { ko: '모델별 분석 (오늘)',   en: 'Model Breakdown (Today)', ja: 'モデル別分析 (今日)',    zh: '模型分析（今天）' },
  cache_efficiency: { ko: '캐시 효율 (오늘)',     en: 'Cache Efficiency (Today)', ja: 'キャッシュ効率 (今日)', zh: '缓存效率（今天）' },
  tool_usage:       { ko: '도구 사용 (최근 7일)', en: 'Tool Usage (Last 7 Days)', ja: 'ツール使用 (直近7日)',  zh: '工具使用（近7天）' },
  recently_edited:  { ko: '최근 편집 파일',       en: 'Recently Edited Files', ja: '最近編集したファイル',     zh: '最近编辑的文件' },
  recent_sessions:  { ko: '최근 세션',           en: 'Recent Sessions',       ja: '最近のセッション',         zh: '最近会话' },
  // 행 상한 / 펼치기 (v0.1.55)
  show_more:        { ko: '더보기',              en: 'Show more',             ja: 'もっと見る',               zh: '显示更多' },
  // 회고 커밋 스코프 (v0.1.55)
  retro_scope_mine: { ko: '내 커밋만',           en: 'my commits only',       ja: '自分のコミットのみ',       zh: '仅我的提交' },
  retro_scope_all:  { ko: '전체 커밋',           en: 'all commits',           ja: '全コミット',               zh: '全部提交' },
  retro_scope_degraded: {
    ko: 'user.email이 설정되지 않은 저장소가 있어 전체 커밋으로 표시합니다 — 다른 사람의 커밋에도 비용이 귀속될 수 있습니다.',
    en: 'Some repos have no user.email, so all commits are shown — cost may be attributed to other people\'s commits.',
    ja: 'user.email 未設定のリポジトリがあるため全コミットを表示します — 他人のコミットに費用が帰属する場合があります。',
    zh: '部分仓库未设置 user.email，因此显示全部提交 — 费用可能被归属到他人的提交。' },
  show_less:        { ko: '접기',                en: 'Show less',             ja: '折りたたむ',               zh: '收起' },
  // 가격 신호 정직성 (v0.1.55)
  pricing_unknown:  { ko: '가격 미상',           en: 'price unknown',         ja: '価格不明',                 zh: '价格未知' },
  pricing_estimated:{ ko: '근사',                en: 'approx.',               ja: '近似',                    zh: '近似' },
  share_by_tokens:  { ko: '토큰 기준',           en: 'by tokens',             ja: 'トークン基準',             zh: '按令牌' },
  pricing_unknown_note: {
    ko: '가격표에 없는 모델이 있어 비용이 과소계상됩니다. 비율은 토큰 기준으로 표시합니다.',
    en: 'Some models are missing from the price table, so cost is undercounted. Shares are shown by tokens.',
    ja: '価格表にないモデルがあるためコストが過少計上されます。比率はトークン基準で表示します。',
    zh: '价格表中缺少部分模型，费用被低估。占比按令牌显示。' },
  cost_unknown_days: {
    ko: '일부 과거 날짜는 당시 가격표에 없던 모델이라 비용이 $0으로 남아 있습니다(토큰 수는 정상).',
    en: 'Some past days show $0 because their models were missing from the price table at the time (token counts are correct).',
    ja: '一部の過去の日付は当時の価格表に無いモデルのため費用が$0のままです(トークン数は正常)。',
    zh: '部分历史日期因当时价格表缺少相应模型而费用显示为 $0（令牌数正常）。' },
  // 대시보드 수치 라벨
  remaining_label:  { ko: '남음',               en: 'remaining',             ja: '残り',                    zh: '剩余' },
  used_label:       { ko: '사용됨',              en: 'used',                  ja: '使用済',                  zh: '已用' },
  after_reset:      { ko: '리셋 후',             en: 'After reset',           ja: 'リセット後',               zh: '重置后' },
  left_at_reset:    { ko: '리셋 시 남음',         en: 'left at reset',         ja: 'リセット時残量',           zh: '重置时剩余' },
  est_label:        { ko: '추정',               en: 'est.',                  ja: '推定',                    zh: '估算' },
  // 대시보드 캐시 라벨
  hit_rate_today:   { ko: '히트율 (오늘)',        en: 'Hit Rate (Today)',      ja: 'ヒット率 (今日)',           zh: '命中率（今天）' },
  saved_today:      { ko: '절약 (오늘)',          en: 'Saved (Today)',         ja: '節約額 (今日)',             zh: '节省（今天）' },
  seven_day_rate:   { ko: '7일 히트율',           en: '7-Day Hit Rate',        ja: '7日間ヒット率',            zh: '7天命中率' },
  // Git / 브랜치
  branch_cost:       { ko: '브랜치 비용',          en: 'Branch Cost',           ja: 'ブランチコスト',           zh: '分支费用' },
  git_roi:           { ko: 'Git ROI',              en: 'Git ROI',               ja: 'Git ROI',                 zh: 'Git ROI' },
  branch_label:      { ko: '브랜치',               en: 'Branch',                ja: 'ブランチ',                 zh: '分支' },
  sessions_label:    { ko: '세션',                 en: 'Sessions',              ja: 'セッション',               zh: '会话' },
  last_active:       { ko: '최근 활동',             en: 'Last Active',           ja: '最終活動',                 zh: '最近活动' },
  no_branch_data:    { ko: '브랜치 데이터 없음…',   en: 'No branch data…',       ja: 'ブランチデータなし…',      zh: '暂无分支数据…' },
  // 비용 귀속 (스킬·서브에이전트)
  skill_attribution: { ko: '스킬별 비용',           en: 'Cost by Skill',         ja: 'スキル別コスト',           zh: '按技能成本' },
  skill_label:       { ko: '스킬',                 en: 'Skill',                 ja: 'スキル',                  zh: '技能' },
  no_skill_data:     { ko: '스킬 귀속 데이터 없음…', en: 'No skill data…',        ja: 'スキルデータなし…',        zh: '暂无技能数据…' },
  skill_scope_badge: { ko: '≈ 부분 귀속',          en: '≈ Partial',             ja: '≈ 部分帰属',              zh: '≈ 部分归属' },
  skill_scope_disclaimer: { ko: '스킬별 비용은 Skill(슬래시 커맨드)이 활성화된 동안의 메인 작업만 귀속됩니다. 스킬 밖 직접 작업은 "스킬 외 작업"으로 집계되고, 서브에이전트 위임 비용은 별도 표시됩니다.',
                      en: 'Skill cost is attributed only to main-chain work while a Skill (slash command) is active. Work outside any skill is grouped as "Outside skills", and subagent-delegated cost is shown separately.',
                      ja: 'スキル別コストはSkill(スラッシュコマンド)が有効な間のメイン作業のみ帰属します。スキル外の直接作業は「スキル外の作業」として集計され、サブエージェント委任コストは別途表示されます。',
                      zh: '技能成本仅归属于Skill(斜杠命令)激活期间的主链工作。技能之外的直接工作归入"技能外工作"，子代理委派成本单独显示。' },
  skill_unattributed: { ko: '스킬 외 작업',         en: 'Outside skills',        ja: 'スキル外の作業',           zh: '技能外工作' },
  skill_unattributed_tip: { ko: '활성 스킬이 없던 메인 작업(평문 요청·스킬 로드 전후의 직접 작업). 숨기면 거짓 정밀도이므로 1급으로 표시합니다.',
                      en: 'Main-chain work with no active skill (plain requests, and work before/after a skill loads). Shown first-class rather than hidden to avoid false precision.',
                      ja: 'アクティブなスキルがなかったメイン作業(平文リクエストやスキル読込前後の直接作業)。隠すと誤った精度になるため1級表示します。',
                      zh: '没有激活技能时的主链工作(平文请求、技能加载前后的直接工作)。隐藏会造成虚假精度，故作为一级显示。' },
  subagent_consumption: { ko: '서브에이전트 소비',  en: 'Subagent usage',        ja: 'サブエージェント消費',      zh: '子代理消耗' },
  agents_label:      { ko: '에이전트',             en: 'agents',                ja: 'エージェント',             zh: '代理' },
  attr_scope_all:    { ko: '전체',                en: 'All',                   ja: '全期間',                  zh: '全部' },
  attr_scope_24h:    { ko: '24시간',              en: '24h',                   ja: '24時間',                  zh: '24小时' },
  attr_scope_7d:     { ko: '7일',                 en: '7d',                    ja: '7日',                     zh: '7天' },
  mcp_attribution:   { ko: 'MCP 서버별 호출',       en: 'Calls by MCP Server',   ja: 'MCPサーバー別呼び出し',     zh: '按 MCP 服务器调用' },
  no_mcp_data:       { ko: 'MCP 호출 없음',         en: 'No MCP calls',          ja: 'MCP呼び出しなし',          zh: '暂无 MCP 调用' },
  context_usage:     { ko: '컨텍스트 사용률',        en: 'Context Usage',         ja: 'コンテキスト使用率',        zh: '上下文使用率' },
  context_gauge_tooltip: { ko: '최근 턴 기준 근사치입니다. auto-compact(자동 압축) 발생 여부는 반영되지 않습니다.',
                      en: 'Approximate, based on the latest turn. Does not account for auto-compact.',
                      ja: '直近ターン基準の近似値です。auto-compact(自動圧縮)は反映されません。',
                      zh: '基于最近一轮的近似值，未考虑 auto-compact（自动压缩）。' },
  context_repo_label: { ko: '워크스페이스', en: 'Workspace', ja: 'ワークスペース', zh: '工作区' },
  context_no_session: { ko: '이 워크스페이스의 세션 기록 없음',
                      en: 'No session record for this workspace',
                      ja: 'このワークスペースのセッション記録なし',
                      zh: '此工作区暂无会话记录' },
  context_no_session_tooltip: { ko: '컨텍스트 사용률은 현재 워크스페이스에서 실행된 세션만 집계합니다. 다른 폴더에서 Claude Code를 실행했다면 여기 표시되지 않습니다.',
                      en: 'Context usage counts only sessions started in the current workspace. Sessions run from another folder are not shown here.',
                      ja: 'コンテキスト使用率は現在のワークスペースで実行されたセッションのみを集計します。他のフォルダで実行した場合はここに表示されません。',
                      zh: '上下文使用率仅统计在当前工作区中运行的会话。若在其他文件夹运行则不会显示。' },
  context_age_label: { ko: '측정 시각', en: 'Measured', ja: '測定時刻', zh: '测量时间' },
  context_picker_tooltip: { ko: '클릭하여 표시할 세션을 선택/고정할 수 있습니다.',
                      en: 'Click to select or pin the session shown here.',
                      ja: 'クリックして表示するセッションを選択・固定できます。',
                      zh: '点击以选择或固定要显示的会话。' },
  context_pinned_tooltip: { ko: '고정된 세션입니다. 클릭하여 변경하세요.',
                      en: 'This session is pinned. Click to change it.',
                      ja: '固定されたセッションです。クリックして変更してください。',
                      zh: '此会话已固定，点击可更改。' },
  context_revert_link: { ko: '자동 모드로 되돌리기', en: 'Switch back to auto', ja: '自動モードに戻す', zh: '切换回自动模式' },
  context_revert_tooltip: { ko: '고정한 세션이 오래 조용합니다. 자동(최근 활동 세션)으로 되돌립니다.',
                      en: 'The pinned session has been idle for a while. Switch back to auto (most recently active session).',
                      ja: '固定したセッションが長時間非アクティブです。自動(直近活動セッション)に戻します。',
                      zh: '固定的会话已长时间无活动。切换回自动模式（最近活动的会话）。' },
  // 장기 트렌드
  this_month:       { ko: '이번달',              en: 'This Month',            ja: '今月',                    zh: '本月' },
  projected:        { ko: '예상',               en: 'Projected',             ja: '予測',                    zh: '预测' },
  long_term_trend:  { ko: '장기 비용 트렌드',     en: 'Long-term Cost Trend',  ja: '長期コストトレンド',       zh: '长期费用趋势' },
  monthly_cost:     { ko: '월별 비용',            en: 'Monthly Cost',          ja: '月別コスト',              zh: '月度费用' },
  // 기간별 비용 통합 탭(v0.2.2). 위 daily_cost/long_term_trend/monthly_cost 3키는 **삭제하지 않는다** —
  // daily_cost는 panelView의 브랜치 비용 라벨이 t('daily_cost').split(' ')[0]로 재사용 중이고,
  // 나머지 둘도 탭 라벨과 의미가 달라(전체 문구 vs 짧은 탭명) 대체 관계가 아니다.
  cost_by_period:   { ko: '기간별 비용',          en: 'Cost by Period',        ja: '期間別コスト',            zh: '按周期费用' },
  period_tab_daily: { ko: '일별',                 en: 'Daily',                 ja: '日別',                    zh: '每日' },
  period_tab_longterm: { ko: '장기',              en: 'Long-term',             ja: '長期',                    zh: '长期' },
  period_tab_monthly: { ko: '월별',               en: 'Monthly',               ja: '月別',                    zh: '月度' },
  scope_30d:        { ko: '30일',               en: '30d',                   ja: '30日',                    zh: '30天' },
  scope_90d:        { ko: '90일',               en: '90d',                   ja: '90日',                    zh: '90天' },
  scope_180d:       { ko: '180일',              en: '180d',                  ja: '180日',                   zh: '180天' },
  no_history_data:  { ko: '이력 데이터 없음…',    en: 'No history data…',      ja: '履歴データなし…',          zh: '暂无历史数据…' },
  // Usage Calendar 히트맵 (v0.1.43)
  usage_calendar:   { ko: '사용량 캘린더',        en: 'Usage Calendar',        ja: '使用量カレンダー',         zh: '使用量日历' },
  calendar_less:    { ko: '적음',                en: 'Less',                  ja: '少ない',                  zh: '较少' },
  calendar_more:    { ko: '많음',                en: 'More',                  ja: '多い',                    zh: '较多' },
  calendar_today_tag:{ ko: '오늘',               en: 'Today',                 ja: '今日',                    zh: '今天' },
  calendar_mon:     { ko: '월',                  en: 'Mon',                   ja: '月',                      zh: '一' },
  calendar_wed:     { ko: '수',                  en: 'Wed',                   ja: '水',                      zh: '三' },
  calendar_fri:     { ko: '금',                  en: 'Fri',                   ja: '金',                      zh: '五' },
  // 빈 상태 메시지
  collecting_data:  { ko: '데이터 수집 중…',      en: 'Collecting data…',      ja: 'データ収集中…',            zh: '收集数据中…' },
  collecting_poll:  { ko: '데이터 수집 중… (다음 폴링 ~5분 후)', en: 'Collecting data… (next poll in ~5 min)', ja: 'データ収集中… (次回ポーリング約5分後)', zh: '收集数据中…（下次轮询约5分钟后）' },
  no_scope_data:    { ko: '선택 범위에 데이터 없음 — 더 넓은 범위로 시도', en: 'No data in selected scope — try a wider range', ja: '選択範囲にデータなし — 範囲を広げてください', zh: '所选范围无数据 — 请尝试更宽范围' },
  no_usage_today2:  { ko: '오늘 사용량 없음…',    en: 'No usage today…',       ja: '本日の使用量なし…',         zh: '今日无使用记录…' },
  no_cache_data:    { ko: '캐시 데이터 없음…',    en: 'No cache data…',        ja: 'キャッシュデータなし…',     zh: '无缓存数据…' },
  no_tool_data:     { ko: '도구 데이터 없음…',    en: 'No tool data…',         ja: 'ツールデータなし…',         zh: '无工具数据…' },
  no_files_yet:     { ko: '파일 없음…',           en: 'No files yet…',         ja: 'ファイルなし…',            zh: '暂无文件…' },
  no_sessions_yet:  { ko: '세션 없음…',           en: 'No sessions yet…',      ja: 'セッションなし…',          zh: '暂无会话…' },
  no_usage_yet:     { ko: '아직 사용량 없음',      en: 'No usage yet',          ja: 'まだ使用量なし',           zh: '暂无使用记录' },
  // usage×git 회고 (v0.1.37) — 근사조인·미귀속 버킷·불확실성 UX
  usage_git_retro:  { ko: '커밋별 비용 회고',      en: 'Cost by Commit',        ja: 'コミット別コスト',         zh: '按提交成本' },
  retro_approx_badge:{ ko: '≈ 근사치',            en: '≈ Approximate',         ja: '≈ 近似値',                zh: '≈ 近似值' },
  retro_disclaimer: { ko: 'git 커밋은 세션 로그에 기록되지 않아 저장소+시각 윈도로 근사 귀속합니다. rebase/squash 시 부정확할 수 있습니다.',
                      en: 'Git commits are not recorded in session logs, so usage is approximately attributed by repository + time window. May be inaccurate after rebase/squash.',
                      ja: 'gitコミットはセッションログに記録されないため、リポジトリ+時刻ウィンドウで近似帰属します。rebase/squash後は不正確な場合があります。',
                      zh: 'git提交不会记录在会话日志中，因此按仓库+时间窗口近似归属。rebase/squash后可能不准确。' },
  retro_unattributed:{ ko: '기타 / 미커밋 작업',   en: 'Other / Uncommitted',   ja: 'その他 / 未コミット',      zh: '其他 / 未提交' },
  retro_unattributed_tip:{ ko: '아직 커밋되지 않은 작업(기획·토론·리서치·디버깅). 실측상 출력의 약 절반을 차지하며, 숨기지 않고 1급으로 표시합니다.',
                      en: 'Work not yet committed (planning, discussion, research, debugging). Measured to be ~half of output — shown first-class rather than hidden.',
                      ja: 'まだコミットされていない作業(企画・議論・調査・デバッグ)。実測で出力の約半分を占め、隠さず一級表示します。',
                      zh: '尚未提交的工作(规划·讨论·调研·调试)。实测约占输出的一半，作为一级项显示而非隐藏。' },
  retro_confidence: { ko: '신뢰도',               en: 'Confidence',            ja: '信頼度',                  zh: '置信度' },
  confidence_high:  { ko: '높음',                 en: 'High',                  ja: '高',                      zh: '高' },
  confidence_medium:{ ko: '보통',                 en: 'Medium',                ja: '中',                      zh: '中' },
  confidence_low:   { ko: '낮음',                 en: 'Low',                   ja: '低',                      zh: '低' },
  retro_records:    { ko: '레코드',               en: 'records',               ja: 'レコード',                 zh: '记录' },
  no_retro_data:    { ko: '회고 데이터 없음 (git repo 아님 또는 커밋 없음)…', en: 'No retro data (not a git repo or no commits)…', ja: '会顧データなし (gitリポジトリでないかコミットなし)…', zh: '暂无回顾数据（非git仓库或无提交）…' },
  waiting_poll:     { ko: '첫 폴링 대기 중… (≈5분) 또는 ↻ 클릭', en: 'Waiting for first poll… (≈5 min) or click ↻', ja: '初回ポーリング待機中… (約5分) または ↻ をクリック', zh: '等待首次轮询…（约5分钟）或点击 ↻' },

  // ── 게이지 밖 ① 캐시 정상범위 밴드 ──
  cache_band_normal: { ko: '정상',                 en: 'Normal',                ja: '正常',                    zh: '正常' },
  cache_band_drop:   { ko: '급락',                 en: 'Drop',                  ja: '急落',                    zh: '骤降' },
  cache_band_note:   {
    ko: '정상 범위(60~90%)를 벗어나면 세션이 잘게 끊기거나 프롬프트 앞부분이 매번 바뀌고 있다는 신호입니다.',
    en: 'Outside the normal range (60–90%) usually means sessions are fragmented or the prompt prefix keeps changing.',
    ja: '正常範囲(60~90%)を外れると、セッションが細切れになっているかプロンプト冒頭が毎回変わっている可能性があります。',
    zh: '超出正常范围（60~90%）通常意味着会话被拆得过碎，或提示词前缀每次都在变化。' },
  // C1 보드의 핵심 주장 — "스파크라인은 이미 있다, 없는 건 이 수치가 뭘 뜻하는지다". 툴팁이 아니라 본문에 노출한다.
  cache_band_msg_normal: {
    ko: '최근 7일 · 프롬프트 재사용이 잘 되고 있다',
    en: 'Last 7 days · prompt reuse is working well',
    ja: '直近7日 · プロンプト再利用がうまく機能している',
    zh: '最近 7 天 · 提示词复用运作良好' },
  cache_band_msg_drop: {
    ko: '범위를 벗어났다 — 세션이 잘게 끊기거나 프롬프트 앞부분이 매번 바뀌고 있다',
    en: 'Out of range — sessions are fragmented, or the prompt prefix keeps changing',
    ja: '範囲外 — セッションが細切れか、プロンプト冒頭が毎回変わっている',
    zh: '超出范围 — 会话被拆得过碎，或提示词前缀每次都在变化' },

  // ── 게이지 밖 ③ 비용 이상 감지 ──
  cost_anomaly_vs_median:  { ko: '평소 대비',            en: 'vs. usual',             ja: '平常時比',                 zh: '相较平常' },
  cost_anomaly_median_note:{ ko: '30일 중앙값',           en: '30-day median',         ja: '30日間中央値',             zh: '30天中位数' },
  cost_today_label:        { ko: '오늘',                 en: 'Today',                 ja: '今日',                    zh: '今天' },
  cost_usual_label:        { ko: '평소 (30일 중앙값)',     en: 'Usual (30-day median)', ja: '平常 (30日間中央値)',       zh: '平常（30天中位数）' },
  cost_median_line_legend: { ko: '가는 선 = 평소 수준',     en: 'Thin line = usual level', ja: '細い線 = 平常水準',        zh: '细线 = 平常水平' },
  cost_anomaly_hint:       {
    ko: '예산 기능이 아니다 — 자기 자신의 평소와 비교할 뿐이라 목표치 설정이 필요 없다.',
    en: 'Not a budget feature — it only compares against your own usual level, so no target to configure.',
    ja: '予算機能ではない — 自分自身の平常時と比較するだけなので目標値の設定は不要。',
    zh: '这不是预算功能 — 仅与你自己的平常水平比较，无需设置目标值。' },

  // ── 게이지 밖 ④ 페이스 라인 ──
  pace_baseline_label:     { ko: '기준 페이스',           en: 'Baseline Pace',         ja: '基準ペース',               zh: '基准节奏' },
  pace_actual_label:       { ko: '실제',                 en: 'Actual',                ja: '実際',                    zh: '实际' },
  pace_window_start:       { ko: '창 시작',               en: 'Window start',          ja: 'ウィンドウ開始',           zh: '窗口开始' },
  pace_window_reset:       { ko: '리셋',                 en: 'Reset',                 ja: 'リセット',                 zh: '重置' },
  pace_exhaust_projected:  { ko: '소진 예상',             en: 'Est. exhaustion',       ja: '消耗予測',                 zh: '预计耗尽' },
  pace_safe_no_exhaust:    { ko: '리셋 전 소진 없음',       en: 'No exhaustion before reset', ja: 'リセット前の消耗なし',    zh: '重置前不会耗尽' },
  // C4 보드의 판정 문장 — 점선(기준 페이스) 대비 실제선 위치가 곧 "리셋 전에 막히는가"의 답이다.
  pace_above_baseline:     {
    ko: '실제선이 기준 페이스 위 — 이 속도면 리셋 전에 막힌다',
    en: 'Above baseline pace — at this rate you hit the limit before reset',
    ja: '実際線が基準ペースの上 — このペースならリセット前に止まる',
    zh: '实际线高于基准节奏 — 按此速度将在重置前触顶' },
  pace_below_baseline:     {
    ko: '실제선이 기준 페이스 아래 — 이 속도면 리셋까지 여유가 있다',
    en: 'Below baseline pace — at this rate you have room until reset',
    ja: '実際線が基準ペースの下 — このペースならリセットまで余裕がある',
    zh: '实际线低于基准节奏 — 按此速度到重置前仍有余量' },
};

function detectLang(): Lang {
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '') ?? '';
  if (nav.startsWith('ko')) return 'ko';
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

export function getLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && ['ko', 'en', 'ja', 'zh'].includes(stored)) return stored;
  } catch { /* storage unavailable */ }
  return detectLang();
}

export function setLang(lang: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
}

export function t(key: string): string {
  const lang = getLang();
  return dict[key]?.[lang] ?? dict[key]?.['en'] ?? key;
}
