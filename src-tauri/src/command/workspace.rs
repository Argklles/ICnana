use std::fs;
use std::path::PathBuf;

use crate::utils::fs as ic_fs;

/*
该命名空间与工作区的文件管理相关
*/

#[tauri::command]
pub fn list_workspace_files() -> Vec<String> {
    let _ = ic_fs::ensure_workspace();
    let dir = ic_fs::workspace_dir();
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
//文件列表

#[tauri::command]
pub fn load_workspace_file(filename: String) -> String {
    fs::read_to_string(ic_fs::workspace_dir().join(&filename)).unwrap_or_default()
}
//加载文件

#[tauri::command]
pub fn save_workspace_file(filename: String, code: String) -> Result<(), String> {
    ic_fs::ensure_workspace().map_err(|e| e.to_string())?;
    fs::write(ic_fs::workspace_dir().join(&filename), code).map_err(|e| e.to_string())
}
//保存文件

#[tauri::command]
pub fn new_workspace_file(filename: String, template: Option<String>) -> Result<String, String> {
    ic_fs::ensure_workspace().map_err(|e| e.to_string())?;
    let name = if filename.ends_with(".cpp") {
        filename
    } else {
        format!("{}.cpp", filename)
    };
    let path = ic_fs::workspace_dir().join(&name);
    if path.exists() {
        return Err(format!("文件 {} 已存在喵~", name));
    }
    let default_template = "// 开始编写你的代码喵！！\n#include <bits/stdc++.h>\n\nint main() {\n  std::ios::sync_with_stdio(false);\n  std::cin.tie(nullptr);\n\n  return 0;\n}";
    let content = template.unwrap_or_else(|| default_template.to_string());
    fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(name)
}
//创建一个新的文件

#[tauri::command]
pub fn delete_workspace_file(file_path: String) -> Result<(), String> {
    let p = PathBuf::from(&file_path);

    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("无法删除源码文件: {e}"))?;
    }

    if let Some(ext) = p.extension() {
        if ext == "cpp" || ext == "cc" {
            let mut cases_path = p.clone();
            cases_path.set_extension("cases.json");

            if cases_path.exists() {
                let _ = fs::remove_file(cases_path); 
                println!("已同步清理测试样例文件喵~");
            }
        }
    }

    Ok(())
}
//删除文件,会同时删除cpp文件和case.json（样例文件）文件

#[tauri::command]
pub fn rename_workspace_file(old_name: String, new_name: String) -> Result<String, String> {
    let workspace = ic_fs::workspace_dir();
    let old_path = workspace.join(&old_name);
    
    // 1. 智能处理新名字后缀
    // 使用 PathBuf 处理，无论用户输入 "abc" 还是 "abc.cpp"，结果都是 "abc.cpp"
    let mut new_path = workspace.join(&new_name);
    new_path.set_extension("cpp");

    let final_new_name = new_path.file_name()
        .and_then(|n| n.to_str())
        .ok_or("文件名包含非法字符喵~")?
        .to_string();

    // 2. 检查目标是否冲突
    if new_path.exists() {
        return Err(format!("文件 {} 已存在喵~", final_new_name));
    }

    // 3. 执行源码重命名
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;

    // 4.联动重命名 JSON (只有旧文件是 .cpp 时才触发)
    if old_name.ends_with(".cpp") || old_name.ends_with(".cc") {
        let mut old_json = old_path.clone();
        old_json.set_extension("cases.json");

        if old_json.exists() {
            let mut new_json = new_path.clone();
            new_json.set_extension("cases.json");

            let _ = fs::rename(old_json, new_json);
        }
    }

    Ok(final_new_name)
}
//重命名文件