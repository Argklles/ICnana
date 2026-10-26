use std::io::{Read, Write};
use std::process::Stdio;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use crate::compiler::hidden_cmd::{
    create_compiler_command, create_hidden_command_path, resolve_compiler, short_path,
};
use crate::compiler::options::CompileOptions;

/*
该命名空间用于编译和运行单个cpp文件
*/

/// 用默认参数编译（参数见 compiler/options.rs，默认 -std=c++17 -O2）。
pub fn compile_code(src: &Path, bin: &Path) -> Result<(), String> {
    compile_code_with(src, bin, &CompileOptions::from_env())
}

/// 按指定参数编译。
///
/// 开 O2 的目的是让本地跑出来的耗时接近评测机；不开优化会让选手对常数和复杂度产生误判。
pub fn compile_code_with(src: &Path, bin: &Path, opts: &CompileOptions) -> Result<(), String> {
    compile_code_with_includes(src, bin, opts, &[])
}

/// 同上，但可以额外加 `-I` 目录（交互器要用 testlib.h）
pub fn compile_code_with_includes(
    src: &Path,
    bin: &Path,
    opts: &CompileOptions,
    includes: &[PathBuf],
) -> Result<(), String> {
    let mut cmd = create_compiler_command();
    for flag in opts.compile_args() {
        cmd.arg(flag);
    }
    for dir in includes {
        // 中文目录：编译器读到的是短名，能正常打开
        cmd.arg("-I").arg(short_path(dir));
    }

    let output = cmd
        .arg(short_path(src))
        .arg("-o")
        .arg(short_path(bin))
        .output()
        .map_err(|e| {
            format!(
                "无法启动编译器（{}）: {}\n请安装 GCC，或确认内置工具链已就位。",
                resolve_compiler().display(),
                e
            )
        })?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

/// 测试用的编译锁。
///
/// 好几个用例都要真编译 C++，并行跑时会同时启动一堆 g++/cc1plus；
/// 在受限环境（容器 / 低配机器）里偶发 `Permission denied (os error 13)`。
/// 用一把锁把它们串起来，代价是测试慢一两秒，换来稳定。
#[cfg(test)]
pub(crate) fn test_compile_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

/// 单次运行最多保留这么多字节的 stdout。
/// 超出的部分仍然继续读走（丢弃），否则子进程会阻塞在 write 上被误判 TLE。
const MAX_CAPTURE: usize = 1024 * 1024;

/// 一次运行的输出结果
#[derive(Debug)]
pub struct RunOutput {
    /// 实际保留的文本（最多 MAX_CAPTURE 字节）
    pub text: String,
    /// 程序总共打印了多少字节
    pub total_bytes: u64,
    /// 是否被截断
    pub truncated: bool,
}

/// 跑一次样例。
///
/// - `time_limit_ms`：超时阈值，来自题目元数据
/// - `memory_limit_mb`：内存上限。**目前只在 Windows 上强制**（Linux/macOS 忽略），
///   超了直接杀掉并返回 MLE。
pub fn run_binary(
    bin: &Path,
    input: &str,
    time_limit_ms: u64,
    memory_limit_mb: u64,
) -> Result<(RunOutput, u64, Option<u64>), String> {
    let mut child = create_hidden_command_path(bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|_| "程序启动失败".to_string())?;

    // 1. 送入输入数据
    if let Some(mut stdin) = child.stdin.take() {
        let input_with_newline = format!("{}\n", input);
        let _ = stdin.write_all(input_with_newline.as_bytes());
        // 这里的 stdin 离开作用域会被自动 drop，相当于向子进程发送 EOF，这步极其关键
    }

    // 2. 挂载“抽水机”线程：实时抽干 stdout，防止 64KB 管道阻塞导致假死。
    //    只保留前 MAX_CAPTURE 字节，其余继续读走丢弃 —— 关键是「继续读」，
    //    停下来子进程会卡在 write() 上，最后被误判成 TLE。
    let mut stdout = child.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut kept: Vec<u8> = Vec::new();
        let mut total: u64 = 0;
        let mut buf = [0u8; 64 * 1024];

        loop {
            match stdout.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    total += n as u64;
                    if kept.len() < MAX_CAPTURE {
                        let remain = MAX_CAPTURE - kept.len();
                        kept.extend_from_slice(&buf[..n.min(remain)]);
                    }
                }
                Err(_) => break,
            }
        }

        // 用 lossy 转换：截断点可能落在多字节字符中间
        let _ = tx.send((String::from_utf8_lossy(&kept).to_string(), total));
    });

    // 3. 核心：死循环检测雷达
    let timeout_duration = Duration::from_millis(time_limit_ms.clamp(100, 600_000));
    #[cfg(windows)]
    let mem_limit_bytes = memory_limit_mb.saturating_mul(1024 * 1024);
    let start_time = Instant::now();

    #[allow(unused_assignments)]
    let mut exit_status = None;

    loop {
        // try_wait() 是非阻塞的，瞬间看一眼进程死没死
        match child.try_wait() {
            Ok(Some(status)) => {
                // 进程乖乖自己结束了，跳出雷达扫描
                exit_status = Some(status);
                break;
            }
            Ok(None) => {
                // Windows 没有 setrlimit，这里轮询工作集内存；超了直接杀
                #[cfg(windows)]
                if let Some(c) = win_mem::counters(&child) {
                    let used = c.working_set_size as u64;
                    if mem_limit_bytes > 0 && used > mem_limit_bytes {
                        let _ = child.kill();
                        return Err(format!(
                            "MLE (Memory Limit Exceeded): 超出 {} MB 限制",
                            memory_limit_mb
                        ));
                    }
                }

                // 进程还在跑，检查是否超过了容忍极限
                if start_time.elapsed() > timeout_duration {
                    // 发现死循环或超时，直接无情击杀！
                    let _ = child.kill(); 
                    return Err(format!(
                        "TLE (Time Limit Exceeded): 超过 {} ms",
                        timeout_duration.as_millis()
                    ));
                }
                // 让当前线程歇一口气，避免把你的 CPU 单核跑满 100%
                thread::sleep(Duration::from_millis(10));
            }
            Err(e) => return Err(format!("等待进程异常: {}", e)),
        }
    }

    // 4. 程序结束，先看退出状态：崩溃 / 非法返回不算「输出为空」
    let elapsed_ms = start_time.elapsed().as_millis() as u64;
    let (text, total_bytes) = rx.recv().unwrap_or_default();
    let output = RunOutput {
        truncated: total_bytes > MAX_CAPTURE as u64,
        text,
        total_bytes,
    };

    // 峰值内存：用子进程句柄查，进程退出后依然能读到（用 pid 就查不到了）
    #[cfg(windows)]
    let peak_kb = win_mem::counters(&child).map(|c| c.peak_working_set_size as u64 / 1024);

    #[cfg(not(windows))]
    let peak_kb: Option<u64> = None;

    // 事后 MLE：可能在我们采样前就被系统杀掉，靠 peak 兜底
    if let Some(kb) = peak_kb {
        if memory_limit_mb > 0 && kb > memory_limit_mb.saturating_mul(1024) {
            return Err(format!(
                "MLE (Memory Limit Exceeded): 峰值 {} MB，超出 {} MB 限制",
                kb / 1024,
                memory_limit_mb
            ));
        }
    }

    if let Some(status) = exit_status {
        if !status.success() {
            let detail = match status.code() {
                Some(code) => format!("退出码 {code}"),
                None => {
                    #[cfg(unix)]
                    {
                        use std::os::unix::process::ExitStatusExt;
                        match status.signal() {
                            Some(sig) => format!("被信号 {sig} 终止（常见于越界访问、栈溢出、除零）"),
                            None => "被异常终止".to_string(),
                        }
                    }
                    #[cfg(not(unix))]
                    {
                        "被异常终止".to_string()
                    }
                }
            };
            return Err(format!("RE (Runtime Error): {detail}"));
        }
    }

    Ok((
        RunOutput { text: output.text.trim().to_string(), ..output },
        elapsed_ms,
        peak_kb,
    ))
}

