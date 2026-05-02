use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// ==============================================================
// 🗂️ 工作区路径管理：所有临时文件统一放在 workspace/ 子目录
// ==============================================================
fn workspace_dir() -> PathBuf {
    // 运行时 cwd 为 src-tauri/，所以 ../workspace 对应项目根下的 workspace/
    PathBuf::from("../workspace")
}

fn workspace_cpp() -> PathBuf {
    workspace_dir().join("test.cpp")
}

fn workspace_bin() -> PathBuf {
    workspace_dir().join("test.bin")
}

/// 确保 workspace 目录存在
fn ensure_workspace() -> std::io::Result<()> {
    fs::create_dir_all(workspace_dir())
}

// ==============================================================
// 🎯 模块 1：Competitive Companion 数据结构 (10043 雷达专用)
// ==============================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CCTestCase {
    pub input: String,
    pub output: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CCPayload {
    pub name: String,
    pub group: String,
    pub url: String,
    pub time_limit: u64,
    pub memory_limit: u64,
    pub tests: Vec<CCTestCase>,
}

#[derive(Clone)]
struct AppState {
    app_handle: AppHandle,
}

async fn handle_companion(
    State(state): State<AppState>,
    Json(payload): Json<CCPayload>,
) -> axum::http::StatusCode {
    println!("🎉 收到新靶场情报: {} - {}", payload.group, payload.name);

    if let Err(e) = state.app_handle.emit("oj_problem_received", payload) {
        eprintln!("💥 转发给前端失败啦: {}", e);
        return axum::http::StatusCode::INTERNAL_SERVER_ERROR;
    }

    if let Some(window) = state.app_handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    axum::http::StatusCode::OK
}

// ==============================================================
// 🎯 模块 2：原有的 IDE 核心逻辑 (恢复使用简单粗暴的 ../test.cpp)
// ==============================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestCase {
    pub input: String,
    pub output: String,
    pub actual: String,
    pub status: String,
}

#[tauri::command]
fn read_code() -> String {
    match fs::read_to_string(workspace_cpp()) {
        Ok(content) => content,
        Err(_) => String::from("// 开始编写你的代码喵！！\n#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}")
    }
}

#[tauri::command]
fn g_cpp(code: String, input: String) -> String {
    if let Err(e) = ensure_workspace() {
        return format!("创建工作区失败: {}", e);
    }
    fs::write(workspace_cpp(), &code).unwrap();
    let compile = Command::new("g++")
        .arg(workspace_cpp())
        .arg("-o")
        .arg(workspace_bin())
        .output()
        .unwrap();

    if !compile.status.success() {
        return String::from_utf8_lossy(&compile.stderr).to_string();
    }

    let mut child = Command::new(workspace_bin())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }

    let output = child.wait_with_output().unwrap();
    String::from_utf8_lossy(&output.stdout).to_string()
}

#[tauri::command]
async fn judge_all(filename: String, code: String, mut cases: Vec<TestCase>) -> Vec<TestCase> {
    if let Err(e) = ensure_workspace() {
        for case in &mut cases {
            case.status = "error".to_string();
            case.actual = format!("创建工作区失败: {}", e);
        }
        return cases;
    }
    let src = workspace_dir().join(&filename);
    let bin_name = filename.trim_end_matches(".cpp").to_string() + ".bin";
    let bin = workspace_dir().join(&bin_name);
    fs::write(&src, &code).unwrap();
    let compile = Command::new("g++")
        .arg(&src)
        .arg("-o")
        .arg(&bin)
        .output()
        .unwrap();

    if !compile.status.success() {
        let err = String::from_utf8_lossy(&compile.stderr).to_string();
        for case in &mut cases {
            case.status = "error".to_string();
            case.actual = err.clone();
        }
        return cases;
    }

    for case in &mut cases {
        let child_process = Command::new(&bin)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn();

        let mut child = match child_process {
            Ok(c) => c,
            Err(_) => {
                case.status = "error".to_string();
                case.actual = "启动失败".to_string();
                continue;
            }
        };

        if let Some(mut stdin) = child.stdin.take() {
            let input_with_newline = format!("{}\n", case.input);
            let _ = stdin.write_all(input_with_newline.as_bytes());
        }

        if let Ok(output) = child.wait_with_output() {
            let actual_out = String::from_utf8_lossy(&output.stdout).trim().to_string();
            case.actual = actual_out.clone();

            if actual_out == case.output.trim() {
                case.status = "ac".to_string();
            } else {
                case.status = "wa".to_string();
            }
        } else {
            case.status = "error".to_string();
            case.actual = "读取超时".to_string();
        }
    }
    cases
}

