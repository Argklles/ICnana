import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
// 记得引入你之前定义的类型
import { TestCase } from "../config/types"; 

// 🎯 核心概念：因为你的 handleMergeToCurrent 需要用到 activeFile 等数据
// 这些数据属于 useWorkspace，所以我们需要通过参数把它们传进这个 Hook 里
interface UseProblemProps {
  activeFile: string;
  switchFile: (file: string) => Promise<void>;
  setTestCases: React.Dispatch<React.SetStateAction<TestCase[]>>;
  setFiles: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useProblem({ activeFile, switchFile, setTestCases, setFiles }: UseProblemProps) {
  // 1️⃣ 状态必须声明在函数内部！
  const [incomingProblem, setIncomingProblem] = useState<string | null>(null);

  // 2️⃣ 监听事件必须包裹在 useEffect 中
  useEffect(() => {
    const unlistenPromise = listen<string>("oj_problem_received", (event) => {
      const newStem = event.payload; 
      console.log("🎉 插件发来新题目了喵！等待用户决定:", newStem);
      setIncomingProblem(newStem); // 触发弹窗
    });

    // 清理函数
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []); // 依赖项为空，表示只在组件挂载时监听一次

  // 3️⃣ 你的处理函数们
  const handleOpenNewPage = async (stem: string) => {
    setIncomingProblem(null);
    const updatedFiles = await invoke<string[]>("list_workspace_files");
    setFiles(updatedFiles);
    await switchFile(stem);
  };

  const handleMergeToCurrent = async (stem: string) => {
    setIncomingProblem(null);

    // 这里直接使用参数传进来的 activeFile
    if (!activeFile) {
      alert("当前没有选中的代码页，无法导入喵！");
      return;
    }

    if (stem === activeFile) {
      alert("笨蛋，新发来的题目和当前题目是同一个啦，不需要导入喵！");
      return;
    }

    try {
      await invoke("load_workspace_file", { filename: activeFile });
      console.log(`准备把 ${stem} 的样例偷进 ${activeFile} 喵...`);

      const newCases = await invoke<TestCase[]>("load_test_cases", { filename: stem });
      setTestCases(newCases);
      
      await invoke("save_test_cases", { 
        filename: activeFile, 
        cases: newCases 
      });

      await invoke("delete_workspace_file", { filename: stem });
      console.log("🎉 成功将样例偷入当前页面，现场已清理！");
    } catch (e) {
      console.error("合并样例失败了喵:", e);
      const updatedFiles = await invoke<string[]>("list_workspace_files");
      setFiles(updatedFiles);
      alert("目标文件可能已经被删除了喵，列表已为你刷新！报错：" + e); 
    }
  };

  const handleIgnore = async (stem: string) => {
    setIncomingProblem(null);
    await invoke("delete_workspace_file", { filename: stem });
  };

  // 4️⃣ 最后，把 UI 组件需要用到的状态和方法 return 出去
  return {
    incomingProblem,
    handleOpenNewPage,
    handleMergeToCurrent,
    handleIgnore
  };
}