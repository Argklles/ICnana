/**
 * 「接收到新题目」的确认弹窗。
 *
 * 从 App.tsx 里抽出来的：它只是三选一的确认框，
 * 和主布局没关系，混在一起会挡住 App 的结构。
 */
interface ProblemArrivalModalProps {
  stem: string;
  onIgnore: (stem: string) => void;
  onMerge: (stem: string) => void;
  onOpenNew: (stem: string) => void;
}

export default function ProblemArrivalModal({
  stem,
  onIgnore,
  onMerge,
  onOpenNew,
}: ProblemArrivalModalProps) {
  const btn: React.CSSProperties = {
    borderRadius: 6,
    cursor: "pointer",
    padding: "8px 16px",
    fontSize: 13,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "rgba(18, 18, 26, 0.96)",
          border: "1px solid rgba(255,255,255,0.14)",
          padding: 24,
          borderRadius: 12,
          width: 420,
          color: "#fff",
          boxShadow: "0 18px 48px rgba(0,0,0,0.5)",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 17 }}>接收到新题目</h3>
        <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: 20, wordBreak: "break-all", fontSize: 13 }}>
          {stem}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => onIgnore(stem)}
            style={{ ...btn, background: "transparent", color: "rgba(255,255,255,0.6)", border: "none" }}
          >
            忽略
          </button>
          <button
            onClick={() => onMerge(stem)}
            style={{
              ...btn,
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            导入当前页
          </button>
          <button
            onClick={() => onOpenNew(stem)}
            style={{
              ...btn,
              background: "linear-gradient(135deg, var(--accent-blue), var(--accent-pink))",
              color: "#0b0b0f",
              border: "none",
              fontWeight: 700,
            }}
          >
            新开代码页
          </button>
        </div>
      </div>
    </div>
  );
}