#[tauri::command]
async fn check_syntax(filename: String, code: String) -> String {
    if ensure_workspace().is_err() {
        return String::new();
    }
    let src = workspace_dir().join(&filename);
    let _ = fs::write(&src, &code);
    let output = Command::new("g++")
        .arg("-fsyntax-only")
        .arg("-Wall")
        .arg(&src)
        .output()
        .unwrap();

    if output.status.success() {
        String::new()
    } else {
        String::from_utf8_lossy(&output.stderr).to_string()
    }
}

// ==============================================================
// 🎯 模块 2.5：工作区文件管理
// ==============================================================
#[tauri::command]
fn list_workspace_files() -> Vec<String> {
    let _ = ensure_workspace();
    let dir = workspace_dir();
    let mut files: Vec<String> = vec![];
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("cpp") {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    files.push(name.to_string());
                }
            }
        }
    }
    files.sort();
    if files.is_empty() {
        let default = "solution.cpp";
        let template = "// 开始编写你的代码喵！！\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}";
        let _ = fs::write(dir.join(default), template);
        files.push(default.to_string());
    }
    files
}

#[tauri::command]
fn load_workspace_file(filename: String) -> String {
    fs::read_to_string(workspace_dir().join(&filename)).unwrap_or_default()
}

#[tauri::command]
fn save_workspace_file(filename: String, code: String) -> Result<(), String> {
    ensure_workspace().map_err(|e| e.to_string())?;
    fs::write(workspace_dir().join(&filename), code).map_err(|e| e.to_string())
}

#[tauri::command]
fn new_workspace_file(filename: String, template: Option<String>) -> Result<String, String> {
    ensure_workspace().map_err(|e| e.to_string())?;
    let name = if filename.ends_with(".cpp") {
        filename
    } else {
        format!("{}.cpp", filename)
    };
    let path = workspace_dir().join(&name);
    if path.exists() {
        return Err(format!("文件 {} 已存在喵~", name));
    }
    let default_template = "// 开始编写你的代码喵！！\n#include <bits/stdc++.h>\n\nint main() {\n  std::ios::sync_with_stdio(false);\n  std::cin.tie(nullptr);\n\n  return 0;\n}";
    let content = template.unwrap_or_else(|| default_template.to_string());
    fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(name)
}

