use serde::Serialize;

use crate::compiler::hidden_cmd::{create_compiler_command, resolve_compiler};

/// 给设置面板展示的编译器状态
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompilerInfo {
    pub path: String,
    pub version: String,
    pub found: bool,
    pub platform: String,
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

/// 探测当前使用的 g++（内置工具链 / 环境变量 / PATH）。
#[tauri::command]
pub fn get_compiler_info() -> CompilerInfo {
    let path = resolve_compiler();

    let mut cmd = create_compiler_command();
    cmd.arg("--version");

    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let version = stdout
                .lines()
                .next()
                .unwrap_or_default()
                .trim()
                .to_string();

            CompilerInfo {
                path: path.display().to_string(),
                version,
                found: output.status.success(),
                platform: platform_name().to_string(),
            }
        }
        Err(_) => CompilerInfo {
            path: path.display().to_string(),
            version: String::new(),
            found: false,
            platform: platform_name().to_string(),
        },
    }
}
