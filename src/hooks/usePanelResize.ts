import { useEffect, useRef, useState } from "react";

/**
 * 左右两侧面板的拖拽调宽。
 *
 * 之前这段逻辑写在 App.tsx 里（4 个 ref + 全局 mousemove），
 * 抽出来之后 App 只剩布局，调宽细节不影响它。
 */
export function usePanelResize(initialFiles = 160, initialTest = 380) {
  const [fileSidebarWidth, setFileSidebarWidth] = useState(initialFiles);
  const [testPanelWidth, setTestPanelWidth] = useState(initialTest);

  const dragging = useRef<"files" | "test" | null>(null);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;

      if (dragging.current === "files") {
        setFileSidebarWidth(Math.max(100, Math.min(320, startW.current + dx)));
      } else {
        // 右侧是从右边拖的，方向相反
        setTestPanelWidth(Math.max(200, Math.min(600, startW.current - dx)));
      }
    };

    const onUp = () => {
      dragging.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const beginDrag = (which: "files" | "test") => (e: React.MouseEvent) => {
    dragging.current = which;
    startX.current = e.clientX;
    startW.current = which === "files" ? fileSidebarWidth : testPanelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return {
    fileSidebarWidth,
    testPanelWidth,
    startDragFiles: beginDrag("files"),
    startDragTest: beginDrag("test"),
  };
}
