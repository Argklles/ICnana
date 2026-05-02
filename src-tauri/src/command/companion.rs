use axum::{extract::State, Json};
use tauri::{AppHandle, Manager, Emitter};

use crate::oj::CCPayload;

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

    if let Err(e) = state.app_handle.emit("oj_problem_received", payload) {
        eprintln!("💥 转发给前端失败啦: {}", e);
        return axum::http::StatusCode::INTERNAL_SERVER_ERROR;
    }

    if let Some(window) = state.app_handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    axum::http::StatusCode::OK
}