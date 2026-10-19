use std::fs;
use std::path::PathBuf;

/*
该命名空间用于确定文件路径;
*/

pub fn workspace_dir() -> PathBuf {
    // 运行时 cwd 为 src-tauri/，所以 ../workspace 对应项目根下的 workspace/
    PathBuf::from("../workspace")
}

#[tauri::command]
pub fn get_workspace_question(stem: String) -> Result<serde_json::Value, String> {
    let path = workspace_question(&stem);
    if !path.exists() {
        return Err("找不到该题目的元数据喵~".to_string());
    }
    
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    Ok(json)
}

pub fn get_works_dir(strm: &str, filename: &str) -> PathBuf {
    workspace_dir().join(strm).join(filename)
}

pub fn workspace_cpp(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("main.cpp")
}

pub fn workspace_bin(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("main.bin")
}

pub fn workspace_test_cases(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("cases.json")
}

/// 交互题用的交互器源码
pub fn workspace_interactor(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("interactor.cpp")
}

/// 交互器编译产物
pub fn workspace_interactor_bin(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("interactor.bin")
}

/// 交互题自测用的临时测试数据文件（作为交互器的 argv[1]）
pub fn workspace_interactive_input(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("interactive.in")
}

pub fn workspace_question(strm: &str) -> PathBuf {
    workspace_dir().join(strm).join("question.json")
}

/// 确保 workspace 目录存在
pub fn ensure_workspace() -> std::io::Result<()> {
    fs::create_dir_all(workspace_dir())
}

/// 内置默认代码模板（与前端 src/config/constants.ts 的 DEFAULT_TEMPLATE 保持一致）
pub const BUILTIN_TEMPLATE: &str = r#"// 开始编写你的代码喵！！
#include <bits/stdc++.h>
using namespace std;

typedef long long ll;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  return 0;
}"#;

/// 收藏夹 / 自定义集合的索引文件（只存文件夹名的引用）
pub fn collections_path() -> PathBuf {
    workspace_dir().join("collections.json")
}

/// 用户自定义模板的落盘位置。
/// 放在工作区根部且以 . 开头：`list_workspace_files` 只扫目录，不会把它当成题目。
pub fn template_path() -> PathBuf {
    workspace_dir().join(".code_template.cpp")
}

/// 读取用户设置的代码模板；没有配置过就退回内置模板
pub fn load_code_template() -> String {
    match fs::read_to_string(template_path()) {
        Ok(content) if !content.trim().is_empty() => content,
        _ => BUILTIN_TEMPLATE.to_string(),
    }
}

#[tauri::command]
pub fn load_question_html(filename: String) -> Result<String, String> {
    let path = workspace_dir().join(&filename).join("question.html");

    if !path.exists() { return Ok("".to_string())};

    fs::read_to_string(path)
        .map_err(|e| format!("路径读取失败啦，\n 报错：{e}"))
}
//计算html文件路径

#[tauri::command]
pub fn load_question_markdown(filename: String) -> Result<String, String> {
    // 🌟 这里是重点！改成去找 question.md
    let path = workspace_dir().join(&filename).join("question.md");
    
    if !path.exists() {
        return Ok("".to_string()); // 找不到就返回空
    }

    std::fs::read_to_string(path)
        .map_err(|e| format!("读取 Markdown 失败喵: {}", e))
}
//计算mark文件路径