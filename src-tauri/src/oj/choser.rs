use tauri::AppHandle;

use crate::oj::models::*;

/// CC 载荷落盘之后的「补全题面」分发。
/// OJ 识别统一走 models::detect_oj，避免这里再写一份 if-else。
pub fn dispatch_extra_logic(app: AppHandle, payload: CCPayload, stem: String) {
    let url = payload.url.clone();
    println!("🔍 分发器已启动，检测 URL: {}", url);

    match detect_oj(&url).as_str() {
        "luogu" => {
            // 洛谷的题面靠 WebView 探针补全，需要 PID（P1000）
            if let Some(pid) = url
                .split('/')
                .last()
                .and_then(|s| s.split('?').next())
                .filter(|s| !s.is_empty())
            {
                println!("🔍 检测到洛谷题目，启动 WebView 补全: {}", pid);
                crate::oj::luogu::spawn_luogu_fetcher(app, pid.to_string(), stem);
            }
        }
        "codeforces" => {
            println!("🔍 检测到 Codeforces 题目，执行 CF 补全...");
            crate::oj::cf::spawn_cf_fetcher(app, url.clone(), stem);
        }
        "atcoder" => {
            println!("🔍 检测到 AtCoder 题目，执行 AtCoder 补全...");
            crate::oj::atcode::spawn_atcoder_fetcher(app, url.clone(), stem);
        }
        _ => {}
    }
}
