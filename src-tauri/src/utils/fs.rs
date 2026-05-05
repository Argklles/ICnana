use std::fs;
use std::path::PathBuf;

/*
该命名空间用于确定文件路径;
*/

pub fn workspace_dir() -> PathBuf {
    // 运行时 cwd 为 src-tauri/，所以 ../workspace 对应项目根下的 workspace/
    PathBuf::from("../workspace")
}

#[tauri::command]
pub fn get_workspace_question(stem: String) -> Result<serde_json::Value, String> {
    let path = workspace_question(&stem);
    if !path.exists() {
        return Err("找不到该题目的元数据喵~".to_string());
    }
    
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    Ok(json)
}

pub fn get_works_dir(strm: &str, filename: &str) -> PathBuf {
    workspace_dir().join(strm).join(filename)
}

pub fn workspace_cpp(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("main.cpp")
}

pub fn workspace_bin(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("main.bin")
}

pub fn workspace_test_cases(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("cases.json")
}

pub fn workspace_question(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("question.json")
}

/// 确保 workspace 目录存在
pub fn ensure_workspace() -> std::io::Result<()> {
    fs::create_dir_all(workspace_dir())
}