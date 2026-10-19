use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub fn create_hidden_command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
//用于隐藏cmd

/// 编译器可执行文件名（Windows 下带 .exe）
pub fn compiler_exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "g++.exe"
    } else {
        "g++"
    }
}

/// 随应用分发的内置工具链（Tauri resources 里）。
fn bundled_compiler() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let name = compiler_exe_name();

    // 依次兼容：Windows/Linux 安装目录、macOS .app 的 Resources、开发期直接放在可执行文件旁
    let candidates = [
        dir.join("resources").join("toolchain").join("bin").join(name),
        dir.join("..").join("Resources").join("resources").join("toolchain").join("bin").join(name),
        dir.join("toolchain").join("bin").join(name),
    ];

    candidates.into_iter().find(|p| p.exists())
}

/// 随应用分发的 testlib.h 目录（交互器里 `#include "testlib.h"` 时加进 -I）
pub fn testlib_include_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;

    let candidates = [
        dir.join("resources").join("testlib"),
        dir.join("..").join("Resources").join("resources").join("testlib"),
        // 开发期：cargo / tauri dev 的 cwd 就是 src-tauri
        PathBuf::from("resources/testlib"),
    ];

    candidates.into_iter().find(|p| p.join("testlib.h").exists())
}

/// 编译器解析顺序：
///   1. 环境变量 `ICNANA_GXX`（开发调试 / 用户手动指定）
///   2. 安装目录内的内置工具链
///   3. 系统 PATH 里的 g++
pub fn resolve_compiler() -> PathBuf {
    if let Ok(custom) = std::env::var("ICNANA_GXX") {
        if !custom.trim().is_empty() {
            return PathBuf::from(custom);
        }
    }
    if let Some(bundled) = bundled_compiler() {
        return bundled;
    }
    PathBuf::from("g++")
}

/// 带隐藏窗口的编译器命令
pub fn create_compiler_command() -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(resolve_compiler());
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
