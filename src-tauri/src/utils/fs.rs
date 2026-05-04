use std::fs;
use std::path::PathBuf;

/*
该命名空间用于确定文件路径;
*/

pub fn workspace_dir() -> PathBuf {
    // 运行时 cwd 为 src-tauri/，所以 ../workspace 对应项目根下的 workspace/
    PathBuf::from("../workspace")
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