use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, ChildStdout, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::compiler::hidden_cmd::create_hidden_command;

/*
    交互题自测。

    两种交互器都支持：

    ① 普通交互器（自己往 stdout 写、从 stdin 读）
         argv[1] = 测试数据文件
         交互器 stdout → 选手 stdin，选手 stdout → 交互器 stdin

    ② testlib 交互器（`#include "testlib.h"` + `registerInteraction`）
         testlib 的约定是：
             argv[1] = 输入文件
             argv[2] = 输出文件（`tout`），交互器往这里写给选手的信息
             stdin   = 选手的输出（`ouf`）
         所以这里会把 argv[2] 换成一个命名管道（Windows 上退化成"边写边读"的文件），
         再把管道里的内容接到选手的 stdin。

    退出码 0 判通过，非 0 判失败，stderr / 交互流水都会带回去。
*/

pub struct InteractiveOutcome {
    pub status: String,
    pub message: String,
    pub transcript: String,
}

/// 记录的双向流水上限，防止死循环刷屏把内存吃满
const MAX_TRANSCRIPT: usize = 24_000;

fn outcome(status: &str, message: String, transcript: &Arc<Mutex<String>>) -> InteractiveOutcome {
    let text = transcript.lock().map(|t| t.clone()).unwrap_or_default();
    InteractiveOutcome {
        status: status.to_string(),
        message,
        transcript: text,
    }
}

fn append(transcript: &Arc<Mutex<String>>, tag: &str, chunk: &[u8]) {
    let Ok(mut guard) = transcript.lock() else { return };
    if guard.len() >= MAX_TRANSCRIPT {
        return;
    }

    let text = String::from_utf8_lossy(chunk);
    let remain = MAX_TRANSCRIPT - guard.len();
    let piece: String = text.chars().take(remain).collect();

    guard.push_str(tag);
    guard.push_str(&piece);
    if !piece.ends_with('\n') {
        guard.push('\n');
    }
}

fn write_to_solution(writer: &Arc<Mutex<ChildStdin>>, chunk: &[u8]) -> bool {
    let Ok(mut stdin) = writer.lock() else { return false };
    if stdin.write_all(chunk).is_err() {
        return false;
    }
    let _ = stdin.flush();
    true
}

/// 把交互器的 stdout 搬运到选手的 stdin
fn pump_stdout(
    mut from: ChildStdout,
    writer: Arc<Mutex<ChildStdin>>,
    transcript: Arc<Mutex<String>>,
    tag: &'static str,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match from.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    append(&transcript, tag, &buf[..n]);
                    if !write_to_solution(&writer, &buf[..n]) {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    })
}

/// 把选手的 stdout 搬运到交互器的 stdin
fn pump_solution_output(
    mut from: ChildStdout,
    mut to: ChildStdin,
    transcript: Arc<Mutex<String>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match from.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    append(&transcript, "[选手→交互器] ", &buf[..n]);
                    if to.write_all(&buf[..n]).is_err() {
                        break;
                    }
                    let _ = to.flush();
                }
                Err(_) => break,
            }
        }
        // drop(to) 让对方读到 EOF
    })
}

fn drain<R: Read + Send + 'static>(
    mut from: R,
    sink: Arc<Mutex<String>>,
    tag: &'static str,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match from.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(mut guard) = sink.lock() {
                        if guard.len() < MAX_TRANSCRIPT {
                            guard.push_str(tag);
                            guard.push_str(&String::from_utf8_lossy(&buf[..n]));
                        }
                    }
                }
                Err(_) => break,
            }
        }
    })
}

// ───────────────────── testlib 的 argv[2] 通道 ─────────────────────

enum Channel {
    /// Unix 命名管道：写多少读多少，天然流式
    Fifo(PathBuf),
    /// Windows 没有 FIFO，用文件 + 轮询追读
    TailFile(PathBuf),
}

impl Channel {
    fn path(&self) -> &Path {
        match self {
            Channel::Fifo(p) | Channel::TailFile(p) => p,
        }
    }

    fn create(dir: &Path) -> Channel {
        #[cfg(unix)]
        {
            let fifo = dir.join("icnana_interaction.fifo");
            let _ = fs::remove_file(&fifo);
            let ok = std::process::Command::new("mkfifo")
                .arg(&fifo)
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if ok {
                return Channel::Fifo(fifo);
            }
        }

        let file = dir.join("icnana_interaction.out");
        let _ = fs::File::create(&file);
        Channel::TailFile(file)
    }

    fn cleanup(&self) {
        let _ = fs::remove_file(self.path());
    }
}

