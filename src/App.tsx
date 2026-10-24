import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// 1️⃣ 引入类型和配置
import { TabType } from "./config/types";

// 2️⃣ 引入你的“数据大脑” Hooks
import { useWorkspace } from "./hooks/useWorkspace";
import { useSetting } from "./hooks/useSetting"; // 记得确保文件名拼写改对了
import { useProblem } from "./hooks/useProblem"; 

// 3️⃣ 引入你的“手脚” UI 组件
import FileSidebar from "./components/workspace/FileSidebar";
import TitleBar from "./components/layout/TitleBar";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { usePanelResize } from "./hooks/usePanelResize";
import ProblemArrivalModal from "./components/ProblemArrivalModal";
import EditorArea from "./components/workspace/EditorArea";
import TestPanel from "./components/workspace/TestPanel";
import { lazy, Suspense } from "react";

// 设置面板很大，按需加载
const SettingsPanel = lazy(() => import("./components/settings/SettingsPanel"));

export default function App() {
  // ── 全局布局状态 ──
  // 现在只有 IDE 一个工作区；保留 activeTab 是为了以后加回浏览器/其它视图
  const [activeTab, setActiveTab] = useState<TabType>("code");

  // ── 激活 Hooks 拿到所有数据和方法 ──
  const workspace = useWorkspace();
  const setting = useSetting();
  
  // 题目接收处理器，需要用到 workspace 的部分能力
  const { fileSidebarWidth, testPanelWidth, startDragFiles, startDragTest } = usePanelResize();

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "transparent", color: "var(--text)", overflow: "hidden" }}>
      
      <TitleBar
        activeTab={activeTab}
        onSelectTab={(key) => setActiveTab(key as TabType)}
        settingsOpen={setting.showSettings}
        onToggleSettings={() => (setting.showSettings ? setting.setShowSettings(false) : setting.openSettings())}
      />

      {toolchainBusy && (
        <div className="banner-in" style={{
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
        <div className="banner-in" style={{
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

        {/* ── 代码实验室 ── */}
        {/* z-index 必须高于 .content-scrim，否则压暗层会盖在面板上 */}
        <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", zIndex: 2 }}>
          
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

          <div className="resize-divider" onMouseDown={startDragFiles} style={{ width: "5px", background: "transparent", cursor: "col-resize", zIndex: 5 }} />

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

          <div className="resize-divider" onMouseDown={startDragTest} style={{ width: "5px", background: "transparent", cursor: "col-resize", zIndex: 5 }} />

          {/* 右侧：测试用例面板组件 */}
          <TestPanel 
            testCases={workspace.testCases} setTestCases={workspace.setTestCases} width={testPanelWidth}
            onRunAll={() => workspace.runAll(setting.compileSettings)}
          />
        </div>

      </div>

      {problemHandler.incomingProblem && (
        <ProblemArrivalModal
          stem={problemHandler.incomingProblem}
          onIgnore={problemHandler.handleIgnore}
          onMerge={problemHandler.handleMergeToCurrent}
          onOpenNew={problemHandler.handleOpenNewPage}
        />
      )}

      {/* ⚙️ 设置面板（编译环境 / 编辑器） */}
      {setting.showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel settings={setting} />
        </Suspense>
      )}
    </div>
  );
}