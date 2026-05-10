import * as vscode from 'vscode';

export class Logger {
  private channel: vscode.OutputChannel;

  constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name);
  }

  info(msg: string): void {
    this.channel.appendLine(`[info] ${new Date().toISOString()} ${msg}`);
  }

  warn(msg: string): void {
    this.channel.appendLine(`[warn] ${new Date().toISOString()} ${msg}`);
  }

  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `\n${err.stack ?? err.message}` : err ? `\n${String(err)}` : '';
    this.channel.appendLine(`[error] ${new Date().toISOString()} ${msg}${detail}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
