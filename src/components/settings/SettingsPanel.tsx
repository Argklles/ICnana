import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Appearance, CompileSettings, CompilerInfo, ThemePreset } from "../../config/types";
import AppearanceSettings from "./AppearanceSettings";
import { CODE_THEME_CHOICES, CodeTheme } from "../../config/constants";
import { TOKEN_KEYS, presetColor } from "../../config/codeThemes";
import { OPT_CHOICES, STD_CHOICES, TAB_SHORTCUTS } from "../../config/constants";
import type { TabShortcut } from "../../config/constants";

interface SettingsPanelProps {
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
  editingTemplate: string;
  setEditingTemplate: (v: string) => void;
  editingIndent: 2 | 4;
  setEditingIndent: (v: 2 | 4) => void;
  editingCompile: CompileSettings;
  setEditingCompile: (v: CompileSettings) => void;
  editingShortcut: TabShortcut;
  setEditingShortcut: (v: TabShortcut) => void;
  editingAppearance: Appearance;
  setEditingAppearance: (v: Appearance) => void;
  appearanceError?: string;
  useSystemTitleBar: boolean;
  setUseSystemTitleBar: (v: boolean) => void;
  codeTheme: CodeTheme;
  setCodeTheme: (v: CodeTheme) => void;
  codeShadow: number;
  setCodeShadow: (v: number) => void;
  tokenColors: Record<string, string>;
  setTokenColor: (token: string, color: string) => void;
  terminalColors: { input: string; output: string; system: string };
  setTerminalColor: (key: "input" | "output" | "system", color: string) => void;
  presets: ThemePreset[];
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  onApplyPreset: (preset: ThemePreset) => void;
}

const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(6, 6, 12, 0.72)",
  backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999,
};

const panelStyle: CSSProperties = {
  width: 560, maxHeight: "82vh", overflowY: "auto",
  background: "rgba(14, 14, 22, 0.97)",
  border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14,
  padding: "20px 24px", color: "#d4d4d4", fontSize: 13,
  boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
};


const labelStyle: CSSProperties = { fontSize: 12, color: "#8b949e", display: "block", marginBottom: 5 };

const fieldStyle: CSSProperties = {
  background: "#1b1b1f", color: "#d4d4d4", border: "1px solid #3a3a3a",
  borderRadius: 5, padding: "7px 9px", fontSize: 13, width: "100%", boxSizing: "border-box",
};

const fieldStyle_withe: CSSProperties = {
  background: "#1b1b1f", color: "#151414", border: "1px solid #3a3a3a",
  borderRadius: 5, padding: "7px 9px", fontSize: 13, width: "100%", boxSizing: "border-box",
};

const hintStyle: CSSProperties = { fontSize: 11, color: "#6b7280", lineHeight: 1.6, marginTop: 8 };

const rowStyle: CSSProperties = { display: "flex", gap: 12, marginBottom: 12 };

const checkStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#b8c0cc", cursor: "pointer",
};

const footerBtn = (primary: boolean): CSSProperties => ({
  padding: "7px 16px", borderRadius: 6, fontSize: 12, cursor: "pointer",
  background: primary ? "#40b864" : "#2d2d33",
  color: primary ? "#fff" : "#c9c9c9",
  border: primary ? "none" : "1px solid #3a3a3a",
  fontWeight: primary ? 700 : 400,
});

