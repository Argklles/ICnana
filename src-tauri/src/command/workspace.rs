use std::fs;
use std::path::Path;

use crate::utils::ic_fs;
/*
该命名空间与工作区的文件管理相关
*/

#[tauri::command]
pub fn list_workspace_files() -> Vec<String> {
    let _ = ic_fs::ensure_workspace();
    let dir = ic_fs::workspace_dir();
    let mut folders: Vec<String> = vec![];

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            // 🌟 关键：现在我们检查的是“是否为文件夹”
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    // 排除掉隐藏文件夹（比如以 . 开头的）
                    if !name.starts_with('.') {
                        folders.push(name.to_string());
                    }
                }
            }
        }
    }
    
    folders.sort();

    // 如果是空的，创建一个默认题目文件夹和代码
    if folders.is_empty() {
        let default_stem = "solution";
        // 利用你写好的 new_workspace_file 来初始化，保证逻辑统一
        let _ = new_workspace_file(default_stem.to_string(), None);
        folders.push(default_stem.to_string());
    }
    folders
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

    let default_template = "// 开始编写你的代码喵！！\n#include <bits/stdc++.h>\n\nint main() {\n  std::ios::sync_with_stdio(false);\n  std::cin.tie(nullptr);\n\n  return 0;\n}";
    let content = template.unwrap_or_else(|| default_template.to_string());

    fs::write(&path, &content).map_err(|e| e.to_string())?;

//--------------------------创建题目信息相关------------------------------
    let question_path = ic_fs::workspace_question(&stem); // 对应 ../workspace/{stem}/question.json

    // 如果是从 CC 插件来的，直接存 payload
    // 如果是手动新建的，存一个基础模板
    let meta = serde_json::json!({
        "name": &stem,
        "url": "",
        "timeLimit": 1000,
        "memoryLimit": 256
    });

    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("序列化题目元数据失败喵: {}", e))?;

    fs::write(&question_path, meta_json)
        .map_err(|e| format!("写入题目元数据失败喵: {}", e))?;

    Ok(stem.to_string())
}
//创建一个新的文件

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

    println!("已将 {} 相关文件全部更名为 {} 喵！", old_stem, new_stem);
    Ok(new_stem.to_string())
}
//重命名文件