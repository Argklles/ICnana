//存放一些静态常量

export const DEFAULT_TEMPLATE = `// 开始编写你的代码喵！！
#include <bits/stdc++.h>
using namespace std;

typedef long long ll;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  return 0;
}`;

// src/config/constants.ts
import { CompileSettings, Favorite } from "./types";

// ── 编译环境默认值 ────────────────────────────────────────
// c++17 是现在的主流档位；O2 对齐评测机；静态链接避免缺 DLL。
export const DEFAULT_COMPILE_SETTINGS: CompileSettings = {
  std: "c++17",
  opt: "O2",
  staticLink: true,
  marchNative: false,
};

// 默认外观
export const DEFAULT_APPEARANCE = {
  bgImage: "",
  bgOpacity: 1,
  baseGradient: false,
  scrim: 0.28,
  glassColor: "#0d0d14",
  glassGradient: false,
  glassColor2: "#f78fb3",
  glassAlpha: 0.60,
  glassBlur: 12,
  glassFidelity: 0.55,
  radius: 10,
  /* 顺序：左上 右上 右下 左下，true = 直角 */
  // 左侧栏贴窗口左边，默认左上/左下是直角；右侧栏同理
  leftSquare: [true, false, false, true],
  rightSquare: [false, true, true, false],
  titlebarAlpha: 0.35,
  titlebarColor: "#0d0d14",
  titlebarBlur: 12,
  blue: "#6ea8fe",
  pink: "#f78fb3",
};

/** 内置预设：纯黑无背景 */
export const BUILTIN_PRESETS = [
  { id: "default", name: "默认（纯黑）", builtin: true, appearance: DEFAULT_APPEARANCE },
];

/** 代码配色方案 */
export type CodeTheme = "contrast" | "soft" | "mono";
export const CODE_THEME_CHOICES: { key: CodeTheme; label: string }[] = [
  { key: "contrast", label: "高对比" },
  { key: "soft", label: "柔和" },
  { key: "mono", label: "单色" },
];
export const DEFAULT_CODE_THEME: CodeTheme = "contrast";
/** 代码文字描边强度 0–1，壁纸越花越需要 */
export const DEFAULT_CODE_SHADOW = 0.75;

/** 终端（手动对答控制台）配色：输入 / 输出 / 系统提示 */
export const DEFAULT_TERMINAL_COLORS = {
  input: "#8fd9ff",
  output: "#e8eef7",
  system: "#9aa0b4",
};
export type TerminalColors = typeof DEFAULT_TERMINAL_COLORS;

/** 玻璃颜色的预设色板 */
export const GLASS_PRESETS = ["#ffffff", "#0a0a12", "#4dd0e1", "#f78fb3", "#ffb74d", "#ef5350"];

// 切换 代码/题面/交互器 的快捷键预设
export const TAB_SHORTCUTS = [
  { key: "alt-arrow", label: "Alt + ← / →" },
  { key: "alt-number", label: "Alt + 1 / 2 / 3" },
  { key: "ctrl-tab", label: "Ctrl + Tab" },
  { key: "off", label: "关闭" },
] as const;

export type TabShortcut = (typeof TAB_SHORTCUTS)[number]["key"];

export const DEFAULT_TAB_SHORTCUT: TabShortcut = "alt-arrow";

// 内置收藏夹的固定 id，与后端 collections.rs 的 FAVORITES_ID 保持一致
export const FAVORITES_ID = "favorites";

export const STD_CHOICES = ["c++14", "c++17", "c++20", "c++23"];
export const OPT_CHOICES = ["O0", "O1", "O2", "O3"];

// 默认收藏夹
export const DEFAULT_FAVORITES: Favorite[] = [
  { name: "Codeforces", url: "https://codeforces.com/problemset" },
  { name: "洛谷", url: "https://www.luogu.com.cn/problem/list" },
  { name: "AtCoder", url: "https://atcoder.jp/contests/" }
];