/// Windows 专用：查询进程的工作集大小。
///
/// 没有用 Job Object（要额外依赖、还得管句柄生命周期），
/// 直接调 psapi 的 GetProcessMemoryInfo，失败就当作「查不到」，
/// 宁可不限制也不能让判题崩掉。
#[cfg(windows)]
mod win_mem {
    use core::ffi::c_void;
    use std::os::windows::io::AsRawHandle;

    #[repr(C)]
    pub struct ProcessMemoryCounters {
        cb: u32,
        page_fault_count: u32,
        pub peak_working_set_size: usize,
        pub working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_non_paged_pool_usage: usize,
        quota_non_paged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
    }

    #[link(name = "psapi")]
    extern "system" {
        fn GetProcessMemoryInfo(
            process: *mut c_void,
            counters: *mut ProcessMemoryCounters,
            cb: u32,
        ) -> i32;
    }

    /// 直接用子进程句柄查内存。
    ///
    /// 之前是拿 pid 调 OpenProcess —— 但进程一退出 OpenProcess 就失败，
    /// 于是「峰值内存」永远是 None（界面上显示 -1 MB）。
    /// 句柄在 Child 被 drop 之前一直有效，进程结束后也能读到 peak。
    pub fn counters(child: &std::process::Child) -> Option<ProcessMemoryCounters> {
        unsafe {
            let handle = child.as_raw_handle() as *mut c_void;
            let mut counters: ProcessMemoryCounters = core::mem::zeroed();
            counters.cb = core::mem::size_of::<ProcessMemoryCounters>() as u32;

            let ok = GetProcessMemoryInfo(handle, &mut counters, counters.cb);
            (ok != 0).then_some(counters)
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::options::CompileOptions;

    fn build(name: &str, code: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        let _compile_guard = crate::compiler::cpp_gcc::test_compile_lock();
        // 每个用例一个独立目录：并行跑时不会互相干扰（否则偶发 EACCES）
        let dir = std::env::temp_dir().join(format!("icnana-build-{name}"));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join(format!("{name}.cpp"));
        let bin = dir.join(name);
        std::fs::write(&src, code).unwrap();
        compile_code_with(&src, &bin, &CompileOptions::from_settings(None)).expect("编译失败");
        (src, bin)
    }

    #[test]
    fn runs_and_returns_stdout() {
        let (_, bin) = build(
            "sum",
            "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}",
        );
        let (out, elapsed_ms, _) = run_binary(&bin, "1 2", 2000, 256).unwrap();
        assert_eq!(out.text, "3");
        assert!(!out.truncated);
        assert!(elapsed_ms < 2000, "正常程序不该超过限制，实测 {elapsed_ms} ms");
    }

    #[test]
    fn optimized_empty_loop_is_not_tle() {
        // 用户报告的场景：2e7 次空循环，-O2 会整个优化掉，不该判超时
        let (_, bin) = build(
            "busy_empty",
            "#include <bits/stdc++.h>\nint main(){std::ios::sync_with_stdio(false);std::cin.tie(nullptr);\nlong long n=20000000;for(int i=0;i<n;i++){}return 0;}",
        );
        let (out, elapsed_ms, _) = run_binary(&bin, "2 0 0", 3000, 256)
            .expect("这个程序不该超时");
        assert_eq!(out.text, "");
        assert!(elapsed_ms < 1000, "空循环应该几毫秒跑完，实测 {elapsed_ms} ms");
    }

    #[test]
    fn tle_respects_the_given_limit() {
        let (_, bin) = build("spin", "int main(){volatile long long x=0;while(true)x++;}");
        let err = run_binary(&bin, "", 300, 256).unwrap_err();
        assert!(err.starts_with("TLE"), "应该是 TLE，实际: {err}");
    }
}

#[cfg(test)]
mod output_cap_tests {
    use super::*;
    use crate::compiler::options::CompileOptions;

    /// 大输出必须被截断，而且要「读完不阻塞」——不能因此变成 TLE。
    #[test]
    fn huge_output_is_truncated_not_blocked() {
        let _compile_guard = crate::compiler::cpp_gcc::test_compile_lock();
        let dir = std::env::temp_dir().join("icnana-build-hugeout");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("print.cpp");
        let bin = dir.join("print");

        // 打印 3MB 左右
        std::fs::write(
            &src,
            "#include <cstdio>\nint main(){for(int i=0;i<300000;i++)printf(\"0123456789\\n\");return 0;}",
        )
        .unwrap();
        compile_code_with(&src, &bin, &CompileOptions::from_settings(None)).expect("编译失败");

        let (out, elapsed_ms, _) = run_binary(&bin, "", 10000, 256).expect("不该失败");

        assert!(out.truncated, "3MB 输出应该被判截断");
        assert!(out.total_bytes > 3_000_000, "应记录真实字节数，实际 {}", out.total_bytes);
        assert!(out.text.len() <= 1024 * 1024, "保留的文本不该超过 1MB");
        assert!(elapsed_ms < 5000, "继续排空不该把它拖成超时，实测 {elapsed_ms} ms");
    }
}

#[cfg(all(test, windows))]
mod mle_tests {
    use super::*;
    use crate::compiler::options::CompileOptions;

    /// 峰值内存超限时必须判 MLE（而不是崩了判 RE / 输出为空判 WA）。
    /// 只在 Windows 跑：Linux 按约定不测内存，peak 恒为 None。
    #[test]
    fn over_limit_memory_is_mle_not_re() {
        let dir = std::env::temp_dir().join("icnana-build-mle");
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("eat.cpp");
        let bin = dir.join("eat");

        // 申请并写入 256MB，限制给 8MB
        std::fs::write(
            &src,
            "#include <cstdlib>\n#include <cstring>\nint main(){size_t n=256ull*1024*1024;char*p=(char*)malloc(n);memset(p,1,n);return 0;}",
        )
        .unwrap();
        compile_code_with(&src, &bin, &CompileOptions::from_settings(None)).expect("编译失败");

        let err = run_binary(&bin, "", 5000, 8).unwrap_err();
        assert!(err.starts_with("MLE"), "应该是 MLE，实际: {err}");
    }
}
