import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type { RateLimitSnapshot, UnifiedWindow } from '../types';

export class StatusBarController {
  private item5h: vscode.StatusBarItem;
  private item7d: vscode.StatusBarItem;

  constructor() {
    // 5H item이 더 왼쪽에 오도록 priority를 7D보다 높게
    this.item5h = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1001);
    this.item5h.command = COMMANDS.openDashboard;

    this.item7d = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.item7d.command = COMMANDS.openDashboard;
  }

  show(): void {
    this.item5h.show();
    this.item7d.show();
  }

  /**
   * 두 아이템을 상태바에서 내린다(v0.2.3 R2).
   *
   * Codex가 활성일 때 "update만 멈추는" 선택지는 틀렸다 — 마지막 Claude 값이 화면에 그대로
   * 남아 Codex를 쓰는 동안 남의 수치를 읽게 된다. 이 컨트롤러는 RateLimitSnapshot의 고정
   * fiveHour/sevenDay 의미론에 묶여 있어 Codex의 가변 버킷(300/10080/43200분)을 두 칸에
   * 담을 수 없다. panelView.ts의 CLAUDE_ONLY_PANEL_IDS와 같은 판단 — 잘못된 라벨로 반쯤
   * 맞는 화면보다 정직한 gap이 낫다.
   */
  hide(): void {
    this.item5h.hide();
    this.item7d.hide();
  }

  update(snapshot: RateLimitSnapshot, todayCostUsd?: number): void {
    const fh = snapshot.fiveHour;
    const sd = snapshot.sevenDay;

    // 5H item
    this.item5h.text = `5H ${this.pctToSquares(fh.utilization, fh.status)} ${this.fmtPct(fh.utilization)}`;
    this.item5h.backgroundColor = this.windowBackground(fh);
    this.item5h.color = this.windowColor(fh);
    this.item5h.tooltip = this.buildTooltip(snapshot, todayCostUsd);

    // 7D item
    this.item7d.text = `7D ${this.pctToSquares(sd.utilization, sd.status)} ${this.fmtPct(sd.utilization)}`;
    this.item7d.backgroundColor = this.windowBackground(sd);
    this.item7d.color = this.windowColor(sd);
    this.item7d.tooltip = undefined;
  }

  dispose(): void {
    this.item5h.dispose();
    this.item7d.dispose();
  }

  private windowBackground(w: UnifiedWindow): vscode.ThemeColor | undefined {
    if (w.status === 'blocked' || w.status === 'danger') return new vscode.ThemeColor('statusBarItem.errorBackground');
    if (w.status === 'allowed_warning') return new vscode.ThemeColor('statusBarItem.warningBackground');
    return undefined;
  }

  private windowColor(w: UnifiedWindow): vscode.ThemeColor | undefined {
    if (w.status === 'blocked' || w.status === 'danger' || w.status === 'allowed_warning') return undefined;
    // 하드코딩 hex 금지(§3#5) — 테마가 정의한 차트 블루로 브랜드 톤 유지(라이트/다크 추종)
    return new vscode.ThemeColor('charts.blue');
  }

  private pctToSquares(pct: number, status: UnifiedWindow['status']): string {
    const filled = pct < 0.10 ? 0
      : pct < 0.30 ? 1
      : pct < 0.50 ? 2
      : pct < 0.70 ? 3
      : pct < 0.90 ? 4
      : 5;
    const sq = (status === 'blocked' || status === 'danger') ? '🟥' : status === 'allowed_warning' ? '🟨' : '🟦';
    return sq.repeat(filled) + '⬜'.repeat(5 - filled);
  }

  private fmtPct(pct: number): string {
    return `${(pct * 100).toFixed(0)}%`;
  }

  private buildTooltip(snapshot: RateLimitSnapshot, todayCostUsd?: number): vscode.MarkdownString {
    const fh = snapshot.fiveHour;
    const sd = snapshot.sevenDay;
    const costLine = todayCostUsd != null ? `\n\nToday: **$${todayCostUsd.toFixed(2)}**` : '';
    return new vscode.MarkdownString(
      `**AgentVitals**\n\n` +
      `Session (5h): **${this.fmtPct(fh.utilization)}** · resets in ${this.fmtReset(fh.msUntilReset)}\n\n` +
      `Weekly (7d): **${this.fmtPct(sd.utilization)}** · resets in ${this.fmtReset(sd.msUntilReset)}` +
      costLine + `\n\n_Click to open dashboard_`
    );
  }

  private fmtReset(ms: number): string {
    if (ms <= 0) return 'now';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
}
