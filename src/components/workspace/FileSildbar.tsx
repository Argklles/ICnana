import { Fragment, useState } from "react";
import type { CSSProperties } from "react";
import { Collection, WorkspaceFile } from "../../config/types";
import { FAVORITES_ID } from "../../config/constants";

// 1️⃣ 定义组件需要从父级（或者 Context）接收的 Props
interface FileSidebarProps {
  files: WorkspaceFile[];
  collections: Collection[];
  activeFile: string;
  createFile: (fileName: string, template: string) => Promise<void>;
  deleteFile: (fileName: string) => Promise<void>;
  renameFile: (oldName: string, newName: string) => Promise<void>;
  switchFile: (fileName: string) => Promise<void>;
  toggleFavorite: (stem: string, favorite: boolean) => Promise<void>;
  toggleInCollection: (id: string, stem: string, member: boolean) => Promise<void>;
  createCollection: (name: string) => Promise<Collection | null>;
  deleteCollection: (id: string) => Promise<void>;
  width: number;
  codeTemplate: string;
}

// OJ 分组的配色（集合 id 形如 oj:luogu）
const OJ_COLORS: Record<string, string> = {
  luogu: "#3ba7e3",
  codeforces: "#f07178",
  atcoder: "#c3e88d",
  nowcoder: "#f2b04a",
  other: "#8b949e",
};

function colorOfCollection(collection: Collection): string {
  if (collection.kind !== "oj") return "#8ab4f8";
  const oj = collection.id.startsWith("oj:") ? collection.id.slice(3) : "other";
  return OJ_COLORS[oj] ?? "#8ab4f8";
}

const sectionTitleStyle: CSSProperties = {
  padding: "7px 8px 3px",
  fontSize: "10px",
  color: "var(--text-faint)",
  letterSpacing: "0.6px",
  fontWeight: 700,
  userSelect: "none",
};

