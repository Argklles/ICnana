use std::path::PathBuf;
use std::process::Command;
use std::sync::{OnceLock, RwLock};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;


/// 把路径换成本身的 8.3 短名（Windows 专有）。
///
/// MinGW 的 GCC 在内部把路径按本地代码页转换，路径里出现中文时
/// 可能找不到自己的 cc1plus，也打不开源文件。传短路径可以绕开这个问题：
///   D:\编程\icnana\main.cpp  →  D:\6E7A~1\icnana\main.cpp
///
/// 拿不到短名（卷上禁用了 8.3）时原样返回，行为不变。
#[cfg(windows)]
pub fn short_path(path: &std::path::Path) -> std::path::PathBuf {
    use std::ffi::OsString;
    use std::os::windows::ffi::{OsStrExt, OsStringExt};

    #[link(name = "kernel32")]
    extern "system" {
        fn GetShortPathNameW(long_path: *const u16, short_path: *mut u16, len: u32) -> u32;
    }

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut buf = vec![0u16; 32_768];
    let len = unsafe { GetShortPathNameW(wide.as_ptr(), buf.as_mut_ptr(), buf.len() as u32) };

    if len == 0 || len as usize >= buf.len() {
        return path.to_path_buf();
    }
    std::path::PathBuf::from(OsString::from_wide(&buf[..len as usize]))
}

/// 非 Windows 上没有必要，原样返回
#[cfg(not(windows))]
pub fn short_path(path: &std::path::Path) -> std::path::PathBuf {
    path.to_path_buf()
}

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
/// 同上，但直接收路径，并且自动转成短路径（中文目录必需）
pub fn create_hidden_command_path(program: &std::path::Path) -> Command {
    create_hidden_command(&short_path(program).to_string_lossy())
}
//用于隐藏cmd

/// 打包后的资源目录（由 lib.rs 启动时注入）。
/// 安装后资源不在 exe 旁边（Linux 是 /usr/lib/icnana，macOS 是 .app/Contents/Resources），
/// 所以不能再靠 current_exe().parent() 猜。
static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init_resource_dir(dir: PathBuf) {
    let _ = RESOURCE_DIR.set(dir);
}

/// 首启解压出来的工具链目录（应用数据目录下）。
/// 用 RwLock 而不是 OnceLock：解压完才知道真正的根（7z 里通常套了一层 winlibs-xxx）。
static TOOLCHAIN_DIR: RwLock<Option<PathBuf>> = RwLock::new(None);

pub fn init_toolchain_dir(dir: PathBuf) {
    if let Ok(mut guard) = TOOLCHAIN_DIR.write() {
        *guard = Some(dir);
    }
}

fn resource_candidates(relative: &[&str]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(dir) = RESOURCE_DIR.get() {
        let mut path = dir.clone();
        for part in relative {
            path = path.join(part);
        }
        out.push(path);
    }
    out
}

/// 编译器可执行文件名（Windows 下带 .exe）
pub fn compiler_exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "g++.exe"
    } else {
        "g++"
    }
}

/// 随应用分发的内置工具链（Tauri resources 里）。
pub fn bundled_compiler() -> Option<PathBuf> {
    let name = compiler_exe_name();

    // 1) 首启解压到数据目录的那份（新版走这里）
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(guard) = TOOLCHAIN_DIR.read() {
        if let Some(dir) = guard.as_ref() {
            candidates.push(dir.join("bin").join(name));
            // 7z 里常见 winlibs-<triplet>/bin/g++.exe 这种一层包装，防御性再看一层
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let child = entry.path().join("bin").join(name);
                    if child.exists() {
                        candidates.push(child);
                    }
                }
            }
        }
    }

    // 2) 打包后的资源目录（老版本直接把目录塞进安装包时走这里）
    candidates.extend(resource_candidates(&["resources", "toolchain", "bin", name]));

    // 2) 兜底：exe 旁边 / macOS .app 的 Resources / 开发期 cwd 下的 resources
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("resources").join("toolchain").join("bin").join(name));
            candidates.push(
                dir.join("..").join("Resources").join("resources").join("toolchain").join("bin").join(name),
            );
            candidates.push(dir.join("toolchain").join("bin").join(name));
        }
    }
    candidates.push(
        PathBuf::from("resources").join("toolchain").join("bin").join(name),
    );

    candidates.into_iter().find(|p| p.exists())
}

/// 随应用分发的 testlib.h 目录（交互器里 `#include "testlib.h"` 时加进 -I）
pub fn testlib_include_dir() -> Option<PathBuf> {
    let mut candidates = resource_candidates(&["resources", "testlib"]);

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("resources").join("testlib"));
            candidates.push(dir.join("..").join("Resources").join("resources").join("testlib"));
        }
    }
    // 开发期：cargo / tauri dev 的 cwd 就是 src-tauri
    candidates.push(PathBuf::from("resources/testlib"));

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
    let mut cmd = Command::new(short_path(&resolve_compiler()));
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_compiler_picks_up_resources_dir() {
        let bin_dir = PathBuf::from("resources").join("toolchain").join("bin");
        let exe = bin_dir.join(compiler_exe_name());

        if std::fs::create_dir_all(&bin_dir).is_err() || std::fs::write(&exe, b"").is_err() {
            return; // 环境不让写就跳过
        }

        let found = bundled_compiler();

        // 只清理测试自己造的东西，别动 resources/toolchain 里的其他文件
        let _ = std::fs::remove_file(&exe);
        let _ = std::fs::remove_dir(&bin_dir);

        assert!(found.is_some(), "应当能从 resources/toolchain/bin 找到编译器");
        assert!(found.unwrap().ends_with(compiler_exe_name()));
    }
}
