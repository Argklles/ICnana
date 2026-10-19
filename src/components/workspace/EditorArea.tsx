import { useState, useEffect, useRef } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CompileSettings } from "../../config/types";

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
  compileSettings
}: EditorAreaProps) {
  
  // 1️⃣ 纯内部 UI 状态：当前是看代码还是看题目
  type ViewMode = "code" | "problem" | "interactive";
  const [viewMode, setViewMode] = useState<ViewMode>("code");
  const monaco = useMonaco();
  // 主编辑器的 model：切到交互器标签时不能让它去给错的 model 打波浪线
  const codeModelRef = useRef<any>(null);

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
  type InteractiveResult = { status: string; message: string; transcript: string };
  const [interactorCode, setInteractorCode] = useState<string>("");
  // 没有交互器的题（Codeforces 一类）用「手动对答」：程序跑起来，用户手敲输入
  const [interactiveMode, setInteractiveMode] = useState<"interactor" | "manual">("interactor");
  const [manualSession, setManualSession] = useState<string | null>(null);
  const manualSessionRef = useRef<string | null>(null);   // 过滤串台事件用
  const manualStartingRef = useRef(false);                // 同步占位，防止连点两下发两个进程
  const [manualStarting, setManualStarting] = useState(false);
  type ConsoleSeg = { kind: "in" | "out" | "sys"; text: string };
  const [consoleSegs, setConsoleSegs] = useState<ConsoleSeg[]>([]);

  const pushOut = (text: string) => setConsoleSegs(prev => {
    const last = prev[prev.length - 1];
    if (last && last.kind === "out") {
      return [...prev.slice(0, -1), { kind: "out" as const, text: last.text + text }];
    }
    return [...prev, { kind: "out" as const, text }];
  });
  const pushSys = (text: string) => setConsoleSegs(prev => [...prev, { kind: "sys" as const, text }]);
  const [manualInput, setManualInput] = useState<string>("");
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const [interactiveResult, setInteractiveResult] = useState<InteractiveResult | null>(null);
  const [runningInteractive, setRunningInteractive] = useState(false);

  useEffect(() => {
    let cancelled = false;               // StrictMode 会挂载两次，用它兜住第一次的异步注册
    let unlisten: (() => void) | undefined;
    listen<any>("manual-interaction", (event) => {
      const payload = event.payload;
      // 只认当前这次会话的事件，旧会话的残响直接丢掉
      if (!manualSessionRef.current || payload.session !== manualSessionRef.current) return;

      if (payload.kind === "exit") {
        pushSys(`[进程结束，退出码 ${payload.data}]`);
        manualSessionRef.current = null;
        setManualSession(null);
      } else {
        pushOut(payload.data);
      }
    }).then(fn => {
      // 注册回来时组件已经卸载了 → 立刻注销，别留一个野监听器（否则事件会被处理两遍）
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [consoleSegs]);

  // 复制时把行首的 < / > 前缀去掉，保证粘出去是干净内容
  const handleConsoleCopy = (e: any) => {
    const selection = window.getSelection?.()?.toString() ?? "";
    if (!selection) return;
    const cleaned = selection
      .split("\n")
      .map((line: string) => line.replace(/^[<>]\s?/, ""))
      .join("\n");
    e.clipboardData.setData("text/plain", cleaned);
    e.preventDefault();
  };

  const statusColor = (status: string) =>
    status === "ac" ? "#40b864"
    : status === "tle" ? "#f0b72f"
    : status === "error" ? "#c98bdb"
    : "#f44336";

  // 切到一道交互/通信题时，直接落在交互器标签页
  useEffect(() => {
    if (problemMeta?.problemType === "interactive" || problemMeta?.problemType === "communication") {
      setViewMode("interactive");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile]);

  // 切换题目时载入该题文件夹里的 interactor.cpp
  useEffect(() => {
    // 旧题目的手动会话必须停掉，否则切过去还在跑上一道题的程序
    const running = manualSessionRef.current;
    if (running) {
      manualSessionRef.current = null;
      setManualSession(null);
      invoke("stop_manual_interaction", { session: running }).catch(() => {});
    }
    setConsoleSegs([]);

    if (!activeFile) { setInteractorCode(""); setInteractiveResult(null); return; }
    let alive = true;
    invoke<string>("load_interactor", { filename: activeFile })
      .then(text => {
        if (!alive) return;
        setInteractorCode(text);
        setInteractiveResult(null);
        // 没有交互器的题直接落到「手动对答」，省得点一下
        setInteractiveMode(text.trim() ? "interactor" : "manual");
      })
      .catch(() => { if (alive) { setInteractorCode(""); setInteractiveMode("manual"); } });
    return () => { alive = false; };
  }, [activeFile]);

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

  // 交互题自测：编译选手 + 交互器，把两者的 stdin/stdout 对接起来跑一次
  const handleRunInteractive = async () => {
    if (!activeFile) return;
    if (!interactorCode.trim()) {
      alert("先把题目给的交互器代码粘到「🔀 交互器」标签页里喵");
      return;
    }

    setRunningInteractive(true);
    setInteractiveResult(null);
    try {
      // 交互题通常只有一组数据：取第一个非空的测试用例输入当作 argv[1]
      const input = testCases.find((c: any) => c.input && c.input.trim())?.input ?? "";
      const res = await invoke<InteractiveResult>("judge_interactive", {
        filename: activeFile,
        code,
        interactor: interactorCode,
        input,
        timeLimit: problemMeta?.timeLimit ?? 2000,
        settings: compileSettings,
      });
      setInteractiveResult(res);
    } catch (e: any) {
      setInteractiveResult({ status: "error", message: String(e), transcript: "" });
    } finally {
      setRunningInteractive(false);
    }
  };

  const startManualInteraction = async () => {
    if (!activeFile) return;
    // ref 是同步的：第一个 await 之前就占住，连点也只会开一个进程
    if (manualStartingRef.current || manualSessionRef.current) return;
    manualStartingRef.current = true;
    setManualStarting(true);

    // 先造会话 id 并立刻认领：程序一启动就打印的内容（比如矩阵）不会丢
    const sessionId = `m${Date.now()}`;
    manualSessionRef.current = sessionId;
    setConsoleSegs([]);

    try {
      await invoke<string>("start_manual_interaction", {
        session: sessionId,
        filename: activeFile,
        code,
        settings: compileSettings,
      });
      setManualSession(sessionId);
    } catch (e: any) {
      manualSessionRef.current = null;
      pushSys(String(e));
    } finally {
      manualStartingRef.current = false;
      setManualStarting(false);
    }
  };

  const sendManualInput = async () => {
    if (!manualSession) return;
    const line = manualInput;
    setManualInput("");
    setConsoleSegs(prev => [...prev, { kind: "in", text: line }]);
    try {
      await invoke("send_interaction_input", { session: manualSession, text: line });
    } catch (e: any) {
      pushSys(`[发送失败] ${e}`);
    }
  };

  const stopManualInteraction = async () => {
    const session = manualSessionRef.current;
    manualSessionRef.current = null;      // 先断开，免得 kill 触发的 exit 再刷一条
    setManualSession(null);
    if (!session) return;
    try {
      await invoke("stop_manual_interaction", { session });
    } catch (e) {
      console.error(e);
    }
  };

  const saveInteractor = async () => {
    if (!activeFile) return;
    try {
      await invoke("save_interactor", { filename: activeFile, code: interactorCode });
    } catch (e) {
      alert(e);
    }
  };

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
        <div style={{ display: 'flex', background: 'rgba(20, 20, 25, 0.8)', padding: '4px 12px', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', zIndex: 20 }}>
          <button onClick={() => setViewMode("code")} style={{ background: viewMode === "code" ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === "code" ? "#fff" : "#888", border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            💻 代码实现
          </button>
          <button onClick={() => setViewMode("problem")} style={{ background: viewMode === "problem" ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === "problem" ? "#fff" : "#888", border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            📖 题目描述
          </button>
          <button onClick={() => setViewMode("interactive")} style={{ background: viewMode === "interactive" ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === "interactive" ? "#fff" : "#888", border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
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
            {viewMode === "code" ? (
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
            ) : viewMode === "problem" ? (
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
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1b1b1f', flexShrink: 0 }}>
                  <button
                    onClick={handleRunInteractive}
                    disabled={runningInteractive}
                    style={{ padding: '5px 14px', background: runningInteractive ? "#2f5f43" : "#40b864", color: "white", border: "none", borderRadius: "4px", cursor: runningInteractive ? "wait" : "pointer", fontWeight: "bold", fontSize: "12px" }}
                  >
                    {runningInteractive ? "交互中..." : "▶ 运行交互自测"}
                  </button>
                  <button
                    onClick={saveInteractor}
                    style={{ padding: '5px 10px', background: "#2d2d33", color: "#c9c9c9", border: "1px solid #3a3a3a", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}
                  >
                    💾 保存
                  </button>
                  <div style={{ display: "flex", gap: "2px", background: "rgba(255,255,255,0.05)", borderRadius: "5px", padding: "2px" }}>
                    <button onClick={() => setInteractiveMode("interactor")} style={{ background: interactiveMode === "interactor" ? "rgba(255,255,255,0.14)" : "transparent", color: interactiveMode === "interactor" ? "#cfe6ff" : "#6b7280", border: "none", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", cursor: "pointer" }}>
                      用交互器
                    </button>
                    <button onClick={() => setInteractiveMode("manual")} style={{ background: interactiveMode === "manual" ? "rgba(255,255,255,0.14)" : "transparent", color: interactiveMode === "manual" ? "#cfe6ff" : "#6b7280", border: "none", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", cursor: "pointer" }}>
                      手动对答
                    </button>
                  </div>
                  <span style={{ fontSize: "11px", color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {interactiveMode === "interactor" ? "支持 testlib 与普通交互器；测试数据作为 argv[1]" : "没给交互器时，自己手敲输入扮演交互器"}
                  </span>
                  {interactiveResult && (
                    <span style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, color: statusColor(interactiveResult.status), flexShrink: 0 }}>
                      {interactiveResult.status.toUpperCase()}
                    </span>
                  )}
                </div>

                {interactiveMode === "interactor" && <div style={{ flex: interactiveResult ? "0 0 52%" : 1, minHeight: 0 }}>
                  <Editor
                    height="100%"
                    path="interactor.cpp"
                    defaultLanguage="cpp"
                    theme="vs-dark"
                    value={interactorCode}
                    onChange={v => setInteractorCode(v || "")}
                    options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true, tabSize: indentSize, insertSpaces: true, padding: { top: 10 } }}
                  />
                </div>}

                {interactiveMode === "interactor" && interactiveResult && (
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: "1px solid #333", background: "#191a1c", padding: "8px 12px" }}>
                    <div style={{ color: statusColor(interactiveResult.status), fontSize: "12px", marginBottom: "6px", whiteSpace: "pre-wrap", fontWeight: 600 }}>
                      {interactiveResult.message}
                    </div>
                    <pre style={{ margin: 0, fontSize: "11px", lineHeight: 1.5, color: "#9aa4b2", whiteSpace: "pre-wrap" }}>
                      {interactiveResult.transcript || "(没有记录到交互流水)"}
                    </pre>
                  </div>
                )}

                {interactiveMode === "manual" && (
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <div ref={consoleRef} onCopy={handleConsoleCopy} style={{ flex: 1, overflowY: "auto", background: "#141518", padding: "10px 12px" }}>
                      <div style={{ fontSize: "12px", lineHeight: 1.55, color: "#c9d1d9", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, Consolas, monospace" }}>
                        {consoleSegs.length === 0 ? (
                          <span style={{ color: "#5c6470" }}>
                            点下面的「开始」把选手程序跑起来，然后在这里手敲交互器该说的话。{"\n"}
                            没有提供交互器的交互题（Codeforces 一类）用这个模式自测。{"\n\n"}
                            <span style={{ color: "#8ab4f8" }}>{"<"} 你发给程序的输入</span>{"    "}
                            <span style={{ color: "#c9d1d9" }}>{">"} 程序的输出</span>
                          </span>
                        ) : (
                          consoleSegs.map((seg, i) => {
                            if (seg.kind === "sys") {
                              return <div key={i} style={{ color: "#6b7280" }}>{seg.text}</div>;
                            }
                            if (seg.kind === "in") {
                              // 一次可能粘贴多行，逐行加前缀
                              return seg.text.split("\n").map((line, j) =>
                                <div key={`${i}-${j}`} style={{ display: "flex", color: "#8ab4f8" }}>
                                  <span style={{ width: 14, flexShrink: 0, userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}>{"<"}</span>
                                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line}</span>
                                </div>
                              );
                            }
                            return seg.text.split("\n").map((line, j) =>
                              line === "" && j === seg.text.split("\n").length - 1
                                ? null
                                : <div key={`${i}-${j}`} style={{ display: "flex", color: "#c9d1d9" }}>
                                    <span style={{ width: 14, flexShrink: 0, userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}>{">"}</span>
                                    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line}</span>
                                  </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", padding: "8px 12px", borderTop: "1px solid #333", background: "#1b1b1f" }}>
                      <textarea
                        value={manualInput}
                        onChange={e => setManualInput(e.target.value)}
                        onKeyDown={e => {
                          // 单行内容直接回车发；多行内容用 Ctrl/Cmd + Enter 发
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !manualInput.includes("\n"))) {
                            e.preventDefault();
                            sendManualInput();
                          }
                        }}
                        rows={2}
                        placeholder="要发给程序的内容，可多行；回车发送，Ctrl+Enter 也可"
                        style={{ flex: 1, minWidth: 0, background: "#2d2d33", border: "1px solid #3a3a3a", borderRadius: "4px", color: "#fff", padding: "6px 8px", fontSize: "12px", outline: "none", resize: "vertical", fontFamily: "ui-monospace, Consolas, monospace" }}
                      />
                      <button
                        onClick={sendManualInput}
                        disabled={!manualSession}
                        style={{ padding: "5px 12px", background: manualSession ? "#2d4a63" : "#26262b", color: manualSession ? "#cfe6ff" : "#666", border: "1px solid #3a3a3a", borderRadius: "4px", fontSize: "12px", cursor: manualSession ? "pointer" : "not-allowed" }}
                      >
                        发送
                      </button>
                      {manualSession ? (
                        <button onClick={stopManualInteraction} style={{ padding: "5px 12px", background: "#5a2b2b", color: "#ffd7d7", border: "1px solid #3a3a3a", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>
                          停止
                        </button>
                      ) : (
                        <button
                          onClick={startManualInteraction}
                          disabled={manualStarting}
                          style={{ padding: "5px 12px", background: manualStarting ? "#2f5f43" : "#40b864", color: "white", border: "none", borderRadius: "4px", fontSize: "12px", cursor: manualStarting ? "wait" : "pointer", fontWeight: 700 }}
                        >
                          {manualStarting ? "启动中…" : "开始"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
          )}
        </div>
      </div>
      
      {/* 底部运行按钮（交互模式有自己的运行按钮） */}
      {viewMode !== "interactive" && <button
        onClick={handleRunAll}
        style={{ marginTop: "10px", padding: "12px", background: "#40b864", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", flexShrink: 0, transition: "filter 0.2s" }}
        onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(1.1)"}
        onMouseLeave={(e) => e.currentTarget.style.filter = "brightness(1.0)"}
      >
        ▶ 运行全部样例 {activeFile ? `(${activeFile})` : ""}
      </button>}
    </div>
  );
}