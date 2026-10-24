use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, Manager};

use crate::compiler::hidden_cmd::compiler_exe_name;

/*
    内置工具链的「首启解压」。

    打包时不再把 500MB 解压后的目录塞进安装包（NSIS 压它要十几分钟，
    装完还占地方），而是只放一个约 110MB 的 toolchain.7z。
    第一次启动时解压到应用数据目录，之后一直用那份。

    Linux / macOS 的包里没有这个 7z，函数会直接返回 None，不做事。
*/

pub const ARCHIVE_NAME: &str = "toolchain.7z";

/// 事件名：前端据此显示「正在准备内置编译器…」
pub const STATUS_EVENT: &str = "toolchain-status";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainStatus {
    /// extracting / ready / missing / error
    pub stage: String,
    pub message: String,
}

fn emit(app: &AppHandle, stage: &str, message: impl Into<String>) {
    let _ = app.emit(
        STATUS_EVENT,
        ToolchainStatus {
            stage: stage.to_string(),
            message: message.into(),
        },
    );
}

/// 在解压目录里找工具链的根。
/// winlibs 的 7z 里通常套了一层 `winlibs-x86_64-.../`，所以要往下探一层。
fn locate_root(dir: &Path) -> Option<PathBuf> {
    let direct = dir.join("bin").join(compiler_exe_name());
    if direct.exists() {
        return Some(dir.to_path_buf());
    }

    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let child = entry.path();
        if child.is_dir() && child.join("bin").join(compiler_exe_name()).exists() {
            return Some(child);
        }
    }
    None
}

/// 解压后的 g++ 路径（不存在就返回 None）
pub fn installed_compiler(dir: &Path) -> Option<PathBuf> {
    let root = locate_root(dir)?;
    Some(root.join("bin").join(compiler_exe_name()))
}

/// 资源目录里的 toolchain.7z
fn archive_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?;
    let p = dir.join("resources").join("toolchain").join(ARCHIVE_NAME);
    p.exists().then_some(p)
}

/// 确保工具链就位；已经解压过就直接返回路径。
pub fn ensure_toolchain(app: &AppHandle, target: &Path) -> Result<Option<PathBuf>, String> {
    if let Some(exe) = installed_compiler(target) {
        emit(app, "ready", "内置工具链已就绪");
        return Ok(Some(exe));
    }

    let Some(archive) = archive_path(app) else {
        emit(app, "missing", "没有内置工具链，使用系统 g++");
        return Ok(None);
    };

    emit(app, "extracting", "首次启动，正在准备内置编译器…");

    if let Err(e) = fs::create_dir_all(target) {
        let msg = format!("创建工具链目录失败: {e}");
        emit(app, "error", msg.clone());
        return Err(msg);
    }

    match sevenz_rust::decompress_file(&archive, target) {
        Ok(_) => {}
        Err(e) => {
            let msg = format!("解压工具链失败: {e}");
            emit(app, "error", msg.clone());
            let _ = fs::remove_dir_all(target);
            return Err(msg);
        }
    }

    match installed_compiler(target) {
        Some(exe) => {
            // 记下真正的根，让 resolve_compiler 能找到它
            if let Some(root) = exe.parent().and_then(|p| p.parent()) {
                crate::compiler::hidden_cmd::init_toolchain_dir(root.to_path_buf());
            }
            emit(app, "ready", "内置编译器已就绪");
            Ok(Some(exe))
        }
        None => {
            let msg = "解压完成但没找到 g++，工具链可能不完整".to_string();
            emit(app, "error", msg.clone());
            Err(msg)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_toolchain(dir: &Path) {
        let bin = dir.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join(compiler_exe_name()), b"").unwrap();
    }

    #[test]
    fn finds_root_when_flat() {
        let dir = std::env::temp_dir().join("icnana-tc-flat");
        let _ = std::fs::remove_dir_all(&dir);
        fake_toolchain(&dir);

        let root = locate_root(&dir).expect("应该能找到根");
        assert_eq!(root, dir);
    }

    #[test]
    fn finds_root_behind_winlibs_wrapper() {
        // winlibs 的 7z 解压出来是 winlibs-xxx/bin/g++.exe
        let dir = std::env::temp_dir().join("icnana-tc-wrapped");
        let _ = std::fs::remove_dir_all(&dir);
        fake_toolchain(&dir.join("winlibs-x86_64-posix-seh-gcc-15.2.0"));

        let root = locate_root(&dir).expect("套了一层也要能找到");
        assert!(root.ends_with("winlibs-x86_64-posix-seh-gcc-15.2.0"));
        assert!(root.join("bin").join(compiler_exe_name()).exists());
    }
}
