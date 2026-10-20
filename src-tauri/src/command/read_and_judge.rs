use std::fs;

use crate::compiler::hidden_cmd::{create_compiler_command, resolve_compiler};
use crate::compiler::options::{CompileOptions, CompileSettings};
use crate::oj::models::TestCase;
use crate::utils::ic_fs;
use crate::compiler::cpp_gcc::{compile_code_with, compile_code_with_includes, run_binary};
use std::path::PathBuf;
use crate::compiler::interactive::run_interactive;
use std::time::Duration;

/// 题目元数据没写限制时的兜底值
pub const DEFAULT_TIME_LIMIT: u64 = 2000;
pub const DEFAULT_MEMORY_LIMIT: u64 = 256;

/// 从 question.json 里读出时间 / 内存限制，缺字段用兜底值
pub fn limits_from_question(q: &serde_json::Value) -> (u64, u64) {
    let time = q
        .get("timeLimit")
        .and_then(|v| v.as_u64())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_TIME_LIMIT);
    let memory = q
        .get("memoryLimit")
        .and_then(|v| v.as_u64())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_MEMORY_LIMIT);
    (time, memory)
}

/*
该命名空间与cpp文件的读取与样例的judge相关
*/

//读取已有的文件，有初始代码模板设定;

#[tauri::command]
pub async fn judge_all(
    filename: String,
    code: String,
    mut cases: Vec<TestCase>,
    settings: Option<CompileSettings>,
) -> Vec<TestCase> {
    if let Err(e) = ic_fs::ensure_workspace() {
        for case in &mut cases {
            case.status = "error".to_string();
            case.actual = format!("创建工作区失败: {}", e);
        }
        return cases;
    }

    let (time_limit, memory_limit) = ic_fs::get_workspace_question(filename.clone())
        .ok()
        .map(|q| limits_from_question(&q))
        .unwrap_or((DEFAULT_TIME_LIMIT, DEFAULT_MEMORY_LIMIT));

    let src = ic_fs::workspace_cpp(&filename);
    let bin_name = filename.trim_end_matches(".cpp").to_string();
    let bin = ic_fs::workspace_bin(&bin_name);
    fs::write(&src, &code).unwrap();
    if let Err(compile_err) = compile_code_with(&src, &bin, &CompileOptions::from_settings(settings)) {
        for case in &mut cases {
            case.status = "error".to_string();
            case.actual = compile_err.clone();
        }
        return cases;
    }

    for case in &mut cases {
        match run_binary(&bin, &case.input, time_limit, memory_limit) {
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
                // 超时 / 超内存单独标出来，红字和普通报错区分开
                case.status = if run_err.starts_with("TLE") {
                    "tle".to_string()
                } else if run_err.starts_with("MLE") {
                    "mle".to_string()
                } else {
                    "error".to_string()
                };
                case.actual = run_err;
            }
        }
    }
    cases
}
//对全部样例进行本地测评

#[tauri::command]
pub async fn check_syntax(
    filename: String,
    code: String,
    settings: Option<CompileSettings>,
) -> String {
    if ic_fs::ensure_workspace().is_err() {
        return String::new();
    }

    let src = ic_fs::workspace_cpp(&filename);
    let _ = fs::write(&src, &code);

    // 语法检查也要跟着标准走，否则 C++17/20 的写法会被误报
    let mut cmd = create_compiler_command();
    for flag in CompileOptions::from_settings(settings).syntax_args() {
        cmd.arg(flag);
    }
    let output = match cmd.arg(&src).output() {
        Ok(out) => out,
        Err(e) => {
            return format!(
                "无法启动编译器（{}）: {}",
                resolve_compiler().display(),
                e
            )
        }
    };

    if output.status.success() {
        String::new()
    } else {
        String::from_utf8_lossy(&output.stderr).to_string()
    }
}
//
// ────────────────────────── 交互题自测 ──────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractiveResult {
    pub status: String,
    pub message: String,
    pub transcript: String,
}

fn stem_of(filename: &str) -> String {
    filename.trim_end_matches(".cpp").to_string()
}

/// 读取题目文件夹里的交互器源码（没有就返回空串）
#[tauri::command]
pub fn load_interactor(filename: String) -> String {
    let stem = stem_of(&filename);
    fs::read_to_string(ic_fs::workspace_interactor(&stem)).unwrap_or_default()
}

