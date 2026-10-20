import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { CompileSettings } from "../../config/types";
import { useTauriEvent } from "../../hooks/useTauriEvent";

/**
 * 交互器标签页：有交互器时跑自动对拍，没有时切「手动对答」人工扮演交互器。
 *
 * 状态全部收在这里，外面只需要 activeFile / code / 编译设置这些“输入”。
 */
interface InteractorTabProps {
  /** 和主编辑器共用同一套配色 */
  editorTheme: string;
  /** 控制台配色：输入 / 输出 / 系统提示 */
  terminalColors: { input: string; output: string; system: string };
  activeFile: string;
  code: string;
  indentSize: number;
  problemMeta: any;
  testCases: any[];
  compileSettings: CompileSettings;
}

export default function InteractorTab({
  activeFile,
  code,
  indentSize,
  problemMeta,
  testCases,
  compileSettings,
  terminalColors,
  editorTheme,
}: InteractorTabProps) {
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

  // 手动交互的输出流：会话过滤放在回调里，旧会话的残响直接丢掉
  useTauriEvent<any>("manual-interaction", (payload) => {
    if (!manualSessionRef.current || payload.session !== manualSessionRef.current) return;

    if (payload.kind === "exit") {
      pushSys(`[进程结束，退出码 ${payload.data}]`);
      manualSessionRef.current = null;
      setManualSession(null);
    } else {
      pushOut(payload.data);
    }
  });

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


  return (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'transparent', flexShrink: 0 }}>
                  <button
                    onClick={handleRunInteractive}
                    disabled={runningInteractive}
                    className="ghost-btn"
                    style={{ color: "var(--accent-blue)", borderColor: "rgba(110,168,254,0.45)", fontWeight: 700, opacity: runningInteractive ? 0.6 : 1, cursor: runningInteractive ? "wait" : "pointer" }}
                  >
                    {runningInteractive ? "交互中..." : "▶ 运行交互自测"}
                  </button>
                  <button
                    onClick={saveInteractor}
                    className="ghost-btn"
                  >
                    保存
                  </button>
                  <div style={{ display: "flex", gap: "2px", background: "rgba(255,255,255,0.06)", borderRadius: "7px", padding: "2px" }}>
                    <button onClick={() => setInteractiveMode("interactor")} style={{ background: interactiveMode === "interactor" ? "rgba(255,255,255,0.18)" : "transparent", color: interactiveMode === "interactor" ? "#fff" : "rgba(255,255,255,0.6)", border: "none", borderRadius: "6px", padding: "3px 10px", fontSize: "11px", fontWeight: interactiveMode === "interactor" ? 700 : 500, cursor: "pointer" }}>
                      用交互器
                    </button>
                    <button onClick={() => setInteractiveMode("manual")} style={{ background: interactiveMode === "manual" ? "rgba(255,255,255,0.18)" : "transparent", color: interactiveMode === "manual" ? "#fff" : "rgba(255,255,255,0.6)", border: "none", borderRadius: "6px", padding: "3px 10px", fontSize: "11px", fontWeight: interactiveMode === "manual" ? 700 : 500, cursor: "pointer" }}>
                      手动对答
                    </button>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                    theme={editorTheme}
                    value={interactorCode}
                    onChange={v => setInteractorCode(v || "")}
                    options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true, tabSize: indentSize, insertSpaces: true, padding: { top: 10 } }}
                  />
                </div>}

                {interactiveMode === "interactor" && interactiveResult && (
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: "1px solid var(--border)", background: "rgba(0,0,0,0.35)", padding: "8px 12px" }}>
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
                    <div ref={consoleRef} className="console-body" onCopy={handleConsoleCopy} style={{ flex: 1, overflowY: "auto", background: "transparent", padding: "10px 12px" }}>
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
                              return <div key={i} style={{ color: terminalColors.system }}>{seg.text}</div>;
                            }
                            if (seg.kind === "in") {
                              // 一次可能粘贴多行，逐行加前缀
                              return seg.text.split("\n").map((line, j) =>
                                <div key={`${i}-${j}`} style={{ display: "flex", color: terminalColors.input }}>
                                  <span style={{ width: 14, flexShrink: 0, userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}>{"<"}</span>
                                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line}</span>
                                </div>
                              );
                            }
                            return seg.text.split("\n").map((line, j) =>
                              line === "" && j === seg.text.split("\n").length - 1
                                ? null
                                : <div key={`${i}-${j}`} style={{ display: "flex", color: terminalColors.output }}>
                                    <span style={{ width: 14, flexShrink: 0, userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}>{">"}</span>
                                    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line}</span>
                                  </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", padding: "8px 12px", borderTop: "1px solid var(--border)", background: "transparent" }}>
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
                        style={{ flex: 1, minWidth: 0, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", padding: "6px 8px", fontSize: "12px", outline: "none", resize: "vertical", fontFamily: "ui-monospace, Consolas, monospace" }}
                      />
                      <button
                        onClick={sendManualInput}
                        disabled={!manualSession}
                        className="ghost-btn"
                        style={{ opacity: manualSession ? 1 : 0.45, cursor: manualSession ? "pointer" : "not-allowed" }}
                      >
                        发送
                      </button>
                      {manualSession ? (
                        <button onClick={stopManualInteraction} className="ghost-btn" style={{ color: "#ff9b93", borderColor: "rgba(255,86,87,0.45)" }}>
                          停止
                        </button>
                      ) : (
                        <button
                          onClick={startManualInteraction}
                          disabled={manualStarting}
                          className="ghost-btn"
                          style={{ color: "var(--accent-blue)", borderColor: "rgba(110,168,254,0.45)", fontWeight: 700, opacity: manualStarting ? 0.6 : 1, cursor: manualStarting ? "wait" : "pointer" }}
                        >
                          {manualStarting ? "启动中…" : "开始"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
  );
}
