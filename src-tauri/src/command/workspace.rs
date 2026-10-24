use std::fs;
use std::path::Path;

use crate::command::collections;
use crate::oj::models::{detect_oj, WorkspaceFile};
use crate::utils::ic_fs;
/*
该命名空间与工作区的文件管理相关
*/

/// 读取单个题目目录的展示信息。
/// question.json 缺失或字段不全时全部走兜底，不让侧边栏因为一道题的元数据坏掉而整个空掉。
/// 工作区扫描缓存：每个题目存一份 question.json 的 mtime + 摘要字段。
/// 题目多了以后，每次启动读几百个 question.json 很慢；有这个索引就只在
/// question.json 变过时才重读（收藏状态仍然实时读 collections.json）。
#[derive(Default, serde::Serialize, serde::Deserialize)]
struct WsIndex {
    version: u32,
    entries: std::collections::HashMap<String, WsIndexEntry>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct WsIndexEntry {
    /// question.json 的 mtime（纳秒），变了就失效
    mtime: u128,
    url: String,
    name: String,
    oj: String,
}

fn load_index(dir: &Path) -> WsIndex {
    fs::read_to_string(dir.join(".wsindex.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_index(dir: &Path, index: &WsIndex) {
    if let Ok(text) = serde_json::to_string(index) {
        let _ = fs::write(dir.join(".wsindex.json"), text);
    }
}

fn file_mtime_nanos(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

fn read_workspace_entry(
    stem: &str,
    dir: &Path,
    favorites: &std::collections::HashSet<String>,
    index: &mut WsIndex,
) -> WorkspaceFile {
    let qjson = dir.join("question.json");
    let qjson_mtime = file_mtime_nanos(&qjson);

    // 缓存命中：question.json 没变过，直接用索引里的摘要
    let (url, name, oj) = match index.entries.get(stem) {
        Some(entry) if entry.mtime == qjson_mtime && qjson_mtime > 0 => {
            (entry.url.clone(), entry.name.clone(), entry.oj.clone())
        }
        _ => {
            let meta_value: serde_json::Value = fs::read_to_string(&qjson)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(serde_json::Value::Null);

            let url = meta_value["url"].as_str().unwrap_or("").to_string();
            let name = meta_value["name"]
                .as_str()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or(stem)
                .to_string();

            // 老存档没有 oj 字段 → 按 url 现场推断，保证升级后也能自动归类
            let oj = meta_value["oj"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or_else(|| detect_oj(&url));

            index.entries.insert(
                stem.to_string(),
                WsIndexEntry { mtime: qjson_mtime, url: url.clone(), name: name.clone(), oj: oj.clone() },
            );

            (url, name, oj)
        }
    };

    // 收藏状态以 collections.json 为准（旧存档里的 favorite 字段只在首次迁移时读一次）
    let favorite = favorites.contains(stem);

    WorkspaceFile {
        stem: stem.to_string(),
        name,
        url,
        oj,
        favorite,
    }
}

/// 分组顺序：洛谷 → Codeforces → AtCoder → 其他
fn oj_rank(oj: &str) -> u8 {
    match oj {
        "luogu" => 0,
        "codeforces" => 1,
        "atcoder" => 2,
        _ => 3,
    }
}

#[tauri::command]
pub fn list_workspace_files() -> Vec<WorkspaceFile> {
    let _ = ic_fs::ensure_workspace();
    let dir = ic_fs::workspace_dir();
    let favorites = collections::favorite_stems();
    let mut index = load_index(&dir);
    let mut files: Vec<WorkspaceFile> = vec![];

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            // 现在检查的是“是否为文件夹”
            if !path.is_dir() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            // 排除隐藏文件夹（比如以 . 开头的）
            if name.starts_with('.') {
                continue;
            }
            files.push(read_workspace_entry(name, &path, &favorites, &mut index));
        }
    }

    // 老用户升级：把已有题目按 OJ 补进集合（只做一次）
    let pairs: Vec<(String, String)> = files
        .iter()
        .map(|f| (f.stem.clone(), f.oj.clone()))
        .collect();
    collections::backfill_oj(&pairs);

    // 如果是空的，创建一个默认题目文件夹和代码
    if files.is_empty() {
        let default_stem = "solution";
        // 利用已经写好的 new_workspace_file 来初始化，保证逻辑统一
        let _ = new_workspace_file(default_stem.to_string(), None);
        files.push(WorkspaceFile {
            stem: default_stem.to_string(),
            name: default_stem.to_string(),
            url: String::new(),
            oj: "other".to_string(),
            favorite: false,
        });
    }

    // 把本次扫描的索引写回（.wsindex.json 在 workspace 根，隐藏文件不会被扫描）
    save_index(&dir, &index);

    // 收藏优先，其次按 OJ 分组序，最后按名字
    files.sort_by(|a, b| {
        b.favorite
            .cmp(&a.favorite)
            .then_with(|| oj_rank(&a.oj).cmp(&oj_rank(&b.oj)))
            .then_with(|| a.stem.cmp(&b.stem))
    });

    files
}
//文件列表

#[tauri::command]
pub fn load_workspace_file(filename: String) -> String {
    // 1. 提取 stem (以防前端传的是带后缀的名字)
    let p = Path::new(&filename);
    let stem = p.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&filename);

    // 2. 利用你已经写好的进化版 workspace_cpp
    // 它会指向 ../workspace/{stem}/main.cpp
    let path = ic_fs::workspace_cpp(stem);

    fs::read_to_string(path).unwrap_or_else(|_| {
        "// 找不到代码文件喵...可能是文件夹被手动动过？".to_string()
    })
}
//加载文件

#[tauri::command]
pub fn save_workspace_file(filename: String, code: String) -> Result<(), String> {
    ic_fs::ensure_workspace().map_err(|e| e.to_string())?;
    fs::write(ic_fs::workspace_cpp(&filename), code).map_err(|e| e.to_string())
}
//保存文件

#[tauri::command]
pub fn new_workspace_file(filename: String, template: Option<String>) -> Result<String, String> {
    ic_fs::ensure_workspace().map_err(|e| e.to_string())?;
    let p = ic_fs::workspace_dir().join(&filename);

    let stem = p.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&filename);
//__________________________创建work文件夹_____________________________
    let folder_path = ic_fs::workspace_dir().join(&stem);

    if folder_path.exists() {
        return Err(format!("已经有一个{stem}文件夹啦！"));
    };

    fs::create_dir_all(&folder_path)
        .map_err(|e| format!("创建失败了....\n报错:{e}"))?;

//——————————————————————————————创建文件——————————————————————————————
    let path = ic_fs::workspace_cpp(&stem);
    if path.exists() {
        return Err(format!("文件夹{stem}的main.cpp 已存在喵~"));
    }

    // 没传模板时用用户设置里保存的那份（前端会通过 save_code_template 同步过来）
    let content = template.unwrap_or_else(ic_fs::load_code_template);

    fs::write(&path, &content).map_err(|e| e.to_string())?;

//--------------------------创建题目信息相关------------------------------
    let question_path = ic_fs::workspace_question(&stem); // 对应 ../workspace/{stem}/question.json

    // 如果是从 CC 插件来的，直接存 payload
    // 如果是手动新建的，存一个基础模板
    let meta = serde_json::json!({
        "name": &stem,
        "url": "",
        "timeLimit": 1000,
        "memoryLimit": 256,
        "problemType": "normal"
    });

    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("序列化题目元数据失败喵: {}", e))?;

