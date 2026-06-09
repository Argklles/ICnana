import React from "react";
// 记得引入 TestCase 类型
// import { TestCase } from "../../config/types";

interface TestPanelProps {
  testCases: any[]; // 替换为 TestCase[]
  setTestCases: React.Dispatch<React.SetStateAction<any[]>>; // 替换为 TestCase[]
  width: number;
}

export default function TestPanel({ testCases, setTestCases, width }: TestPanelProps) {
  
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
    <div style={{ width: `${width}px`, background: "#252526", padding: "10px", overflowY: "auto", flexShrink: 0 }}>
      
      {/* 头部：标题与添加按钮 */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px", alignItems: "center" }}>
        <strong style={{ color: "#fff", fontSize: "16px" }}>测试用例</strong>
        <button 
          onClick={handleAddCase} 
          style={{ padding: "4px 8px", background: "#444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          ➕ 添加
        </button>
      </div>

      {/* 列表渲染 */}
      {testCases.map((tc, index) => (
        <div key={index} style={{ background: "#333", padding: "10px", marginBottom: "10px", borderRadius: "4px", borderLeft: tc.status === "ac" ? "4px solid #40b864" : tc.status === "wa" ? "4px solid #f44336" : "4px solid #888" }}>
          
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
          <pre style={{ margin: 0, padding: "8px", background: "#1e1e1e", borderRadius: "4px", fontSize: "12px", color: tc.status === "ac" ? "#40b864" : tc.status === "wa" ? "#f44336" : "#aaa", whiteSpace: "pre-wrap" }}>
            {tc.actual || "等待运行..."}
          </pre>
        </div>
      ))}
    </div>
  );
}

// 把原本在 App.tsx 底部的样式挪到这里，因为它只属于这个面板
const inputStyle: React.CSSProperties = {
  flex: 1, height: "45px", background: "#1a1a1a", color: "#fff",
  border: "1px solid #444", borderRadius: "4px", fontSize: "11px", padding: "4px",
};