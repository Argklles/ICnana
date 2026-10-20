/**
 * 编辑器语法配色的三套预设。
 *
 * 这里是唯一来源：Monaco 注册主题、设置页显示默认色，都从这里读。
 * 用户的自定义颜色（overrides）会在预设之上按 token 覆盖。
 */

export type TokenKey =
  | ""
  | "comment"
  | "keyword"
  | "string"
  | "number"
  | "type"
  | "function"
  | "delimiter"
  | "operator"
  | "predefined";

/** 设置页里能单独调色的元素（顺序即展示顺序） */
export const TOKEN_KEYS: { key: TokenKey; label: string }[] = [
  { key: "", label: "普通代码" },
  { key: "comment", label: "注释" },
  { key: "keyword", label: "关键字" },
  { key: "string", label: "字符串" },
  { key: "number", label: "数字" },
  { key: "type", label: "类型" },
  { key: "function", label: "函数名" },
  { key: "delimiter", label: "括号分号" },
  { key: "operator", label: "运算符" },
  { key: "predefined", label: "宏 / 预处理" },
];

export const COMMON_COLORS: Record<string, string> = {
  "editor.background": "#00000000",
  "editorGutter.background": "#00000000",
  "editorLineNumber.foreground": "#c9d4ea",
  "editorLineNumber.activeForeground": "#ffffff",
  "minimap.background": "#00000000",
  "editor.lineHighlightBackground": "#FFFFFF18",
  "editorCursor.foreground": "#ff9ec4",
  "editor.selectionBackground": "#6EA8FE55",
};

export const THEME_RULES: Record<string, { token: string; foreground: string; fontStyle?: string }[]> = {
  contrast: [
    { token: "", foreground: "ffffff" },
    { token: "comment", foreground: "a8e6a3", fontStyle: "italic" },
    { token: "keyword", foreground: "ffa8c4" },
    { token: "string", foreground: "ffe08a" },
    { token: "number", foreground: "8fd9ff" },
    { token: "type", foreground: "7ff0e0" },
    { token: "identifier", foreground: "ffffff" },
    { token: "function", foreground: "d9b8ff" },
    { token: "delimiter", foreground: "dfe6f5" },
    { token: "operator", foreground: "ffc4dc" },
    { token: "predefined", foreground: "9fd8ff" },
  ],
  soft: [
    { token: "", foreground: "eef1f7" },
    { token: "comment", foreground: "9db4a8", fontStyle: "italic" },
    { token: "keyword", foreground: "e3b0c6" },
    { token: "string", foreground: "e8d8b0" },
    { token: "number", foreground: "a9c8e0" },
    { token: "type", foreground: "a8d8d0" },
    { token: "identifier", foreground: "eef1f7" },
    { token: "function", foreground: "c9b8e0" },
    { token: "delimiter", foreground: "dde3ee" },
    { token: "operator", foreground: "e6c8d6" },
    { token: "predefined", foreground: "b4cde0" },
  ],
  mono: [
    { token: "", foreground: "ffffff" },
    { token: "comment", foreground: "b9c2d0", fontStyle: "italic" },
    { token: "keyword", foreground: "ffffff", fontStyle: "bold" },
    { token: "string", foreground: "e8ecf5" },
    { token: "number", foreground: "e8ecf5" },
    { token: "type", foreground: "ffffff", fontStyle: "bold" },
    { token: "identifier", foreground: "ffffff" },
    { token: "function", foreground: "ffffff" },
    { token: "delimiter", foreground: "dbe2ee" },
    { token: "operator", foreground: "ffffff" },
    { token: "predefined", foreground: "ffffff" },
  ],
};

/** 某个 token 在某套预设里的默认颜色（十六进制，带 #） */
export function presetColor(theme: string, token: string): string {
  const rule = THEME_RULES[theme]?.find((r) => r.token === token);
  return `#${rule?.foreground ?? "ffffff"}`;
}
