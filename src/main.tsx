import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loader } from "@monaco-editor/react";

// Monaco 走本地资源而不是 CDN（断网也能开编辑器）。
// 对应 scripts/prepare-monaco.mjs 拷到 public/monaco/vs 的那份。
loader.config({ paths: { vs: "/monaco/vs" } });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
