import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CompileSettings, CompilerInfo } from "../../config/types";
import { OPT_CHOICES, STD_CHOICES } from "../../config/constants";

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
}

const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
  display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999,
};

const panelStyle: CSSProperties = {
  width: 560, maxHeight: "82vh", overflowY: "auto",
  background: "rgba(30,30,35,0.96)", backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
  padding: "20px 24px", color: "#d4d4d4", fontSize: 13,
  boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
};

const sectionTitle: CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "#82AAFF", letterSpacing: 1,
  margin: "4px 0 12px",
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
}: SettingsPanelProps) {
  const [compiler, setCompiler] = useState<CompilerInfo | null>(null);
  const [probeFailed, setProbeFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    invoke<CompilerInfo>("get_compiler_info")
      .then((info) => { if (alive) setCompiler(info); })
      .catch(() => { if (alive) setProbeFailed(true); });
    return () => { alive = false; };
  }, []);

  const patchCompile = (p: Partial<CompileSettings>) => setEditingCompile({ ...editingCompile, ...p });
  const isMac = compiler?.platform === "macos";

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>⚙️ 设置</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* ── 编译环境 ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={sectionTitle}>编译环境</div>

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
                  <div>{compiler.version || "编译器可用"}</div>
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
            默认 -std=c++14 -O2 -static：C++14 对齐洛谷默认语言与 NOI Linux 2.0，O2 让本地耗时贴近评测机。
            本地不定义 <code>ONLINE_JUDGE</code>，避免 <code>#ifdef</code> 分支走反。
            <br />
            Windows 与 Linux 判题机的 <code>long</code> 宽度不同（4 字节 vs 8 字节），涉及 <code>%ld</code> 的代码本地行为不一定等于线上。
          </div>
        </div>

        {/* ── 编辑器 ── */}
        <div style={{ marginBottom: 4 }}>
          <div style={sectionTitle}>编辑器</div>

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
          </div>

          <label style={labelStyle}>新建文件时使用的代码模板</label>
          <textarea
            style={{ ...fieldStyle, height: 140, resize: "vertical", fontFamily: "ui-monospace, Consolas, monospace", lineHeight: 1.5 }}
            value={editingTemplate}
            onChange={(e) => setEditingTemplate(e.target.value)}
            spellCheck={false}
          />
        </div>

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
