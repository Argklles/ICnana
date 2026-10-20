// src/config/types.ts

export interface TestCase {
  input: string;
  output: string;
  actual: string;
  status: "pending" | "running" | "ac" | "wa" | "error" | "tle" | "mle";
  /** 本轮运行耗时（毫秒） */
  timeMs?: number;
  /** 本轮峰值内存（KB），目前只有 Windows 有 */
  memoryKb?: number;
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
  /** C++ 标准，例如 c++17 / c++20 / c++23 */
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

/** 外观偏好：背景、玻璃、圆角、强调色 */
export interface Appearance {
  /** 背景图片地址（http / 本地路径 / file://），空字符串表示不用 */
  bgImage: string;
  /** 背景图不透明度 0–1 */
  bgOpacity: number;
  /** 没有壁纸时是否用蓝粉渐变打底；false = 纯黑 */
  baseGradient: boolean;
  /** 整体压暗 0–1，越大文字越清楚 */
  scrim: number;

  /** 玻璃颜色（hex），渐变模式下是起点色 */
  glassColor: string;
  /** 玻璃渐变开关 */
  glassGradient: boolean;
  /** 渐变终点色 */
  glassColor2: string;
  /** 玻璃不透明度 0–1 */
  glassAlpha: number;
  /** 雾化（模糊半径 px） */
  glassBlur: number;
  /** 玻璃保真度 0–1，映射到饱和度 */
  glassFidelity: number;
  /** 标题栏不透明度 0–1（独立于侧栏玻璃） */
  titlebarAlpha: number;
  /** 标题栏底色（hex），可以和玻璃颜色不同 */
  titlebarColor: string;
  /** 标题栏雾化半径（px） */
  titlebarBlur: number;

  /** 圆角统一值 */
  radius: number;
  /** 左侧栏四角是否直角，顺序：左上 右上 右下 左下 */
  leftSquare: boolean[];
  /** 右侧栏四角是否直角 */
  rightSquare: boolean[];

  /** 渐变两个端点 */
  blue: string;
  pink: string;
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
/** 一套外观预设（默认预设 + 用户自己存的） */
export interface ThemePreset {
  id: string;
  name: string;
  /** 内置预设不能删 */
  builtin?: boolean;
  appearance: Appearance;
}
