import { useState, useEffect } from "react";
import { DEFAULT_TEMPLATE } from "../config/constants"

export function useSetting() {

    const [showSettings, setShowSettings] = useState(false);
    const [codeTemplate, setCodeTemplate] = useState(DEFAULT_TEMPLATE);
    const [indentSize, setIndentSize] = useState<2 | 4>(2);
    const [editingTemplate, setEditingTemplate] = useState(DEFAULT_TEMPLATE);
    const [editingIndent, setEditingIndent] = useState<2 | 4>(2);

    useEffect(() => {
        
        
        // 加载设置
        const savedTemplate = localStorage.getItem("icnana_code_template"   );
        const savedIndent = localStorage.getItem("icnana_indent_size");
        if (savedTemplate) { setCodeTemplate(savedTemplate); setEditingTemplate(savedTemplate); }
        if (savedIndent) {
        const v = parseInt(savedIndent) as 2 | 4;
        setIndentSize(v); setEditingIndent(v);
        }
    }, []);

    // ── 保存设置 ───────────────────────────────────────────
    const saveSettings = () => {
        setCodeTemplate(editingTemplate);
        setIndentSize(editingIndent);
        localStorage.setItem("icnana_code_template", editingTemplate);
        localStorage.setItem("icnana_indent_size", String(editingIndent));
        setShowSettings(false);
    };
    const resetSettings = () => {
        setEditingTemplate(DEFAULT_TEMPLATE);
        setEditingIndent(2);
    };

    return {
        //数据
        showSettings, setShowSettings,
        codeTemplate, setCodeTemplate,
        indentSize, setIndentSize,
        editingTemplate, setEditingTemplate,
        editingIndent, setEditingIndent,
        //方法
        saveSettings,
        resetSettings,
    }
}