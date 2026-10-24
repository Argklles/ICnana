#!/usr/bin/env node
/**
 * KaTeX 的 CSS 会同时引用 woff2 / woff / ttf 三种字体格式。
 * 现代 WebKit / Chromium 全都支持 woff2，另外两种只是白占安装包体积。
 * 构建完成后把非 woff2 的字体删掉（CSS 里的 @font-face 依然按顺序
 * 先命中 woff2，删掉后面的格式不会影响渲染）。
 */
import { readdirSync, unlinkSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "dist/assets");

let freed = 0;
for (const f of readdirSync(dir)) {
  const lower = f.toLowerCase();
  if ((lower.endsWith(".woff") && !lower.endsWith(".woff2")) || lower.endsWith(".ttf")) {
    const size = statSync(resolve(dir, f)).size;
    freed += size;
    unlinkSync(resolve(dir, f));
    console.log(`[prune] 删除 ${f} (${(size / 1024).toFixed(0)} KB)`);
  }
}
console.log(`[prune] 共省 ${(freed / 1024).toFixed(0)} KB`);
