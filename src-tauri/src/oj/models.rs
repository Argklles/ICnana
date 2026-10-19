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

/// 提取后用于存储在 question.json 的纯净元数据
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionMeta {
    pub name: String,
    pub group: String,
    pub url: String,
    pub time_limit: u64,
    pub memory_limit: u64,
    /// normal / interactive / communication，老存档缺省按普通题处理
    #[serde(default = "default_problem_type")]
    pub problem_type: String,
}

pub fn default_problem_type() -> String {
    "normal".to_string()
}

/// 侧边栏用的文件条目：携带来源 OJ 与收藏状态
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    /// 文件夹名，也就是切换 / 删除时用的唯一标识
    pub stem: String,
    /// 展示名（题目名，没有元数据时回退成 stem）
    pub name: String,
    pub url: String,
    /// luogu / codeforces / atcoder / other
    pub oj: String,
    pub favorite: bool,
}

/// 根据题目链接判断来源 OJ。
/// 老存档没有 oj 字段，列表时用它现场推断，保证升级后也能自动归类。
pub fn detect_oj(url: &str) -> String {
    let u = url.to_lowercase();
    let oj = if u.contains("luogu.com.cn") {
        "luogu"
    } else if u.contains("codeforces.com") {
        "codeforces"
    } else if u.contains("atcoder.jp") {
        "atcoder"
    } else if u.contains("nowcoder.com") {
        "nowcoder"
    } else {
        "other"
    };
    oj.to_string()
}