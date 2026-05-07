use tauri::AppHandle;

use crate::oj::models::*;

pub fn dispatch_extra_logic(app: AppHandle, payload: CCPayload, stem: String) {
    let url = payload.url.to_lowercase();
    println!("🔍 分发器已启动，检测 URL: {}", payload.url);

    if url.contains("luogu.com.cn") {
        // 洛谷逻辑：使用你之前打通的 WebView 探针
        // 提取 PID (P1000)
        if let Some(pid) = url.split('/').last().and_then(|s| s.split('?').next()) {
            println!("🔍 检测到洛谷题目，启动 WebView 补全: {}", pid);
            // 这里调用你之前的 spawn_luogu_fetcher
            crate::oj::luogu::spawn_luogu_fetcher(app, pid.to_string(), stem);
        }
    } 
    else if url.contains("codeforces.com") {
        // 如果以后要加 CF 的逻辑
        println!("🔍 检测到 Codeforces 题目，执行 CF 补全...");

        crate::oj::cf::spawn_cf_fetcher(app, url.clone(), stem);
    }
    else if url.contains("atcoder.jp") {
        println!("检测到atcode题目，执行atcode补全");

        crate::oj::atcode::spawn_atcoder_fetcher(app, url.clone(), stem);
    }
    // ... 可以继续扩展 AtCoder, Vjudge 等
}