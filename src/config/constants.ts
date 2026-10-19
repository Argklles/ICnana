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
// c++14 对齐洛谷默认语言与 NOI Linux 2.0；O2 对齐评测机；静态链接避免缺 DLL。
export const DEFAULT_COMPILE_SETTINGS: CompileSettings = {
  std: "c++14",
  opt: "O2",
  staticLink: true,
  marchNative: false,
};

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