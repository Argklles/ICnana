use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, AppHandle, Emitter};
use std::fs::File;
use std::io::Write;
use serde_json::Value;
use crate::utils::ic_fs;

pub fn spawn_atcoder_fetcher(app: AppHandle, url: String, stem: String) {
    if let Some(_) = app.get_webview_window("atcoder_fetcher") { return; }

    let app_handle = app.clone();
    let stem_save = stem.clone();

    let _webview = WebviewWindowBuilder::new(
        &app,
        "atcoder_fetcher",
        WebviewUrl::External(url.parse().unwrap()),
    )
    .visible(false)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.contains("atcoder.local/?data=") {
            let encoded_data = url_str.split("data=").last().unwrap_or("");
            if let Ok(decoded_data) = urlencoding::decode(encoded_data) {
                let json_str = decoded_data.into_owned();
                if let Ok(data) = serde_json::from_str::<Value>(&json_str) {
                    let title = data["title"].as_str().unwrap_or("Unknown");
                    let desc = data["description"].as_str().unwrap_or("");
                    
                    // AtCoder 的 Markdown 拼接
                    let markdown = format!(
                        "# {}\n\n{}\n\n*(数据补全由 icnana 后台静默完成)*",
                        title, desc
                    );

                    let path = ic_fs::workspace_dir().join(&stem_save).join("question.md");
                    if let Ok(mut f) = File::create(&path) {
                        let _ = f.write_all(markdown.as_bytes());
                        println!("✅ [AtCoder补全] {} 题面已保存", stem_save);
                        let _ = app_handle.emit("markdown_updated", stem_save.clone());
                    }
                }
            }
            if let Some(w) = app_handle.get_webview_window("atcoder_fetcher") { let _ = w.close(); }
            return false;
        }
        true
    })
   .on_page_load(move |window, _| {
        let script = r#"
            setTimeout(() => {
                try {
                    const taskStatement = document.querySelector('#task-statement');
                    if (!taskStatement) throw "Task statement not found";

                    const enPartOrigin = taskStatement.querySelector('.lang-en');
                    if (!enPartOrigin) throw "English part not found";

                    // 🌟 克隆一份，在内存里操作，不影响原网页，也不会因为 DOM 变动崩溃
                    const enPart = enPartOrigin.cloneNode(true);

                    // 1. 处理公式：把 KaTeX 还原为 $...$
                    enPart.querySelectorAll('.katex').forEach(el => {
                        const texEl = el.querySelector('annotation[encoding="application/x-tex"]');
                        if (texEl) {
                            const tex = texEl.textContent;
                            const isDisplay = el.classList.contains('katex-display');
                            const replacement = document.createTextNode(isDisplay ? `\n$$\n${tex}\n$$\n` : `$${tex}$`);
                            el.parentNode.replaceChild(replacement, el);
                        }
                    });

                    // 2. 智能处理 pre 标签（区分格式说明和样例）
                    enPart.querySelectorAll('pre').forEach(pre => {
                        // 清理按钮
                        pre.querySelectorAll('.btn-copy, .btn-pre').forEach(b => b.remove());
                        
                        const code = pre.innerText.trim();
                        // 寻找它的兄弟节点或父节点，判断是不是 Sample
                        const parentText = pre.parentElement ? pre.parentElement.innerText : "";
                        const isSample = /Sample/i.test(parentText) || /样例/i.test(parentText);

                        if (isSample) {
                            // 样例：进代码块
                            const replacement = document.createTextNode(`\n\n\`\`\`\n${code}\n\`\`\`\n\n`);
                            pre.parentNode.replaceChild(replacement, pre);
                        } else {
                            // 格式说明：变回普通文本，让 $...$ 露出来
                            const replacement = document.createTextNode(`\n${code}\n`);
                            pre.parentNode.replaceChild(replacement, pre);
                        }
                    });

                    // 3. 提取标题
                    const title = document.title.split(' - ')[0];

                    // 4. 暴力移除残留的 UI 元素
                    enPart.querySelectorAll('.btn-copy, .div-btn-copy, h3').forEach(el => el.remove());

                    const data = {
                        title: title,
                        description: enPart.innerText.trim()
                    };

                    window.location.href = 'https://atcoder.local/?data=' + encodeURIComponent(JSON.stringify(data));
                } catch (e) {
                    console.error("抓取失败:", e);
                    // 就算失败也强行跳转一下，防止 Rust 端干等
                    window.location.href = 'https://atcoder.local/?data=error';
                }
            }, 1000);
        "#;
        let _ = window.eval(script);
    })
    .build()
    .ok();
}