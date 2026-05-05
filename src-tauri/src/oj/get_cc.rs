use std::fs;
use std::path::PathBuf;

use crate::oj::models::*;
use crate::utils::fs as ic_fs;

/// 将字符串转换为安全的文件系统目录名
pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            // 把这些非法字符替换成下划线
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        // 去除首尾可能存在的空格或点号，防止出现类似 " .hidden" 这样的隐藏文件夹
        .trim_matches(|c| c == ' ' || c == '.')
        .to_string()
}

pub fn process_cc_payload(payload: CCPayload) -> Result<String, String> {
    // 1. 清洗并生成安全的文件夹名称
    let stem = sanitize_filename(&payload.name);
    let folder_path = ic_fs::workspace_dir().join(&stem);

    if !folder_path.exists() {
        fs::create_dir_all(&folder_path)
            .map_err(|e| format!("创建题目目录失败喵: {}", e))?;
    }

    // 2. 构造并写入 QuestionMeta (注意 i32 到 u64 的转换)
    let meta = QuestionMeta {
        name: payload.name.clone(),
        group: payload.group,
        url: payload.url,
        time_limit: payload.time_limit as u64,
        memory_limit: payload.memory_limit as u64,
    };
    
    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("序列化题目元数据失败: {}", e))?;
    fs::write(folder_path.join("question.json"), meta_json)
        .map_err(|e| format!("写入题目元数据失败: {}", e))?;

    // 3. 🌟 关键步：将 CCTestCase 转换为带状态的 TestCase
    let local_test_cases: Vec<TestCase> = payload.tests.into_iter().map(|cc_test| {
        TestCase {
            input: cc_test.input,
            output: cc_test.output,
            actual: String::new(),         // 初始实际输出为空
            status: "Pending".to_string(), // 初始状态设为待评测
        }
    }).collect();

    // 4. 写入 cases.json
    let cases_json = serde_json::to_string_pretty(&local_test_cases)
        .map_err(|e| format!("序列化测试样例失败: {}", e))?;
    fs::write(folder_path.join("cases.json"), cases_json)
        .map_err(|e| format!("写入测试样例失败: {}", e))?;

    // 5. 初始化代码文件
    let cpp_path = folder_path.join("main.cpp");
    if !cpp_path.exists() {
        let template = format!(
            "// Problem: {}\n// Group: {}\n// URL: {}\n// Memory Limit: {} MB\n// Time Limit: {} ms\n#include <bits/stdc++.h>\n\nint main() {{\n    std::ios::sync_with_stdio(false);\n    std::cin.tie(nullptr);\n\n    return 0;\n}}",
            meta.name, meta.group, meta.url, meta.memory_limit, meta.time_limit
        );
        fs::write(&cpp_path, template)
            .map_err(|e| format!("模板文件写入失败: {}", e))?;
    }

    Ok(stem)
}

#[tauri::command]
pub fn get_problem_meta(stem: String) -> Result<QuestionMeta, String> {
    // 找到对应题目文件夹下的 question.json
    let path = ic_fs::workspace_dir().join(&stem).join("question.json");
    
    // 1. 如果文件不存在，返回友好报错
    if !path.exists() {
        return Err(format!("找不到题目 {} 的元数据喵~", stem));
    }

    // 2. 读取文件内容
    let content = fs::read_to_string(path)
        .map_err(|e| format!("读取题面数据失败: {}", e))?;
    
    // 3. 反序列化成 QuestionMeta 结构体返回给前端
    let meta: QuestionMeta = serde_json::from_str(&content)
        .map_err(|e| format!("解析题目数据失败: {}", e))?;
        
    Ok(meta)
}
//获取题目数据