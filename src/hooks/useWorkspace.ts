import { invoke } from "@tauri-apps/api/core";
import { useState , useRef , useEffect} from "react";
import { TestCase , QuestionMeta, WorkspaceFile, Collection, CompileSettings } from "../config/types"
import { FAVORITES_ID } from "../config/constants"

export function useWorkspace() {

    const [files, setFiles] = useState<WorkspaceFile[]> ([]);
    const [activeFile, setActiveFile] = useState<string>("");
    const [code, setCode] = useState<string>("");
    const [testCases, setTestCases] = useState<TestCase[]>([{input: "", output: "", actual: "", status: "pending"}]);
    const [problemMeta, setProblemMeta] = useState<QuestionMeta|null>(null);
    const [problemMarkdown, setproblemMarkdown] = useState<string>(""); 
    const [collections, setCollections] = useState<Collection[]>([]);

    const activeFileRef = useRef(activeFile);
    const codeRef = useRef(code);
    const testCasesRef = useRef(testCases);

    useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);
    useEffect(() => { codeRef.current = code; }, [code]);
    useEffect(() => { testCasesRef.current = testCases}, [testCases]);

    // 🌟🌟🌟 新增：应用启动时的初始化逻辑 🌟🌟🌟
    useEffect(() => {
        const initWorkspace = async () => {
            try {
                // 1. 向 Rust 后端请求最新的文件列表
                const initialFiles = await invoke<WorkspaceFile[]>("list_workspace_files");
                setFiles(initialFiles);

                const initialCollections = await invoke<Collection[]>("list_collections");
                setCollections(initialCollections);

                // 2. 如果有文件，自动打开一个
                if (initialFiles.length > 0) {
                    // 尝试从本地存储读取上次关闭前正在写的文件
                    const lastActive = localStorage.getItem("icnana_active_file");
                    if (lastActive && initialFiles.some(f => f.stem === lastActive)) {
                        await switchFile(lastActive); // 恢复上次的现场
                    } else {
                        await switchFile(initialFiles[0].stem); // 如果没有记录，默认打开第一个
                    }
                }
            } catch (e) {
                console.error("初始化工作区失败喵:", e);
            }
        };

        initWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 创建新文件 ───────────────────────────────────────
    const createFile = async (fileName: string, nowCodeTemplate: string) => {
        const name = fileName.trim();
        if (!name) return;
        try {
        // 传入用户自定义模板
        const created = await invoke<string>("new_workspace_file", { filename: name, template: nowCodeTemplate });
        const updated = await invoke<WorkspaceFile[]>("list_workspace_files");
        setFiles(updated);
        
        await switchFile(created);
        } catch (e) { alert(e); }
    };

    // ── 删除文件 ───────────────────────────────────────────────
    const deleteFile = async (filename: string) => {
        if (files.length <= 1) { alert("至少保留一个文件喵~"); return; }
        if (!confirm(`确定删除 ${filename}？`)) return;
        await invoke("delete_workspace_file", { filename });
        const updated = await invoke<WorkspaceFile[]>("list_workspace_files");
        setFiles(updated);
        await refreshCollections();
        if (activeFile === filename) {
        // ⚠️ 必须先清空 ref，否则 switchFile 的 auto-save 会把刚删的文件重建回来
        activeFileRef.current = "";
        await switchFile(updated[0].stem);
        }
    };

    // ── 重命名文件 ─────────────────────────────────────────────
    const renameFile = async (oldName: string, goalName: string) => {
        const val = goalName.trim();
        if (!val || val === oldName.replace(".cpp", "")) { return; }
        try {
        const newName = await invoke<string>("rename_workspace_file", { oldName, newName: val });
        const updated = await invoke<WorkspaceFile[]>("list_workspace_files");
        setFiles(updated);
        await refreshCollections();
        if (activeFile === oldName) {
            setActiveFile(newName);
            localStorage.setItem("icnana_active_file", newName);
        }
        
        } catch (e) { alert(e); }
    };

    const switchFile = async (filename: string) => {
        if (filename === activeFileRef.current) return;

        // 1. 切换前：保存当前旧文件的代码和样例
        if (activeFileRef.current) {
        try {
            // 保存代码
            await invoke("save_workspace_file", { filename: activeFileRef.current, code: codeRef.current });
            // 保存样例 (确保运行后的最新结果被固化到硬盘)
            await invoke("save_test_cases", { filename: activeFileRef.current, cases: testCasesRef.current }); 
        } catch (e) {
            console.error("保存旧文件数据失败喵:", e);
        }
        }

        // 2. 切换后：加载新文件的代码
        const content = await invoke<string>("load_workspace_file", { filename });
        setCode(content);

        // 3. 核心：加载新文件的样例数据
        try {
        // 只传 filename，后端会通过 stem 自动定位 .cases.json
        const cases = await invoke<TestCase[]>("load_test_cases", { filename });
        setTestCases(cases);
        } catch (e) {
        console.error("加载新样例失败喵:", e);
        // 如果读取失败，给一个初始空样例防止界面留空
        setTestCases([{ input: "", output: "", actual:"", status:"pending" }]);
        }

        // 🌟 核心：加载新题目的元数据 (question.json)
        try {
        // 注意：这里的参数名要和你后端 Rust 写的参数名对应（之前我们写的是 stem: String）
        const meta = await invoke<QuestionMeta>("get_problem_meta", { stem: filename });
        setProblemMeta(meta);
        } catch (e) {
        console.warn("这道题没有元数据喵，可能是纯手动创建的空文件:", e);
        setProblemMeta(null); // 如果没有，就清空面板
        }

        try {
        // 呼叫后端读取刚才你写的那个 question.html
        const html = await invoke<string>("load_question_markdown", { filename });
        setproblemMarkdown(html); 
        } catch (e) {
        console.error("加载题面失败:", e);
        setproblemMarkdown("");
        }

        // 4. 更新 UI 状态
        setActiveFile(filename);
        localStorage.setItem("icnana_active_file", filename);
    };

    // ── 运行全部样例（由右侧「测试用例」面板的按钮触发）─────────
    const runAll = async (settings: CompileSettings) => {
        if (!activeFileRef.current) return;

        const loading = testCasesRef.current.map(c => ({
            ...c,
            actual: "正在运行喵...",
            status: "pending" as const,
        }));
        setTestCases(loading);

        try {
            const res = await invoke<TestCase[]>("judge_all", {
                filename: activeFileRef.current,
                code: codeRef.current,
                cases: loading,
                settings,
            });
            setTestCases(res);
            await invoke("save_test_cases", { filename: activeFileRef.current, cases: res });
        } catch (e) {
            console.error("运行或保存失败了喵:", e);
        }
    };

    // ── 集合（收藏夹就是 id 为 favorites 的那个内置集合）───────
    const refreshCollections = async () => {
        try {
            setCollections(await invoke<Collection[]>("list_collections"));
        } catch (e) {
            console.error("刷新集合失败喵:", e);
        }
    };

    // 把某个题目加入 / 移出集合，乐观更新
    const toggleInCollection = async (id: string, stem: string, member: boolean) => {
        setCollections(prev => prev.map(c => {
            if (c.id !== id) return c;
            const items = member
                ? (c.items.includes(stem) ? c.items : [...c.items, stem].sort())
                : c.items.filter(s => s !== stem);
            return { ...c, items };
        }));

        // 收藏集合同时要反映到文件列表的 favorite 字段（决定星标和排序）
        if (id === FAVORITES_ID) {
            setFiles(prev => prev.map(f => (f.stem === stem ? { ...f, favorite: member } : f)));
        }

        try {
            await invoke("toggle_in_collection", { id, stem, member });
        } catch (e) {
            console.error("切换集合成员失败喵:", e);
            await refreshCollections();
        }
    };

    const toggleFavorite = async (stem: string, favorite: boolean) => {
        await toggleInCollection(FAVORITES_ID, stem, favorite);
    };

    const createCollection = async (name: string): Promise<Collection | null> => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        try {
            const created = await invoke<Collection>("create_collection", { name: trimmed });
            setCollections(prev => [...prev, created]);
            return created;
        } catch (e) {
            alert(e);
            return null;
        }
    };

    const deleteCollection = async (id: string) => {
        if (!confirm("删除这个集合？（题目本身不会被删除）")) return;
        try {
            await invoke("delete_collection", { id });
            setCollections(prev => prev.filter(c => c.id !== id));
        } catch (e) {
            alert(e);
        }
    };

    return {
        //数据
        files, setFiles,
        activeFile, setActiveFile,
        code, setCode,
        testCases, setTestCases,
        problemMeta, setProblemMeta,
        problemMarkdown, setproblemMarkdown, 
        collections, setCollections,
        //方法
        runAll,
        createFile,
        deleteFile,
        renameFile,
        switchFile,
        toggleFavorite,
        toggleInCollection,
        createCollection,
        deleteCollection,
        refreshCollections
    }
}