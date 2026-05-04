use axum::{routing::post, Router};

pub mod command;
pub mod compiler;
pub mod oj;
pub mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state = command::companion::AppState { app_handle };

            tauri::async_runtime::spawn(async move {
                let router = Router::new()
                    .route("/", post(command::companion::handle_companion))
                    .with_state(state);

                let listener = tokio::net::TcpListener::bind("127.0.0.1:10043")
                    .await
                    .unwrap();
                println!("📡 ICnana 实验室雷达启动！正在监听 10043 端口...");
                axum::serve(listener, router).await.unwrap();
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            command::read_and_judge::judge_all,
            command::read_and_judge::check_syntax,

            command::workspace::list_workspace_files,
            command::workspace::load_workspace_file,
            command::workspace::save_workspace_file,
            command::workspace::new_workspace_file,
            command::workspace::delete_workspace_file,
            command::workspace::rename_workspace_file,

            command::system::open_browser,

            command::history_testcase::load_test_cases,
            command::history_testcase::save_test_cases,
        ])
        .run(tauri::generate_context!())
        .expect("运行失败喵");
}
