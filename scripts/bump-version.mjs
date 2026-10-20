#!/usr/bin/env node
/**
 * 版本号同步脚本。
 *
 * 发版前最烦的一件事是这个版本号散在 5 个文件里，手改容易漏，
 * 漏了就会出现「tag 是 v1.2.0，安装包叫 icnana_1.0.4_x64-setup.exe」这种事故。
 *
 * 用法：
 *   node scripts/bump-version.mjs 1.2.0      # 全部改成 1.2.0
 *   node scripts/bump-version.mjs --check    # 只检查五处是否一致，不一致退出码 1
 *   node scripts/bump-version.mjs 1.2.0 --dry-run
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const check = args.includes("--check");
const dryRun = args.includes("--dry-run");
const version = args.find((a) => /^\d+\.\d+\.\d+/.test(a));

if (!check && !version) {
  console.error("用法: node scripts/bump-version.mjs <x.y.z> | --check");
  process.exit(2);
}

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
if (version && !SEMVER.test(version)) {
  console.error(`版本号格式不对: ${version}`);
  process.exit(2);
}

const read = (p) => readFileSync(resolve(root, p), "utf8");
const write = (p, text) => {
  if (!dryRun) writeFileSync(resolve(root, p), text, "utf8");
};

/** package.json —— 顶层 version */
function patchPackageJson(text) {
  return text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
}

/** package-lock.json —— 顶层和 packages[""] 两处 */
function patchPackageLock(text) {
  const data = JSON.parse(text);
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  return JSON.stringify(data, null, 2) + "\n";
}

/** Cargo.toml —— 只改 [package] 段里的 version */
function patchCargoToml(text) {
  const lines = text.split("\n");
  let inPackage = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\[package\]\s*$/.test(lines[i])) inPackage = true;
    else if (/^\[/.test(lines[i])) inPackage = false;
    else if (inPackage && /^version\s*=/.test(lines[i])) {
      lines[i] = `version = "${version}"`;
      break;
    }
  }
  return lines.join("\n");
}

/** Cargo.lock —— 只改 name = "icnana" 那个包的 version */
function patchCargoLock(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'name = "icnana"') {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/^version\s*=/.test(lines[j])) {
          lines[j] = `version = "${version}"`;
          return lines.join("\n");
        }
      }
    }
  }
  return text;
}

/** tauri.conf.json —— 顶层 version */
function patchTauriConf(text) {
  const data = JSON.parse(text);
  data.version = version;
  return JSON.stringify(data, null, 2) + "\n";
}

const targets = [
  ["package.json", patchPackageJson, (t) => JSON.parse(t).version],
  ["package-lock.json", patchPackageLock, (t) => JSON.parse(t).version],
  ["src-tauri/Cargo.toml", patchCargoToml, (t) => t.match(/^version = "([^"]+)"/m)?.[1]],
  ["src-tauri/Cargo.lock", patchCargoLock, (t) => {
    const i = t.indexOf('name = "icnana"');
    return i >= 0 ? t.slice(i).match(/version = "([^"]+)"/)?.[1] : undefined;
  }],
  ["src-tauri/tauri.conf.json", patchTauriConf, (t) => JSON.parse(t).version],
];

// ── 检查模式 ──────────────────────────────────────────
if (check) {
  const found = targets.map(([file, , get]) => [file, get(read(file))]);
  const versions = new Set(found.map(([, v]) => v));
  for (const [file, v] of found) {
    console.log(`${v === [...versions][0] ? "  " : "✗ "}${file.padEnd(28)} ${v ?? "(读不到)"}`);
  }
  if (versions.size !== 1) {
    console.error(`\n版本号不一致: ${[...versions].join(", ")}`);
    process.exit(1);
  }
  console.log(`\n✓ 五处版本号一致: ${[...versions][0]}`);
  process.exit(0);
}

// ── 写入模式 ──────────────────────────────────────────
console.log(`${dryRun ? "[dry-run] " : ""}版本号 → ${version}\n`);
for (const [file, patch, get] of targets) {
  const before = read(file);
  const after = patch(before);
  const changed = before !== after;
  console.log(`  ${changed ? "✓" : "·"} ${file.padEnd(28)} ${get(before)} → ${get(after)}`);
  if (changed) write(file, after);
}

console.log("\n下一步：");
console.log('  git add -A && git commit -m "chore: 版本号 ' + version + '"');
console.log("  git tag v" + version);
console.log("  git push origin main && git push origin v" + version);
