import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CodeTheme, DEFAULT_APPEARANCE, DEFAULT_CODE_SHADOW, DEFAULT_CODE_THEME, DEFAULT_COMPILE_SETTINGS, DEFAULT_TAB_SHORTCUT, DEFAULT_TEMPLATE, DEFAULT_TERMINAL_COLORS, TAB_SHORTCUTS, TerminalColors } from "../config/constants"
import { Appearance, CompileSettings, ThemePreset } from "../config/types"
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
// 老版本默认是 c++14，存档里如果还是这个值说明用户没动过，跟着新默认（c++17）走。
function loadCompileSettings(): CompileSettings {
    try {
        const raw = localStorage.getItem(COMPILE_SETTINGS_KEY);
        if (!raw) return DEFAULT_COMPILE_SETTINGS;

        const merged = { ...DEFAULT_COMPILE_SETTINGS, ...JSON.parse(raw) };
        if (merged.std === "c++14") merged.std = DEFAULT_COMPILE_SETTINGS.std;
        return merged;
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
    const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
    const [editingAppearance, setEditingAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
    const [appearanceError, setAppearanceError] = useState<string>("");
    const [codeTheme, setCodeTheme] = useState<CodeTheme>(DEFAULT_CODE_THEME);
    const [codeShadow, setCodeShadow] = useState<number>(DEFAULT_CODE_SHADOW);
    const [tokenColors, setTokenColors] = useState<Record<string, string>>({});
    const [presets, setPresets] = useState<ThemePreset[]>([]);
    const [terminalColors, setTerminalColors] = useState<TerminalColors>(DEFAULT_TERMINAL_COLORS);
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

        const savedAppearance = localStorage.getItem("icnana_appearance");
        if (savedAppearance) {
            try {
                const parsed = { ...DEFAULT_APPEARANCE, ...JSON.parse(savedAppearance) };
                setAppearance(parsed);
                setEditingAppearance(parsed);
            } catch { /* 坏数据就用默认 */ }
        }


        const savedTheme = localStorage.getItem("icnana_code_theme") as CodeTheme | null;
        if (savedTheme === "contrast" || savedTheme === "soft" || savedTheme === "mono") setCodeTheme(savedTheme);

        const savedShadow = localStorage.getItem("icnana_code_shadow");
        if (savedShadow !== null) setCodeShadow(Number(savedShadow));

        const savedPresets = localStorage.getItem("icnana_appearance_presets");
        if (savedPresets) {
            try { setPresets(JSON.parse(savedPresets)); } catch { /* 坏数据忽略 */ }
        }

        const savedTerminal = localStorage.getItem("icnana_terminal_colors");
        if (savedTerminal) {
            try { setTerminalColors({ ...DEFAULT_TERMINAL_COLORS, ...JSON.parse(savedTerminal) }); } catch { /* 坏数据忽略 */ }
        }

        const savedTokens = localStorage.getItem("icnana_code_tokens");
        if (savedTokens) {
            try { setTokenColors(JSON.parse(savedTokens)); } catch { /* 坏数据忽略 */ }
        }

        const loadedCompile = loadCompileSettings();
        setCompileSettings(loadedCompile);
        setEditingCompile(loadedCompile);
    }, []);

    // 外观变化时同步到 :root，所有面板都读这些变量。
    // 设置面板开着时用草稿值做实时预览，关掉就回到已保存的值。
    useEffect(() => {
        const a = showSettings ? editingAppearance : appearance;
        const style = document.documentElement.style;

        // 玻璃颜色：hex → "r g b"（rgb() 里带空格分隔的写法要用这个形式）
        const toRgb = (hexColor: string) => {
            const hex = hexColor.replace("#", "");
            const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
            return [
                parseInt(full.slice(0, 2), 16) || 0,
                parseInt(full.slice(2, 4), 16) || 0,
                parseInt(full.slice(4, 6), 16) || 0,
            ].join(" ");
        };

        style.setProperty("--glass-rgb", toRgb(a.glassColor));
        style.setProperty(
            "--glass-gradient",
            a.glassGradient
                ? `linear-gradient(135deg, rgb(${toRgb(a.glassColor)} / ${a.glassAlpha}), rgb(${toRgb(a.glassColor2)} / ${a.glassAlpha}))`
                : "none",
        );
        style.setProperty("--glass-alpha", String(a.glassAlpha));
        style.setProperty("--glass-blur", String(a.glassBlur));
        style.setProperty("--glass-saturate", String(1 + a.glassFidelity * 0.8));

        style.setProperty("--scrim-alpha", String(a.scrim));
        style.setProperty("--titlebar-alpha", String(a.titlebarAlpha));
        style.setProperty("--titlebar-rgb", toRgb(a.titlebarColor));
        style.setProperty("--titlebar-blur", String(a.titlebarBlur));
        style.setProperty("--code-shadow", String(codeShadow));
        style.setProperty("--bg-image-opacity", String(a.bgOpacity));

        style.setProperty("--accent-blue", a.blue);
        style.setProperty("--accent-pink", a.pink);

        // 四角独立圆角：直角给 0，否则用统一值
        const radiusOf = (square: boolean[]) => {
            const r = `${a.radius}px`;
            const [tl, tr, br, bl] = square.length === 4 ? square : [false, false, false, false];
            return `${tl ? 0 : r} ${tr ? 0 : r} ${br ? 0 : r} ${bl ? 0 : r}`;
        };
        style.setProperty("--panel-left-radius", radiusOf(a.leftSquare));
        style.setProperty("--panel-right-radius", radiusOf(a.rightSquare));
    }, [
        showSettings, appearance, editingAppearance, codeShadow,
    ]);

    // ── 外观预设 ───────────────────────────────────────────
    /** 把当前设置存成一个预设（只存本地，不进仓库） */
    const savePreset = (name: string) => {
        const preset: ThemePreset = {
            id: `p-${Date.now()}`,
            name: name.trim() || "未命名预设",
            appearance: { ...(showSettings ? editingAppearance : appearance) },
        };
        const next = [...presets, preset];
        setPresets(next);
        localStorage.setItem("icnana_appearance_presets", JSON.stringify(next));
    };

    const deletePreset = (id: string) => {
        const next = presets.filter((p) => p.id !== id);
        setPresets(next);
        localStorage.setItem("icnana_appearance_presets", JSON.stringify(next));
    };

    /** 套用预设（写进草稿，点保存才落盘） */
    const applyPreset = (preset: ThemePreset) => {
        const merged = { ...DEFAULT_APPEARANCE, ...preset.appearance };
        setEditingAppearance(merged);
        if (!showSettings) setAppearance(merged);
    };

    // 代码配色/描边：改了就生效，不用等保存
    const updateCodeTheme = (v: CodeTheme) => {
        setCodeTheme(v);
        localStorage.setItem("icnana_code_theme", v);
    };
    const updateCodeShadow = (v: number) => {
        setCodeShadow(v);
        localStorage.setItem("icnana_code_shadow", String(v));
    };

    const updateTerminalColor = (key: keyof TerminalColors, color: string) => {
        const next = { ...terminalColors, [key]: color };
        setTerminalColors(next);
        localStorage.setItem("icnana_terminal_colors", JSON.stringify(next));
    };

    /** 改某一类元素的颜色；传空字符串表示恢复预设 */
    const updateTokenColor = (token: string, color: string) => {
        const next = { ...tokenColors };
        if (!color) delete next[token];
        else next[token] = color;
        setTokenColors(next);
        localStorage.setItem("icnana_code_tokens", JSON.stringify(next));
    };

    /** 由文件扩展名猜 MIME（供 Blob 使用，与后端 mime_of 保持一致） */
function mimeFromPath(p: string): string {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    switch (ext) {
        case "png": return "image/png";
        case "jpg": case "jpeg": return "image/jpeg";
        case "webp": return "image/webp";
        case "gif": return "image/gif";
        case "bmp": return "image/bmp";
        case "svg": return "image/svg+xml";
        default: return "application/octet-stream";
    }
}

// 上一次的 objectURL，换图时要 revoke，避免内存泄漏
let currentBgObjectUrl: string | null = null;

// 背景图单独处理：http 直接用，本地文件交给 Rust 读成字节，拼 Blob URL
    useEffect(() => {
        let alive = true;
        const raw = appearance.bgImage.trim();

        // 有壁纸、或用户没开「渐变底」时，都保持纯黑底
        const useGradient = !raw && (showSettings ? editingAppearance : appearance).baseGradient;
        if (useGradient) {
            document.documentElement.style.removeProperty("--base-gradient");
        } else {
            document.documentElement.style.setProperty("--base-gradient", "none");
        }
        const apply = (url: string) => {
            if (!alive) return;
            document.documentElement.style.setProperty("--app-bg-image", url ? `url("${url}")` : "none");
        };

        setAppearanceError("");

        if (!raw) {
            apply("");
        } else if (/^https?:\/\//i.test(raw)) {
            apply(raw);
        } else {
            invoke<ArrayBuffer>("read_image_bytes", { path: raw })
                .then((buf) => {
                    const blob = new Blob([buf], { type: mimeFromPath(raw) });
                    const url = URL.createObjectURL(blob);
                    if (currentBgObjectUrl) URL.revokeObjectURL(currentBgObjectUrl);
                    currentBgObjectUrl = url;
                    apply(url);
                    setAppearanceError("");
                })
                .catch((e) => {
                    console.warn("背景图加载失败:", e);
                    apply("");
                    if (alive) setAppearanceError(String(e));
                });
        }

        return () => { alive = false; };
    }, [appearance.bgImage]);

    // ── 保存设置 ───────────────────────────────────────────
    const saveSettings = () => {
        setCodeTemplate(editingTemplate);
        setIndentSize(editingIndent);
        setCompileSettings(editingCompile);
        setTabShortcut(editingShortcut);
        localStorage.setItem("icnana_tab_shortcut", editingShortcut);

        setAppearance(editingAppearance);
        localStorage.setItem("icnana_appearance", JSON.stringify(editingAppearance));

        localStorage.setItem("icnana_code_theme", codeTheme);
        localStorage.setItem("icnana_code_shadow", String(codeShadow));
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
        setEditingAppearance(DEFAULT_APPEARANCE);
    };

    // 每次打开面板都从已保存的值同步一份草稿，避免上次“取消”的编辑残留
    const openSettings = () => {
        setEditingTemplate(codeTemplate);
        setEditingIndent(indentSize);
        setEditingCompile(compileSettings);
        setEditingShortcut(tabShortcut);
        setEditingAppearance(appearance);
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
        appearance, setAppearance,
        editingAppearance, setEditingAppearance,
        appearanceError,
        codeTheme, updateCodeTheme,
        codeShadow, updateCodeShadow,
        tokenColors, updateTokenColor,
        presets, savePreset, deletePreset, applyPreset,
        terminalColors, updateTerminalColor,
        editingTemplate, setEditingTemplate,
        editingIndent, setEditingIndent,
        editingCompile, setEditingCompile,
        //方法
        openSettings,
        saveSettings,
        resetSettings,
    }
}
