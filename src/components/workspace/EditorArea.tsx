import { useState, useEffect, useRef } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { invoke } from "@tauri-apps/api/core";
import { CompileSettings } from "../../config/types";
import InteractorTab from "./InteractorTab";

interface EditorAreaProps {
  activeFile: string;
  code: string;
  setCode: (val: string) => void;
  indentSize: number;
  problemMeta: any; // 替换为 QuestionMeta | null
  problemMarkdown: string;
  testCases: any[]; // 替换为 TestCase[]
  setTestCases: React.Dispatch<React.SetStateAction<any[]>>; // 替换为 TestCase[]
  setProblemMeta: (meta: any) => void;
  compileSettings: CompileSettings;
  tabShortcut: string;
}

export default function EditorArea({
  activeFile,
  code,
  setCode,
  indentSize,
  problemMeta,
  problemMarkdown,
  testCases,
  setTestCases,
  setProblemMeta,
  compileSettings,
  tabShortcut
}: EditorAreaProps) {
  
  // 1️⃣ 纯内部 UI 状态：当前是看代码还是看题目
  type ViewMode = "code" | "problem" | "interactive";
  const [viewMode, setViewMode] = useState<ViewMode>("code");
  const monaco = useMonaco();
  // 主编辑器的 model：切到交互器标签时不能让它去给错的 model 打波浪线
  const codeModelRef = useRef<any>(null);

  // ── 快捷键切换 代码 / 题面 / 交互器 ──
  useEffect(() => {
    if (tabShortcut === "off") return;

    const order: ViewMode[] = ["code", "problem", "interactive"];

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // 只在输入框里打字时让路；Monaco 的隐藏 textarea 要放行，否则编辑器里快捷键失效
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing && !target?.closest(".monaco-editor")) return;

      const go = (next: ViewMode) => {
        e.preventDefault();
        e.stopPropagation();
        setViewMode(next);
      };

      if (tabShortcut === "alt-arrow" && e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "ArrowRight") go(order[(order.indexOf(viewMode) + 1) % order.length]);
        if (e.key === "ArrowLeft") go(order[(order.indexOf(viewMode) + order.length - 1) % order.length]);
      } else if (tabShortcut === "alt-number" && e.altKey && !e.ctrlKey && !e.metaKey) {
        const idx = ["1", "2", "3"].indexOf(e.key);
        if (idx >= 0) go(order[idx]);
      } else if (tabShortcut === "ctrl-tab" && e.ctrlKey && e.key === "Tab") {
        go(order[(order.indexOf(viewMode) + (e.shiftKey ? order.length - 1 : 1)) % order.length]);
      }
    };

    // 捕获阶段，抢在 Monaco 自己的快捷键之前
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [tabShortcut, viewMode]);

  // 切到交互/通信题时自动落在交互器标签页
  useEffect(() => {
    if (problemMeta?.problemType === "interactive" || problemMeta?.problemType === "communication") {
      setViewMode("interactive");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile]);

  // 题面公式渲染（KaTeX auto-render，兜住 rehype-katex 没覆盖到的写法）
  useEffect(() => {
    if (viewMode === "problem" && problemMarkdown) {
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
  }, [viewMode, problemMarkdown]);

  // 实时波浪线语法检查
  useEffect(() => {
    if (!monaco) return;
    const timer = setTimeout(async () => {
      if (!code || !code.trim() || !activeFile) return;
      try {
        const errStr = await invoke<string>("check_syntax", { filename: activeFile, code, settings: compileSettings });
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
        const model = codeModelRef.current ?? monaco.editor.getModels()[0];
        if (model && !model.isDisposed()) monaco.editor.setModelMarkers(model, "cpp", markers);
      } catch (e) { console.error("语法检查崩溃:", e); }
    }, 600);
    return () => clearTimeout(timer);
  }, [code, monaco, activeFile, compileSettings]);

  // 题目类型：普通 / 交互 / 通信（手动指定，拉取时按 CC 的 interactive 字段预填）
  const PROBLEM_TYPES = [
    { key: "normal", label: "普通", color: "#8b949e" },
    { key: "interactive", label: "交互", color: "#82AAFF" },
    { key: "communication", label: "通信", color: "#C3E88D" },
  ];
  const currentType = problemMeta?.problemType || "normal";

  const handleSetProblemType = async (type: string) => {
    if (!activeFile) return;
    try {
      await invoke("set_problem_type", { stem: activeFile, problemType: type });
      setProblemMeta({ ...(problemMeta ?? {}), problemType: type });
      if (type === "normal") {
        setViewMode(prev => (prev === "interactive" ? "code" : prev));
      } else {
        setViewMode("interactive");
      }
    } catch (e) {
      alert(e);
    }
  };

  // 交互题自测
  // 4️⃣ 运行全部样例的处理函数
  const handleRunAll = async () => {
    if (!activeFile) return;
    setViewMode("code"); // 自动切回代码视图方便观察
    
    const loading = testCases.map(c => ({ 
      ...c,
      actual: "正在运行喵...",
      status: "pending" as const 
    }));
    setTestCases(loading);

    try {
      const res = await invoke<any[]>("judge_all", { // 替换为 TestCase[]
        filename: activeFile, 
        code,
        cases: loading,
        settings: compileSettings
      });
      setTestCases(res);
      await invoke("save_test_cases", { filename: activeFile, cases: res });
    } catch (e) {
      console.error("运行或保存失败了喵:", e);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px", minWidth: 0, height: "100%" }}>
      {/* ── 中间主面板 ── */}
      <div className="center-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: "1px solid #444", borderRadius: "8px", background: "#1e1e1e" }}>
        
        {/* Tab 切换栏 */}
        <div className="editor-tabs">
          <button className={`editor-tab${viewMode === "code" ? " active" : ""}`} onClick={() => setViewMode("code")}>
            💻 代码实现
          </button>
          <button className={`editor-tab${viewMode === "problem" ? " active" : ""}`} onClick={() => setViewMode("problem")}>
            📖 题目描述
          </button>
          <button className={`editor-tab${viewMode === "interactive" ? " active" : ""}`} onClick={() => setViewMode("interactive")}>
            🔀 交互器
          </button>
        </div>

        {/* 题目元数据毛玻璃面板 */}
        {problemMeta && (
          <div style={{ background: "rgba(30, 30, 35, 0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
              <span style={{ fontWeight: 900, fontSize: "15px", color: "#82AAFF" }}>{problemMeta.name}</span>
              <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)" }}>{problemMeta.group}</span>
            </div>
            <div style={{ display: "flex", gap: "15px", fontSize: "12px", fontFamily: "monospace", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "2px", background: "rgba(255,255,255,0.05)", borderRadius: "5px", padding: "2px" }}>
                {PROBLEM_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => handleSetProblemType(t.key)}
                    title={`把这题标成${t.label}题`}
                    style={{
                      background: currentType === t.key ? "rgba(255,255,255,0.14)" : "transparent",
                      color: currentType === t.key ? t.color : "#6b7280",
                      border: "none", borderRadius: "4px", padding: "2px 8px",
                      fontSize: "11px", cursor: "pointer", fontWeight: currentType === t.key ? 700 : 400,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ color: "#C3E88D" }}>⏱️ {problemMeta.timeLimit} ms</div>
              <div style={{ color: "#F07178" }}>💾 {problemMeta.memoryLimit} MB</div>
              {problemMeta.url && (
                <a href={problemMeta.url} target="_blank" rel="noreferrer" style={{ color: "#89DDFF", textDecoration: "none", opacity: 0.8 }}>🔗 原题</a>
              )}
            </div>
          </div>
        )}

        {/* 动态内容区 */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {/* 三个面板始终挂载，只切 display：切回来时 Monaco 的撤销栈和题面滚动位置都还在 */}
            <div style={{ height: "100%", display: viewMode === "code" ? "block" : "none" }}>
              <Editor
                height="100%"
                path="main.cpp"
                defaultLanguage="cpp"
                theme="vs-dark"
                value={code}
                onChange={v => setCode(v || "")}
                onMount={editor => { codeModelRef.current = editor.getModel(); }}
                options={{ fontSize: 16, minimap: { enabled: false }, automaticLayout: true, tabSize: indentSize, insertSpaces: true, padding: { top: 10 } }}
              />
            </div>
            <div style={{ height: "100%", display: viewMode === "problem" ? "block" : "none" }}>
              <div className="problem-content-root" style={{ height: '100%', overflowY: 'auto', padding: '24px 40px', lineHeight: 1.7, color: '#ddd', fontSize: '15px' }}>
                {problemMarkdown ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      a: ({node, ...props}) => <a target="_blank" rel="noreferrer" style={{color: "#89DDFF"}} {...props} />,
                      code: ({node, inline, className, children, ...props}: any) => (
                        inline ? <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 4px", borderRadius: "3px" }} {...props}>{children}</code> : <code {...props}>{children}</code>
                      )
                    }}
                  >
                    {problemMarkdown}
                  </ReactMarkdown>
                ) : (
                  <div style={{textAlign: 'center', marginTop: '100px', color: '#555'}}>暂无题面数据喵...</div>
                )}
              </div>
            </div>
            <div style={{ height: "100%", display: viewMode === "interactive" ? "flex" : "none", flexDirection: "column", minHeight: 0 }}>
              <InteractorTab
                activeFile={activeFile}
                code={code}
                indentSize={indentSize}
                problemMeta={problemMeta}
                testCases={testCases}
                compileSettings={compileSettings}
              />
            </div>
        </div>
      </div>
      
      {/* 底部运行按钮（交互模式有自己的运行按钮） */}
      {viewMode !== "interactive" && (
        <button className="run-button" onClick={handleRunAll}>
          ▶ 运行全部样例 {activeFile ? `(${activeFile})` : ""}
        </button>
      )}
    </div>
  );
}