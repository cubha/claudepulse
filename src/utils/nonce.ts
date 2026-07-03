import { randomBytes } from 'node:crypto';

/**
 * Webview CSP nonce 생성 (단일 진실원).
 * Math.random()은 예측 가능해 nonce 목적(암호학적 무작위성)에 부적합 — crypto.randomBytes 사용.
 */
export function getNonce(): string {
  return randomBytes(16).toString('hex');
}