export default function SettingsPanel({
  onClose, onSave, onReset,
  editingTemplate, setEditingTemplate,
  editingIndent, setEditingIndent,
  editingCompile, setEditingCompile,
  editingShortcut, setEditingShortcut,
  editingAppearance, setEditingAppearance, appearanceError,
  useSystemTitleBar, setUseSystemTitleBar,
  codeTheme, setCodeTheme,
  codeShadow, setCodeShadow,
  tokenColors, setTokenColor,
  terminalColors, setTerminalColor,
  presets, onSavePreset, onDeletePreset, onApplyPreset,
}: SettingsPanelProps) {
  const [compiler, setCompiler] = useState<CompilerInfo | null>(null);
  const [probeFailed, setProbeFailed] = useState(false);
  const [dataDir, setDataDir] = useState<string>("");

  type Section = "compile" | "appearance" | "storage" | "editor";
  const SECTIONS: { key: Section; label: string }[] = [
    { key: "compile", label: "编译环境" },
    { key: "appearance", label: "外观" },
    { key: "storage", label: "存储" },
    { key: "editor", label: "编辑器" },
  ];
  const [section, setSection] = useState<Section>("compile");

  useEffect(() => {
    let alive = true;
    invoke<CompilerInfo>("get_compiler_info")
      .then((info) => { if (alive) setCompiler(info); })
      .catch(() => { if (alive) setProbeFailed(true); });
    invoke<string>("get_workspace_path")
      .then((dir) => { if (alive) setDataDir(dir); })
      .catch(() => { if (alive) setDataDir("读取失败"); });

    return () => { alive = false; };
  }, []);

  const patchCompile = (p: Partial<CompileSettings>) => setEditingCompile({ ...editingCompile, ...p });


  const isMac = compiler?.platform === "macos";

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, flexShrink: 0 }}>设置</h3>

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {SECTIONS.map(item => (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  borderRadius: 6,
                  border: "none",
                  background: section === item.key ? "rgba(255,255,255,0.18)" : "transparent",
                  color: section === item.key ? "#fff" : "rgba(255,255,255,0.62)",
                  fontWeight: section === item.key ? 700 : 500,
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            style={{ marginLeft: "auto", background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 15 }}
          >
            ✕
          </button>
        </div>

        {/* ── 编译环境 ── */}
        {section === "compile" && (<div>

          <div
            style={{
              background: "#1b1b1f", border: "1px solid #2f2f35", borderRadius: 6,
              padding: "8px 10px", marginBottom: 12, fontSize: 11,
              color: compiler?.found === false || probeFailed ? "#F07178" : "#8b949e",
              wordBreak: "break-all", lineHeight: 1.6,
            }}
          >
            {compiler ? (
              compiler.found ? (
                <>
                  <div>
                    <span style={{
                      display: "inline-block", padding: "1px 6px", borderRadius: 4, marginRight: 6,
                      fontSize: 10, fontWeight: 700,
                      background: compiler.bundled ? "rgba(64,184,100,0.18)" : "rgba(138,180,248,0.16)",
                      color: compiler.bundled ? "#7ee2a8" : "#8ab4f8",
                    }}>
                      {compiler.bundled ? "内置工具链" : "系统编译器"}
                    </span>
                    {compiler.version || "编译器可用"}
                  </div>
                  <div style={{ color: "#5c6470" }}>{compiler.path}</div>
                </>
              ) : (
                <>
                  <div>未找到 g++，编译和测评都会失败。</div>
                  <div style={{ color: "#5c6470" }}>查找位置：{compiler.path}</div>
                </>
              )
            ) : probeFailed ? (
              <div>无法获取编译器信息</div>
            ) : (
              <div>正在检测编译器…</div>
            )}
          </div>

          {compiler && !compiler.found && (
            <div style={{
              background: "rgba(240,183,47,0.10)", border: "1px solid rgba(240,183,47,0.35)",
              borderRadius: 6, padding: "10px 12px", marginBottom: 12, fontSize: 11,
              color: "#d8c48a", lineHeight: 1.8,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>怎么装编译器</div>
              <div>Windows：装 <a href="https://winlibs.com/" target="_blank" rel="noreferrer" style={{ color: "#8ab4f8" }}>winlibs 的 MinGW-w64</a>，解压后把 <code>bin</code> 目录加进 PATH；官方安装包后续会自带工具链。</div>
              <div>Linux：<code>sudo apt install g++</code>（Debian/Ubuntu）或 <code>sudo dnf install gcc-c++</code>（Fedora）。</div>
              <div>macOS：<code>xcode-select --install</code>。</div>
            </div>
          )}

          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>C++ 标准</label>
              <select
                style={fieldStyle_withe}
                value={editingCompile.std}
                onChange={(e) => patchCompile({ std: e.target.value })}
              >
                {STD_CHOICES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>优化等级</label>
              <select
                style={fieldStyle_withe}
                value={editingCompile.opt}
                onChange={(e) => patchCompile({ opt: e.target.value })}
              >
                {OPT_CHOICES.map((o) => <option key={o} value={o}>-{o}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <label style={{ ...checkStyle, opacity: isMac ? 0.4 : 1, cursor: isMac ? "not-allowed" : "pointer" }}>
              <input
                type="checkbox"
                checked={editingCompile.staticLink}
                disabled={isMac}
                onChange={(e) => patchCompile({ staticLink: e.target.checked })}
              />
              静态链接（-static）
            </label>
            <label style={checkStyle}>
              <input
                type="checkbox"
                checked={editingCompile.marchNative}
                onChange={(e) => patchCompile({ marchNative: e.target.checked })}
              />
              -march=native
            </label>
          </div>

          <div style={hintStyle}>
            默认 -std=c++17 -O2 -static：C++17 是当前主流档位，O2 让本地耗时贴近评测机。
            本地不定义 <code>ONLINE_JUDGE</code>，避免 <code>#ifdef</code> 分支走反。
            <br />
            Windows 与 Linux 判题机的 <code>long</code> 宽度不同（4 字节 vs 8 字节），涉及 <code>%ld</code> 的代码本地行为不一定等于线上。
          </div>
        

</div>)}

        {/* ── 外观 ── */}
        {section === "appearance" && (
          <AppearanceSettings
            value={editingAppearance}
            onChange={setEditingAppearance}
            error={appearanceError}
            useSystemTitleBar={useSystemTitleBar}
            setUseSystemTitleBar={setUseSystemTitleBar}
            presets={presets}
            onSavePreset={onSavePreset}
            onDeletePreset={onDeletePreset}
            onApplyPreset={onApplyPreset}
          />
        )}

        {section === "storage" && (<div>
          <div style={{
            background: "#1b1b1f", border: "1px solid #2f2f35", borderRadius: 6,
            padding: "8px 10px", fontSize: 11, color: "#8b949e", wordBreak: "break-all", lineHeight: 1.6,
          }}>
            {dataDir || "读取中…"}
          </div>
          <div style={hintStyle}>题目、样例、收藏夹都在这里；换机器时备份这个目录即可。</div>
        </div>)}

        {/* ── 编辑器 ── */}
        {section === "editor" && (<div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#a9c7ff", letterSpacing: 1.2, paddingBottom: 6, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>代码区</div>

          <label style={labelStyle}>代码配色</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {CODE_THEME_CHOICES.map((t) => (
              <button
                key={t.key}
                onClick={() => setCodeTheme(t.key)}
                style={{
                  padding: "5px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: codeTheme === t.key ? "rgba(255,255,255,0.18)" : "transparent",
                  color: codeTheme === t.key ? "#fff" : "rgba(255,255,255,0.62)",
                  fontWeight: codeTheme === t.key ? 700 : 500,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label style={labelStyle}>元素配色</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 14px", marginBottom: 8 }}>
            {TOKEN_KEYS.map((t) => {
              const current = tokenColors[t.key] || presetColor(codeTheme, t.key);
              const customized = Boolean(tokenColors[t.key]);
              return (
                <div key={t.key || "default"} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", width: 76, flexShrink: 0 }}>{t.label}</span>
                  <input
                    type="color"
                    value={current}
                    onChange={(e) => setTokenColor(t.key, e.target.value)}
                    style={{ width: 30, height: 22, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 5, padding: 1, cursor: "pointer" }}
                  />
                  <button
                    onClick={() => setTokenColor(t.key, "")}
                    disabled={!customized}
                    title="恢复预设颜色"
                    style={{
                      background: "transparent", border: "none", fontSize: 11,
                      color: customized ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)",
                      cursor: customized ? "pointer" : "default", padding: 0,
                    }}
                  >
                    恢复
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginBottom: 14 }}>
            点色块改颜色，「恢复」回到当前预设的默认值；切换预设不会清掉自定义。
          </div>

          <label style={labelStyle}>文字描边（壁纸越花越需要）</label>
          <div className="range-wrap" style={{ width: 220, marginBottom: 14 }}>
            <div className="range-track" />
            <div className="range-fill" style={{ width: `${codeShadow * 100}%` }} />
            <input
              className="range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={codeShadow}
              onChange={(e) => setCodeShadow(Number(e.target.value))}
            />
          </div>

          <div style={{ ...rowStyle, alignItems: "flex-end" }}>
            <div style={{ width: 140 }}>
              <label style={labelStyle}>缩进</label>
              <select
                style={fieldStyle_withe}
                value={editingIndent}
                onChange={(e) => setEditingIndent(parseInt(e.target.value) as 2 | 4)}
              >
                <option value={2}>2 空格</option>
                <option value={4}>4 空格</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>切换 代码 / 题面 / 交互器</label>
              <select
                style={fieldStyle_withe}
                value={editingShortcut}
                onChange={(e) => setEditingShortcut(e.target.value as TabShortcut)}
              >
                {TAB_SHORTCUTS.map(item => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>


          <div style={{ fontSize: 12, fontWeight: 700, color: "#a9c7ff", letterSpacing: 1.2, paddingBottom: 6, marginTop: 18, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>终端</div>
          <label style={labelStyle}>终端配色（手动对答控制台）</label>
          <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 6 }}>
            {([
              { key: "input" as const, label: "输入" },
              { key: "output" as const, label: "输出" },
              { key: "system" as const, label: "系统提示" },
            ]).map((item) => (
              <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                <input
                  type="color"
                  value={terminalColors[item.key]}
                  onChange={(e) => setTerminalColor(item.key, e.target.value)}
                  style={{ width: 30, height: 22, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 5, padding: 1, cursor: "pointer" }}
                />
                {item.label}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginBottom: 12 }}>
            控制台里 `&lt;` 开头的行是输入、`&gt;` 开头的是输出。
          </div>

          <label style={labelStyle}>新建文件时使用的代码模板</label>
          <textarea
            style={{ ...fieldStyle, height: 140, resize: "vertical", fontFamily: "ui-monospace, Consolas, monospace", lineHeight: 1.5 }}
            value={editingTemplate}
            onChange={(e) => setEditingTemplate(e.target.value)}
            spellCheck={false}
          />
        </div>)}

        {/* ── 底部操作 ── */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
          <button onClick={onReset} style={footerBtn(false)}>恢复默认</button>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={footerBtn(false)}>取消</button>
            <button onClick={onSave} style={footerBtn(true)}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
