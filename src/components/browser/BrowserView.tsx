import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
// import { Favorite, HistoryEntry } from "../../config/types";

// 格式化时间的帮助函数直接丢在文件外面
const formatTimeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
};

interface BrowserViewProps {
  isActive: boolean; // 用于判断当前 Tab 是否选中，控制底层浏览器的显示隐藏
  ojUrl: string;
  setOjUrl: (url: string) => void;
  browserHistory: any[]; // 替换为 HistoryEntry[]
  clearHistory: () => void;
}

export default function BrowserView({
  isActive, ojUrl, setOjUrl, browserHistory, clearHistory
}: BrowserViewProps) {
  
  const [showHistory, setShowHistory] = useState(false);
  const browserContainerRef = useRef<HTMLDivElement>(null);

  // 呼叫后端打开/更新浏览器
  const openBrowser = async (targetUrl: string = ojUrl) => {
    if (!browserContainerRef.current) return;
    const rect = browserContainerRef.current.getBoundingClientRect();
    try {
      await invoke("open_oj_browser", { 
        url: targetUrl, 
        x: rect.x + window.screenX, 
        y: rect.y + window.screenY, 
        width: rect.width, 
        height: rect.height 
      });
    } catch (e) { console.error(e); }
  };

  // 监听容器大小变化，同步底层 WebView 尺寸
  useEffect(() => {
    let resizeTimeout: number;
    const syncBrowser = async () => {
      if (isActive && browserContainerRef.current) {
        const rect = browserContainerRef.current.getBoundingClientRect();
        await invoke("update_oj_bounds", { 
          x: rect.x + window.screenX, 
          y: rect.y + window.screenY, 
          width: rect.width, 
          height: rect.height 
        });
      } else {
        await invoke("update_oj_bounds", { x: -9999, y: -9999, width: 800, height: 600 });
      }
    };
    
    const observer = new ResizeObserver(() => {
      if (!isActive) return;
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => requestAnimationFrame(syncBrowser), 15);
    });
    
    if (browserContainerRef.current) observer.observe(browserContainerRef.current);
    syncBrowser();
    
    return () => { observer.disconnect(); clearTimeout(resizeTimeout); };
  }, [isActive, ojUrl]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", position: "absolute", visibility: isActive ? "visible" : "hidden", zIndex: isActive ? 10 : 0 }}>
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
                <button onClick={clearHistory} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "11px" }}>清空</button>
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
          title="在系统默认浏览器中打开"
          style={{ background: "#555", color: "#ccc", border: "none", padding: "0 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}
          onClick={() => invoke("open_in_system_browser", { url: ojUrl })}
        >🔗 外部打开</button>
      </div>
      
      {/* 浏览器容器 */}
      <div ref={browserContainerRef} style={{ flex: 1, width: "100%", background: "#000", pointerEvents: isActive ? "auto" : "none" }}>
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#444" }}>正在召唤浏览器...喵...</div>
      </div>
    </div>
  );
}