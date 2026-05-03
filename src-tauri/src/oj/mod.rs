use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestCase {
    pub input: String,
    pub output: String,
    pub actual: String,
    pub status: String,
}
//打包数据（输入输出，测评状态，代码输出）用的结构体


/*
    Competitive Companion 数据结构(用于从插件拉取样例)
*/
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CCTestCase {
    pub input: String,
    pub output: String,
}

// CC 完整数据包结构
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")] // 关键！告诉 Serde 自动处理驼峰命名
pub struct CCPayload {
    pub name: String,           // 题目名称，例如 "A. Theatre Square"
    pub group: String,          // 分组/来源，例如 "Codeforces - Codeforces Beta Round 1"
    pub url: String,            // 题目原始链接
    pub memory_limit: i32,      // 内存限制 (单位通常是 MB)
    pub time_limit: i32,        // 时间限制 (单位是 ms)
    pub interactive: bool,      // 是否是交互题
    pub tests: Vec<CCTestCase>,     // 这就是你要落盘的物理样例！
    pub test_type: String,      // 通常是 "single" 或 "multiNumber"
}