#[tauri::command]
fn delete_workspace_file(filename: String) -> Result<(), String> {
    fs::remove_file(workspace_dir().join(&filename)).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_workspace_file(old_name: String, new_name: String) -> Result<String, String> {
    let new_name = if new_name.ends_with(".cpp") {
        new_name
    } else {
        format!("{}.cpp", new_name)
    };
    let old_path = workspace_dir().join(&old_name);
    let new_path = workspace_dir().join(&new_name);
    if new_path.exists() {
        return Err(format!("文件 {} 已存在喵~", new_name));
    }
    fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
    Ok(new_name)
}

// ==============================================================
// 🎯 模块 3：浏览器控制与爬虫
// ==============================================================
#[tauri::command]
async fn open_oj_browser(
    app: tauri::AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) {
    let safe_url = if url.starts_with("http") {
        url.clone()
    } else {
        format!("https://{}", url)
    };

    if let Some(window) = app.get_webview_window("oj_browser") {
        // 使用 navigate() 而不是 eval，避免被站点 CSP 拦截
        if let Ok(parsed) = safe_url.parse::<url::Url>() {
            let _ = window.navigate(parsed);
        }
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = window.set_focus();
        return;
    }

    let app_clone = app.clone();
    let fake_user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

    let window = WebviewWindowBuilder::new(
        &app,
        "oj_browser",
        WebviewUrl::External(safe_url.parse().unwrap()),
    )
    .title("OJ 浏览器")
    .decorations(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .user_agent(fake_user_agent)
    .data_directory(std::path::PathBuf::from(".oj_cookies"))
    .initialization_script(r#"
        // 将所有 target="_blank" 链接改为在当前窗口内跳转，避免新窗口无法打开
        window.addEventListener('click', function(e) {
            var el = e.target;
            while (el && el.tagName !== 'A') el = el.parentElement;
            if (el && el.href && (el.target === '_blank' || el.target === '_new' || el.target === '_top')) {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = el.href;
            }
        }, true);
    "#)
    .on_navigation(move |url| {
        let _ = app_clone.emit("oj_url_changed", url.as_str());
        if let Some(hash) = url.fragment() {
            if hash.starts_with("ICNANA_SYNC:") {
                let encoded_data = &hash;
                if let Ok(decoded) = urlencoding::decode(encoded_data) {
                    if let Ok(payload) = serde_json::from_str::<CCPayload>(&decoded) {
                        let _ = app_clone.emit("oj_problem_received", payload);
                        if let Some(main_win) = app_clone.get_webview_window("main") {
                            let _ = main_win.show();
                            let _ = main_win.set_focus();
                        }
                    }
                }
            }
        }
        true
    })
    .build()
    .unwrap();

    let _ = window.set_position(tauri::LogicalPosition::new(x, y));
    let _ = window.set_size(tauri::LogicalSize::new(width, height));
}

#[tauri::command]
async fn update_oj_bounds(app: tauri::AppHandle, x: f64, y: f64, width: f64, height: f64) {
    if let Some(window) = app.get_webview_window("oj_browser") {
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
    }
}

#[tauri::command]
fn open_in_system_browser(url: String) {
    #[cfg(target_os = "linux")]
    let _ = Command::new("xdg-open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let _ = Command::new("cmd").args(["/c", "start", "", &url]).spawn();
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(&url).spawn();
}

#[tauri::command]
fn oj_browser_back(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("oj_browser") {
        let _ = window.eval("history.back()");
    }
}

#[tauri::command]
fn extract_builtin(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("oj_browser") {
        let script = r#"
            (function() {
                function sendData(inputs, outputs) {
                    let tests = inputs.map((inp, idx) => ({
                        input: inp.trim(),
                        output: (outputs[idx] || "").trim()
                    }));
                    let payload = {
                        name: document.title,
                        group: window.location.hostname,
                        url: window.location.href,
                        timeLimit: 1000,
                        memoryLimit: 256,
                        tests: tests
                    };
                    window.location.hash = "ICNANA_SYNC:" + encodeURIComponent(JSON.stringify(payload));
                }

                // 🌟 洛谷底层 API 截获
                if (window.location.hostname.includes("luogu.com.cn")) {
                    let cleanUrl = window.location.href.split('#')[0].split('?')[0];
                    if (cleanUrl.includes("/problem/")) {
                        fetch(cleanUrl + "?_contentOnly=1", {
                            headers: { "x-luogu-type": "content-only" }
                        })
                        .then(res => res.json())
                        .then(data => {
                            let samples = data.currentData.problem.samples;
                            if (!samples && data.currentData.problem.core) {
                                samples = data.currentData.problem.core.samples;
                            }
                            if (samples && samples.length > 0) {
                                sendData(samples.map(s => s[0]), samples.map(s => s[1]));
                            } else {
                                alert("洛谷说这道题没有公开样例数据喵~");
                            }
                        })
                        .catch(err => alert("抓取洛谷 API 失败啦喵: " + err));
                        return;
                    }
                }

                // 🌟 Vjudge 及其他 OJ DOM 雷达
                let attempts = 0;
                const timer = setInterval(() => {
                    attempts++;
                    let inputs = []; let outputs = [];
                    let targetDoc = document;
                    const iframe = document.getElementById('frame-description');
                    if (iframe && iframe.contentDocument) targetDoc = iframe.contentDocument;

                    let cfInputs = targetDoc.querySelectorAll('.input pre, .io-style .input pre, pre.sample-test-input');
                    let cfOutputs = targetDoc.querySelectorAll('.output pre, .io-style .output pre, pre.sample-test-output');
                    if (cfInputs.length > 0 && cfOutputs.length > 0) {
                        inputs = Array.from(cfInputs).map(e => e.innerText);
                        outputs = Array.from(cfOutputs).map(e => e.innerText);
                    }

                    if (inputs.length === 0) {
                        const tags = Array.from(targetDoc.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, .panel_title, p.pst, dt'));
                        tags.forEach(tag => {
                            const text = tag.innerText.trim().toLowerCase();
                            const isInput = text.includes('输入样例') || text.includes('sample input') || text.includes('输入 #') || text.includes('样例输入');
                            const isOutput = text.includes('输出样例') || text.includes('sample output') || text.includes('输出 #') || text.includes('样例输出');

                            if (isInput || isOutput) {
                                let next = tag.nextElementSibling || (tag.parentElement ? tag.parentElement.nextElementSibling : null);
                                let pre = null;
                                for(let i = 0; i < 8 && next; i++) {
                                    if (next.tagName === 'PRE') { pre = next; break; }
                                    if (next.querySelector('pre')) { pre = next.querySelector('pre'); break; }
                                    if (next.tagName === 'DIV' && next.querySelector('code')) { pre = next.querySelector('code'); break; }
                                    next = next.nextElementSibling;
                                }
                                if (pre) {
                                    let content = pre.innerText.replace(/复制$/, '').replace(/^\s*\n/, '').trim();
                                    if (isInput && !inputs.includes(content)) inputs.push(content);
                                    if (isOutput && !outputs.includes(content)) outputs.push(content);
                                }
                            }
                        });
                    }

                    if (inputs.length === 0) {
                        let pres = Array.from(targetDoc.querySelectorAll('pre'));
                        pres = pres.filter(p => !p.innerText.includes('#include') && !p.innerText.includes('import java'));
                        if (pres.length > 0 && pres.length % 2 === 0) {
                            for(let i = 0; i < pres.length; i += 2) {
                                inputs.push(pres[i].innerText);
                                outputs.push(pres[i+1].innerText);
                            }
                        }
                    }

                    if (inputs.length > 0) {
                        clearInterval(timer);
                        sendData(inputs, outputs);
                    } else if (attempts >= 6) {
                        clearInterval(timer);
                        alert('雷达扫了 3 秒还是没找到喵... QAQ\n\n请确保你是在具体的题目页面哦！');
                    }
                }, 500); 
            })();
        "#;
        let _ = window.eval(script);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state = AppState { app_handle };

            tauri::async_runtime::spawn(async move {
                let router = Router::new()
                    .route("/", post(handle_companion))
                    .with_state(state);

                let listener = tokio::net::TcpListener::bind("127.0.0.1:10043")
                    .await
                    .unwrap();
                println!("📡 ICnana 实验室雷达启动！正在监听 10043 端口...");
                axum::serve(listener, router).await.unwrap();
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            g_cpp,
            read_code,
            judge_all,
            open_oj_browser,
            update_oj_bounds,
            check_syntax,
            extract_builtin,
            list_workspace_files,
            load_workspace_file,
            save_workspace_file,
            new_workspace_file,
            delete_workspace_file,
            rename_workspace_file,
            open_in_system_browser,
            oj_browser_back
        ])
        .run(tauri::generate_context!())
        .expect("运行失败喵");
}
