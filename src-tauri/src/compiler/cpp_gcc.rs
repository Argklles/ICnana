use std::io::{Read, Write};
use std::process::Stdio;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use crate::compiler::hidden_cmd::{create_compiler_command, create_hidden_command, resolve_compiler};
use crate::compiler::options::CompileOptions;

/*
该命名空间用于编译和运行单个cpp文件
*/

/// 用默认参数编译（参数见 compiler/options.rs，默认 -std=c++14 -O2）。
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
        cmd.arg("-I").arg(dir);
    }

    let output = cmd
        .arg(src)
        .arg("-o")
        .arg(bin)
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

pub fn run_binary(bin: &Path, input: &str) -> Result<String, String> {
    let mut child = create_hidden_command(bin.to_str().unwrap())
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

    // 2. 挂载“抽水机”线程：实时抽干 stdout，防止 64KB 管道阻塞导致假死
    let mut stdout = child.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut buffer = String::new();
        // 这里会一直读，直到子进程结束关闭 stdout
        let _ = stdout.read_to_string(&mut buffer);
        let _ = tx.send(buffer);
    });

    // 3. 核心：死循环检测雷达
    let timeout_duration = Duration::from_secs(2); // 你可以自定义，通常 OJ 是 1 到 2 秒
    let start_time = Instant::now();

    loop {
        // try_wait() 是非阻塞的，瞬间看一眼进程死没死
        match child.try_wait() {
            Ok(Some(_status)) => {
                // 进程乖乖自己结束了，跳出雷达扫描
                break;
            }
            Ok(None) => {
                // 进程还在跑，检查是否超过了容忍极限
                if start_time.elapsed() > timeout_duration {
                    // 发现死循环或超时，直接无情击杀！
                    let _ = child.kill(); 
                    return Err("TLE (Time Limit Exceeded): 运行超时或死循环喵！".to_string());
                }
                // 让当前线程歇一口气，避免把你的 CPU 单核跑满 100%
                thread::sleep(Duration::from_millis(10));
            }
            Err(e) => return Err(format!("等待进程异常: {}", e)),
        }
    }

    // 4. 程序正常结束（在规定时间内），去通道里把抽水机抽好的真实输出拿出来
    let actual_output = rx.recv().unwrap_or_default();
    Ok(actual_output.trim().to_string())
}