/// 把交互器源码写进题目文件夹
#[tauri::command]
pub fn save_interactor(filename: String, code: String) -> Result<(), String> {
    let stem = stem_of(&filename);
    ic_fs::ensure_workspace().map_err(|e| e.to_string())?;
    fs::write(ic_fs::workspace_interactor(&stem), code).map_err(|e| e.to_string())
}

/// 交互题自测：编译选手程序 + 交互器，把两者的 stdin/stdout 对接起来跑一次。
///
/// 约定：argv[1] = 测试数据文件；普通交互器用 stdout 输出，testlib 交互器用 argv[2]；
/// 选手的 stdout 一律接进交互器 stdin；交互器退出码 0 判通过。
#[tauri::command]
pub async fn judge_interactive(
    app: tauri::AppHandle,
    filename: String,
    code: String,
    interactor: String,
    input: String,
    time_limit: u64,
    settings: Option<CompileSettings>,
) -> InteractiveResult {
    let fail = |message: String| InteractiveResult {
        status: "error".to_string(),
        message,
        transcript: String::new(),
    };

    if let Err(e) = ic_fs::ensure_workspace() {
        return fail(format!("创建工作区失败: {e}"));
    }

    let stem = stem_of(&filename);
    let opts = CompileOptions::from_settings(settings);

    let src = ic_fs::workspace_cpp(&stem);
    let bin = ic_fs::workspace_bin(&stem);
    let inter_src = ic_fs::workspace_interactor(&stem);
    let inter_bin = ic_fs::workspace_interactor_bin(&stem);
    let input_path = ic_fs::workspace_interactive_input(&stem);

    if let Err(e) = fs::write(&src, &code) {
        return fail(format!("写入代码失败: {e}"));
    }
    if let Err(e) = fs::write(&inter_src, &interactor) {
        return fail(format!("写入交互器失败: {e}"));
    }
    if interactor.trim().is_empty() {
        return fail("还没有交互器代码，先把题目给的 interactor 粘进来喵".to_string());
    }

    if let Err(e) = compile_code_with(&src, &bin, &opts) {
        return fail(format!("选手程序编译失败:\n{e}"));
    }
    // testlib 交互器要带 -I 指向随应用分发的 testlib.h
    let testlib_mode = interactor.contains("testlib.h") || interactor.contains("registerInteraction");
    let mut includes: Vec<PathBuf> = Vec::new();
    if testlib_mode {
        // 打包后资源在 Tauri 的 resource_dir 里；开发期回退到 src-tauri/resources
        use tauri::Manager;
        let packaged = app
            .path()
            .resource_dir()
            .ok()
            .map(|dir| dir.join("resources").join("testlib"))
            .filter(|dir| dir.join("testlib.h").exists());

        if let Some(dir) = packaged.or_else(crate::compiler::hidden_cmd::testlib_include_dir) {
            includes.push(dir);
        }
    }

    if let Err(e) = compile_code_with_includes(&inter_src, &inter_bin, &opts, &includes) {
        return fail(format!("交互器编译失败:\n{e}"));
    }

    if let Err(e) = fs::write(&input_path, &input) {
        return fail(format!("写入测试数据失败: {e}"));
    }

    // 交互本身有来有回，给一个固定宽限，避免正常对答被判超时
    let timeout = Duration::from_millis(time_limit.max(1000) + 5000);
    let outcome = run_interactive(&bin, &inter_bin, &input_path, timeout, testlib_mode);

    InteractiveResult {
        status: outcome.status,
        message: outcome.message,
        transcript: outcome.transcript,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_limits_from_meta() {
        let q = json!({ "timeLimit": 3000, "memoryLimit": 512 });
        assert_eq!(limits_from_question(&q), (3000, 512));
    }

    #[test]
    fn falls_back_when_missing_or_zero() {
        assert_eq!(limits_from_question(&json!({})), (DEFAULT_TIME_LIMIT, DEFAULT_MEMORY_LIMIT));
        assert_eq!(
            limits_from_question(&json!({ "timeLimit": 0, "memoryLimit": 0 })),
            (DEFAULT_TIME_LIMIT, DEFAULT_MEMORY_LIMIT)
        );
        // 只有一半字段时，另一半走默认
        assert_eq!(
            limits_from_question(&json!({ "timeLimit": 1500 })),
            (1500, DEFAULT_MEMORY_LIMIT)
        );
    }
}
