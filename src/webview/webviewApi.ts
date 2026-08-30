// acquireVsCodeApi() 단독 소유(v0.1.54 ST5) — VS Code Webview는 이 함수를 프로세스당 1회만
// 호출 가능하다(재호출 시 throw). sidebarView.ts/panelView.ts 둘 다 이 모듈에서만 값을 가져온다.
//
// esbuild가 vscode-messenger-webview 내부의 acquireVsCodeApi를 빈 모듈로 번들링하는 문제 우회.
// 글로벌에서 직접 호출해 캐싱 후 Messenger 생성자에 전달한다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const vsApi: unknown = typeof (globalThis as any).acquireVsCodeApi === 'function'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ? (globalThis as any).acquireVsCodeApi()
  : undefined;
