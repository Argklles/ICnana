use axum::{routing::post, Router};
use tauri::Manager;

pub mod command;
pub mod compiler;
pub mod oj;
pub mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(command::manual_interaction::InteractionState::default());
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
            command::read_and_judge::judge_interactive,
            command::read_and_judge::load_interactor,
            command::read_and_judge::save_interactor,
            command::manual_interaction::start_manual_interaction,
            command::manual_interaction::send_interaction_input,
            command::manual_interaction::stop_manual_interaction,
            command::compiler::get_compiler_info,

            command::workspace::list_workspace_files,
            command::workspace::load_workspace_file,
            command::workspace::save_workspace_file,
            command::workspace::new_workspace_file,
            command::workspace::delete_workspace_file,
            command::workspace::rename_workspace_file,
            command::workspace::save_code_template,
            command::workspace::set_problem_type,

            command::collections::list_collections,
            command::collections::create_collection,
            command::collections::delete_collection,
            command::collections::toggle_in_collection,

            command::system::open_browser,

            command::history_testcase::load_test_cases,
            command::history_testcase::save_test_cases,

            oj::get_cc::get_problem_meta,

            utils::ic_fs::load_question_html,
            utils::ic_fs::load_question_markdown,
        ])
        .run(tauri::generate_context!())
        .expect("运行失败喵");
}
