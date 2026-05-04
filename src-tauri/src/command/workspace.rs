use std::fs;
use std::path::{PathBuf, Path};

use crate::utils::fs::{self as ic_fs, workspace_bin, workspace_dir, workspace_test_cases};
use crate::command::history_testcase as hiscase;
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
pub fn delete_workspace_file(filename: String) -> Result<(), String> {
    let p = workspace_dir().join(&filename);

    let stem = p.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&filename);

    let cpp_path = ic_fs::workspace_cpp(stem);
    let bin_path = ic_fs::workspace_bin(stem);
    let cases_path = ic_fs::workspace_test_cases(stem);

    let target = vec![cpp_path, bin_path, cases_path];
    for path in target {
        if path.exists(){
            let _= fs::remove_file(&path);
        }
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

    let new_cpp = ic_fs::workspace_cpp(new_stem);
    if new_cpp.exists() {
        return Err(format!("文件 {new_stem} 已存在喵~"));
    }

    let rename_targets = vec![
        (ic_fs::workspace_cpp(old_stem), ic_fs::workspace_cpp(new_stem)),
        (ic_fs::workspace_bin(old_stem), ic_fs::workspace_bin(new_stem)),
        (ic_fs::workspace_test_cases(old_stem), ic_fs::workspace_test_cases(new_stem)),
    ];

    for (old_path, new_path) in rename_targets {
        if old_path.exists() {
            fs::rename(&old_path, &new_path)
                .map_err(|e| format!("重命名失败: {}", e))?;
        }
    }

    println!("已将 {} 相关文件全部更名为 {} 喵！", old_stem, new_stem);
    Ok(new_stem.to_string())
}
//重命名文件