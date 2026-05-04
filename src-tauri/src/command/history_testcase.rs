use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::utils::fs as ic_fs;
/*
    该命名空间与历史样例有关，历史样例与同名cpp文件关联
*/

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestCase {
    pub input: String,
    pub output: String,
    pub actual: String, 
    pub status: String
}

#[tauri::command]
pub fn load_test_cases(filename: String) -> Result<Vec<TestCase>, String> {
    let p = ic_fs::workspace_dir().join(&filename);

    let stem = p.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&filename);

    let cases_path = ic_fs::workspace_test_cases(stem);
    
    // 如果这个文件还没生成过样例文件，直接返回一个空的默认样例
    if !cases_path.exists() {
        return Ok(vec![TestCase { input: "".into(), output: "".into(), actual: "".into(), status: "pending" .into() }]);
    }

    let content = fs::read_to_string(cases_path).map_err(|e| e.to_string())?;
    let cases: Vec<TestCase> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(cases)
}
//加载样例文件

#[tauri::command]
pub fn save_test_cases(filename: String, cases: Vec<TestCase>) -> Result<(), String> {
    let p = ic_fs::workspace_dir().join(&filename);

    let stem = p.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&filename);

    let cases_path = ic_fs::workspace_test_cases(stem);
    
    println!("Path: {:?}", cases_path);
    // 把数据转成带缩进的漂亮 JSON，方便你在 Git 里看 diff
    let json = serde_json::to_string_pretty(&cases).map_err(|e| e.to_string())?;
    fs::write(cases_path, json).map_err(|e| e.to_string())
}
//保存样例文件