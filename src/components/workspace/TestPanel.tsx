import React from "react";
// 记得引入 TestCase 类型
// import { TestCase } from "../../config/types";

interface TestPanelProps {
  testCases: any[]; // 替换为 TestCase[]
  setTestCases: React.Dispatch<React.SetStateAction<any[]>>; // 替换为 TestCase[]
  width: number;
  /** 跑一遍全部样例（逻辑在 useWorkspace 里） */
  onRunAll: () => void | Promise<void>;
}

export default function TestPanel({ testCases, setTestCases, width, onRunAll }: TestPanelProps) {
  
  // 增加新用例
  const handleAddCase = () => {
    setTestCases([
      ...testCases, 
      { input: "", output: "", actual: "", status: "pending" }
    ]);
  };

  // 删除某一个用例
  const handleDeleteCase = (indexToRemove: number) => {
    if (testCases.length <= 1) return;
    setTestCases(testCases.filter((_, i) => i !== indexToRemove));
  };

  // 更新某一个用例的内容 (type 可以是 'input' 或 'output')
  const handleUpdateCase = (indexToUpdate: number, field: "input" | "output", value: string) => {
    const newCases = [...testCases];
    newCases[indexToUpdate][field] = value;
    setTestCases(newCases);
  };

  return (
    <div className="glass-panel panel-right" style={{ width: `${width}px`, padding: "10px", overflowY: "auto", flexShrink: 0 }}>
      
      {/* 头部：标题 · 运行 · 添加 */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px", alignItems: "center", gap: "8px" }}>
        <strong style={{ color: "var(--text)", fontSize: "15px", flexShrink: 0 }}>测试用例</strong>

        <button
          className="ghost-btn"
          onClick={() => onRunAll()}
          title="运行全部样例"
          style={{ flex: 1, color: "var(--accent-blue)", borderColor: "rgba(110, 168, 254, 0.45)", fontWeight: 600 }}
        >
          ▶ 运行
        </button>

        <button className="ghost-btn" onClick={handleAddCase} style={{ flexShrink: 0 }}>
          + 添加
        </button>
      </div>

      {/* 列表渲染 */}
      {testCases.map((tc, index) => (
        <div key={index} style={{ background: "var(--bg-elevated)", padding: "10px", marginBottom: "10px", borderRadius: "4px", borderLeft: tc.status === "ac" ? "4px solid #40b864" : tc.status === "wa" ? "4px solid #f44336" : "4px solid #888" }}>
          
          {/* 单个用例的 Header */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#888" }}>Case #{index + 1}</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <b style={{ fontSize: "12px", color: tc.status === "ac" ? "#40b864" : tc.status === "wa" ? "#f44336" : "#888" }}>
                {tc.status.toUpperCase()}
              </b>
              <button
                onClick={() => handleDeleteCase(index)}
                title={testCases.length <= 1 ? "至少保留一个用例" : "删除此用例"}
                style={{ background: "none", border: "none", color: testCases.length <= 1 ? "#555" : "#f44336", cursor: testCases.length <= 1 ? "not-allowed" : "pointer", fontSize: "15px", lineHeight: 1, padding: "0 2px" }}
              >
                ×
              </button>
            </div>
          </div>

          {/* 输入与预期输出 */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <textarea 
              value={tc.input} 
              onChange={e => handleUpdateCase(index, "input", e.target.value)} 
              style={inputStyle} 
              placeholder="输入" 
            />
            <textarea 
              value={tc.output} 
              onChange={e => handleUpdateCase(index, "output", e.target.value)} 
              style={inputStyle} 
              placeholder="预期输出" 
            />
          </div>

          {/* 实际运行结果展示区 */}
          <pre style={{ margin: 0, padding: "8px", background: "var(--bg-input)", borderRadius: "4px", fontSize: "12px", color: tc.status === "ac" ? "#40b864" : tc.status === "wa" ? "#f44336" : "#aaa", whiteSpace: "pre-wrap" }}>
            {tc.actual || "等待运行..."}
          </pre>
        </div>
      ))}
    </div>
  );
}

// 把原本在 App.tsx 底部的样式挪到这里，因为它只属于这个面板
const inputStyle: React.CSSProperties = {
  flex: 1, height: "45px", background: "var(--bg-input)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "4px", fontSize: "11px", padding: "4px",
};