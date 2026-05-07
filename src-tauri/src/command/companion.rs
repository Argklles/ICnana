use axum::{extract::State, Json};
use tauri::{AppHandle, Manager, Emitter};

use crate::oj::models::CCPayload;
use crate::oj::{choser, get_cc};

/*
    Competitive Companion 数据打包传递
*/

#[derive(Clone)]
pub struct AppState {
    pub app_handle: AppHandle,
}

pub async fn handle_companion(
    State(state): State<AppState>,
    Json(payload): Json<CCPayload>,
) -> axum::http::StatusCode {
    println!("🎉 收到新靶场情报: {} - {}", payload.group, payload.name);

    // 1. 🌟 核心接入点：先在后端进行数据清洗和落盘生成文件夹！
    match get_cc::process_cc_payload(payload.clone()) {
        Ok(stem) => {
            println!("💾 题目档案已落盘，文件夹名: {}", stem);

            // 2. 🌟 策略分发：根据 URL 触发特定的补全逻辑
            // 我们不阻塞主流程，直接 spawn 异步任务
            let app_handle = state.app_handle.clone();
            let payload_clone = payload.clone();
            let stem_clone = stem.clone();
            
            tauri::async_runtime::spawn(async move {
                choser::dispatch_extra_logic(app_handle, payload_clone, stem_clone);
            });
            
            // 3. 落盘成功后，通知前端去加载这个新的题目文件夹
            // 注意：这里我们发的是 stem (字符串)，而不是巨大的 payload
            if let Err(e) = state.app_handle.emit("oj_problem_received", stem) {
                eprintln!("💥 转发给前端失败啦: {}", e);
                return axum::http::StatusCode::INTERNAL_SERVER_ERROR;
            }
        }
        Err(e) => {
            eprintln!("💥 处理并保存题目数据失败喵: {}", e);
            // 这里可以考虑发个报错事件给前端，让前端弹个 Toast
            return axum::http::StatusCode::INTERNAL_SERVER_ERROR;
        }
    }

    // 4. 极其贴心的窗口唤醒逻辑
    if let Some(window) = state.app_handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    

    axum::http::StatusCode::OK
}