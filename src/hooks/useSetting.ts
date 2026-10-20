import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_COMPILE_SETTINGS, DEFAULT_TAB_SHORTCUT, DEFAULT_TEMPLATE, TAB_SHORTCUTS } from "../config/constants"
import { CompileSettings } from "../config/types"
import type { TabShortcut } from "../config/constants"

// 把模板同步给后端：拉取题面时后端要用它拼「题目信息 + 代码模板」写入 main.cpp
function syncTemplateToBackend(template: string) {
    if (!template.trim()) return;
    invoke("save_code_template", { template }).catch((e) => {
        console.warn("同步代码模板到后端失败:", e);
    });
}

const COMPILE_SETTINGS_KEY = "icnana_compile_settings";

// 旧版默认模板（缺 using namespace std;，写 string 会直接 CE）。
// 存档里如果就是这一份，说明用户没改过，直接升级成新模板，不算自定义。
const LEGACY_DEFAULT_TEMPLATE = `// 开始编写你的代码喵！！
#include <bits/stdc++.h>

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);

  return 0;
}`;

// 读回上次保存的编译设置，缺字段用默认值补齐（兼容旧版本）。
function loadCompileSettings(): CompileSettings {
    try {
        const raw = localStorage.getItem(COMPILE_SETTINGS_KEY);
        if (!raw) return DEFAULT_COMPILE_SETTINGS;
        return { ...DEFAULT_COMPILE_SETTINGS, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_COMPILE_SETTINGS;
    }
}

export function useSetting() {

    const [showSettings, setShowSettings] = useState(false);
    const [codeTemplate, setCodeTemplate] = useState(DEFAULT_TEMPLATE);
    const [indentSize, setIndentSize] = useState<2 | 4>(2);
    const [compileSettings, setCompileSettings] = useState<CompileSettings>(DEFAULT_COMPILE_SETTINGS);
    const [tabShortcut, setTabShortcut] = useState<TabShortcut>(DEFAULT_TAB_SHORTCUT);
    const [editingShortcut, setEditingShortcut] = useState<TabShortcut>(DEFAULT_TAB_SHORTCUT);

    // 编辑中的副本：点“保存”才写回，点“取消”直接丢弃
    const [editingTemplate, setEditingTemplate] = useState(DEFAULT_TEMPLATE);
    const [editingIndent, setEditingIndent] = useState<2 | 4>(2);
    const [editingCompile, setEditingCompile] = useState<CompileSettings>(DEFAULT_COMPILE_SETTINGS);

    useEffect(() => {
        // 加载设置
        const savedTemplate = localStorage.getItem("icnana_code_template");
        const savedIndent = localStorage.getItem("icnana_indent_size");

        let effectiveTemplate = DEFAULT_TEMPLATE;
        if (savedTemplate === LEGACY_DEFAULT_TEMPLATE) {
            // 用户没改过，只是存档里躺着旧默认值 → 丢掉，跟着新默认走
            localStorage.removeItem("icnana_code_template");
        } else if (savedTemplate) {
            effectiveTemplate = savedTemplate;
            setCodeTemplate(savedTemplate);
            setEditingTemplate(savedTemplate);
        }
        // 启动即同步一次，保证「拉取题面」用的是当前模板
        syncTemplateToBackend(effectiveTemplate);

        if (savedIndent) {
            const v = parseInt(savedIndent) as 2 | 4;
            setIndentSize(v); setEditingIndent(v);
        }

        const savedShortcut = localStorage.getItem("icnana_tab_shortcut");
        if (savedShortcut && TAB_SHORTCUTS.some(s => s.key === savedShortcut)) {
            setTabShortcut(savedShortcut as TabShortcut);
            setEditingShortcut(savedShortcut as TabShortcut);
        }

        const loadedCompile = loadCompileSettings();
        setCompileSettings(loadedCompile);
        setEditingCompile(loadedCompile);
    }, []);

    // ── 保存设置 ───────────────────────────────────────────
    const saveSettings = () => {
        setCodeTemplate(editingTemplate);
        setIndentSize(editingIndent);
        setCompileSettings(editingCompile);
        setTabShortcut(editingShortcut);
        localStorage.setItem("icnana_tab_shortcut", editingShortcut);

        localStorage.setItem("icnana_code_template", editingTemplate);
        localStorage.setItem("icnana_indent_size", String(editingIndent));
        localStorage.setItem(COMPILE_SETTINGS_KEY, JSON.stringify(editingCompile));

        syncTemplateToBackend(editingTemplate);
        setShowSettings(false);
    };

    const resetSettings = () => {
        setEditingTemplate(DEFAULT_TEMPLATE);
        setEditingIndent(2);
        setEditingCompile(DEFAULT_COMPILE_SETTINGS);
        setEditingShortcut(DEFAULT_TAB_SHORTCUT);
    };

    // 每次打开面板都从已保存的值同步一份草稿，避免上次“取消”的编辑残留
    const openSettings = () => {
        setEditingTemplate(codeTemplate);
        setEditingIndent(indentSize);
        setEditingCompile(compileSettings);
        setEditingShortcut(tabShortcut);
        setShowSettings(true);
    };

    return {
        //数据
        showSettings, setShowSettings,
        codeTemplate, setCodeTemplate,
        indentSize, setIndentSize,
        compileSettings, setCompileSettings,
        tabShortcut, setTabShortcut,
        editingShortcut, setEditingShortcut,
        editingTemplate, setEditingTemplate,
        editingIndent, setEditingIndent,
        editingCompile, setEditingCompile,
        //方法
        openSettings,
        saveSettings,
        resetSettings,
    }
}
