import { Appearance, ThemePreset } from "../../config/types";
import { BUILTIN_PRESETS, GLASS_PRESETS } from "../../config/constants";
import { ColorSwatches, SliderRow, Switch, groupTitleStyle, hintStyle, labelStyle } from "./ui";

/**
 * 外观设置面板。
 *
 * 结构参考 DSH 的壁纸插件：
 *   玻璃 UI  —— 颜色 / 透明度 / 雾化 / 保真度
 *   背景     —— 图片 / 透明度 / 压暗 / 代码区
 *   圆角     —— 统一值 + 四角单独 + 一键全直/全圆
 */

interface AppearanceSettingsProps {
  value: Appearance;
  onChange: (v: Appearance) => void;
  error?: string;
  presets: ThemePreset[];
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  onApplyPreset: (preset: ThemePreset) => void;
}

const CORNER_NAMES = ["左上角", "右上角", "右下角", "左下角"];

export default function AppearanceSettings({
  value,
  onChange,
  error,
  presets,
  onSavePreset,
  onDeletePreset,
  onApplyPreset,
}: AppearanceSettingsProps) {
  const patch = (p: Partial<Appearance>) => onChange({ ...value, ...p });

  const slider = (
    label: string,
    current: number,
    min: number,
    max: number,
    step: number,
    suffix: string,
    toValue: (v: number) => Partial<Appearance>,
  ) => (
    <SliderRow
      label={label}
      value={current}
      min={min}
      max={max}
      step={step}
      suffix={suffix}
      onChange={(v) => patch(toValue(v))}
    />
  );

  const radiusButtons = (side: "left" | "right") => {
    const key = side === "left" ? "leftSquare" : "rightSquare";
    const square = value[key];
    const setSquare = (next: boolean[]) => patch({ [key]: next } as Partial<Appearance>);

    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={labelStyle}>{side === "left" ? "左侧栏" : "右侧栏"}·统一圆角</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { label: "跟随原生", v: 0 },
              { label: "小 6px", v: 6 },
              { label: "中 12px", v: 12 },
              { label: "大 20px", v: 20 },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => patch({ radius: opt.v })}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: value.radius === opt.v ? "rgba(247,143,179,0.35)" : "transparent",
                  color: value.radius === opt.v ? "#fff" : "rgba(255,255,255,0.65)",
                  fontWeight: value.radius === opt.v ? 700 : 500,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={labelStyle}>{side === "left" ? "左侧栏" : "右侧栏"}·四角单独</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {CORNER_NAMES.map((name, i) => {
              const isSquare = square[i];
              return (
                <button
                  key={name}
                  onClick={() => setSquare(square.map((s, idx) => (idx === i ? !s : s)))}
                  title={isSquare ? "当前是直角，点一下变圆角" : "当前是圆角，点一下变直角"}
                  style={{
                    padding: "4px 9px",
                    fontSize: 11,
                    cursor: "pointer",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: isSquare ? "rgba(255,255,255,0.20)" : "transparent",
                    color: isSquare ? "#fff" : "rgba(255,255,255,0.65)",
                    fontWeight: isSquare ? 700 : 500,
                  }}
                >
                  {name} {isSquare ? "直角" : "圆角"}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, paddingLeft: 140 }}>
          <button
            onClick={() => setSquare([true, true, true, true])}
            style={{ padding: "3px 10px", fontSize: 11, borderRadius: 6, cursor: "pointer", border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)" }}
          >
            四角全直角
          </button>
          <button
            onClick={() => setSquare([false, false, false, false])}
            style={{ padding: "3px 10px", fontSize: 11, borderRadius: 6, cursor: "pointer", border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)" }}
          >
            四角全圆角
          </button>
        </div>
      </>
    );
  };

  return (
    <div>
      {/* ── 预设 ── */}
      <div style={groupTitleStyle}>预设</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {BUILTIN_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onApplyPreset(p)}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              cursor: "pointer",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "transparent",
              color: "rgba(255,255,255,0.78)",
            }}
          >
            {p.name}
          </button>
        ))}

        {presets.map((p) => (
          <span
            key={p.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 6px 5px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.08)",
            }}
          >
            <button
              onClick={() => onApplyPreset(p)}
              style={{ background: "transparent", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", padding: 0 }}
            >
              {p.name}
            </button>
            <button
              onClick={() => onDeletePreset(p.id)}
              title="删除这个预设"
              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 12, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}

        <button
          onClick={() => {
            const name = window.prompt("给这套外观起个名字", "我的预设");
            if (name) onSavePreset(name);
          }}
          style={{
            padding: "5px 12px",
            fontSize: 12,
            cursor: "pointer",
            borderRadius: 6,
            border: "1px dashed rgba(255,255,255,0.25)",
            background: "transparent",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          + 保存当前
        </button>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginBottom: 4 }}>
        预设只存在本地，不会进仓库；「默认」是纯黑无背景。
      </div>

      {/* ── 玻璃 UI ── */}
      <div style={groupTitleStyle}>玻璃 UI</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={labelStyle}>{value.glassGradient ? "渐变起点" : "玻璃颜色"}</span>
        <ColorSwatches value={value.glassColor} onChange={(c) => patch({ glassColor: c })} presets={GLASS_PRESETS} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={labelStyle}>启用玻璃渐变</span>
        <Switch checked={value.glassGradient} onChange={(v) => patch({ glassGradient: v })} />
        <span style={hintStyle}>开启后玻璃从起点色渐变到终点色</span>
      </div>

      {value.glassGradient && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={labelStyle}>渐变终点</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {GLASS_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => patch({ glassColor2: c })}
                title={c}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  cursor: "pointer",
                  background: c,
                  border:
                    value.glassColor2.toLowerCase() === c.toLowerCase()
                      ? "2px solid #fff"
                      : "1px solid rgba(255,255,255,0.25)",
                }}
              />
            ))}
            <input
              type="color"
              value={value.glassColor2}
              onChange={(e) => patch({ glassColor2: e.target.value })}
              title="自定义终点色"
              style={{ width: 32, height: 24, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: 1, cursor: "pointer" }}
            />
            <span
              style={{
                width: 78,
                height: 20,
                borderRadius: 999,
                marginLeft: 4,
                background: `linear-gradient(135deg, ${value.glassColor}, ${value.glassColor2})`,
                border: "1px solid rgba(255,255,255,0.2)",
              }}
              title="预览"
            />
          </div>
        </div>
      )}

      {slider("玻璃透明度", Math.round(value.glassAlpha * 100), 0, 95, 1, "%", (v) => ({ glassAlpha: v / 100 }))}
      {slider("雾化", value.glassBlur, 0, 40, 1, "px", (v) => ({ glassBlur: v }))}
      {slider("玻璃保真度", Math.round(value.glassFidelity * 100), 0, 100, 1, "%", (v) => ({ glassFidelity: v / 100 }))}

      {/* ── 标题栏 ── */}
      <div style={groupTitleStyle}>标题栏</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={labelStyle}>标题栏颜色</span>
        <ColorSwatches value={value.titlebarColor} onChange={(c) => patch({ titlebarColor: c })} presets={GLASS_PRESETS} />
      </div>

      {slider("标题栏不透明度", Math.round(value.titlebarAlpha * 100), 0, 100, 1, "%", (v) => ({ titlebarAlpha: v / 100 }))}
      {slider("标题栏雾化", value.titlebarBlur, 0, 40, 1, "px", (v) => ({ titlebarBlur: v }))}

      {/* ── 背景 ── */}
      <div style={groupTitleStyle}>背景</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={labelStyle}>背景图片</span>
        <input
          value={value.bgImage}
          onChange={(e) => patch({ bgImage: e.target.value })}
          placeholder="http 链接 / 本地绝对路径 / file:// ，留空则用渐变"
          spellCheck={false}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 6,
            padding: "6px 9px",
            color: "#fff",
            fontSize: 12,
            outline: "none",
          }}
        />
      </div>
      {error && (
        <div style={{ fontSize: 11, color: "#ff9b93", marginLeft: 142, marginBottom: 8, wordBreak: "break-all" }}>
          没加载上：{error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={labelStyle}>无壁纸时用渐变底</span>
        <Switch checked={value.baseGradient} onChange={(v) => patch({ baseGradient: v })} />
        <span style={hintStyle}>关闭 = 纯黑（默认）；开启 = 蓝粉渐变</span>
      </div>

      {slider("背景透明度", Math.round(value.bgOpacity * 100), 0, 100, 1, "%", (v) => ({ bgOpacity: v / 100 }))}
      {slider("整体压暗", Math.round(value.scrim * 100), 0, 80, 1, "%", (v) => ({ scrim: v / 100 }))}

      {/* ── 圆角 ── */}
      <div style={groupTitleStyle}>侧边栏圆角</div>
      {radiusButtons("left")}
      {radiusButtons("right")}

      {/* ── 杂项 ── */}
      <div style={{ ...hintStyle, marginTop: 8 }}>圆角统一值作用于所有非直角的角。</div>

    </div>
  );
}
