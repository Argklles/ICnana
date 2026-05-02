use std::process::{Command, Stdio};
use std::io::Write;
use std::fs;

use crate::oj::TestCase;
use crate::utils::fs as ic_fs;

/*
该命名空间与cpp文件的读取与样例的judge相关
*/

#[tauri::command]
pub fn read_code() -> String {
    match fs::read_to_string(ic_fs::workspace_cpp()) {
        Ok(content) => content,
        Err(_) => String::from("// 开始编写你的代码喵！！\n#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}")
    }
}
//读取已有的文件，有初始代码模板设定;

#[tauri::command]
pub async fn judge_all(filename: String, code: String, mut cases: Vec<TestCase>) -> Vec<TestCase> {
    if let Err(e) = ic_fs::ensure_workspace() {
        for case in &mut cases {
            case.status = "error".to_string();
            case.actual = format!("创建工作区失败: {}", e);
        }
        return cases;
    }
    let src = ic_fs::workspace_dir().join(&filename);
    let bin_name = filename.trim_end_matches(".cpp").to_string() + ".bin";
    let bin = ic_fs::workspace_dir().join(&bin_name);
    fs::write(&src, &code).unwrap();
    let compile = Command::new("g++")
        .arg(&src)
        .arg("-o")
        .arg(&bin)
        .output()
        .unwrap();

    if !compile.status.success() {
        let err = String::from_utf8_lossy(&compile.stderr).to_string();
        for case in &mut cases {
            case.status = "error".to_string();
            case.actual = err.clone();
        }
        return cases;
    }

    for case in &mut cases {
        let child_process = Command::new(&bin)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn();

        let mut child = match child_process {
            Ok(c) => c,
            Err(_) => {
                case.status = "error".to_string();
                case.actual = "启动失败".to_string();
                continue;
            }
        };

        if let Some(mut stdin) = child.stdin.take() {
            let input_with_newline = format!("{}\n", case.input);
            let _ = stdin.write_all(input_with_newline.as_bytes());
        }

        if let Ok(output) = child.wait_with_output() {
            let actual_out = String::from_utf8_lossy(&output.stdout).trim().to_string();
            case.actual = actual_out.clone();

            if actual_out == case.output.trim() {
                case.status = "ac".to_string();
            } else {
                case.status = "wa".to_string();
            }
        } else {
            case.status = "error".to_string();
            case.actual = "读取超时".to_string();
        }
    }
    cases
}
//对全部样例进行本地测评

#[tauri::command]
pub async fn check_syntax(filename: String, code: String) -> String {
    if ic_fs::ensure_workspace().is_err() {
        return String::new();
    }
    let src = ic_fs::workspace_dir().join(&filename);
    let _ = fs::write(&src, &code);
    let output = Command::new("g++")
        .arg("-fsyntax-only")
        .arg("-Wall")
        .arg(&src)
        .output()
        .unwrap();

    if output.status.success() {
        String::new()
    } else {
        String::from_utf8_lossy(&output.stderr).to_string()
    }
}
//