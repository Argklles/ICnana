import { useState } from "react";
// 如果你建好了 types.ts，也可以引入相关的类型，这里我们暂且不强求类型完美

// 1️⃣ 定义组件需要从父级（或者 Context）接收的 Props
// 这些刚好就是你 useWorkspace 里面 return 出来的一部分！
interface FileSidebarProps {
  files: string[];
  activeFile: string;
  createFile: (fileName: string, template: string) => Promise<void>;
  deleteFile: (fileName: string) => Promise<void>;
  renameFile: (oldName: string, newName: string) => Promise<void>;
  switchFile: (fileName: string) => Promise<void>;
  width: number; // 接收父组件传来的面板宽度
  codeTemplate: string; // 假设从设置里拿到的默认模板
}

export default function FileSidebar({
  files,
  activeFile,
  createFile,
  deleteFile,
  renameFile,
  switchFile,
  width,
  codeTemplate,
}: FileSidebarProps) {
  
  // 2️⃣ 只有这个组件自己关心的“纯视觉/交互状态”留在这里！
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // 处理新建文件（包装一下传给父级的 createFile）
  const handleCreate = async () => {
    await createFile(newFileName, codeTemplate);
    setIsCreatingFile(false);
    setNewFileName("");
  };

  // 处理重命名（包装一下传给父级的 renameFile）
  const handleRename = async (file: string) => {
    await renameFile(file, renameValue);
    setRenamingFile(null);
  };

  return (
    <div style={{ width: `${width}px`, background: "#1e1e1e", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      {/* 头部工具栏 */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "#888", fontWeight: "bold", letterSpacing: "0.5px" }}>📁 文件</span>
        <button
          onClick={() => { setIsCreatingFile(true); setNewFileName(""); }}
          title="新建文件"
          style={{ background: "none", border: "1px solid #555", color: "#aaa", width: "20px", height: "20px", borderRadius: "3px", cursor: "pointer", fontSize: "14px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          +
        </button>
      </div>

      {/* 新建文件输入框 */}
      {isCreatingFile && (
        <div style={{ padding: "6px 8px", borderBottom: "1px solid #333" }}>
          <input
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setIsCreatingFile(false); setNewFileName(""); }
            }}
            placeholder="文件名 (不含.cpp)"
            autoFocus
            style={{ width: "100%", background: "#2d2d2d", border: "1px solid #007acc", borderRadius: "3px", color: "#fff", padding: "4px 6px", fontSize: "11px", outline: "none", boxSizing: "border-box" }}
          />
        </div>
      )}

      {/* 文件列表 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {files.map(file => (
          <div
            key={file}
            onClick={() => switchFile(file)}
            onDoubleClick={() => { setRenamingFile(file); setRenameValue(file.replace(".cpp", "")); }}
            title={renamingFile === file ? "" : `${file}（双击重命名）`}
            className="file-item" // 记得保留你原来的 CSS 类名，我看你原本用了 className
            style={{
              padding: "7px 8px",
              cursor: "pointer",
              background: activeFile === file ? "#094771" : "transparent",
              color: activeFile === file ? "#fff" : "#bbb",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              borderLeft: activeFile === file ? "2px solid #007acc" : "2px solid transparent",
              gap: "4px",
              userSelect: "none",
            }}
          >
            {renamingFile === file ? (
              <input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleRename(file);
                  if (e.key === "Escape") setRenamingFile(null);
                }}
                onBlur={() => handleRename(file)}
                onClick={e => e.stopPropagation()}
                autoFocus
                style={{ background: "#2d2d2d", border: "1px solid #007acc", borderRadius: "2px", color: "#fff", padding: "2px 4px", fontSize: "11px", outline: "none", width: "100%", boxSizing: "border-box" }}
              />
            ) : (
              <>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {file}</span>
                <span
                  className="file-delete-btn"
                  onClick={e => {
                    e.stopPropagation(); // 阻止冒泡，防止触发外层的 switchFile
                    deleteFile(file);
                  }}
                  title="删除"
                  style={{ fontSize: "13px", color: "#f44336", flexShrink: 0, opacity: 0, transition: "opacity 0.15s" }}
                >
                  ×
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}