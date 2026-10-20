import { CSSProperties } from "react";

/**
 * 设置面板里公用的样式和小控件。
 *
 * 之前 SettingsPanel 和 AppearanceSettings 各写了一份 labelStyle / 滑块 / 开关，
 * 值还不一样；统一收到这里，改一次全局生效。
 */

export const labelStyle: CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.72)",
  display: "block",
  marginBottom: 5,
};

export const fieldStyle: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  color: "var(--text)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 6,
  padding: "7px 9px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

export const hintStyle: CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.45)",
  lineHeight: 1.6,
  marginTop: 8,
};

/** 分组标题（外观页用的那种带下划线的蓝色小标题） */
export const groupTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#a9c7ff",
  letterSpacing: 1.2,
  paddingBottom: 6,
  margin: "18px 0 10px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
};

/** 原生 select：继承 fieldStyle，另外让下拉列表走深色（WebKit 下才好看） */
export const selectStyle: CSSProperties = {
  ...fieldStyle,
  colorScheme: "dark",
  cursor: "pointer",
};

/** 一行里并排放几个控件 */
export const rowStyle: CSSProperties = { display: "flex", gap: 12, marginBottom: 12 };

/** 滑块：底轨 + 填充层 + 透明 input，数值由 width 决定，不依赖原生渲染 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  width,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  width?: number | string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="range-wrap" style={{ width, flex: width ? undefined : 1 }}>
      <div className="range-track" />
      <div className="range-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** 带标题和数值的滑块行 */
export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ ...labelStyle, marginBottom: 0, width: 132, flexShrink: 0 }}>{label}</span>
      <Slider value={value} min={min} max={max} step={step} onChange={onChange} />
      <span
        style={{
          width: 46,
          flexShrink: 0,
          textAlign: "right",
          fontSize: 11,
          color: "rgba(255,255,255,0.62)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {suffix}
      </span>
    </div>
  );
}

/** 胶囊开关 */
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{
        width: 38,
        height: 20,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        position: "relative",
        padding: 0,
        background: checked
          ? "linear-gradient(135deg, var(--accent-blue), var(--accent-pink))"
          : "rgba(255, 255, 255, 0.18)",
        transition: "background 0.15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

/** 一排圆形色板 + 自定义取色器 */
export function ColorSwatches({
  value,
  onChange,
  presets,
}: {
  value: string;
  onChange: (color: string) => void;
  presets: string[];
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {presets.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          title={c}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            cursor: "pointer",
            background: c,
            border:
              value.toLowerCase() === c.toLowerCase()
                ? "2px solid #fff"
                : "1px solid rgba(255,255,255,0.25)",
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title="自定义颜色"
        style={{
          width: 32,
          height: 24,
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 6,
          padding: 1,
          cursor: "pointer",
        }}
      />
    </div>
  );
}
