import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 自绘标题栏（仿 VS Code / QQ 那条）。
 *
 * 关掉系统装饰后，窗口就失去了「拖动」和「边缘缩放」能力，
 * 所以这里要自己补两样东西：
 *   1. data-tauri-drag-region 提供拖动（双击 = 最大化）
 *   2. 四边四角 8 条透明热区，用 startResizeDragging 恢复缩放
 *
 * 如果某个桌面环境不买账，设置里可以切回系统标题栏，本组件会直接不渲染。
 */

interface TitleBarProps {
  activeTab: string;
  onSelectTab: (key: string) => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  /** true = 用回系统标题栏，自己不画 */
  useSystemTitleBar: boolean;
}

const RESIZE_HANDLES: { dir: string; style: React.CSSProperties }[] = [
  { dir: "North", style: { top: 0, left: 8, right: 8, height: 4, cursor: "ns-resize" } },
  { dir: "South", style: { bottom: 0, left: 8, right: 8, height: 4, cursor: "ns-resize" } },
  { dir: "West", style: { left: 0, top: 8, bottom: 8, width: 4, cursor: "ew-resize" } },
  { dir: "East", style: { right: 0, top: 8, bottom: 8, width: 4, cursor: "ew-resize" } },
  { dir: "NorthWest", style: { top: 0, left: 0, width: 10, height: 10, cursor: "nwse-resize" } },
  { dir: "NorthEast", style: { top: 0, right: 0, width: 10, height: 10, cursor: "nesw-resize" } },
  { dir: "SouthWest", style: { bottom: 0, left: 0, width: 10, height: 10, cursor: "nesw-resize" } },
  { dir: "SouthEast", style: { bottom: 0, right: 0, width: 10, height: 10, cursor: "nwse-resize" } },
];

export default function TitleBar({
  activeTab,
  onSelectTab,
  settingsOpen,
  onToggleSettings,
  useSystemTitleBar,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);

  // 最大化状态要跟着窗口变化，否则图标永远显示成一个样子
  useEffect(() => {
    if (useSystemTitleBar) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let alive = true;

    win.isMaximized().then((m) => { if (alive) setMaximized(m); });
    win.onResized(async () => {
      const m = await win.isMaximized();
      if (alive) setMaximized(m);
    }).then((fn) => {
      if (alive) unlisten = fn;
      else fn();
    });

    return () => {
      alive = false;
      if (unlisten) unlisten();
    };
  }, [useSystemTitleBar]);

  if (useSystemTitleBar) return null;

  const win = getCurrentWindow();

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 14px",
    background: active ? "rgba(255,255,255,0.18)" : "transparent",
    color: active ? "#fff" : "rgba(255,255,255,0.66)",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    transition: "background 0.15s, color 0.15s",
    userSelect: "none",
  });

  const controlStyle: React.CSSProperties = {
    width: 34,
    height: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.75)",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
    borderRadius: 5,
    transition: "background 0.15s, color 0.15s",
  };

  return (
    <>
      {/* 边缘缩放热区：decorations=false 之后 WM 不再提供边框拖拽 */}
      {RESIZE_HANDLES.map(({ dir, style }) => (
        <div
          key={dir}
          onMouseDown={(e) => {
            e.preventDefault();
            // @ts-ignore ResizeDirection 是字符串枚举
            win.startResizeDragging(dir);
          }}
          style={{ position: "fixed", zIndex: 9999, ...style }}
        />
      ))}

      <div
        data-tauri-drag-region
        className="titlebar"
        onDoubleClick={() => win.toggleMaximize()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 34,
          padding: "0 6px 0 10px",
          flexShrink: 0,
          zIndex: 30,
          userSelect: "none",
        }}
      >
        <span className="titlebar-brand" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, opacity: 0.85 }}>
          icnana
        </span>

        <div onClick={() => onSelectTab("code")} style={tabStyle(activeTab === "code")}>
          IDE
        </div>

        {/* 中间整段都可以拖 */}
        <div data-tauri-drag-region style={{ flex: 1, height: "100%" }} />

        <button
          onClick={onToggleSettings}
          style={{
            padding: "3px 11px",
            fontSize: 12,
            cursor: "pointer",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.32)",
            background: settingsOpen
              ? "linear-gradient(135deg, var(--accent-blue), var(--accent-pink))"
              : "rgba(255,255,255,0.10)",
            color: settingsOpen ? "#0b0b0f" : "#fff",
            fontWeight: 700,
            transition: "background 0.15s",
          }}
        >
          设置
        </button>

        <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          <button
            style={controlStyle}
            onClick={() => win.minimize()}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title="最小化"
          >
            ─
          </button>
          <button
            style={controlStyle}
            onClick={() => win.toggleMaximize()}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title={maximized ? "还原" : "最大化"}
          >
            {maximized ? "❐" : "□"}
          </button>
          <button
            style={controlStyle}
            onClick={() => win.close()}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#e81123";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.75)";
            }}
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
