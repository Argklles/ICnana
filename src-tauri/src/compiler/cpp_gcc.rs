use std::process::{Command, Stdio};
use std::io::Write;
use std::fs;

use crate::utils::fs as ic_fs;

/*
该命名空间用于编译cpp文件
*/

#[tauri::command]
pub fn g_cpp(code: String, input: String) -> String {
    if let Err(e) = ic_fs::ensure_workspace() {
        return format!("创建工作区失败: {}", e);
    }
    fs::write(ic_fs::workspace_cpp(), &code).unwrap();
    let compile = Command::new("g++")
        .arg(ic_fs::workspace_cpp())
        .arg("-o")
        .arg(ic_fs::workspace_bin())
        .output()
        .unwrap();

    if !compile.status.success() {
        return String::from_utf8_lossy(&compile.stderr).to_string();
    }

    let mut child = Command::new(ic_fs::workspace_bin())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }

    let output = child.wait_with_output().unwrap();
    String::from_utf8_lossy(&output.stdout).to_string()
}

