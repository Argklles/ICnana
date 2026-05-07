use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, AppHandle, Emitter};
use std::fs::File;
use std::io::Write;
use serde_json::Value;
use crate::utils::ic_fs;

pub fn spawn_cf_fetcher(app: AppHandle, url: String, stem: String) {
    // 1. 防止重复开启
    if let Some(_) = app.get_webview_window("cf_fetcher") { return; }

    let app_handle = app.clone();
    let stem_save = stem.clone();

    // 2. 创建隐身窗口
    let _webview = WebviewWindowBuilder::new(
        &app,
        "cf_fetcher",
        WebviewUrl::External(url.parse().unwrap()),
    )
    .visible(false) // 调试时可以改回 true
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        
        // 拦截带有数据的虚拟 URL
        if url_str.contains("cf.local/?data=") {
            let encoded_data = url_str.split("data=").last().unwrap_or("");
            if let Ok(decoded_data) = urlencoding::decode(encoded_data) {
                let json_str = decoded_data.into_owned();
                
                if let Ok(data) = serde_json::from_str::<Value>(&json_str) {
                    // --- 提取数据 ---
                    let title = data["title"].as_str().unwrap_or("Unknown");
                    let desc = data["description"].as_str().unwrap_or("");
                    let input_fmt = data["input_format"].as_str().unwrap_or("");
                    let output_fmt = data["output_format"].as_str().unwrap_or("");
                    let hint = data["hint"].as_str().unwrap_or("");

                    // --- 处理样例 ---
                    let mut samples_md = String::new();
                    if let Some(samples_array) = data["samples"].as_array() {
                        for (i, sample) in samples_array.iter().enumerate() {
                            let input = sample[0].as_str().unwrap_or("");
                            let output = sample[1].as_str().unwrap_or("");
                            samples_md.push_str(&format!("\n#### 样例输入 #{}\n```\n{}\n```\n", i + 1, input));
                            samples_md.push_str(&format!("\n#### 样例输出 #{}\n```\n{}\n```\n", i + 1, output));
                        }
                    }

                    // --- 拼接最终 Markdown ---
                    let markdown = format!(
                        "# {}\n\n## 题目描述\n{}\n\n## 输入格式\n{}\n\n## 输出格式\n{}\n\n## 输入输出样例\n{}\n\n## 说明/提示\n{}",
                        title, desc, input_fmt, output_fmt, samples_md, hint
                    );

                    // --- 保存落盘 ---
                    let path = ic_fs::workspace_dir().join(&stem_save).join("question.md");
                    if let Ok(mut f) = File::create(&path) {
                        let _ = f.write_all(markdown.as_bytes());
                        println!("✅ [CF补全] {} 题面已保存", stem_save);
                        // 通知前端刷新
                        let _ = app_handle.emit("markdown_updated", stem_save.clone());
                    }
                }
            }
            // 任务完成，关闭窗口
            if let Some(w) = app_handle.get_webview_window("cf_fetcher") { let _ = w.close(); }
            return false; // 拦截跳转
        }
        true
    })
    .on_page_load(move |window, _| {
        // 核心：注入 JS 抓取 DOM
        let script = r#"
            setTimeout(() => {
                const prob = document.querySelector('.problem-statement');
                if (!prob) return;

                // 🌟 核心：还原 MathJax 公式
                // CF 把原始 LaTeX 存放在 type="math/tex" 的 script 标签里
                prob.querySelectorAll('script[type^="math/tex"]').forEach(script => {
                    const tex = script.textContent;
                    const isDisplay = script.type.includes('mode=display');
                    // 还原为 Markdown 识别的 $ 或 $$
                    const newNode = document.createTextNode(isDisplay ? `\n$$\n${tex}\n$$\n` : `$${tex}$`);
                    script.parentNode.replaceChild(newNode, script);
                });

                // 🌟 核心：暴力清理 MathJax 生成的临时渲染标签
                // 删掉所有预览层和渲染出来的 span 容器
                prob.querySelectorAll('.MathJax_Preview, .MathJax, .MathJax_Display, .mjx-chtml, .MJX_Assistive_MathML').forEach(el => el.remove());

                const getCleanText = (selector) => {
                    const el = prob.querySelector(selector);
                    if (!el) return "";
                    // 使用 innerText 而不是 innerHTML，因为我们已经手动把公式还原成文本了
                    // 这样可以去掉多余的 HTML 标签，只保留纯净的题目文本和我们的 $公式$
                    return el.innerText;
                };

                const data = {
                    title: (prob.querySelector('.header .title') || {}).innerText || "Unknown",
                    // 描述部分我们稍微特殊处理，保留部分格式
                    description: prob.querySelector('div.header + div').innerText, 
                    input_format: getCleanText('.input-specification'),
                    output_format: getCleanText('.output-specification'),
                    hint: getCleanText('.note'),
                    samples: Array.from(prob.querySelectorAll('.sample-test')).map(st => {
                        const inputs = st.querySelectorAll('.input pre');
                        const outputs = st.querySelectorAll('.output pre');
                        let res = [];
                        for (let i = 0; i < inputs.length; i++) {
                            res.push([inputs[i].innerText, outputs[i] ? outputs[i].innerText : ""]);
                        }
                        return res;
                    }).flat()
                };

                window.location.href = 'https://cf.local/?data=' + encodeURIComponent(JSON.stringify(data));
            }, 2000);
        "#;
        let _ = window.eval(script);
    })
    .build()
    .expect("Failed to build CF WebView");
}