import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const prod = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !prod,
  minify: prod,
  logLevel: 'info'
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'dist/webview/main.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: !prod,
  minify: prod,
  logLevel: 'info'
};

async function copyAssets() {
  await mkdir('dist/webview', { recursive: true });
  await copyFile('src/webview/styles.css', 'dist/webview/styles.css');
  if (existsSync('media')) {
    // media는 vsce가 직접 패키징하므로 dist 복사 불필요
  }
}

async function run() {
  if (watch) {
    const extCtx = await context(extensionConfig);
    const webCtx = await context(webviewConfig);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    await copyAssets();
    console.log('[esbuild] watching extension + webview...');
  } else {
    await Promise.all([build(extensionConfig), build(webviewConfig)]);
    await copyAssets();
    console.log('[esbuild] build complete.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
