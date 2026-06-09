import { useState, useEffect } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { invoke } from "@tauri-apps/api/core";
// 记得从 config/types 引入类型
// import { TestCase, QuestionMeta } from "../../config/types";

interface EditorAreaProps {
  activeFile: string;
  code: string;
  setCode: (val: string) => void;
  indentSize: number;
  problemMeta: any; // 替换为 QuestionMeta | null
  problemMarkdown: string;
  testCases: any[]; // 替换为 TestCase[]
  setTestCases: React.Dispatch<React.SetStateAction<any[]>>; // 替换为 TestCase[]
}

export default function EditorArea({
  activeFile,
  code,
  setCode,
  indentSize,
  problemMeta,
  problemMarkdown,
  testCases,
  setTestCases
}: EditorAreaProps) {
  
  // 1️⃣ 纯内部 UI 状态：当前是看代码还是看题目
  type ViewMode = "code" | "problem";
  const [viewMode, setViewMode] = useState<ViewMode>("code");
  const monaco = useMonaco();

  // 2️⃣ 题目公式渲染特效
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

  // 3️⃣ 实时波浪线语法检查（这部分逻辑完美内聚在编辑器组件里）
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
        cases: loading 
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
        <div style={{ display: 'flex', background: 'rgba(20, 20, 25, 0.8)', padding: '4px 12px', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', zIndex: 20 }}>
          <button onClick={() => setViewMode("code")} style={{ background: viewMode === "code" ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === "code" ? "#fff" : "#888", border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            💻 代码实现
          </button>
          <button onClick={() => setViewMode("problem")} style={{ background: viewMode === "problem" ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === "problem" ? "#fff" : "#888", border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            📖 题目描述
          </button>
        </div>
        
        {/* 题目元数据毛玻璃面板 */}
        {problemMeta && (
          <div style={{ background: "rgba(30, 30, 35, 0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
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

        {/* 动态内容区 */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {viewMode === "code" ? (
              <Editor
                height="100%"
                defaultLanguage="cpp"
                theme="vs-dark"
                value={code}
                onChange={v => setCode(v || "")}
                options={{ fontSize: 16, minimap: { enabled: false }, automaticLayout: true, tabSize: indentSize, insertSpaces: true, padding: { top: 10 } }}
              />
            ) : (
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
          )}
        </div>
      </div>
      
      {/* 底部运行按钮 */}
      <button
        onClick={handleRunAll}
        style={{ marginTop: "10px", padding: "12px", background: "#40b864", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", flexShrink: 0, transition: "filter 0.2s" }}
        onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(1.1)"}
        onMouseLeave={(e) => e.currentTarget.style.filter = "brightness(1.0)"}
      >
        ▶ 运行全部样例 {activeFile ? `(${activeFile})` : ""}
      </button>
    </div>
  );
}