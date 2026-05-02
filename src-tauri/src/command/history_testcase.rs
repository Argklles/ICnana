use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/*
    该命名空间与历史样例有关，历史样例与同名cpp文件关联
*/

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestCase {
    pub input: String,
    pub output: String,
}

fn get_cases_path (cpp_path: &str) ->PathBuf {
    let mut path = PathBuf::from(cpp_path);
    path.set_extension("case.json");
    path
}
//计算样例文件路径

#[tauri::command]
pub fn load_test_cases(file_path: String) -> Result<Vec<TestCase>, String> {
    let cases_path = get_cases_path(&file_path);
    
    // 如果这个文件还没生成过样例文件，直接返回一个空的默认样例
    if !cases_path.exists() {
        return Ok(vec![TestCase { input: "".into(), output: "".into() }]);
    }

    let content = fs::read_to_string(cases_path).map_err(|e| e.to_string())?;
    let cases: Vec<TestCase> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(cases)
}
//加载样例文件

#[tauri::command]
pub fn save_test_cases(file_path: String, cases: Vec<TestCase>) -> Result<(), String> {
    let cases_path = get_cases_path(&file_path);
    
    // 把数据转成带缩进的漂亮 JSON，方便你在 Git 里看 diff
    let json = serde_json::to_string_pretty(&cases).map_err(|e| e.to_string())?;
    fs::write(cases_path, json).map_err(|e| e.to_string())
}
//保存样例文件

#[tauri::command]
pub fn clear_test_cases(file_path: String) -> Result<(), String> {
    let mut p = std::path::PathBuf::from(&file_path);
    
    // 核心逻辑：直接定位到对应的 json 文件
    p.set_extension("cases.json");

    if p.exists() {
        // 执行物理删除
        std::fs::remove_file(p).map_err(|e| format!("清理样例失败: {e}"))?;
        println!("样例物理文件已清除喵~");
    }
    
    Ok(())
}
//清除样例数据