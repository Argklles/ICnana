import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// 1️⃣ 引入类型和配置
import { TabType } from "./config/types";

// 2️⃣ 引入你的“数据大脑” Hooks
import { useWorkspace } from "./hooks/useWorkspace";
import { useSetting } from "./hooks/useSetting"; // 记得确保文件名拼写改对了
import { useProblem } from "./hooks/usePloblem"; // 沿用你的文件名

// 3️⃣ 引入你的“手脚” UI 组件
import FileSidebar from "./components/workspace/FileSildbar";
import TitleBar from "./components/layout/TitleBar";
import { useTauriEvent } from "./hooks/useTauriEvent";
import EditorArea from "./components/workspace/EditorArea";
import TestPanel from "./components/workspace/TestPanel";
import SettingsPanel from "./components/settings/SettingsPanel";

export default function App() {
  // ── 全局布局状态 ──
  const [activeTab, setActiveTab] = useState<TabType>("code");

  // ── 激活 Hooks 拿到所有数据和方法 ──
  const workspace = useWorkspace();
  const setting = useSetting();
  
  // 题目接收处理器，需要用到 workspace 的部分能力
  const problemHandler = useProblem({
    activeFile: workspace.activeFile,
    switchFile: workspace.switchFile,
    setTestCases: workspace.setTestCases,
    setFiles: workspace.setFiles,
    refreshCollections: workspace.refreshCollections
  });

  // ── 首次启动引导：没有编译器时给一条横幅，别等到点了运行才报错 ──
  const [compilerMissing, setCompilerMissing] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [toolchainBusy, setToolchainBusy] = useState(false);

  const refreshCompiler = () => {
    invoke<any>("get_compiler_info")
      .then(info => setCompilerMissing(!info.found))
      .catch(() => { /* 探测失败就不打扰用户 */ });
  };

  useEffect(() => { refreshCompiler(); }, []);

  // 内置工具链首启解压：解压中显示进度提示，完成后重新探测编译器
  useTauriEvent<{ stage: string; message: string }>("toolchain-status", (payload) => {
    if (payload.stage === "extracting") {
      setToolchainBusy(true);
    } else {
      setToolchainBusy(false);
      if (payload.stage === "ready") refreshCompiler();
    }
  });

  // ── 面板宽度（可拖动布局） ──
  const [fileSidebarWidth, setFileSidebarWidth] = useState(160);
  const [testPanelWidth, setTestPanelWidth] = useState(380);
  const draggingFiles = useRef(false);
  const draggingTest  = useRef(false);
  const dragStartX    = useRef(0);
  const dragStartW    = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartX.current;
      if (draggingFiles.current) setFileSidebarWidth(Math.max(100, Math.min(320, dragStartW.current + dx)));
      if (draggingTest.current) setTestPanelWidth(Math.max(200, Math.min(600, dragStartW.current - dx)));
    };
    const onUp = () => { 
      draggingFiles.current = false; 
      draggingTest.current = false; 
      document.body.style.cursor = ""; 
      document.body.style.userSelect = ""; 
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "transparent", color: "var(--text)", overflow: "hidden" }}>
      
      <TitleBar
        activeTab={activeTab}
        onSelectTab={(key) => setActiveTab(key as TabType)}
        settingsOpen={setting.showSettings}
        onToggleSettings={() => (setting.showSettings ? setting.setShowSettings(false) : setting.openSettings())}
        useSystemTitleBar={setting.useSystemTitleBar}
      />

      {toolchainBusy && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 14px", background: "rgba(110,168,254,0.14)",
          borderBottom: "1px solid rgba(110,168,254,0.35)",
          color: "#cfe6ff", fontSize: 12, flexShrink: 0,
        }}>
          <span>🛠️ 首次启动，正在解压内置编译器（约 500MB），完成后右下角会提示……</span>
        </div>
      )}

      {/* 🟢 首次启动引导横幅 */}
      {compilerMissing && !guideDismissed && (
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "8px 14px", background: "rgba(240,183,47,0.12)",
          borderBottom: "1px solid rgba(240,183,47,0.3)",
          color: "#d8c48a", fontSize: "12px", flexShrink: 0,
        }}>
          <span>⚠️ 没有找到 C++ 编译器，现在还不能编译和测评。</span>
          <button
            onClick={() => { setting.openSettings(); setGuideDismissed(true); }}
            style={{ background: "rgba(240,183,47,0.2)", border: "1px solid rgba(240,183,47,0.45)", color: "#f4d27a", borderRadius: 4, padding: "3px 10px", fontSize: "11px", cursor: "pointer" }}
          >
            查看安装方法
          </button>
          <button
            onClick={() => setGuideDismissed(true)}
            title="先不管"
            style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#a08f4f", cursor: "pointer", fontSize: "14px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* 🟢 主体内容区域 */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

        {/* 压暗层：壁纸之上、所有面板之下 */}
        <div className="content-scrim" />

        {/* ── 💻 代码实验室 (受 activeTab 控制) ── */}
        <div style={{ display: "flex", width: "100%", height: "100%", position: "absolute", visibility: activeTab === "code" ? "visible" : "hidden", zIndex: activeTab === "code" ? 10 : 0 }}>
          
          {/* 左侧：文件树组件 */}
          <FileSidebar 
            files={workspace.files} activeFile={workspace.activeFile}
            createFile={workspace.createFile} deleteFile={workspace.deleteFile}
            renameFile={workspace.renameFile} switchFile={workspace.switchFile}
            toggleFavorite={workspace.toggleFavorite}
            collections={workspace.collections}
            toggleInCollection={workspace.toggleInCollection}
            createCollection={workspace.createCollection}
            deleteCollection={workspace.deleteCollection}
            width={fileSidebarWidth} codeTemplate={setting.codeTemplate}
          />

          <div className="resize-divider" onMouseDown={e => { draggingFiles.current = true; dragStartX.current = e.clientX; dragStartW.current = fileSidebarWidth; document.body.style.cursor = "col-resize"; }} style={{ width: "5px", background: "transparent", cursor: "col-resize", zIndex: 5 }} />

          {/* 中间：编辑器与题面组件 */}
          <EditorArea 
            activeFile={workspace.activeFile} code={workspace.code} setCode={workspace.setCode}
            indentSize={setting.indentSize} problemMeta={workspace.problemMeta}
            problemMarkdown={workspace.problemMarkdown} testCases={workspace.testCases}
            setProblemMeta={workspace.setProblemMeta}
            compileSettings={setting.compileSettings}
            tabShortcut={setting.tabShortcut}
            codeTheme={setting.codeTheme}
            tokenColors={setting.tokenColors}
            terminalColors={setting.terminalColors}
          />

          <div className="resize-divider" onMouseDown={e => { draggingTest.current = true; dragStartX.current = e.clientX; dragStartW.current = testPanelWidth; document.body.style.cursor = "col-resize"; }} style={{ width: "5px", background: "transparent", cursor: "col-resize", zIndex: 5 }} />

          {/* 右侧：测试用例面板组件 */}
          <TestPanel 
            testCases={workspace.testCases} setTestCases={workspace.setTestCases} width={testPanelWidth}
            onRunAll={() => workspace.runAll(setting.compileSettings)}
          />
        </div>

        {/* ── 🌐 OJ 浏览器组件 (受 activeTab 控制) ──
        <BrowserView 
          isActive={activeTab === "browser"} ojUrl={browser.ojUrl} setOjUrl={browser.setOjUrl}
          browserHistory={browser.browserHistory} clearHistory={browser.clearHistory}
        /> */}
      </div>

      {/* 🟢 新题目接收弹窗 (接入 problemHandler) */}
      {problemHandler.incomingProblem && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
          <div style={{ background: "rgba(30,30,35,0.8)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", padding: "24px", borderRadius: "12px", width: "400px", color: "#fff" }}>
            <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px" }}>✨ 接收到新题目数据</h3>
            <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: "20px", wordBreak: "break-all" }}>{problemHandler.incomingProblem}</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => problemHandler.handleIgnore(problemHandler.incomingProblem!)} style={{ background: "transparent", color: "#aaa", border: "none", cursor: "pointer", padding: "8px 16px" }}>忽略</button>
              <button onClick={() => problemHandler.handleMergeToCurrent(problemHandler.incomingProblem!)} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "6px", cursor: "pointer", padding: "8px 16px" }}>导入当前页</button>
              <button onClick={() => problemHandler.handleOpenNewPage(problemHandler.incomingProblem!)} style={{ background: "#4caf50", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", padding: "8px 16px", fontWeight: "bold" }}>新开代码页</button>
            </div>
          </div>
        </div>
      )}

      {/* ⚙️ 设置面板（编译环境 / 编辑器） */}
      {setting.showSettings && (
        <SettingsPanel
          onClose={() => setting.setShowSettings(false)}
          onSave={setting.saveSettings}
          onReset={setting.resetSettings}
          editingTemplate={setting.editingTemplate}
          setEditingTemplate={setting.setEditingTemplate}
          editingIndent={setting.editingIndent}
          setEditingIndent={setting.setEditingIndent}
          editingCompile={setting.editingCompile}
          setEditingCompile={setting.setEditingCompile}
          editingShortcut={setting.editingShortcut}
          setEditingShortcut={setting.setEditingShortcut}
          editingAppearance={setting.editingAppearance}
          setEditingAppearance={setting.setEditingAppearance}
          appearanceError={setting.appearanceError}
          presets={setting.presets}
          onSavePreset={setting.savePreset}
          onDeletePreset={setting.deletePreset}
          onApplyPreset={setting.applyPreset}
          useSystemTitleBar={setting.useSystemTitleBar}
          setUseSystemTitleBar={setting.setUseSystemTitleBar}
          codeTheme={setting.codeTheme}
          setCodeTheme={setting.updateCodeTheme}
          codeShadow={setting.codeShadow}
          setCodeShadow={setting.updateCodeShadow}
          tokenColors={setting.tokenColors}
          setTokenColor={setting.updateTokenColor}
          terminalColors={setting.terminalColors}
          setTerminalColor={setting.updateTerminalColor}
        />
      )}
    </div>
  );
}