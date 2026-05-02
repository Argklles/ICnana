use std::fs;
use std::path::PathBuf;

/*
该命名空间用于确定文件路径
*/

pub fn workspace_dir() -> PathBuf {
    // 运行时 cwd 为 src-tauri/，所以 ../workspace 对应项目根下的 workspace/
    PathBuf::from("../workspace")
}

pub fn workspace_cpp() -> PathBuf {
    workspace_dir().join("test.cpp")
}

pub fn workspace_bin() -> PathBuf {
    workspace_dir().join("test.bin")
}

/// 确保 workspace 目录存在
pub fn ensure_workspace() -> std::io::Result<()> {
    fs::create_dir_all(workspace_dir())
}