import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * 题面渲染页。
 *
 * 单独一个文件是为了让 react-markdown / remark-math / katex 这些
 * 大依赖能被 Vite 拆成独立 chunk——不看题面的用户就不用下载它们。
 */
interface ProblemTabProps {
  markdown: string;
}

export default function ProblemTab({ markdown }: ProblemTabProps) {
  // 公式渲染（KaTeX auto-render，兜住 rehype-katex 没覆盖到的写法）
  useEffect(() => {
    if (!markdown) return;
    // @ts-ignore
    if (window.renderMathInElement) {
      // @ts-ignore
      window.renderMathInElement(document.querySelector(".problem-content-root"), {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
      });
    }
  }, [markdown]);

  return (
    <div
      className="problem-content-root"
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "24px 40px",
        lineHeight: 1.7,
        color: "#ddd",
        fontSize: "15px",
      }}
    >
      {markdown ? (
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            a: ({ node, ...props }) => (
              <a target="_blank" rel="noreferrer" style={{ color: "#89DDFF" }} {...props} />
            ),
            code: ({ node, inline, className, children, ...props }: any) =>
              inline ? (
                <code
                  style={{ background: "rgba(255,255,255,0.1)", padding: "2px 4px", borderRadius: "3px" }}
                  {...props}
                >
                  {children}
                </code>
              ) : (
                <code {...props}>{children}</code>
              ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      ) : (
        <div style={{ textAlign: "center", marginTop: "100px", color: "#555" }}>暂无题面数据</div>
      )}
    </div>
  );
}
