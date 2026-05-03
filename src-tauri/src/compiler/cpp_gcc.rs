use std::process::Stdio;
use std::io::Write;
use std::fs;
use std::path::Path;

use crate::utils::fs as ic_fs;
use crate::compiler::hidden_cmd::create_hidden_command;

/*
该命名空间用于编译和运行单个cpp文件
*/

pub fn compile_code(src: &Path, bin: &Path) -> Result<(), String> {
    let output = create_hidden_command("g++")
        .arg(src)
        .arg("-o")
        .arg(bin)
        .output()
        .map_err(|e| format!("无法启动编译器: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

pub fn run_binary(bin: &Path, input: &str) -> Result<String, String> {
    let mut child = create_hidden_command(bin.to_str().unwrap())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|_| "程序启动失败".to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        let input_with_newline = format!("{}\n", input);
        let _ = stdin.write_all(input_with_newline.as_bytes());
    }

    let output = child.wait_with_output().map_err(|_| "读取程序输出超时".to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn g_cpp(code: String, input: String) -> String {
    if let Err(e) = ic_fs::ensure_workspace() {
        return format!("创建工作区失败: {}", e);
    }
    
    let src = ic_fs::workspace_cpp();
    let bin = ic_fs::workspace_bin();
    
    // 写代码到工作区
    if let Err(e) = fs::write(&src, &code) {
         return format!("写入文件失败: {}", e);
    }

    // 组合技：先编译，如果报错直接返回错误信息
    if let Err(err_msg) = compile_code(&src, &bin) {
        return err_msg;
    }

    // 组合技：后运行，返回程序的真实输出
    match run_binary(&bin, &input) {
        Ok(actual_output) => actual_output,
        Err(e) => e,
    }
}