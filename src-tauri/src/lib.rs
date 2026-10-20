use axum::{routing::post, Router};
use tauri::Manager;

pub mod command;
pub mod compiler;
pub mod oj;
pub mod utils;

/// 开发模式下的项目根目录（src-tauri 的上一级）
fn dev_repo_root() -> Option<std::path::PathBuf> {
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest.parent().map(|p| p.to_path_buf())
}

/// 目录能不能写：试着建一个探针文件再删掉。
/// 用来判断「绿色版」可行不可行——Program Files / /usr/lib 这种写不了。
fn dir_is_writable(dir: &std::path::Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    let probe = dir.join(".icnana-write-test");
    match std::fs::write(&probe, b"1") {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ── 开发模式：把 WebView 的缓存 / cookies / localStorage 也收进项目目录 ──
    // （必须在创建窗口之前设置，WebKit 只在初始化时读一次）
    if cfg!(debug_assertions) {
        if let Some(root) = dev_repo_root() {
            if std::env::var_os("XDG_DATA_HOME").is_none() {
                std::env::set_var("XDG_DATA_HOME", root.join(".devdata"));
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // ── 资源目录：打包后资源不在 exe 旁边，交给 Tauri 解析 ──
            if let Ok(resource_dir) = app.path().resource_dir() {
                compiler::hidden_cmd::init_resource_dir(resource_dir);
            }

            // ── 数据目录 ──
            // 优先级：环境变量 > 开发模式的仓库目录 > exe 旁边（绿色版） > 系统 app data
            // 小工具按绿色软件处理更符合直觉：解压到哪，数据就在哪。
            // Program Files / /usr/lib 这类只读目录写不了，才回落到 app data。
            let data_root = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from(".."));

            let (portable_root, workspace) = {
                let exe_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|d| d.to_path_buf()));

                let from_env = std::env::var("ICNANA_WORKSPACE")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
                    .map(std::path::PathBuf::from);

                if let Some(dir) = from_env {
                    (None, dir)
                } else if cfg!(debug_assertions) {
                    match dev_repo_root() {
                        Some(root) => (Some(root.clone()), root.join("workspace")),
                        None => (None, data_root.join("workspace")),
                    }
                } else {
                    let usable = exe_dir.filter(|d| dir_is_writable(d));
                    match usable {
                        Some(dir) => {
                            println!("🧳 绿色模式：数据放在程序目录（{}）", dir.display());
                            (Some(dir.clone()), dir.join("workspace"))
                        }
                        None => (None, data_root.join("workspace")),
                    }
                }
            };

            if let Err(e) = std::fs::create_dir_all(&workspace) {
                eprintln!("⚠️ 创建工作区目录失败: {e}（{}）", workspace.display());
            }
            utils::ic_fs::init_workspace_root(workspace.clone());
            println!("📂 工作区目录: {}", workspace.display());

            // 切到绿色模式后，把以前存在 app data 里的数据搬过来（只搬一次）
            if portable_root.is_some() {
                let legacy_root = data_root.join("workspace");
                if let Some(count) = utils::ic_fs::migrate_from(&legacy_root, &workspace) {
                    println!("🧳 已把 app data 里的 {count} 个题目搬到程序目录");
                }
            }

            // 老版本把数据放在 cwd 旁边的 ../workspace，第一次升级时搬过来
            if let Some(count) = utils::ic_fs::migrate_legacy_workspace(&workspace) {
                println!("📦 已从旧目录迁移 {count} 个题目文件夹");
            }

            // ── 内置工具链：放数据目录，首次启动时从资源里的 7z 解压 ──
            let toolchain_dir = match (&portable_root, cfg!(debug_assertions)) {
                // 绿色版：工具链也放程序目录旁边，整个目录可以拷走
                (Some(root), false) => root.join("toolchain"),
                // 开发模式
                (_, true) => dev_repo_root()
                    .map(|r| r.join(".toolchain"))
                    .unwrap_or_else(|| workspace.join("toolchain")),
                // 常规安装：数据目录旁边
                (None, false) => workspace
                    .parent()
                    .map(|p| p.join("toolchain"))
                    .unwrap_or_else(|| workspace.join("toolchain")),
            };
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