export default function FileSidebar({
  files,
  collections,
  activeFile,
  createFile,
  deleteFile,
  renameFile,
  switchFile,
  toggleFavorite,
  toggleInCollection,
  createCollection,
  deleteCollection,
  width,
  codeTemplate,
}: FileSidebarProps) {

  // 2. 只有这个组件自己关心的“纯视觉/交互状态”留在这里
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null); // 展开“加入集合”面板的题目
  const [newCollectionName, setNewCollectionName] = useState("");

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

  const handleCreateCollection = async (stem: string) => {
    const created = await createCollection(newCollectionName);
    if (created) {
      await toggleInCollection(created.id, stem, true);
      setNewCollectionName("");
    }
  };

  // 引用 → 真实文件（集合里可能残留已删除题目的引用，直接跳过）
  const byStem = new Map(files.map(f => [f.stem, f]));
  const orderOf = new Map(files.map((f, i) => [f.stem, i]));
  const resolveOrdered = (items: string[]) =>
    items
      .map(s => byStem.get(s))
      .filter((f): f is WorkspaceFile => Boolean(f))
      .sort((a, b) => (orderOf.get(a.stem) ?? 0) - (orderOf.get(b.stem) ?? 0));

  // 单行渲染：收藏星标 + 文件名 + 集合菜单 + 删除
  const renderRow = (file: WorkspaceFile) => {
    const isActive = activeFile === file.stem;
    const isRenaming = renamingFile === file.stem;
    const isMenuOpen = menuFor === file.stem;

    return (
      <Fragment key={file.stem}>
        <div
          onClick={() => { setMenuFor(null); switchFile(file.stem); }}
          onDoubleClick={() => { setRenamingFile(file.stem); setRenameValue(file.stem); }}
          title={isRenaming ? "" : `${file.stem}${file.url ? `\n${file.url}` : ""}\n双击重命名`}
          className="file-item"
          style={{
            padding: "7px 8px",
            cursor: "pointer",
            background: isActive ? "#094771" : "transparent",
            color: isActive ? "var(--text)" : "var(--text-dim)",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            borderLeft: isActive ? "2px solid #007acc" : "2px solid transparent",
            gap: "4px",
            userSelect: "none",
          }}
        >
          {isRenaming ? (
            <input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleRename(file.stem);
                if (e.key === "Escape") setRenamingFile(null);
              }}
              onBlur={() => handleRename(file.stem)}
              onClick={e => e.stopPropagation()}
              autoFocus
              style={{ background: "var(--bg-input)", border: "1px solid var(--accent-blue)", borderRadius: "2px", color: "var(--text)", padding: "2px 4px", fontSize: "11px", outline: "none", width: "100%", boxSizing: "border-box" }}
            />
          ) : (
            <>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name || file.stem}
              </span>

              {/* ⭐ 收藏 */}
              <span
                onClick={e => {
                  e.stopPropagation(); // 别触发 switchFile
                  toggleFavorite(file.stem, !file.favorite);
                }}
                title={file.favorite ? "取消收藏" : "加入收藏"}
                className={`icon-btn${file.favorite ? " star-on" : " file-star-btn"}`}
              >
                {file.favorite ? "★" : "☆"}
              </span>

              {/* ＋ 加入其它集合 */}
              <span
                onClick={e => {
                  e.stopPropagation();
                  setMenuFor(isMenuOpen ? null : file.stem);
                }}
                title="加入集合"
                className={`icon-btn${isMenuOpen ? "" : " file-collection-btn"}`}
                style={isMenuOpen ? { color: "var(--accent-blue)" } : undefined}
              >
                ＋
              </span>

              <span
                className="icon-btn danger file-delete-btn"
                onClick={e => {
                  e.stopPropagation(); // 阻止冒泡，防止触发 switchFile
                  deleteFile(file.stem);
                }}
                title="删除"
                style={{ opacity: 0 }}
              >
                ×
              </span>
            </>
          )}
        </div>

        {isMenuOpen && (
          <div style={{ padding: "6px 10px 9px 20px", background: "#191a1c", borderBottom: "1px solid #2a2a2a" }}>
            <div style={{ fontSize: "10px", color: "#666", marginBottom: "4px" }}>加入集合</div>
            {collections.map(c => (
              <label
                key={c.id}
                style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#bbb", cursor: "pointer", padding: "2px 0" }}
              >
                <input
                  type="checkbox"
                  checked={c.items.includes(file.stem)}
                  onChange={e => toggleInCollection(c.id, file.stem, e.target.checked)}
                  style={{ accentColor: "#007acc" }}
                />
                {c.name}
              </label>
            ))}
            <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
              <input
                value={newCollectionName}
                onChange={e => setNewCollectionName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreateCollection(file.stem); }}
                placeholder="新集合名"
                style={{ flex: 1, minWidth: 0, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "3px", color: "var(--text)", padding: "3px 5px", fontSize: "10px", outline: "none" }}
              />
              <button
                onClick={() => handleCreateCollection(file.stem)}
                style={{ background: "#2d4a63", border: "1px solid #3a3a3a", color: "#cfe6ff", borderRadius: "3px", fontSize: "10px", padding: "2px 7px", cursor: "pointer" }}
              >
                建
              </button>
            </div>
          </div>
        )}
      </Fragment>
    );
  };

  const favoritesCollection = collections.find(c => c.kind === "favorites" || c.id === FAVORITES_ID);
  const favoriteFiles = favoritesCollection ? resolveOrdered(favoritesCollection.items) : [];
  const ojCollections = collections.filter(c => c.kind === "oj");
  const customCollections = collections.filter(c => c.kind === "custom");

  // 既不在 OJ 分组也不在自建集合里的题目（手动新建的、认不出来源的）
  const assigned = new Set(
    collections.filter(c => c.kind !== "favorites").flatMap(c => c.items)
  );
  const unassigned = files.filter(f => !assigned.has(f.stem));

  const renderCollection = (collection: Collection) => {
    const items = resolveOrdered(collection.items);
    const deletable = collection.kind === "custom";

    return (
      <div key={collection.id}>
        <div style={{ ...sectionTitleStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: colorOfCollection(collection), opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {collection.name} · {items.length}
          </span>
          {deletable && (
            <span
              onClick={e => { e.stopPropagation(); deleteCollection(collection.id); }}
              title="删除集合（不会删除题目）"
              style={{ cursor: "pointer", color: "#666", fontSize: "11px", paddingRight: "2px" }}
            >
              ×
            </span>
          )}
        </div>
        {items.length > 0
          ? items.map(renderRow)
          : <div style={{ padding: "2px 10px 5px 20px", fontSize: "10px", color: "#555" }}>（空）</div>}
      </div>
    );
  };

  return (
    <div className="glass-panel panel-left" style={{ width: `${width}px`, display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      {/* 头部工具栏 */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "#888", fontWeight: "bold", letterSpacing: "0.5px" }}>文件</span>
        <button
          onClick={() => { setIsCreatingFile(true); setNewFileName(""); }}
          title="新建文件"
          className="ghost-btn"
          style={{ width: "22px", height: "22px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", lineHeight: 1 }}
        >
          +
        </button>
      </div>

      {/* 新建文件输入框 */}
      {isCreatingFile && (
        <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
          <input
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setIsCreatingFile(false); setNewFileName(""); }
            }}
            placeholder="文件名 (不含.cpp)"
            autoFocus
            style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--accent-blue)", borderRadius: "3px", color: "var(--text)", padding: "4px 6px", fontSize: "11px", outline: "none", boxSizing: "border-box" }}
          />
        </div>
      )}

      {/* 文件列表：收藏夹 / 自定义集合 / 按来源 OJ 分组 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {favoriteFiles.length > 0 && (
          <>
            <div style={{ ...sectionTitleStyle, color: "#f5c542", opacity: 0.9 }}>收藏</div>
            {favoriteFiles.map(renderRow)}
          </>
        )}

        {/* 按 OJ 自动归类的集合（空的先不显示，免得占地方） */}
        {ojCollections.filter(c => resolveOrdered(c.items).length > 0).map(renderCollection)}

        {/* 用户自建集合 */}
        {customCollections.map(renderCollection)}

        {/* 哪儿都没归进去的题目 */}
        {unassigned.length > 0 && (
          <>
            <div style={{ ...sectionTitleStyle, color: "#8b949e", opacity: 0.8 }}>未分类</div>
            {unassigned.map(renderRow)}
          </>
        )}

        {files.length === 0 && (
          <div style={{ padding: "12px 10px", fontSize: "11px", color: "#666" }}>还没有文件，点右上角 + 新建喵</div>
        )}
      </div>
    </div>
  );
}
