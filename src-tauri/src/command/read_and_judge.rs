use std::fs;

use crate::{compiler::hidden_cmd::create_hidden_command, oj::models::TestCase};
use crate::utils::ic_fs;
use crate::compiler::cpp_gcc::{compile_code, run_binary};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/*
该命名空间与cpp文件的读取与样例的judge相关
*/

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

    let src = ic_fs::workspace_cpp(&filename);
    let bin_name = filename.trim_end_matches(".cpp").to_string();
    let bin = ic_fs::workspace_bin(&bin_name);
    fs::write(&src, &code).unwrap();
    if let Err(compile_err) = compile_code(&src, &bin) {
        for case in &mut cases {
            case.status = "error".to_string();
            case.actual = compile_err.clone();
        }
        return cases;
    }

    for case in &mut cases {
        match run_binary(&bin, &case.input) {
            Ok(actual_out) => {
                case.actual = actual_out.clone();
                // 验证实际输出和期望输出是否一致
                if actual_out == case.output.trim() {
                    case.status = "ac".to_string();
                } else {
                    case.status = "wa".to_string();
                }
            }
            Err(run_err) => {
                // 如果运行过程出错（如超时、无法启动等）
                case.status = "error".to_string();
                case.actual = run_err;
            }
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

    let src = ic_fs::workspace_cpp(&filename);
    let _ = fs::write(&src, &code);
    let output = create_hidden_command("g++")
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