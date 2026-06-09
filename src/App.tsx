import { useState, useEffect, useRef } from "react";
import "./App.css";

// 1️⃣ 引入类型和配置
import { TabType } from "./config/types";

// 2️⃣ 引入你的“数据大脑” Hooks
import { useWorkspace } from "./hooks/useWorkspace";
import { useSetting } from "./hooks/useSetting"; // 记得确保文件名拼写改对了
import { useProblem } from "./hooks/usePloblem"; // 沿用你的文件名
import { useBrowser } from "./hooks/useBrowser";

// 3️⃣ 引入你的“手脚” UI 组件
import FileSidebar from "./components/workspace/FileSildbar";
import EditorArea from "./components/workspace/EditorArea";
import TestPanel from "./components/workspace/TestPanel";
import BrowserView from "./components/browser/BrowserView";

export default function App() {
  // ── 全局布局状态 ──
  const [activeTab, setActiveTab] = useState<TabType>("code");

  // ── 激活 Hooks 拿到所有数据和方法 ──
  const workspace = useWorkspace();
  const setting = useSetting();
  const browser = useBrowser();
  
  // 题目接收处理器，需要用到 workspace 的部分能力
  const problemHandler = useProblem({
    activeFile: workspace.activeFile,
    switchFile: workspace.switchFile,
    setTestCases: workspace.setTestCases,
    setFiles: workspace.setFiles
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

  // 点击收藏栏快速跳转
  const handleFavoriteClick = (url: string) => {
    browser.setOjUrl(url);
    setActiveTab("browser");
  };

  // ── 纯样式常量（为了不污染顶部，放在组件内） ──
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px", background: active ? "#1e1e1e" : "transparent",
    color: active ? "#fff" : "#999", borderRadius: "6px 6px 0 0", cursor: "pointer",
    fontSize: "13px", borderBottom: active ? "2px solid #40b864" : "2px solid transparent",
    transition: "0.2s", userSelect: "none",
  });
  const favButtonStyle: React.CSSProperties = {
    padding: "4px 10px", background: "#333", color: "#bbb", border: "1px solid #444",
    borderRadius: "15px", fontSize: "11px", cursor: "pointer", transition: "0.2s",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1a1a1a", color: "#d4d4d4", overflow: "hidden" }}>
      
      {/* 🟢 顶部导航与工具栏 (TopNavBar 部分暂留此处，若嫌长后续可单独抽离) */}
      <div style={{ display: "flex", background: "#252526", padding: "8px 12px 0 12px", gap: "4px", borderBottom: "1px solid #333", alignItems: "center", zIndex: 20, flexShrink: 0 }}>
        <div onClick={() => setActiveTab("code")} style={tabStyle(activeTab === "code")}>💻 代码实验室</div>
        <div onClick={() => setActiveTab("browser")} style={tabStyle(activeTab === "browser")}>🌐 OJ 浏览器</div>

        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: "8px", paddingBottom: "8px", marginLeft: "20px", alignItems: "center" }}>
          
          {/* ⚙️ 设置按钮 (接入 setting Hook) */}
          <button onClick={() => setting.setShowSettings(!setting.showSettings)} style={{ ...favButtonStyle, padding: "4px 9px", fontSize: "13px", background: setting.showSettings ? "#444" : "#2d2d2d" }}>⚙️</button>
          
          <span style={{ fontSize: "11px", color: "#555", userSelect: "none" }}>|</span>
          <span style={{ fontSize: "11px", color: "#666", alignSelf: "center", marginRight: "4px" }}>快捷收藏:</span>
          
          {/* 收藏夹渲染 (接入 browser Hook) */}
          {browser.favorites.map(oj => (
            <button key={oj.name} onClick={() => handleFavoriteClick(oj.url)} onContextMenu={e => { e.preventDefault(); browser.deleteFavorite(oj.name); }} style={favButtonStyle} title={oj.url}>
              {oj.name}
            </button>
          ))}
        </div>
      </div>

      {/* 🟢 主体内容区域 */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        
        {/* ── 💻 代码实验室 (受 activeTab 控制) ── */}
        <div style={{ display: "flex", width: "100%", height: "100%", position: "absolute", visibility: activeTab === "code" ? "visible" : "hidden", zIndex: activeTab === "code" ? 10 : 0 }}>
          
          {/* 左侧：文件树组件 */}
          <FileSidebar 
            files={workspace.files} activeFile={workspace.activeFile}
            createFile={workspace.createFile} deleteFile={workspace.deleteFile}
            renameFile={workspace.renameFile} switchFile={workspace.switchFile}
            width={fileSidebarWidth} codeTemplate={setting.codeTemplate}
          />

          <div className="resize-divider" onMouseDown={e => { draggingFiles.current = true; dragStartX.current = e.clientX; dragStartW.current = fileSidebarWidth; document.body.style.cursor = "col-resize"; }} style={{ width: "5px", background: "#2d2d2d", cursor: "col-resize", zIndex: 5 }} />

          {/* 中间：编辑器与题面组件 */}
          <EditorArea 
            activeFile={workspace.activeFile} code={workspace.code} setCode={workspace.setCode}
            indentSize={setting.indentSize} problemMeta={workspace.problemMeta}
            problemMarkdown={workspace.problemMarkdown} testCases={workspace.testCases} setTestCases={workspace.setTestCases}
          />

          <div className="resize-divider" onMouseDown={e => { draggingTest.current = true; dragStartX.current = e.clientX; dragStartW.current = testPanelWidth; document.body.style.cursor = "col-resize"; }} style={{ width: "5px", background: "#2d2d2d", cursor: "col-resize", zIndex: 5 }} />

          {/* 右侧：测试用例面板组件 */}
          <TestPanel 
            testCases={workspace.testCases} setTestCases={workspace.setTestCases} width={testPanelWidth}
          />
        </div>

        {/* ── 🌐 OJ 浏览器组件 (受 activeTab 控制) ── */}
        <BrowserView 
          isActive={activeTab === "browser"} ojUrl={browser.ojUrl} setOjUrl={browser.setOjUrl}
          browserHistory={browser.browserHistory} clearHistory={browser.clearHistory}
        />
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
    </div>
  );
}