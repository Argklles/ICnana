use std::fs;
use std::path::{Path, PathBuf};

/*
该命名空间用于确定文件路径
*/

pub fn workspace_dir() -> PathBuf {
    // 运行时 cwd 为 src-tauri/，所以 ../workspace 对应项目根下的 workspace/
    PathBuf::from("../workspace")
}

pub fn workspace_cpp(file_name: &str) -> PathBuf {
    workspace_dir().join(file_name).with_extension("cpp")
}

pub fn workspace_bin(file_name: &str) -> PathBuf {
    workspace_dir().join(file_name).with_extension("bin")
}

pub fn workspace_test_cases(file_name: &str) -> PathBuf {
    workspace_dir().join(file_name).with_extension("cases.json")
}

/// 确保 workspace 目录存在
pub fn ensure_workspace() -> std::io::Result<()> {
    fs::create_dir_all(workspace_dir())
}