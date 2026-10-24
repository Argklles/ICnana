use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/*
该命名空间用于确定文件路径。

工作区根目录不再依赖 cwd：
应用启动时由 lib.rs 把系统数据目录（Windows: %APPDATA%\com.icnana，
Linux: ~/.local/share/com.icnana，macOS: ~/Library/Application Support/com.icnana）
写进 WORKSPACE_ROOT，之后所有路径都以它为基准。

没有初始化时（比如单元测试直接调用）回退到旧的相对路径，保证测试和老调用点不炸。
*/

static WORKSPACE_ROOT: OnceLock<PathBuf> = OnceLock::new();

/// 由应用启动流程调用一次，固定工作区根目录
pub fn init_workspace_root(dir: PathBuf) {
    let _ = WORKSPACE_ROOT.set(dir);
}

pub fn workspace_dir() -> PathBuf {
    if let Some(dir) = WORKSPACE_ROOT.get() {
        return dir.clone();
    }
    // 兜底：未初始化的场景（测试、单独跑某个命令）
    PathBuf::from("../workspace")
}

fn copy_dir_all(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if src.is_dir() {
            copy_dir_all(&src, &dst)?;
        } else {
            fs::copy(&src, &dst)?;
        }
    }
    Ok(())
}

/// 一次性迁移：把老版本留在 cwd 旁边的 `../workspace` 搬到新的数据目录。
/// 只有目标目录为空时才搬，避免覆盖用户已经在新目录里的数据。
pub fn migrate_legacy_workspace(target: &Path) -> Option<usize> {
    migrate_from(Path::new("../workspace"), target)
}

/// 把 `source` 里的内容搬到 `target`（target 为空时才搬）。
/// 用于：老版本的工作区迁移、以及「从 app data 切到绿色模式」时的一次性搬家。
pub fn migrate_from(source: &Path, target: &Path) -> Option<usize> {
    let legacy = source.to_path_buf();
    if !legacy.is_dir() {
        return None;
    }
    if legacy == target {
        return None;
    }

    // 目标目录已经有东西就不动
    let has_content = target
        .read_dir()
        .map(|mut it| it.next().is_some())
        .unwrap_or(false);
    if has_content {
        return None;
    }

    copy_dir_all(&legacy, target).ok()?;

    // 数一下搬了多少个题目文件夹，方便在日志里报一句
    let count = fs::read_dir(target)
        .map(|it| it.flatten().filter(|e| e.path().is_dir()).count())
        .unwrap_or(0);
    Some(count)
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