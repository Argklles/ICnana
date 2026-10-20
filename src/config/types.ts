// src/config/types.ts

export interface TestCase {
  input: string;
  output: string;
  actual: string;
  status: "pending" | "running" | "ac" | "wa" | "error";
}

export interface QuestionMeta {
  name: string;
  group: string;
  url: string;
  timeLimit: number;
  memoryLimit: number;
  /** normal / interactive / communication */
  problemType: string;
}

export interface Favorite {
  name: string;
  url: string;
}

export interface HistoryEntry {
  url: string;
  timestamp: number;
}

export type TabType = "code" | "browser";

// 编译设置：与 Rust 侧 compiler::options::CompileSettings 一一对应（camelCase 传输）
export interface CompileSettings {
  /** C++ 标准，例如 c++14 / c++17 / c++20 / c++23 */
  std: string;
  /** 优化等级，只存 O0 / O1 / O2 / O3 */
  opt: string;
  /** 静态链接：Windows 下必须开，否则用户二进制缺 DLL */
  staticLink: boolean;
  /** -march=native，默认关 */
  marchNative: boolean;
}

/** 侧边栏文件条目：携带来源 OJ 与收藏状态 */
export interface WorkspaceFile {
  /** 文件夹名，切换 / 删除 / 收藏时用的唯一标识 */
  stem: string;
  /** 展示名（题目名，没有元数据时后端回退成 stem） */
  name: string;
  url: string;
  /** luogu / codeforces / atcoder / other */
  oj: string;
  favorite: boolean;
}

/** 收藏夹 / 自定义集合：只存题目文件夹名的引用 */
export interface Collection {
  id: string;
  name: string;
  /** favorites（内置收藏） / oj（按来源自动归类） / custom（用户自建） */
  kind: string;
  items: string[];
}

/** 后端返回的当前编译器信息 */
export interface CompilerInfo {
  path: string;
  version: string;
  found: boolean;
  /** true = 用的是随安装包分发的内置工具链 */
  bundled: boolean;
  platform: string;
}