    fs::write(&question_path, meta_json)
        .map_err(|e| format!("写入题目元数据失败喵: {}", e))?;

    Ok(stem.to_string())
}
//创建一个新的文件

/// 前端把设置里的代码模板同步给后端。
/// 拉取题面（Competitive Companion）时，后端要拿它拼「题目信息 + 代码模板」写入 main.cpp。
#[tauri::command]
pub fn save_code_template(template: String) -> Result<(), String> {
    ic_fs::ensure_workspace().map_err(|e| e.to_string())?;
    fs::write(ic_fs::template_path(), template).map_err(|e| e.to_string())
}

/// 给设置页展示：当前工作区在磁盘上的哪个位置
#[tauri::command]
pub fn get_workspace_path() -> String {
    ic_fs::workspace_dir().display().to_string()
}

/// 手动切换题目类型：normal / interactive / communication
#[tauri::command]
pub fn set_problem_type(stem: String, problem_type: String) -> Result<(), String> {
    let kind = match problem_type.as_str() {
        "normal" | "interactive" | "communication" => problem_type,
        other => return Err(format!("不认识的题目类型: {other}")),
    };

    let path = ic_fs::workspace_question(&stem);
    let content = fs::read_to_string(&path).map_err(|e| format!("读取题目信息失败: {e}"))?;
    let mut value: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析题目信息失败: {e}"))?;

    value["problemType"] = serde_json::json!(kind);

    let text = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("序列化题目信息失败: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("写入题目信息失败: {e}"))
}

/// 改题目的时间 / 内存限制（评测和界面都读这两个值）
#[tauri::command]
pub fn set_problem_limits(stem: String, time_limit: u64, memory_limit: u64) -> Result<(), String> {
    if time_limit == 0 || time_limit > 600_000 {
        return Err("时间限制要在 1 ~ 600000 ms 之间".to_string());
    }
    if memory_limit == 0 || memory_limit > 65536 {
        return Err("内存限制要在 1 ~ 65536 MB 之间".to_string());
    }

    let path = ic_fs::workspace_question(&stem);
    let content = fs::read_to_string(&path).map_err(|e| format!("读取题目信息失败: {e}"))?;
    let mut value: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析题目信息失败: {e}"))?;

    value["timeLimit"] = serde_json::json!(time_limit);
    value["memoryLimit"] = serde_json::json!(memory_limit);

    let text = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("序列化题目信息失败: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("写入题目信息失败: {e}"))
}

#[tauri::command]
pub fn delete_workspace_file(filename: String) -> Result<(), String> {
    let p = ic_fs::workspace_dir().join(&filename);

    let stem = p.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&filename);

    let file_folder_path = ic_fs::workspace_dir().join(stem);

    if file_folder_path.exists(){
        let _= fs::remove_dir_all(&file_folder_path);
    }

    // 清掉收藏夹里指向它的引用，别留幽灵条目
    collections::forget_stem(stem);

    println!("已经删除所有名为{stem}的文件喵！");
    Ok(())
}
//删除文件,会同时删除cpp文件和case.json（样例文件）文件

#[tauri::command]
pub fn rename_workspace_file(old_name: String, new_name: String) -> Result<String, String> {
    let old_p = Path::new(&old_name);
    let old_stem = old_p.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&old_name);

    let new_p = Path::new(&new_name);
    let new_stem = new_p.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&new_name);
    
    if old_stem == new_stem {return Ok(new_stem.to_string())};

    let old_path = ic_fs::workspace_dir().join(old_stem);
    let new_path = ic_fs::workspace_dir().join(new_stem);
    if new_path.exists() {
        return Err(format!("文件 {new_stem} 已存在喵~"));
    }

        fs::rename(&old_path, &new_path)
            .map_err(|e| format!("文件重命名错误喵！报错：{e}"))?;

    collections::rename_stem(old_stem, new_stem);

    println!("已将 {} 相关文件全部更名为 {} 喵！", old_stem, new_stem);
    Ok(new_stem.to_string())
}
//重命名文件
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_cache_hits_and_invalidates_on_mtime_change() {
        let dir = std::env::temp_dir().join("icnana-wsindex-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let stem = "demo";
        let problem = dir.join(stem);
        std::fs::create_dir_all(&problem).unwrap();
        std::fs::write(
            problem.join("question.json"),
            r#"{"name":"Demo 题","url":"https://www.luogu.com.cn/problem/P1","oj":"luogu"}"#,
        )
        .unwrap();

        let favorites = std::collections::HashSet::new();

        // 第一次扫描：冷缓存，从 question.json 读
        let mut index = WsIndex::default();
        let first = read_workspace_entry(stem, &problem, &favorites, &mut index);
        assert_eq!(first.name, "Demo 题");
        assert_eq!(first.oj, "luogu");
        assert_eq!(index.entries.len(), 1);

        // 第二次扫描：缓存命中（结果一样）
        let second = read_workspace_entry(stem, &problem, &favorites, &mut index);
        assert_eq!(second.name, "Demo 题");

        // 改掉 question.json 之后 mtime 变化 → 必须读到新值
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(
            problem.join("question.json"),
            r#"{"name":"改名了","url":"https://codeforces.com/problemset/problem/4/A","oj":"codeforces"}"#,
        )
        .unwrap();
        let third = read_workspace_entry(stem, &problem, &favorites, &mut index);
        assert_eq!(third.name, "改名了");
        assert_eq!(third.oj, "codeforces");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