/// 从 FIFO 读，喂给选手 stdin
fn feed_fifo(path: PathBuf, writer: Arc<Mutex<ChildStdin>>, transcript: Arc<Mutex<String>>) {
    thread::spawn(move || {
        // open 会阻塞，直到交互器那边以写方式打开 argv[2]
        let Ok(mut file) = fs::File::open(&path) else { return };
        let mut buf = [0u8; 4096];
        loop {
            match file.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    append(&transcript, "[交互器→选手] ", &buf[..n]);
                    if !write_to_solution(&writer, &buf[..n]) {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });
}

/// 追读文件（Windows 的退化方案）
fn feed_tail(path: PathBuf, writer: Arc<Mutex<ChildStdin>>, transcript: Arc<Mutex<String>>) {
    thread::spawn(move || {
        use std::io::{Seek, SeekFrom};

        let mut offset: u64 = 0;
        let deadline = Instant::now() + Duration::from_secs(120);

        while Instant::now() < deadline {
            if let Ok(mut file) = fs::File::open(&path) {
                if file.seek(SeekFrom::Start(offset)).is_ok() {
                    let mut buf = Vec::new();
                    if let Ok(n) = file.read_to_end(&mut buf) {
                        if n > 0 {
                            offset += n as u64;
                            append(&transcript, "[交互器→选手] ", &buf);
                            if !write_to_solution(&writer, &buf) {
                                break;
                            }
                        }
                    }
                }
            }
            thread::sleep(Duration::from_millis(5));
        }
    });
}

pub fn run_interactive(
    solution: &Path,
    interactor: &Path,
    input_file: &Path,
    timeout: Duration,
    testlib_mode: bool,
) -> InteractiveOutcome {
    let runtime_dir = input_file.parent().unwrap_or_else(|| Path::new("."));
    let channel = if testlib_mode {
        Some(Channel::create(runtime_dir))
    } else {
        None
    };

    let mut inter_cmd = create_hidden_command(interactor.to_str().unwrap_or_default());
    inter_cmd.arg(input_file);
    if let Some(ch) = &channel {
        inter_cmd.arg(ch.path());
    }

    let mut inter = match inter_cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            if let Some(ch) = &channel {
                ch.cleanup();
            }
            return InteractiveOutcome {
                status: "error".to_string(),
                message: format!("无法启动交互器: {e}"),
                transcript: String::new(),
            };
        }
    };

    let mut sol = match create_hidden_command(solution.to_str().unwrap_or_default())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            let _ = inter.kill();
            if let Some(ch) = &channel {
                ch.cleanup();
            }
            return InteractiveOutcome {
                status: "error".to_string(),
                message: format!("无法启动选手程序: {e}"),
                transcript: String::new(),
            };
        }
    };

    let inter_out = inter.stdout.take().expect("stdout piped");
    let inter_in = inter.stdin.take().expect("stdin piped");
    let inter_err = inter.stderr.take().expect("stderr piped");
    let sol_out = sol.stdout.take().expect("stdout piped");
    let sol_in = sol.stdin.take().expect("stdin piped");
    let sol_err = sol.stderr.take().expect("stderr piped");

    let transcript: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let inter_err_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let inter_log_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let sol_err_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));

    let writer: Arc<Mutex<ChildStdin>> = Arc::new(Mutex::new(sol_in));

    // 选手输出 → 交互器 stdin（两种模式都要）
    let sol_pump = pump_solution_output(sol_out, inter_in, transcript.clone());

    // 交互器输出 → 选手 stdin
    // testlib 模式下走 argv[2] 通道，它的 stdout 只剩日志/判定信息，收起来展示
    let mut inter_log = None;
    let feed = match &channel {
        Some(Channel::Fifo(path)) => {
            feed_fifo(path.clone(), writer.clone(), transcript.clone());
            inter_log = Some(drain(inter_out, inter_log_buf.clone(), "[交互器输出] "));
            None // 这条线程会在交互器开管道前阻塞，不 join
        }
        Some(Channel::TailFile(path)) => {
            feed_tail(path.clone(), writer.clone(), transcript.clone());
            inter_log = Some(drain(inter_out, inter_log_buf.clone(), "[交互器输出] "));
            None
        }
        None => Some(pump_stdout(inter_out, writer.clone(), transcript.clone(), "[交互器→选手] ")),
    };

    let inter_err_thread = drain(inter_err, inter_err_buf.clone(), "[交互器 stderr] ");
    let sol_err_thread = drain(sol_err, sol_err_buf.clone(), "[选手 stderr] ");

    let deadline = Instant::now() + timeout;
    let mut inter_status = None;
    let mut sol_status = None;
    let mut timed_out = false;

    while inter_status.is_none() || sol_status.is_none() {
        if Instant::now() > deadline {
            timed_out = true;
            let _ = inter.kill();
            let _ = sol.kill();
            break;
        }

        if inter_status.is_none() {
            inter_status = inter.try_wait().ok().flatten();
        }
        if sol_status.is_none() {
            sol_status = sol.try_wait().ok().flatten();
        }
        thread::sleep(Duration::from_millis(5));
    }

    let _ = inter.wait();
    let _ = sol.wait();

    if let Some(handle) = feed {
        let _ = handle.join();
    }
    let _ = sol_pump.join();
    let _ = inter_err_thread.join();
    let _ = sol_err_thread.join();
    if let Some(handle) = inter_log {
        let _ = handle.join();
    }
    thread::sleep(Duration::from_millis(30)); // 让最后几段流水落袋

    if let Some(ch) = &channel {
        ch.cleanup();
    }

    if timed_out {
        return outcome("tle", format!("交互超时（超过 {} ms）", timeout.as_millis()), &transcript);
    }

    let inter_ok = inter_status.map(|s| s.success()).unwrap_or(false);
    let sol_ok = sol_status.map(|s| s.success()).unwrap_or(false);
    let inter_code = inter_status.and_then(|s| s.code()).unwrap_or(-1);
    let sol_code = sol_status.and_then(|s| s.code()).unwrap_or(-1);

    let inter_err_text = inter_err_buf.lock().map(|s| s.trim().to_string()).unwrap_or_default();
    let sol_err_text = sol_err_buf.lock().map(|s| s.trim().to_string()).unwrap_or_default();

    if inter_ok && sol_ok {
        return outcome("ac", "交互器判定通过 ✅".to_string(), &transcript);
    }

    if !sol_ok {
        let mut message = format!("选手程序异常退出（退出码 {sol_code}）");
        if !sol_err_text.is_empty() {
            message.push('\n');
            message.push_str(&sol_err_text);
        }
        return outcome("re", message, &transcript);
    }

    let inter_log_text = inter_log_buf
        .lock()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    // testlib 的 quitf 信息写在 stdout，普通交互器写在 stderr，两边都兜一下
    let mut message = if !inter_err_text.is_empty() {
        inter_err_text
    } else if !inter_log_text.is_empty() {
        inter_log_text
    } else {
        format!("交互器判定失败（退出码 {inter_code}）")
    };
    if !sol_err_text.is_empty() {
        message.push_str("\n选手 stderr: ");
        message.push_str(&sol_err_text);
    }

    outcome("wa", message, &transcript)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn have_gpp() -> bool {
        Command::new("g++")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn compile(src: &Path, bin: &Path, includes: &[PathBuf]) {
        let mut cmd = Command::new("g++");
        cmd.arg("-std=c++14").arg("-O2").arg("-o").arg(bin).arg(src);
        for dir in includes {
            cmd.arg("-I").arg(dir);
        }
        let status = cmd.status().expect("g++ 跑不起来");
        assert!(status.success(), "编译失败: {}", src.display());
    }

    fn dir() -> PathBuf {
        let p = std::env::temp_dir().join(format!("icnana-interactive-{}", std::process::id()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn testlib_dir() -> Option<PathBuf> {
        let p = PathBuf::from("resources/testlib");
        if p.join("testlib.h").exists() { Some(p) } else { None }
    }

    #[test]
    fn interactive_ac_and_wa() {
        if !have_gpp() {
            eprintln!("跳过：没有 g++");
            return;
        }

        let base = dir();
        let inter_src = base.join("interactor.cpp");
        let sol_src = base.join("solution.cpp");
        let inter_bin = base.join("interactor.bin");
        let sol_bin = base.join("solution.bin");
        let input = base.join("interactive.in");

        fs::write(
            &inter_src,
            r#"
#include <bits/stdc++.h>
int main(int argc, char** argv) {
    std::ifstream fin(argv[1]);
    int answer; fin >> answer;
    int guess;
    for (int i = 0; i < 10; i++) {
        if (!(std::cin >> guess)) { std::cerr << "选手没有输出" << std::endl; return 1; }
        if (guess == answer) { std::cout << 1 << std::endl; std::cout.flush(); return 0; }
        std::cout << (guess < answer ? 2 : 3) << std::endl;
        std::cout.flush();
    }
    std::cerr << "猜太多次了" << std::endl;
    return 1;
}
"#,
        )
        .unwrap();

        fs::write(
            &sol_src,
            r#"
#include <bits/stdc++.h>
int main() {
    int lo = 1, hi = 100, mid, resp;
    while (lo <= hi) {
        mid = (lo + hi) / 2;
        std::cout << mid << std::endl;
        if (!(std::cin >> resp)) return 1;
        if (resp == 1) return 0;
        if (resp == 2) lo = mid + 1; else hi = mid - 1;
    }
    return 0;
}
"#,
        )
        .unwrap();

        fs::write(&input, "42\n").unwrap();
        compile(&inter_src, &inter_bin, &[]);
        compile(&sol_src, &sol_bin, &[]);

        let ok = run_interactive(&sol_bin, &inter_bin, &input, Duration::from_secs(5), false);
        assert_eq!(ok.status, "ac", "message={} transcript={}", ok.message, ok.transcript);
        assert!(ok.transcript.contains("[交互器→选手]"), "流水没记录到: {}", ok.transcript);

        fs::write(
            &sol_src,
            "#include <bits/stdc++.h>\nint main(){ int resp; for(int i=1;i<=100;i++){ std::cout<<i<<std::endl; if(!(std::cin>>resp)) return 1; if(resp==1) return 0; } return 1; }\n",
        )
        .unwrap();
        compile(&sol_src, &sol_bin, &[]);

        let bad = run_interactive(&sol_bin, &inter_bin, &input, Duration::from_secs(5), false);
        assert_ne!(bad.status, "ac", "不该判通过: {}", bad.message);
    }

    #[test]
    fn tle_when_solution_never_answers() {
        if !have_gpp() {
            eprintln!("跳过：没有 g++");
            return;
        }

        let base = dir();
        let inter_src = base.join("interactor2.cpp");
        let sol_src = base.join("solution2.cpp");
        let inter_bin = base.join("interactor2.bin");
        let sol_bin = base.join("solution2.bin");
        let input = base.join("interactive2.in");

        fs::write(
            &inter_src,
            "#include <bits/stdc++.h>\nint main(int argc, char** argv) {\n    int x; std::cin >> x; std::cout << 1 << std::endl; return 0;\n}\n",
        )
        .unwrap();
        fs::write(&sol_src, "#include <bits/stdc++.h>\nint main() { while (true) {} }\n").unwrap();
        fs::write(&input, "1\n").unwrap();

        compile(&inter_src, &inter_bin, &[]);
        compile(&sol_src, &sol_bin, &[]);

        let r = run_interactive(&sol_bin, &inter_bin, &input, Duration::from_millis(800), false);
        assert_eq!(r.status, "tle", "message={}", r.message);
    }

    /// testlib 交互器：argv[2] 被换成命名管道后，必须能和选手正常对话
    #[test]
    fn testlib_interactor_works() {
        if !have_gpp() {
            eprintln!("跳过：没有 g++");
            return;
        }
        let Some(lib) = testlib_dir() else {
            eprintln!("跳过：没有 resources/testlib/testlib.h");
            return;
        };

        let base = dir();
        let inter_src = base.join("testlib_interactor.cpp");
        let sol_src = base.join("testlib_solution.cpp");
        let inter_bin = base.join("testlib_interactor.bin");
        let sol_bin = base.join("testlib_solution.bin");
        let input = base.join("testlib.in");

        fs::write(
            &inter_src,
            r#"
#include "testlib.h"
int main(int argc, char** argv) {
    registerInteraction(argc, argv);
    int answer = inf.readInt();
    tout << 1 << std::endl;          // 告诉选手可以开始
    int guess = ouf.readInt();
    if (guess == answer) quitf(_ok, "correct");
    quitf(_wa, "wrong answer");
}
"#,
        )
        .unwrap();

        fs::write(
            &sol_src,
            "#include <bits/stdc++.h>\nint main(){ int p; std::cin >> p; std::cout << 42 << std::endl; return 0; }\n",
        )
        .unwrap();

        fs::write(&input, "42\n").unwrap();
        compile(&inter_src, &inter_bin, std::slice::from_ref(&lib));
        compile(&sol_src, &sol_bin, &[]);

        let ok = run_interactive(&sol_bin, &inter_bin, &input, Duration::from_secs(5), true);
        assert_eq!(ok.status, "ac", "message={} transcript={}", ok.message, ok.transcript);

        // 换成错误答案：交互器 quitf(_wa)，应判失败
        fs::write(
            &sol_src,
            "#include <bits/stdc++.h>\nint main(){ int p; std::cin >> p; std::cout << 41 << std::endl; return 0; }\n",
        )
        .unwrap();
        compile(&sol_src, &sol_bin, &[]);

        let bad = run_interactive(&sol_bin, &inter_bin, &input, Duration::from_secs(5), true);
        assert_ne!(bad.status, "ac", "不该判通过: {}", bad.message);
    }
}
