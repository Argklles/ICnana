use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::Mutex;
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::compiler::cpp_gcc::compile_code_with;
use crate::compiler::hidden_cmd::create_hidden_command_path;
use crate::compiler::options::{CompileOptions, CompileSettings};
use crate::utils::ic_fs;

/*
    手动交互控制台。

    给"没有提供交互器"的交互题（Codeforces 一类）用：
    把选手程序跑起来，stdout/stderr 实时推到前端，用户在界面上手敲输入送进 stdin，
    相当于人工扮演交互器。
*/

pub struct Session {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
pub struct InteractionState(pub Mutex<HashMap<String, Session>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InteractionEvent {
    session: String,
    /// stdout / stderr / exit
    kind: String,
    data: String,
}

fn emit(app: &AppHandle, session: &str, kind: &str, data: String) {
    let _ = app.emit(
        "manual-interaction",
        InteractionEvent {
            session: session.to_string(),
            kind: kind.to_string(),
            data,
        },
    );
}

fn spawn_reader<R: Read + Send + 'static>(
    app: AppHandle,
    session: String,
    kind: &'static str,
    mut from: R,
) {
    thread::spawn(move || {
        let mut buf = [0u8; 2048];
        loop {
            match from.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    emit(&app, &session, kind, String::from_utf8_lossy(&buf[..n]).to_string());
                }
                Err(_) => break,
            }
        }

        // stdout 关闭基本等于进程结束：顺手收尸并报告退出码
        if kind == "stdout" {
            let state = app.state::<InteractionState>();
            let removed = {
                let mut map = state.0.lock().unwrap();
                map.remove(&session)
            };
            if let Some(mut session_data) = removed {
                let code = session_data
                    .child
                    .wait()
                    .ok()
                    .and_then(|status| status.code())
                    .unwrap_or(-1);
                emit(&app, &session, "exit", code.to_string());
            }
        }
    });
}

#[tauri::command]
pub fn start_manual_interaction(
    app: AppHandle,
    state: State<'_, InteractionState>,
    session: String,
    filename: String,
    code: String,
    settings: Option<CompileSettings>,
) -> Result<String, String> {
    let stem = filename.trim_end_matches(".cpp").to_string();

    ic_fs::ensure_workspace().map_err(|e| e.to_string())?;
    let src = ic_fs::workspace_cpp(&stem);
    let bin = ic_fs::workspace_bin(&stem);

    std::fs::write(&src, &code).map_err(|e| format!("写入代码失败: {e}"))?;
    compile_code_with(&src, &bin, &CompileOptions::from_settings(settings))
        .map_err(|e| format!("编译失败:\n{e}"))?;

    let mut child = create_hidden_command_path(&bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动程序失败: {e}"))?;

    // 会话 id 由前端生成：这样前端在等 invoke 返回之前就能认领事件，
    // 程序一启动就打印的内容不会因为"会话还没登记"被丢掉。
    let session_id = session;

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");
    let stdin = child.stdin.take().expect("stdin piped");

    {
        let mut map = state.0.lock().unwrap();
        // 同一时间只允许一个手动交互会话，旧的先杀掉，避免两个进程抢同一块控制台
        for (_, mut old) in map.drain() {
            let _ = old.child.kill();
            let _ = old.child.wait();
        }
        map.insert(
            session_id.clone(),
            Session {
                child,
                stdin,
            },
        );
    }

    spawn_reader(app.clone(), session_id.clone(), "stdout", stdout);
    spawn_reader(app.clone(), session_id.clone(), "stderr", stderr);

    Ok(session_id)
}

#[tauri::command]
pub fn send_interaction_input(
    state: State<'_, InteractionState>,
    session: String,
    text: String,
) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    let entry = map.get_mut(&session).ok_or("这次交互已经结束了喵")?;

    let mut payload = text.into_bytes();
    if !payload.ends_with(b"\n") {
        payload.push(b'\n');
    }

    entry
        .stdin
        .write_all(&payload)
        .and_then(|_| entry.stdin.flush())
        .map_err(|e| format!("写入失败，程序可能已经退出: {e}"))
}

#[tauri::command]
pub fn stop_manual_interaction(
    state: State<'_, InteractionState>,
    session: String,
) -> Result<(), String> {
    let removed = {
        let mut map = state.0.lock().unwrap();
        map.remove(&session)
    };

    if let Some(mut session_data) = removed {
        let _ = session_data.child.kill();
        let _ = session_data.child.wait();
    }
    Ok(())
}
