use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use std::fs::File;
use std::io::Write;
use serde_json::Value;
use tauri::Emitter;

use crate::utils::ic_fs;

// --- 核心工具：从最新的 lentille-context 结构中提取题目数据 ---
pub fn extract_problem_from_new_html(html: &str) -> Option<Value> {
    // 1. 定位新版的 JSON 容器
    let start_pattern = "id=\"lentille-context\" type=\"application/json\">";
    let end_pattern = "</script>";

    let start_idx = html.find(start_pattern)? + start_pattern.len();
    let tail = &html[start_idx..];
    let end_idx = tail.find(end_pattern)?;
    let json_text = &tail[..end_idx];

    // 2. 解析 JSON
    let full_json: Value = serde_json::from_str(json_text).ok()?;
    
    // 3. 根据你提供的源码，数据路径在 data -> problem 中
    Some(full_json["data"]["problem"].clone())
}

// 🌟 将原本的 fetch_luogu_webview 逻辑提取成一个普通的 pub 函数
pub fn spawn_luogu_fetcher(app: tauri::AppHandle, pid: String, stem: String) {
    // 如果已经在抓取了，就别重复开了
    if let Some(_) = app.get_webview_window("luogu_fetcher") { return; }

    let url = format!("https://www.luogu.com.cn/problem/{}", pid);
    let app_handle = app.clone();
    let pid_save = pid.clone();

    let _webview = WebviewWindowBuilder::new(
        &app,
        "luogu_fetcher",
        WebviewUrl::External(url.parse().unwrap()),
    )
    .visible(false) // 👈 真·静默，用户无感知
    .on_navigation(move |url| {
        let url_str = url.as_str();
        if url_str.contains("luogu.local/?data=") {
            let encoded_data = url_str.split("data=").last().unwrap_or("");
            if let Ok(decoded_data) = urlencoding::decode(encoded_data) {
                let html_content = decoded_data.into_owned();
                
                if let Some(problem) = extract_problem_from_new_html(&html_content) {
                    let title = problem["title"].as_str().unwrap_or("Unknown");
                    
                    // 1. 🌟 强力定位 content 块：不管它是 contenu 还是 content，或者是空的
                    let content = if problem["contenu"].is_object() {
                        &problem["contenu"]
                    } else if problem["content"].is_object() {
                        &problem["content"]
                    } else {
                        &problem // 如果都没有，尝试直接从根部找
                    };

                    let description = content["description"].as_str().unwrap_or("");
                    let input_format = content["formatI"].as_str().unwrap_or("");
                    let output_format = content["formatO"].as_str().unwrap_or("");
                    let hint = content["hint"].as_str().unwrap_or("");

                    // 2. 🌟 重新检查样例路径
                    let mut samples_md = String::new();
                    // 有些题目样例可能直接挂在 problem["samples"] 下
                    let samples_source = if content["samples"].is_array() {
                        content["samples"].as_array()
                    } else {
                        problem["samples"].as_array()
                    };

                    if let Some(samples) = samples_source {
                        for (i, sample) in samples.iter().enumerate() {
                            // 确保能拿到字符串，如果洛谷传的是数字，用 to_string() 保底
                            let input = sample[0].as_str().map(|s| s.to_string())
                                .unwrap_or_else(|| sample[0].to_string());
                            let output = sample[1].as_str().map(|s| s.to_string())
                                .unwrap_or_else(|| sample[1].to_string());
                            
                            samples_md.push_str(&format!("\n#### 样例输入 #{}\n```\n{}\n```\n", i + 1, input));
                            samples_md.push_str(&format!("\n#### 样例输出 #{}\n```\n{}\n```\n", i + 1, output));
                        }
                    }

                    // 3. 拼接
                    let samples_display = if samples_md.is_empty() { "*(暂无样例)*".to_string() } else { samples_md };
                    let markdown = format!(
                        "# {} - {}\n\n## 题目描述\n{}\n\n## 输入格式\n{}\n\n## 输出格式\n{}\n\n## 输入输出样例\n{}\n\n## 说明/提示\n{}",
                        pid_save, title, description, input_format, output_format, samples_display, hint
                    );

                    // --- 🌟 保存逻辑 ---
                    let work_path = ic_fs::workspace_dir(); 
                    let path = work_path.join(&stem).join("question.md");
                    
                    if let Ok(mut f) = File::create(&path) {
                        let _ = f.write_all(markdown.as_bytes());
                        println!("✅ [后台补全] {} 的完整题面（含样例）已保存", pid_save);
                        let _ = app_handle.emit("markdown_updated", pid_save.clone());
                    }
                }
            }
            if let Some(w) = app_handle.get_webview_window("luogu_fetcher") { let _ = w.close(); }
            return false;
        }
        true
    })
    .on_page_load(move |window, _| {
        let _ = window.eval("
            setTimeout(() => {
                const content = document.documentElement.outerHTML;
                window.location.href = 'https://luogu.local/?data=' + encodeURIComponent(content);
            }, 1000);
        ");
    })
    .build();
}