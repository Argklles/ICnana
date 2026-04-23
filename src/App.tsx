import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor, { useMonaco } from "@monaco-editor/react";
import "./App.css";

interface TestCase {
  input: string;
  output: string;
  actual: string;
  status: "pending" | "running" | "ac" | "wa" | "error";
}

interface Favorite {
  name: string;
  url: string;
}

type TabType = "code" | "browser";

const DEFAULT_TEMPLATE = `// 开始编写你的代码喵！！
#include <bits/stdc++.h>

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);

  return 0;
}`;

const DEFAULT_FAVORITES: Favorite[] = [
  { name: "Codeforces", url: "https://codeforces.com/problemset" },
  { name: "洛谷", url: "https://www.luogu.com.cn/problem/list" },
  { name: "AtCoder", url: "https://atcoder.jp/contests/" }
];

function App() {
  const [activeTab, setActiveTab] = useState<TabType>("code");
  const [code, setCode] = useState<string>("");
  const [ojUrl, setOjUrl] = useState<string>("https://codeforces.com/problemset/problem/4/A");
  const [testCases, setTestCases] = useState<TestCase[]>([{ input: "", output: "", actual: "", status: "pending" }]);

  // ── 文件管理 ──────────────────────────────────────────────
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── 编辑器设置 ───────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [codeTemplate, setCodeTemplate] = useState(DEFAULT_TEMPLATE);
  const [indentSize, setIndentSize] = useState<2 | 4>(2);
  const [editingTemplate, setEditingTemplate] = useState(DEFAULT_TEMPLATE);
  const [editingIndent, setEditingIndent] = useState<2 | 4>(2);

  // ref 用于在事件回调中读取最新 code，避免 stale closure
  const codeRef = useRef(code);
  const activeFileRef = useRef(activeFile);
  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);

  const monaco = useMonaco();

  // ── 初始加载文件列表 + 设置 ────────────────────────────
  useEffect(() => {
    const init = async () => {
      // 加载设置
      const savedTemplate = localStorage.getItem("icnana_code_template");
      const savedIndent = localStorage.getItem("icnana_indent_size");
      if (savedTemplate) { setCodeTemplate(savedTemplate); setEditingTemplate(savedTemplate); }
      if (savedIndent) {
        const v = parseInt(savedIndent) as 2 | 4;
        setIndentSize(v); setEditingIndent(v);
      }
      // 加载文件列表
      const fileList = await invoke<string[]>("list_workspace_files");
      setFiles(fileList);
      const saved = localStorage.getItem("icnana_active_file");
      const toLoad = saved && fileList.includes(saved) ? saved : fileList[0];
      if (toLoad) {
        const content = await invoke<string>("load_workspace_file", { filename: toLoad });
        setCode(content);
        setActiveFile(toLoad);
        localStorage.setItem("icnana_active_file", toLoad);
      }
    };
    init();
  }, []);

  // ── 保存设置 ───────────────────────────────────────────
  const saveSettings = () => {
    setCodeTemplate(editingTemplate);
    setIndentSize(editingIndent);
    localStorage.setItem("icnana_code_template", editingTemplate);
    localStorage.setItem("icnana_indent_size", String(editingIndent));
    setShowSettings(false);
  };
  const resetSettings = () => {
    setEditingTemplate(DEFAULT_TEMPLATE);
    setEditingIndent(2);
  };

  // ── 切换文件：先保存当前，再加载新文件 ────────────────────
  const switchFile = async (filename: string) => {
    if (filename === activeFileRef.current) return;
    if (activeFileRef.current) {
      await invoke("save_workspace_file", { filename: activeFileRef.current, code: codeRef.current }).catch(() => {});
    }
    const content = await invoke<string>("load_workspace_file", { filename });
    setCode(content);
    setActiveFile(filename);
    localStorage.setItem("icnana_active_file", filename);
  };

  // ── 创建新文件 ───────────────────────────────────────
  const createFile = async () => {
    const name = newFileName.trim();
    if (!name) return;
    try {
      // 传入用户自定义模板
      const created = await invoke<string>("new_workspace_file", { filename: name, template: codeTemplate });
      const updated = await invoke<string[]>("list_workspace_files");
      setFiles(updated);
      setIsCreatingFile(false);
      setNewFileName("");
      await switchFile(created);
    } catch (e) { alert(e); }
  };

  // ── 删除文件 ───────────────────────────────────────────────
  const deleteFile = async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    if (files.length <= 1) { alert("至少保留一个文件喵~"); return; }
    if (!confirm(`确定删除 ${filename}？`)) return;
    await invoke("delete_workspace_file", { filename });
    const updated = await invoke<string[]>("list_workspace_files");
    setFiles(updated);
    if (activeFile === filename) {
      // ⚠️ 必须先清空 ref，否则 switchFile 的 auto-save 会把刚删的文件重建回来
      activeFileRef.current = "";
      await switchFile(updated[0]);
    }
  };

  // ── 重命名文件 ─────────────────────────────────────────────
  const renameFile = async (oldName: string) => {
    const val = renameValue.trim();
    if (!val || val === oldName.replace(".cpp", "")) { setRenamingFile(null); return; }
    try {
      const newName = await invoke<string>("rename_workspace_file", { oldName, newName: val });
      const updated = await invoke<string[]>("list_workspace_files");
      setFiles(updated);
      if (activeFile === oldName) {
        setActiveFile(newName);
        localStorage.setItem("icnana_active_file", newName);
      }
      setRenamingFile(null);
    } catch (e) { alert(e); setRenamingFile(null); }
  };

  // ── 实时波浪线语法检查 ──────────────────────────────────────
  useEffect(() => {
    if (!monaco) return;
    const timer = setTimeout(async () => {
      if (!code || !code.trim() || !activeFile) return;
      try {
        const errStr = await invoke<string>("check_syntax", { filename: activeFile, code });
        const markers: any[] = [];
        if (errStr) {
          const lines = errStr.split("\n");
          const regex = /:(\d+):(\d+):\s*(error|warning|fatal error|错误|警告|致命错误):\s*(.*)/i;
          for (const line of lines) {
            const match = line.match(regex);
            if (match) {
              const row = parseInt(match[1]);
              const col = parseInt(match[2]);
              const isError = match[3].includes("error") || match[3].includes("错误") || match[3].includes("fatal");
              markers.push({
                severity: isError ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
                startLineNumber: row, startColumn: col,
                endLineNumber: row, endColumn: col + 1,
                message: match[4],
              });
            }
          }
        }
        const model = monaco.editor.getModels()[0];
        if (model) monaco.editor.setModelMarkers(model, "cpp", markers);
      } catch (e) { console.error("语法检查崩溃:", e); }
    }, 600);
    return () => clearTimeout(timer);
  }, [code, monaco, activeFile]);

  // ── 收藏夹 ─────────────────────────────────────────────────
  const [favorites, setFavorites] = useState<Favorite[]>(DEFAULT_FAVORITES);
  const [showFavForm, setShowFavForm] = useState(false);
  const [newFavName, setNewFavName] = useState("");
  const [newFavUrl, setNewFavUrl] = useState("https://");

  useEffect(() => {
    const saved = localStorage.getItem("oj_favorites");
    if (saved) { try { setFavorites(JSON.parse(saved)); } catch (e) {} }
  }, []);

  const addFavorite = () => {
    if (!newFavName.trim() || !newFavUrl.trim()) return;
    const newFavs = [...favorites, { name: newFavName, url: newFavUrl }];
    setFavorites(newFavs);
    localStorage.setItem("oj_favorites", JSON.stringify(newFavs));
    setShowFavForm(false); setNewFavName(""); setNewFavUrl("https://");
  };
  const deleteFavorite = (e: React.MouseEvent, targetName: string) => {
    e.preventDefault();
    const newFavs = favorites.filter(f => f.name !== targetName);
    setFavorites(newFavs);
    localStorage.setItem("oj_favorites", JSON.stringify(newFavs));
  };

  // ── 浏览器控制 ─────────────────────────────────────────────
  const browserContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let resizeTimeout: number;
    const syncBrowser = async () => {
      if (activeTab === "browser" && browserContainerRef.current) {
        const rect = browserContainerRef.current.getBoundingClientRect();
        await invoke("update_oj_bounds", { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height });
      } else {
        await invoke("update_oj_bounds", { x: -9999, y: -9999, width: 800, height: 600 });
      }
    };
    const observer = new ResizeObserver(() => {
      if (activeTab !== "browser") return;
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => requestAnimationFrame(syncBrowser), 15);
    });
    if (browserContainerRef.current) observer.observe(browserContainerRef.current);
    syncBrowser();
    return () => { observer.disconnect(); clearTimeout(resizeTimeout); };
  }, [activeTab, ojUrl]);

  // ── OJ 事件监听 ────────────────────────────────────────────
  useEffect(() => {
    let unlistenProblem: () => void;
    let unlistenUrl: () => void;
    const setup = async () => {
      unlistenProblem = await listen("oj_problem_received", (event: any) => {
        try {
          const data = event.payload;
          setTestCases(data.tests.map((t: any) => ({ input: t.input, output: t.output, actual: "", status: "pending" })));
          setOjUrl(data.url);
          setActiveTab("code");
        } catch (e) { console.error("解析包裹失败:", e); }
      });
      unlistenUrl = await listen("oj_url_changed", (event: any) => {
        setOjUrl((event.payload as string).split("#")[0]);
      });
    };
    setup();
    return () => { if (unlistenProblem) unlistenProblem(); if (unlistenUrl) unlistenUrl(); };
  }, []);

  const openBrowser = async (targetUrl: string = ojUrl) => {
    if (!browserContainerRef.current) return;
    const rect = browserContainerRef.current.getBoundingClientRect();
    try {
      await invoke("open_oj_browser", { url: targetUrl, x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height });
    } catch (e) { console.error(e); }
  };

  const handleFavoriteClick = async (url: string) => {
    setOjUrl(url); setActiveTab("browser");
    setTimeout(() => openBrowser(url), 100);
  };

  // ── 渲染 ───────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1a1a1a", color: "#d4d4d4", overflow: "hidden" }}>

      {/* Tab 栏 */}
      <div style={{ display: "flex", background: "#252526", padding: "8px 12px 0 12px", gap: "4px", borderBottom: "1px solid #333", alignItems: "center", zIndex: 20, flexShrink: 0 }}>
        <div onClick={() => setActiveTab("code")} style={tabStyle(activeTab === "code")}>💻 代码实验室</div>
        <div onClick={() => setActiveTab("browser")} style={tabStyle(activeTab === "browser")}>🌐 OJ 浏览器</div>

        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: "8px", paddingBottom: "8px", marginLeft: "20px", position: "relative", alignItems: "center" }}>

          {/* ⚙️ 设置按鈕 */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowSettings(!showSettings); setShowFavForm(false); setEditingTemplate(codeTemplate); setEditingIndent(indentSize); }}
              title="编辑器设置"
              style={{ ...favButtonStyle, padding: "4px 9px", fontSize: "13px", background: showSettings ? "#444" : "#2d2d2d" }}
            >⚙️</button>
            {showSettings && (
              <div style={{ position: "absolute", top: "30px", left: "0", width: "380px", background: "#2d2d2d", border: "1px solid #444", padding: "14px", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.7)", zIndex: 200 }}>
                <div style={{ fontSize: "13px", color: "#ccc", fontWeight: "bold", borderBottom: "1px solid #444", paddingBottom: "8px" }}>⚙️ 编辑器设置</div>

                {/* 缩进大小 */}
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>缩进大小</div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {([2, 4] as const).map(n => (
                      <label key={n} style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", fontSize: "12px", color: editingIndent === n ? "#fff" : "#aaa" }}>
                        <input
                          type="radio"
                          name="indentSize"
                          checked={editingIndent === n}
                          onChange={() => setEditingIndent(n)}
                          style={{ accentColor: "#007acc" }}
                        />
                        {n} 空格
                      </label>
                    ))}
                  </div>
                </div>

                {/* 代码模板 */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "11px", color: "#888" }}>新建文件初始模板</div>
                  <textarea
                    value={editingTemplate}
                    onChange={e => setEditingTemplate(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    style={{ width: "100%", background: "#1a1a1a", border: "1px solid #555", borderRadius: "4px", color: "#d4d4d4", padding: "8px", fontSize: "12px", fontFamily: "'Consolas', 'Courier New', monospace", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveSettings} style={{ flex: 1, background: "#007acc", border: "none", color: "white", padding: "7px", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>✅ 保存</button>
                  <button onClick={resetSettings} style={{ background: "#555", border: "none", color: "#ccc", padding: "7px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>恢复默认</button>
                  <button onClick={() => setShowSettings(false)} style={{ background: "#3a3a3a", border: "none", color: "#aaa", padding: "7px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>取消</button>
                </div>
              </div>
            )}
          </div>

          <span style={{ fontSize: "11px", color: "#555", userSelect: "none" }}>|</span>
          <span style={{ fontSize: "11px", color: "#666", alignSelf: "center", marginRight: "4px" }} title="右键删除">快捷收藏 (右键删除):</span>
          {favorites.map(oj => (
            <button key={oj.name} onClick={() => handleFavoriteClick(oj.url)} onContextMenu={e => deleteFavorite(e, oj.name)} style={favButtonStyle} title={oj.url}>{oj.name}</button>
          ))}
          <button onClick={() => { setShowFavForm(!showFavForm); setShowSettings(false); }} style={{ ...favButtonStyle, background: "#444", padding: "4px 8px" }}>+</button>
          {showFavForm && (
            <div style={{ position: "absolute", top: "35px", right: "0", background: "#2d2d2d", border: "1px solid #444", padding: "12px", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", zIndex: 100 }}>
              <div style={{ fontSize: "12px", color: "#aaa", fontWeight: "bold" }}>添加新靖场 🎯</div>
              <input value={newFavName} onChange={e => setNewFavName(e.target.value)} placeholder="名称 (如: 牛客网)" style={miniInputStyle} />
              <input value={newFavUrl} onChange={e => setNewFavUrl(e.target.value)} placeholder="网址" style={miniInputStyle} />
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={addFavorite} style={{ flex: 1, background: "#40b864", border: "none", color: "white", padding: "6px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>保存</button>
                <button onClick={() => setShowFavForm(false)} style={{ flex: 1, background: "#555", border: "none", color: "white", padding: "6px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>取消</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 主体内容 */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

        {/* ── 代码实验室 ── */}
        <div style={{ display: "flex", width: "100%", height: "100%", position: "absolute", visibility: activeTab === "code" ? "visible" : "hidden", zIndex: activeTab === "code" ? 10 : 0 }}>

          {/* 📁 文件侧边栏 */}
          <div style={{ width: "160px", background: "#1e1e1e", borderRight: "1px solid #333", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#888", fontWeight: "bold", letterSpacing: "0.5px" }}>📁 文件</span>
              <button
                onClick={() => { setIsCreatingFile(true); setNewFileName(""); }}
                title="新建文件"
                style={{ background: "none", border: "1px solid #555", color: "#aaa", width: "20px", height: "20px", borderRadius: "3px", cursor: "pointer", fontSize: "14px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >+</button>
            </div>

            {/* 新建文件输入框 */}
            {isCreatingFile && (
              <div style={{ padding: "6px 8px", borderBottom: "1px solid #333" }}>
                <input
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createFile(); if (e.key === "Escape") { setIsCreatingFile(false); setNewFileName(""); } }}
                  placeholder="文件名 (不含.cpp)"
                  autoFocus
                  style={{ width: "100%", background: "#2d2d2d", border: "1px solid #007acc", borderRadius: "3px", color: "#fff", padding: "4px 6px", fontSize: "11px", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            )}

            {/* 文件列表 */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {files.map(file => (
                <div
                  key={file}
                  onClick={() => switchFile(file)}
                  onDoubleClick={() => { setRenamingFile(file); setRenameValue(file.replace(".cpp", "")); }}
                  title={renamingFile === file ? "" : `${file}（双击重命名）`}
                  style={{
                    padding: "7px 8px",
                    cursor: "pointer",
                    background: activeFile === file ? "#094771" : "transparent",
                    color: activeFile === file ? "#fff" : "#bbb",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    borderLeft: activeFile === file ? "2px solid #007acc" : "2px solid transparent",
                    gap: "4px",
                    userSelect: "none",
                  }}
                  className="file-item"
                >
                  {renamingFile === file ? (
                    <input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") renameFile(file); if (e.key === "Escape") setRenamingFile(null); }}
                      onBlur={() => renameFile(file)}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                      style={{ background: "#2d2d2d", border: "1px solid #007acc", borderRadius: "2px", color: "#fff", padding: "2px 4px", fontSize: "11px", outline: "none", width: "100%", boxSizing: "border-box" }}
                    />
                  ) : (
                    <>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {file}</span>
                      <span
                        className="file-delete-btn"
                        onClick={e => deleteFile(e, file)}
                        title="删除"
                        style={{ fontSize: "13px", color: "#f44336", flexShrink: 0, opacity: 0, transition: "opacity 0.15s" }}
                      >×</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 编辑器区域 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px", minWidth: 0 }}>
            <div style={{ flex: 1, minHeight: 0, border: "1px solid #444", borderRadius: "8px", overflow: "hidden" }}>
              <Editor
                height="100%"
                defaultLanguage="cpp"
                theme="vs-dark"
                value={code}
                onChange={v => setCode(v || "")}
                options={{ fontSize: 16, minimap: { enabled: false }, automaticLayout: true, tabSize: indentSize, insertSpaces: true }}
              />
            </div>
            <button
              onClick={async () => {
                if (!activeFile) return;
                const loading = testCases.map(c => ({ ...c, actual: "正在运行喵...", status: "pending" as const }));
                setTestCases(loading);
                const res = await invoke<TestCase[]>("judge_all", { filename: activeFile, code, cases: loading });
                setTestCases(res);
              }}
              style={{ marginTop: "10px", padding: "12px", background: "#40b864", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", flexShrink: 0 }}
            >▶ 运行全部样例 {activeFile ? `(${activeFile})` : ""}</button>
          </div>

          {/* 测试用例面板 */}
          <div style={{ width: "380px", background: "#252526", padding: "10px", overflowY: "auto", borderLeft: "1px solid #333", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px", alignItems: "center" }}>
              <strong style={{ color: "#fff", fontSize: "16px" }}>测试用例</strong>
              <button onClick={() => setTestCases([...testCases, { input: "", output: "", actual: "", status: "pending" }])} style={{ padding: "4px 8px", background: "#444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>➕ 添加</button>
            </div>
            {testCases.map((tc, index) => (
              <div key={index} style={{ background: "#333", padding: "10px", marginBottom: "10px", borderRadius: "4px", borderLeft: tc.status === "ac" ? "4px solid #40b864" : tc.status === "wa" ? "4px solid #f44336" : "4px solid #888" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#888" }}>Case #{index + 1}</span>
                  <b style={{ fontSize: "12px", color: tc.status === "ac" ? "#40b864" : tc.status === "wa" ? "#f44336" : "#888" }}>{tc.status.toUpperCase()}</b>
                </div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <textarea value={tc.input} onChange={e => { const n = [...testCases]; n[index].input = e.target.value; setTestCases(n); }} style={inputStyle} placeholder="输入" />
                  <textarea value={tc.output} onChange={e => { const n = [...testCases]; n[index].output = e.target.value; setTestCases(n); }} style={inputStyle} placeholder="预期输出" />
                </div>
                <pre style={{ margin: 0, padding: "8px", background: "#1e1e1e", borderRadius: "4px", fontSize: "12px", color: tc.status === "ac" ? "#40b864" : tc.status === "wa" ? "#f44336" : "#aaa", whiteSpace: "pre-wrap" }}>
                  {tc.actual || "等待运行..."}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* ── OJ 浏览器 ── */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", position: "absolute", visibility: activeTab === "browser" ? "visible" : "hidden", zIndex: activeTab === "browser" ? 10 : 0 }}>
          <div style={{ display: "flex", padding: "8px 12px", background: "#2d2d2d", gap: "8px", borderBottom: "1px solid #444" }}>
            <input
              style={{ flex: 1, padding: "6px 12px", background: "#1a1a1a", border: "1px solid #444", borderRadius: "4px", color: "#fff", outline: "none", fontSize: "13px" }}
              value={ojUrl}
              onChange={e => setOjUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && openBrowser()}
              placeholder="输入题目网址..."
            />
            <button style={{ background: "#007acc", color: "white", border: "none", padding: "0 15px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }} onClick={() => openBrowser()}>前往</button>
            <button style={{ background: "#ff9800", color: "white", border: "none", padding: "0 15px", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }} onClick={() => invoke("extract_builtin")}>⚡ 提取题目</button>
          </div>
          <div ref={browserContainerRef} style={{ flex: 1, width: "100%", background: "#000", pointerEvents: activeTab === "browser" ? "auto" : "none" }}>
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#444" }}>正在召唤浏览器...喵...</div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── 样式常量 ──────────────────────────────────────────────────
const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  background: active ? "#1e1e1e" : "transparent",
  color: active ? "#fff" : "#999",
  borderRadius: "6px 6px 0 0",
  cursor: "pointer",
  fontSize: "13px",
  borderBottom: active ? "2px solid #40b864" : "2px solid transparent",
  transition: "0.2s",
  userSelect: "none",
});

const favButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  background: "#333",
  color: "#bbb",
  border: "1px solid #444",
  borderRadius: "15px",
  fontSize: "11px",
  cursor: "pointer",
  transition: "0.2s",
};

const miniInputStyle: React.CSSProperties = {
  width: "200px", padding: "6px 10px", background: "#1a1a1a", border: "1px solid #555",
  borderRadius: "4px", color: "#fff", fontSize: "12px", outline: "none",
};

const inputStyle: React.CSSProperties = {
  flex: 1, height: "45px", background: "#1a1a1a", color: "#fff",
  border: "1px solid #444", borderRadius: "4px", fontSize: "11px", padding: "4px",
};

export default App;