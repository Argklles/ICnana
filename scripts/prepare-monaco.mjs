#!/usr/bin/env node
/**
 * 把 node_modules 里的 Monaco 运行时拷到 public/monaco/vs，
 * 前端再用 loader.config({ paths: { vs: "/monaco/vs" } }) 走本地加载。
 *
 * 这样：
 *  - 断网也能打开编辑器（之前走 jsdelivr CDN）
 *  - 首次打开不用等下载 5MB
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/monaco-editor/min/vs");
const dest = resolve(root, "public/monaco/vs");

if (!existsSync(src)) {
  console.error("找不到 node_modules/monaco-editor，先 npm install");
  process.exit(1);
}

mkdirSync(resolve(dest, ".."), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[monaco] ${src} → ${dest}`);
