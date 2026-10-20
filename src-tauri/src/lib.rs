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
            // ── 资源目录：打包后资源不在 exe 旁边，交给 Tauri 解析 ──
            if let Ok(resource_dir) = app.path().resource_dir() {
                compiler::hidden_cmd::init_resource_dir(resource_dir);
            }

            // ── 数据目录：固定到系统的 app data，不再依赖启动时的 cwd ──
            let data_root = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from(".."));
            let workspace = data_root.join("workspace");

            if let Err(e) = std::fs::create_dir_all(&workspace) {
                eprintln!("⚠️ 创建工作区目录失败: {e}（{}）", workspace.display());
            }
            utils::ic_fs::init_workspace_root(workspace.clone());
            println!("📂 工作区目录: {}", workspace.display());

            // 老版本把数据放在 cwd 旁边的 ../workspace，第一次升级时搬过来
            if let Some(count) = utils::ic_fs::migrate_legacy_workspace(&workspace) {
                println!("📦 已从旧目录迁移 {count} 个题目文件夹");
            }

            // ── 内置工具链：放数据目录，首次启动时从资源里的 7z 解压 ──
            let toolchain_dir = workspace
                .parent()
                .map(|p| p.join("toolchain"))
                .unwrap_or_else(|| workspace.join("toolchain"));
            compiler::hidden_cmd::init_toolchain_dir(toolchain_dir.clone());

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                match command::toolchain::ensure_toolchain(&handle, &toolchain_dir) {
                    Ok(Some(exe)) => println!("🛠️ 内置工具链: {}", exe.display()),
                    Ok(None) => {}
                    Err(e) => eprintln!("⚠️ 工具链准备失败: {e}"),
                }
            });

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
            command::workspace::set_problem_limits,
            command::workspace::get_workspace_path,
            command::assets::read_image_as_data_url,

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
