//存放一些静态常量

export const DEFAULT_TEMPLATE = `// 开始编写你的代码喵！！
#include <bits/stdc++.h>

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);

  return 0;
}`;

// src/config/constants.ts
import { Favorite } from "./types";

// 默认收藏夹
export const DEFAULT_FAVORITES: Favorite[] = [
  { name: "Codeforces", url: "https://codeforces.com/problemset" },
  { name: "洛谷", url: "https://www.luogu.com.cn/problem/list" },
  { name: "AtCoder", url: "https://atcoder.jp/contests/" }
];