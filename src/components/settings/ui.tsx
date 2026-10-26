import { CSSProperties, useEffect, useRef, useState } from "react";

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

/**
 * 自绘下拉框。
 *
 * 不用原生 <select>：Windows 的 WebView2 里弹出列表用的是系统配色，
 * 深色主题下会出现「白底白字」，点开什么都看不见。
 *
 * 列表用 position: fixed 按按钮的位置定位，而不是 absolute：
 * 设置面板本身是 overflow: auto 的滚动容器，absolute 的列表在靠近底部时
 * 会被裁掉、还会把面板撑出滚动条。
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  width,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  width?: number | string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const openList = () => {
    const el = btnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      // 往下放不下就往上翻
      const spaceBelow = window.innerHeight - r.bottom;
      const listHeight = Math.min(220, options.length * 34 + 8);
      const top = spaceBelow < listHeight ? Math.max(8, r.top - listHeight - 4) : r.bottom + 4;
      setRect({ top, left: r.left, width: r.width });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    // 面板滚动 / 窗口缩放后坐标就失效了，直接关掉最省事
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);

    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        style={{
          ...fieldStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current?.label ?? String(value)}
        </span>
        <span style={{ fontSize: 10, opacity: 0.6, flexShrink: 0 }}>▼</span>
      </button>

      {open && rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            zIndex: 9999,
            background: "rgba(22, 22, 30, 0.98)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 6,
            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            padding: 4,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 4,
                border: "none",
                background: "transparent",
                color: o.value === value ? "#fff" : "rgba(255,255,255,0.82)",
                fontWeight: o.value === value ? 700 : 400,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
