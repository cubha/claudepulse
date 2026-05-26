const STORAGE_KEY = 'ccg-lang';

type Lang = 'ko' | 'en' | 'ja' | 'zh';

const dict: Record<string, Record<Lang, string>> = {
  // 에러 / 연결 상태
  login_required:   { ko: '로그인 필요',       en: 'Login Required',        ja: 'ログイン必要',             zh: '需要登录' },
  session_expired:  { ko: '세션 만료',          en: 'Session Expired',       ja: 'セッション期限切れ',       zh: '会话过期' },
  network_error:    { ko: '네트워크 오류',      en: 'Network Error',         ja: 'ネットワークエラー',       zh: '网络错误' },
  connecting:       { ko: '연결 중…',           en: 'Connecting…',           ja: '接続中…',                 zh: '连接中…' },
  login_sub_missing:{ ko: 'Claude Code CLI가 설치되어 있지 않거나<br>로그인되지 않았습니다.',
                      en: 'Claude Code CLI is not installed or<br>you are not logged in.',
                      ja: 'Claude Code CLIがインストールされていないか<br>ログインされていません。',
                      zh: 'Claude Code CLI 未安装或<br>您尚未登录。' },
  login_sub_expired:{ ko: 'OAuth 토큰이 만료됐습니다.<br>다시 로그인해 주세요.',
                      en: 'OAuth token has expired.<br>Please log in again.',
                      ja: 'OAuthトークンが期限切れです。<br>再ログインしてください。',
                      zh: 'OAuth 令牌已过期。<br>请重新登录。' },
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
  // Overage
  overage:          { ko: '초과사용량',           en: 'Overage Usage',         ja: '超過使用量',               zh: '超额用量' },
  overage_active:   { ko: '활성',               en: 'Active',                ja: 'アクティブ',               zh: '活跃' },
  overage_blocked:  { ko: '차단됨',             en: 'Blocked',               ja: 'ブロック',                 zh: '已屏蔽' },
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
  // 장기 트렌드
  this_month:       { ko: '이번달',              en: 'This Month',            ja: '今月',                    zh: '本月' },
  projected:        { ko: '예상',               en: 'Projected',             ja: '予測',                    zh: '预测' },
  long_term_trend:  { ko: '장기 비용 트렌드',     en: 'Long-term Cost Trend',  ja: '長期コストトレンド',       zh: '长期费用趋势' },
  monthly_cost:     { ko: '월별 비용',            en: 'Monthly Cost',          ja: '月別コスト',              zh: '月度费用' },
  scope_30d:        { ko: '30일',               en: '30d',                   ja: '30日',                    zh: '30天' },
  scope_90d:        { ko: '90일',               en: '90d',                   ja: '90日',                    zh: '90天' },
  scope_180d:       { ko: '180일',              en: '180d',                  ja: '180日',                   zh: '180天' },
  no_history_data:  { ko: '이력 데이터 없음…',    en: 'No history data…',      ja: '履歴データなし…',          zh: '暂无历史数据…' },
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
  waiting_poll:     { ko: '첫 폴링 대기 중… (≈5분) 또는 ↻ 클릭', en: 'Waiting for first poll… (≈5 min) or click ↻', ja: '初回ポーリング待機中… (約5分) または ↻ をクリック', zh: '等待首次轮询…（约5分钟）或点击 ↻' },
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
