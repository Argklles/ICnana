import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor, { useMonaco } from "@monaco-editor/react";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
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

interface HistoryEntry {
  url: string;
  timestamp: number;
}

const formatTimeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
};

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
  const [incomingProblem, setIncomingProblem] = useState<string | null>(null);
  //--题目渲染相关---------------------------------------------------------------------------------------------
  // 定义和后端完全一致的接口
  interface QuestionMeta {
    name: string;
    group: string;
    url: string;
    timeLimit: number;
    memoryLimit: number;
  }

  // 存放当前题目的信息
  const [problemMeta, setProblemMeta] = useState<QuestionMeta | null>(null);

  /*用于渲染题目正文*/
  type ViewMode = "code" | "problem";

  const [viewMode, setViewMode] = useState<ViewMode>("code");
  const [problemHtml, setProblemHtml] = useState<string>(""); // 存放读取到的 HTML 文本
  const [problemMarkdown, setProblemMarkdown] = useState<string>("");//markdown

  // ── 编辑器设置 ───────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [codeTemplate, setCodeTemplate] = useState(DEFAULT_TEMPLATE);
  const [indentSize, setIndentSize] = useState<2 | 4>(2);
  const [editingTemplate, setEditingTemplate] = useState(DEFAULT_TEMPLATE);
  const [editingIndent, setEditingIndent] = useState<2 | 4>(2);

  // ── 面板宽度（可拖动） ───────────────────────────────
  const [fileSidebarWidth, setFileSidebarWidth] = useState(160);
  const [testPanelWidth, setTestPanelWidth] = useState(380);
  const draggingFiles = useRef(false);
  const draggingTest  = useRef(false);
  const dragStartX    = useRef(0);
  const dragStartW    = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartX.current;
      if (draggingFiles.current) {
        setFileSidebarWidth(Math.max(100, Math.min(320, dragStartW.current + dx)));
      }
      if (draggingTest.current) {
        setTestPanelWidth(Math.max(200, Math.min(600, dragStartW.current - dx)));
      }
    };
    const onUp = () => { draggingFiles.current = false; draggingTest.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

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

    // 1. 切换前：保存当前旧文件的代码和样例
    if (activeFileRef.current) {
      try {
        // 保存代码
        await invoke("save_workspace_file", { filename: activeFileRef.current, code: codeRef.current });
        // 保存样例 (确保运行后的最新结果被固化到硬盘)
        await invoke("save_test_cases", { filename: activeFileRef.current, cases: testCases }); 
      } catch (e) {
        console.error("保存旧文件数据失败喵:", e);
      }
    }

    // 2. 切换后：加载新文件的代码
    const content = await invoke<string>("load_workspace_file", { filename });
    setCode(content);

    // 3. 核心：加载新文件的样例数据
    try {
      // 只传 filename，后端会通过 stem 自动定位 .cases.json
      const cases = await invoke<TestCase[]>("load_test_cases", { filename });
      setTestCases(cases);
    } catch (e) {
      console.error("加载新样例失败喵:", e);
      // 如果读取失败，给一个初始空样例防止界面留空
      setTestCases([{ input: "", output: "", actual:"", status:"pending" }]);
    }

    // 🌟 核心：加载新题目的元数据 (question.json)
    try {
      // 注意：这里的参数名要和你后端 Rust 写的参数名对应（之前我们写的是 stem: String）
      const meta = await invoke<QuestionMeta>("get_problem_meta", { stem: filename });
      setProblemMeta(meta);
    } catch (e) {
      console.warn("这道题没有元数据喵，可能是纯手动创建的空文件:", e);
      setProblemMeta(null); // 如果没有，就清空面板
    }

    try {
      // 呼叫后端读取刚才你写的那个 question.html
      const html = await invoke<string>("load_question_markdown", { filename });
      setProblemHtml(html); 
    } catch (e) {
      console.error("加载题面失败:", e);
      setProblemHtml("");
    }

    // 4. 更新 UI 状态
    setActiveFile(filename);
    localStorage.setItem("icnana_active_file", filename);
  };

  // 🌟 ── 监听 CC 插件发来的新题目 ───────────────────────────
  useEffect(() => {
    const unlistenPromise = listen<string>("oj_problem_received", (event) => {
      const newStem = event.payload; 
      console.log("🎉 插件发来新题目了喵！等待用户决定:", newStem);
      
      // 拦截它！弹窗让用户选择
      setIncomingProblem(newStem);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // 选项 A：新开代码页（和以前的逻辑一样）
  const handleOpenNewPage = async (stem: string) => {
    setIncomingProblem(null); // 关闭弹窗
    const updatedFiles = await invoke<string[]>("list_workspace_files");
    setFiles(updatedFiles);
    await switchFile(stem);
  };

  // 选项 B：导入当前页（提取样例，然后销毁新文件夹）
  const handleMergeToCurrent = async (stem: string) => {
    setIncomingProblem(null); // 关闭弹窗

    // 🌟 1. 改用你的 activeFile 状态变量！并加一个警告防止它为空
    const currentTarget = activeFile; 
    if (!currentTarget) {
      alert("当前没有选中的代码页，无法导入喵！");
      return;
    }

    // 🛑 新增防御 1：防止“我杀我自己”
    if (stem === currentTarget) {
      alert("笨蛋，新发来的题目和当前题目是同一个啦，不需要导入喵！");
      // 为了防止后端已经新建了同名文件夹导致覆盖，这里可以视情况刷新一下
      return;
    }

    try {
          // 🛑 新增防御 2：动手前先摸一下目标文件夹还在不在
          // 我们可以尝试读取一下当前代码，如果抛错说明文件夹没了
          await invoke("load_workspace_file", { filename: currentTarget });

          console.log(`准备把 ${stem} 的样例偷进 ${currentTarget} 喵...`);

          const newCases = await invoke<TestCase[]>("load_test_cases", { filename: stem });
          setTestCases(newCases);
          
          await invoke("save_test_cases", { 
            filename: currentTarget, 
            cases: newCases 
          });

          await invoke("delete_workspace_file", { filename: stem });
          
          console.log("🎉 成功将样例偷入当前页面，现场已清理！");
        } catch (e) {
          console.error("合并样例失败了喵:", e);
          // 报错后自动刷新一下左侧的文件列表，把那些“幽灵文件”刷掉
          const updatedFiles = await invoke<string[]>("list_workspace_files");
          setFiles(updatedFiles);
          alert("目标文件可能已经被删除了喵，列表已为你刷新！报错：" + e); 
        }

    try {
      console.log(`准备把 ${stem} 的样例偷进 ${currentTarget} 喵...`);

      // 2. 读取新题目的样例
      const newCases = await invoke<TestCase[]>("load_test_cases", { filename: stem });
      
      // 3. 覆盖前端界面的测试样例
      setTestCases(newCases);
      
      // 4. 保存到当前正在写的文件夹的 cases.json 里
      await invoke("save_test_cases", { 
        filename: currentTarget, 
        cases: newCases 
      });

      // 5. 毁尸灭迹：删掉冗余文件夹
      await invoke("delete_workspace_file", { filename: stem });
      
      console.log("🎉 成功将样例偷入当前页面，现场已清理！");
    } catch (e) {
      console.error("合并样例失败了喵:", e);
      alert("合并样例失败了喵: " + e); 
    }
  };

  // 可选选项 C：取消/忽略
  const handleIgnore = async (stem: string) => {
    setIncomingProblem(null);
    // 直接删掉生成的文件夹
    await invoke("delete_workspace_file", { filename: stem });
  };
  // ---题目渲染相关------------------------------------------------------------------------------

  useEffect(() => {
    if (viewMode === "problem" && problemHtml) {
      // 这里的 window.renderMathInElement 是引入的 auto-render 插件提供的
      // @ts-ignore
      if (window.renderMathInElement) {
        // @ts-ignore
        window.renderMathInElement(document.querySelector(".problem-content-root"), {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      }
    }
  }, [viewMode, problemHtml])
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

  // ── 浏览历史 ───────────────────────────────────────────────
  const [browserHistory, setBrowserHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // ── 收藏夹 ─────────────────────────────────────────────────
  const [favorites, setFavorites] = useState<Favorite[]>(DEFAULT_FAVORITES);
  const [showFavForm, setShowFavForm] = useState(false);
  const [newFavName, setNewFavName] = useState("");
  const [newFavUrl, setNewFavUrl] = useState("https://");

  useEffect(() => {
    const saved = localStorage.getItem("oj_favorites");
    if (saved) { try { setFavorites(JSON.parse(saved)); } catch (e) {} }
    // 加载历史记录，过滤超过 30 天的条目
    const savedHistory = localStorage.getItem("oj_history");
    if (savedHistory) {
      try {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const parsed: HistoryEntry[] = JSON.parse(savedHistory);
        setBrowserHistory(parsed.filter(h => h.timestamp > thirtyDaysAgo));
      } catch (e) {}
    }
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
        // 用 screenX/screenY 获取屏幕绝对坐标，而非视口相对坐标
        await invoke("update_oj_bounds", { x: rect.x + window.screenX, y: rect.y + window.screenY, width: rect.width, height: rect.height });
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
        const newUrl = (event.payload as string).split("#")[0];
        // 过滤掉 about:blank 等内部页面，避免后退时污染 URL 栏和历史
        if (!newUrl.startsWith("http")) return;
        setOjUrl(newUrl);
        // 写入历史记录，去重并保留最近 30 天
        setBrowserHistory(prev => {
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          const entry: HistoryEntry = { url: newUrl, timestamp: Date.now() };
          const updated = [entry, ...prev.filter(h => h.url !== newUrl && h.timestamp > thirtyDaysAgo)].slice(0, 500);
          localStorage.setItem("oj_history", JSON.stringify(updated));
          return updated;
        });
      });
    };
    setup();
    return () => { if (unlistenProblem) unlistenProblem(); if (unlistenUrl) unlistenUrl(); };
  }, []);

  const openBrowser = async (targetUrl: string = ojUrl) => {
    if (!browserContainerRef.current) return;
    const rect = browserContainerRef.current.getBoundingClientRect();
    try {
      await invoke("open_oj_browser", { url: targetUrl, x: rect.x + window.screenX, y: rect.y + window.screenY, width: rect.width, height: rect.height });
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
          <div style={{ width: `${fileSidebarWidth}px`, background: "#1e1e1e", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
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

          {/* 分隔条 1：文件栏 ↔ 编辑器 */}
          <div
            onMouseDown={e => { draggingFiles.current = true; dragStartX.current = e.clientX; dragStartW.current = fileSidebarWidth; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
            style={{ width: "5px", background: "#2d2d2d", cursor: "col-resize", flexShrink: 0, transition: "background 0.15s", zIndex: 5 }}
            className="resize-divider"
          />

          {/* 编辑器区域 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px", minWidth: 0, height: "100%" }}>
  
            {/* ── 中间主面板 ────────────────────────────────────────────────── */}
            <div className="center-panel" style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden', 
              border: "1px solid #444", 
              borderRadius: "8px",
              background: "#1e1e1e" 
            }}>

              {/* 1. 视图切换 Tab */}
              <div style={{ 
                display: 'flex', 
                background: 'rgba(20, 20, 25, 0.8)', 
                padding: '4px 12px',
                gap: '8px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                zIndex: 20
              }}>
                <button 
                  onClick={() => setViewMode("code")}
                  style={{
                    background: viewMode === "code" ? "rgba(255,255,255,0.1)" : "transparent",
                    color: viewMode === "code" ? "#fff" : "#888",
                    border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px'
                  }}
                >
                  💻 代码实现
                </button>
                <button 
                  onClick={() => setViewMode("problem")}
                  style={{
                    background: viewMode === "problem" ? "rgba(255,255,255,0.1)" : "transparent",
                    color: viewMode === "problem" ? "#fff" : "#888",
                    border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px'
                  }}
                >
                  📖 题目描述
                </button>
              </div>
              
              {/* 2. 题目元数据毛玻璃面板 */}
              {problemMeta && (
                <div style={{
                  background: "rgba(30, 30, 35, 0.4)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  padding: "10px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  zIndex: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                    <span style={{ fontWeight: 900, fontSize: "15px", color: "#82AAFF" }}>{problemMeta.name}</span>
                    <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)" }}>{problemMeta.group}</span>
                  </div>
                  <div style={{ display: "flex", gap: "15px", fontSize: "12px", fontFamily: "monospace" }}>
                    <div style={{ color: "#C3E88D" }}>⏱️ {problemMeta.timeLimit} ms</div>
                    <div style={{ color: "#F07178" }}>💾 {problemMeta.memoryLimit} MB</div>
                    {problemMeta.url && (
                      <a href={problemMeta.url} target="_blank" rel="noreferrer" style={{ color: "#89DDFF", textDecoration: "none", opacity: 0.8 }}>🔗 原题</a>
                    )}
                  </div>
                </div>
              )}

              {/* 3. 动态内容区 */}
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {viewMode === "code" ? (
                  /* ✅ 模式一：代码编辑器 */
                  <Editor
                    height="100%"
                    defaultLanguage="cpp"
                    theme="vs-dark"
                    value={code}
                    onChange={v => setCode(v || "")}
                    options={{ 
                      fontSize: 16, 
                      minimap: { enabled: false }, 
                      automaticLayout: true, 
                      tabSize: indentSize, 
                      insertSpaces: true,
                      padding: { top: 10 }
                    }}
                  />
                ) : (
                  /* ✅ 模式二：题面渲染 */
                  <div 
                    className="problem-content-root"
                    style={{ 
                      height: '100%',
                      overflowY: 'auto',
                      padding: '24px 40px', 
                      lineHeight: 1.7, 
                      color: '#ddd',
                      fontSize: '15px'
                    }}
                  >
                    {problemHtml ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          a: ({node, ...props}) => <a target="_blank" rel="noreferrer" style={{color: "#89DDFF"}} {...props} />,
                          code: ({node, inline, className, children, ...props}: any) => (
                            inline ? 
                              <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 4px", borderRadius: "3px" }} {...props}>
                                {children}
                              </code> 
                              : 
                              <code {...props}>{children}</code>
                          )
                        }}
                      >
                        {problemHtml}
                      </ReactMarkdown>
                    ) : (
                      <div style={{textAlign: 'center', marginTop: '100px', color: '#555'}}>
                        暂无题面数据喵...
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* ── 底部运行按钮 ────────────────────────────────────────────────── */}
            <button
              onClick={async () => {
                if (!activeFile) return;
                // 切换到代码视图，方便观察运行结果
                setViewMode("code"); 
                
                const loading = testCases.map(c => ({ 
                  ...c,
                  actual: "正在运行喵...",
                  status: "pending" as const 
                }));
                setTestCases(loading);

                try {
                  const res = await invoke<TestCase[]>("judge_all", { 
                    filename: activeFile, 
                    code,
                    cases: loading 
                  });
                  setTestCases(res);
                  await invoke("save_test_cases", { filename: activeFile, cases: res });
                } catch (e) {
                  console.error("运行或保存失败了喵:", e);
                }
              }}
              style={{ 
                marginTop: "10px", 
                padding: "12px", 
                background: "#40b864", 
                color: "white", 
                border: "none", 
                borderRadius: "4px", 
                cursor: "pointer", 
                fontWeight: "bold", 
                flexShrink: 0,
                transition: "filter 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(1.1)"}
              onMouseLeave={(e) => e.currentTarget.style.filter = "brightness(1.0)"}
            >
              ▶ 运行全部样例 {activeFile ? `(${activeFile})` : ""}
            </button>
          </div>

          {/* 分隔条 2：编辑器 ↔ 测试面板 */}
          <div
            onMouseDown={e => { draggingTest.current = true; dragStartX.current = e.clientX; dragStartW.current = testPanelWidth; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
            style={{ width: "5px", background: "#2d2d2d", cursor: "col-resize", flexShrink: 0, transition: "background 0.15s", zIndex: 5 }}
            className="resize-divider"
          />

          {/* 测试用例面板 */}
          <div style={{ width: `${testPanelWidth}px`, background: "#252526", padding: "10px", overflowY: "auto", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px", alignItems: "center" }}>
              <strong style={{ color: "#fff", fontSize: "16px" }}>测试用例</strong>
              <button onClick={() => setTestCases([...testCases, { input: "", output: "", actual: "", status: "pending" }])} style={{ padding: "4px 8px", background: "#444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>➕ 添加</button>
            </div>
            {testCases.map((tc, index) => (
              <div key={index} style={{ background: "#333", padding: "10px", marginBottom: "10px", borderRadius: "4px", borderLeft: tc.status === "ac" ? "4px solid #40b864" : tc.status === "wa" ? "4px solid #f44336" : "4px solid #888" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: "#888" }}>Case #{index + 1}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <b style={{ fontSize: "12px", color: tc.status === "ac" ? "#40b864" : tc.status === "wa" ? "#f44336" : "#888" }}>{tc.status.toUpperCase()}</b>
                    <button
                      onClick={() => {
                        if (testCases.length <= 1) return;
                        setTestCases(testCases.filter((_, i) => i !== index));
                      }}
                      title={testCases.length <= 1 ? "至少保留一个用例" : "删除此用例"}
                      style={{ background: "none", border: "none", color: testCases.length <= 1 ? "#555" : "#f44336", cursor: testCases.length <= 1 ? "not-allowed" : "pointer", fontSize: "15px", lineHeight: 1, padding: "0 2px" }}
                    >×</button>
                  </div>
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
          <div style={{ display: "flex", padding: "8px 12px", background: "#2d2d2d", gap: "8px", borderBottom: "1px solid #444", alignItems: "center" }}>

            {/* ≡ 历史记录 */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => setShowHistory(!showHistory)}
                title="浏览历史"
                style={{ background: showHistory ? "#444" : "#333", color: "#ccc", border: "1px solid #555", padding: "5px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}
              >≡</button>
              {showHistory && (
                <div style={{ position: "absolute", top: "36px", left: "0", width: "360px", maxHeight: "420px", background: "#2d2d2d", border: "1px solid #444", borderRadius: "6px", boxShadow: "0 8px 24px rgba(0,0,0,0.7)", zIndex: 300, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #444" }}>
                    <span style={{ fontSize: "12px", color: "#aaa", fontWeight: "bold" }}>📋 浏览历史（30 天内）</span>
                    <button onClick={() => { setBrowserHistory([]); localStorage.removeItem("oj_history"); }} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "11px" }}>清空</button>
                  </div>
                  <div style={{ overflowY: "auto", flex: 1 }}>
                    {browserHistory.length === 0 ? (
                      <div style={{ padding: "20px", textAlign: "center", color: "#555", fontSize: "12px" }}>暂无历史记录</div>
                    ) : browserHistory.map((h, i) => (
                      <div
                        key={i}
                        onClick={() => { setOjUrl(h.url); openBrowser(h.url); setShowHistory(false); }}
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #333", display: "flex", flexDirection: "column", gap: "2px" }}
                        className="history-item"
                      >
                        <span style={{ fontSize: "12px", color: "#d4d4d4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.url}</span>
                        <span style={{ fontSize: "10px", color: "#666" }}>{formatTimeAgo(h.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ← 后退按钮 */}
            <button
              onClick={() => invoke("oj_browser_back")}
              title="返回上一页"
              style={{ background: "#333", color: "#ccc", border: "1px solid #555", padding: "5px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "14px", flexShrink: 0 }}
            >←</button>

            <input
              style={{ flex: 1, padding: "6px 12px", background: "#1a1a1a", border: "1px solid #444", borderRadius: "4px", color: "#fff", outline: "none", fontSize: "13px" }}
              value={ojUrl}
              onChange={e => setOjUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && openBrowser()}
              placeholder="输入题目网址..."
            />
            <button style={{ background: "#007acc", color: "white", border: "none", padding: "0 15px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }} onClick={() => openBrowser()}>前往</button>
            <button style={{ background: "#ff9800", color: "white", border: "none", padding: "0 15px", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }} onClick={() => invoke("extract_builtin")}>⚡ 提取题目</button>
            <button
              title="在系统默认浏览器中打开（可用于通过人机验证）"
              style={{ background: "#555", color: "#ccc", border: "none", padding: "0 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}
              onClick={() => invoke("open_in_system_browser", { url: ojUrl })}
            >🔗 外部打开</button>
          </div>
          <div ref={browserContainerRef} style={{ flex: 1, width: "100%", background: "#000", pointerEvents: activeTab === "browser" ? "auto" : "none" }}>
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#444" }}>正在召唤浏览器...喵...</div>
          </div>
        </div>

      </div>

      {/* 新题目接收弹窗 (只有 incomingProblem 有值时才显示) */}
      {incomingProblem && (
        <div 
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)", // 遮罩层
            display: "flex", justifyContent: "center", alignItems: "center",
            zIndex: 9999
          }}
        >
          <div 
            style={{
              // 毛玻璃效果，很适合你的暗黑系界面
              background: "rgba(30, 30, 35, 0.8)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: "24px",
              borderRadius: "12px",
              width: "400px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
              color: "#fff"
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px" }}>
              ✨ 接收到新题目数据
            </h3>
            <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: "20px", wordBreak: "break-all" }}>
              {incomingProblem}
            </p>
            
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button 
                onClick={() => handleIgnore(incomingProblem!)}
                style={{ background: "transparent", color: "#aaa", border: "none", cursor: "pointer", padding: "8px 16px" }}
              >
                忽略
              </button>
              
              <button 
                onClick={() => handleMergeToCurrent(incomingProblem!)}
                style={{ background: "rgba(255, 255, 255, 0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "6px", cursor: "pointer", padding: "8px 16px" }}
              >
                导入当前页
              </button>

              <button 
                onClick={() => handleOpenNewPage(incomingProblem!)}
                style={{ background: "#4caf50", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", padding: "8px 16px", fontWeight: "bold" }}
              >
                新开代码页
              </button>
            </div>
          </div>
        </div>
      )}
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